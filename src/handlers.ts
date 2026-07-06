import {
  formatAgentsList,
  getActiveAgentEntry,
  getNormalizedSession,
  registerAgent,
  removeAgentFromList,
  resolveActiveAgentId,
  selectAgent,
  updateAgentRun,
} from "./agents";
import {
  addAdmin,
  getBootstrapAdminIds,
  isAllowedUser,
  isBootstrapAdmin,
  listAllAdminIds,
  listStoredAdmins,
  removeAdmin,
} from "./admins";
import {
  createAgent,
  createRun,
  getAgent,
  getRunForDisplay,
  isTerminal,
  pollRunAndFormat,
} from "./cursor";
import {
  formatKvLimitMessage,
  isKvWriteLimitError,
} from "./kv-store";
import { schedulePendingPoller } from "./pending-poller";
import {
  TRACK_RUN_INTERVAL_MS,
  TRACK_RUN_MAX_ATTEMPTS,
  addPendingRun,
  clearPendingForManualStatus,
  kickoffPendingPoll,
  listPendingRuns,
  notifyIfFinished,
  processPendingRuns,
} from "./pending";
import {
  STICKER_STATUSES,
  listStatusStickers,
  setStatusStickerFileId,
} from "./stickers";
import { saveCursorApiKey, resolveCursorApiKey } from "./secrets";
import { defaultRepo, updateSession } from "./session";
import { sendChatAction, sendMessage, sendRunResult, configureWebhookFromEnv, getWebhookInfo } from "./telegram";
import type { Env, TelegramMessage } from "./types";
import { BUILD_DATE, VERSION } from "./version";
import type { StoredAgentEntry } from "./types";
import {
  NO_WORKSPACE_MESSAGE,
  OUT_OF_SCOPE_PROBE_REPLY,
  buildAgentPrompt,
  detectFolderSetupIntent,
  detectOutOfScopeProbe,
  formatWorkspaceStatus,
  getAdminWorkspaceFolder,
  isLikelyWorkPrompt,
  isSystemAdmin,
  listLegacyWorkspaceMappings,
  resolvePromptContext,
  resolveWorkspaceScope,
  setAdminWorkspaceFolder,
  setLegacyWorkspaceMapping,
  type PromptContext,
  type WorkspaceScope,
} from "./workspace";

const HELP_TEXT_BOOTSTRAP = `Telegram → Cursor Cloud Agent bot (asosiy admin)

/start /help /status /repo /new /agents /use /agent
/papka — ish papkasi
/admin list|add|remove|workspace — adminlar boshqaruvi
/setkey /setup /setsticker /stickers /version

Siz barcha agentlarni ko'rasiz va ishlata olasiz.
Boshqa adminning agentini tanlasangiz — u o'z egasiga javob berayotgandek ishlaydi.

Oddiy matn — agentga vazifa.`;

const HELP_TEXT_USER = `Telegram → Cursor Cloud Agent bot

/start — boshlash
/help — yordam
/status — agent holati
/repo <url> — GitHub repo
/new — yangi agent
/agents — agentlar ro'yxati
/use 2 — agent tanlash
/agent — faol agent
/papka — ish papkasi
/papka <nom> — papka belgilash
/version — versiya

Oddiy matn yuboring — agent avtomatik ishlaydi.

Avval /new → papka yarating → keyin ish buyrug'i.`;

function helpTextFor(env: Env, userId: number): string {
  return isBootstrapAdmin(env, userId) ? HELP_TEXT_BOOTSTRAP : HELP_TEXT_USER;
}

export async function handleMessage(
  env: Env,
  message: TelegramMessage,
  ctx: ExecutionContext,
  workerOrigin: string,
): Promise<void> {
  const userId = message.from?.id;
  const chatId = message.chat.id;
  const text = message.text?.trim();

  if (!userId || !text) return;

  try {
    if (!(await isAllowedUser(env, userId))) {
      await sendMessage(
        env,
        chatId,
        "Ruxsat yo'q. Admin sizni qo'shishi kerak:\n/admin add <telegram_user_id>",
      );
      return;
    }

    if (text.startsWith("/")) {
      await handleCommand(env, chatId, userId, text, ctx, workerOrigin, message);
      return;
    }

    await dispatchPrompt(env, chatId, userId, text, ctx, workerOrigin);
  } catch (error) {
    console.error(
      "handleMessage failed:",
      error instanceof Error ? error.message : String(error),
    );
    await sendMessage(
      env,
      chatId,
      isKvWriteLimitError(error)
        ? formatKvLimitMessage()
        : [
            "Bot xatolik berdi. Qayta urinib ko'ring.",
            error instanceof Error ? error.message : String(error),
            "",
            "/ping — tekshirish",
            "/agents — agentlar ro'yxati",
          ].join("\n"),
    );
  }
}

async function handleCommand(
  env: Env,
  chatId: number,
  userId: number,
  text: string,
  ctx: ExecutionContext,
  workerOrigin: string,
  message: TelegramMessage,
): Promise<void> {
  const [command, ...rest] = text.split(/\s+/);
  const args = rest.join(" ").trim();
  const cmd = command.toLowerCase().split("@")[0];

  switch (cmd) {
    case "/start":
      await sendMessage(
        env,
        chatId,
        "Salom! Men Cursor Cloud Agent botman.\n\n/help — buyruqlar ro'yxati",
      );
      return;

    case "/help":
      await sendMessage(env, chatId, helpTextFor(env, userId));
      return;

    case "/status":
      await handleStatus(env, chatId, userId);
      return;

    case "/repo":
      await handleRepo(env, chatId, userId, args);
      return;

    case "/papka":
    case "/folder":
      await handleFolder(env, chatId, userId, args);
      return;

    case "/new":
      await handleNew(env, chatId, userId, args || "Yangi agent tayyor.", ctx, workerOrigin);
      return;

    case "/agents":
      await handleAgents(env, chatId, userId, args);
      return;

    case "/use":
    case "/select":
      await handleUse(env, chatId, userId, args);
      return;

    case "/agent":
      await handleAgentInfo(env, chatId, userId);
      return;

    case "/admin":
      await handleAdmin(env, chatId, userId, args);
      return;

    case "/setkey":
    case "/cursorkey":
      await handleSetKey(env, chatId, userId, args);
      return;

    case "/setsticker":
      await handleSetSticker(env, chatId, userId, message, args);
      return;

    case "/stickers":
      await handleListStickers(env, chatId, userId);
      return;

    case "/setup":
      await handleSetup(env, chatId, userId, workerOrigin);
      return;

    case "/ask":
      if (!args) {
        await sendMessage(
          env,
          chatId,
          "Oddiy matn yuboring — agent avtomatik ishlaydi.\nYoki: /ask <prompt>",
        );
        return;
      }
      await dispatchPrompt(env, chatId, userId, args, ctx, workerOrigin);
      return;

    case "/ping":
      await sendMessage(env, chatId, "pong ✅");
      return;

    case "/wake":
      await sendChatAction(env, chatId, "typing");
      await sendMessage(env, chatId, "Bot ishlayapti. /agents yoki /use 1");
      return;

    case "/version":
      await sendMessage(
        env,
        chatId,
        [
          `telegram-cursor-bot v${VERSION}`,
          `Build: ${BUILD_DATE}`,
          `Environment: ${env.ENVIRONMENT ?? "unknown"}`,
        ].join("\n"),
      );
      return;

    default:
      await sendMessage(env, chatId, "Noma'lum buyruq. /help");
  }
}

async function handleSetSticker(
  env: Env,
  chatId: number,
  userId: number,
  message: TelegramMessage,
  statusArg: string,
): Promise<void> {
  if (!isBootstrapAdmin(env, userId)) {
    await sendMessage(env, chatId, "Bu buyruq faqat asosiy admin uchun.");
    return;
  }

  const sticker = message.reply_to_message?.sticker ?? message.sticker;
  if (!sticker) {
    await sendMessage(
      env,
      chatId,
      [
        "Stickerga javob qilib yuboring:",
        "/setsticker finished",
        "",
        `Statuslar: ${STICKER_STATUSES.join(", ")}`,
      ].join("\n"),
    );
    return;
  }

  const status = (statusArg || "finished").toLowerCase();
  if (!STICKER_STATUSES.includes(status as (typeof STICKER_STATUSES)[number])) {
    await sendMessage(
      env,
      chatId,
      `Noto'g'ri status. Mavjud: ${STICKER_STATUSES.join(", ")}`,
    );
    return;
  }

  await setStatusStickerFileId(env, status, sticker.file_id);
  await sendMessage(
    env,
    chatId,
    `Sticker saqlandi: ${status}${sticker.emoji ? ` ${sticker.emoji}` : ""}`,
  );
}

async function handleSetup(
  env: Env,
  chatId: number,
  userId: number,
  workerOrigin: string,
): Promise<void> {
  if (!isBootstrapAdmin(env, userId)) {
    await sendMessage(env, chatId, "Bu buyruq faqat asosiy admin uchun.");
    return;
  }

  await sendChatAction(env, chatId, "typing");

  const lines: string[] = ["🔧 Bot sozlama tekshiruvi", ""];

  const cursorKey = await resolveCursorApiKey(env);
  lines.push(cursorKey ? "✅ Cursor API key" : "❌ Cursor API key yo'q → /setkey");

  const webhook = await configureWebhookFromEnv(env, workerOrigin);
  lines.push(webhook.ok ? "✅ Telegram webhook" : "❌ Telegram webhook xato");

  const info = (await getWebhookInfo(env)) as {
    result?: { url?: string; last_error_message?: string };
  };
  if (info.result?.url) {
    lines.push(`🔗 ${info.result.url}`);
  }
  if (info.result?.last_error_message) {
    lines.push(`⚠️ ${info.result.last_error_message}`);
  }

  const pending = await listPendingRuns(env);
  lines.push(`📋 Kutilayotgan runlar: ${pending.length}`);

  const pollerOk = await schedulePendingPoller(env);
  lines.push(
    pollerOk
      ? "✅ Avtomatik polling (Durable Objects)"
      : "⚠️ Polling zaxira rejimida",
  );

  if (!pollerOk) {
    await processPendingRuns(env);
  }

  lines.push("");
  lines.push("Lokal to'liq o'rnatish:");
  lines.push("node scripts/setup-all.mjs");

  await sendMessage(env, chatId, lines.join("\n"));
}

async function handleListStickers(
  env: Env,
  chatId: number,
  userId: number,
): Promise<void> {
  if (!isBootstrapAdmin(env, userId)) {
    await sendMessage(env, chatId, "Bu buyruq faqat asosiy admin uchun.");
    return;
  }

  const stickers = await listStatusStickers(env);
  if (stickers.length === 0) {
    await sendMessage(
      env,
      chatId,
      "Stickerlar yo'q.\n\nStickerga javob: /setsticker finished",
    );
    return;
  }

  const lines = stickers.map((s) => `• ${s.status}`);
  await sendMessage(
    env,
    chatId,
    ["Saqlandi:", "", ...lines, "", "O'rnatish: stickerga javob /setsticker finished"].join(
      "\n",
    ),
  );
}

async function handleAdmin(
  env: Env,
  chatId: number,
  userId: number,
  args: string,
): Promise<void> {
  if (!isBootstrapAdmin(env, userId)) {
    await sendMessage(
      env,
      chatId,
      "Bu buyruq mavjud emas. /help — buyruqlar ro'yxati",
    );
    return;
  }

  const [subcommand, ...rest] = args.split(/\s+/);
  const sub = (subcommand || "list").toLowerCase();
  const value = rest.join(" ").trim();

  switch (sub) {
    case "list":
      await handleAdminList(env, chatId);
      return;

    case "add":
      await handleAdminAdd(env, chatId, userId, value);
      return;

    case "remove":
    case "delete":
      await handleAdminRemove(env, chatId, value);
      return;

    case "workspace":
    case "papka":
      await handleAdminWorkspace(env, chatId, userId, value);
      return;

    default:
      await sendMessage(
        env,
        chatId,
        [
          "Foydalanish:",
          "/admin list",
          "/admin add 123456789",
          "/admin remove 123456789",
          "/admin workspace set 123 ish",
          "/admin workspace list",
        ].join("\n"),
      );
  }
}

async function handleSetKey(
  env: Env,
  chatId: number,
  userId: number,
  apiKey: string,
): Promise<void> {
  if (!getBootstrapAdminIds(env).includes(String(userId))) {
    await sendMessage(env, chatId, "Faqat asosiy admin /setkey ishlata oladi.");
    return;
  }

  const key = apiKey.trim();
  if (!key) {
    await sendMessage(
      env,
      chatId,
      "Foydalanish: /setkey key_...\n\nKey: https://cursor.com/dashboard/integrations",
    );
    return;
  }

  if (!key.startsWith("key_") && !key.startsWith("crsr_")) {
    await sendMessage(
      env,
      chatId,
      "Key formati noto'g'ri. key_... yoki crsr_... bilan boshlanishi kerak.",
    );
    return;
  }

  await saveCursorApiKey(env, key);
  const masked = `${key.slice(0, 8)}...${key.slice(-4)}`;
  await sendMessage(
    env,
    chatId,
    `✅ Cursor API key saqlandi: ${masked}\n\nEndi /new yoki matn yuboring.`,
  );
}

async function handleAdminList(env: Env, chatId: number): Promise<void> {
  const bootstrapIds = new Set(getBootstrapAdminIds(env));
  const allIds = await listAllAdminIds(env);
  const stored = await listStoredAdmins(env);
  const storedById = new Map(stored.map((admin) => [admin.userId, admin]));
  const workspaceMap = new Map(
    (await listLegacyWorkspaceMappings(env)).map((w) => [w.userId, w.folder]),
  );

  const lines = await Promise.all(
    allIds.map(async (id) => {
      if (bootstrapIds.has(id)) {
        return `${id} — asosiy admin (tizim kodi)`;
      }

      const folder =
        (await getAdminWorkspaceFolder(env, Number.parseInt(id, 10))) ??
        workspaceMap.get(id);

      const info = storedById.get(id);
      const base = info
        ? `${id} — qo'shilgan (${info.addedBy})`
        : `${id} — admin`;
      return folder ? `${base}, papka: ${folder}/` : `${base}, papka: —`;
    }),
  );

  await sendMessage(
    env,
    chatId,
    ["Adminlar:", "", ...lines].join("\n"),
  );
}

async function handleAdminAdd(
  env: Env,
  chatId: number,
  userId: number,
  targetId: string,
): Promise<void> {
  if (!/^\d+$/.test(targetId)) {
    await sendMessage(
      env,
      chatId,
      "Foydalanish: /admin add 123456789\n\nID olish: @userinfobot",
    );
    return;
  }

  const result = await addAdmin(env, targetId, userId);

  if (result === "exists") {
    await sendMessage(env, chatId, `Admin allaqachon mavjud: ${targetId}`);
    return;
  }

  await sendMessage(
    env,
    chatId,
    [
      `Yangi admin qo'shildi: ${targetId}`,
      "",
      "Foydalanuvchiga yo'riqnoma:",
      "1. /new — agent ochish",
      '2. Agentga: "loyiha papkasini yarat: nom"',
      "3. Yoki: /papka nom",
      "4. Keyin ish buyruqlarini yuborish",
    ].join("\n"),
  );
}

async function handleAdminRemove(
  env: Env,
  chatId: number,
  targetId: string,
): Promise<void> {
  if (!/^\d+$/.test(targetId)) {
    await sendMessage(env, chatId, "Foydalanish: /admin remove 123456789");
    return;
  }

  const result = await removeAdmin(env, targetId);

  if (result === "protected") {
    await sendMessage(
      env,
      chatId,
      `Asosiy adminni o'chirib bo'lmaydi: ${targetId}`,
    );
    return;
  }

  if (result === "not_found") {
    await sendMessage(env, chatId, `Admin topilmadi: ${targetId}`);
    return;
  }

  await sendMessage(env, chatId, `Admin olib tashlandi: ${targetId}`);
}

async function handleAgents(
  env: Env,
  chatId: number,
  userId: number,
  args: string,
): Promise<void> {
  const [subcommand, ...rest] = args.split(/\s+/);
  const sub = subcommand?.toLowerCase();
  const value = rest.join(" ").trim() || subcommand;

  if (sub === "remove" || sub === "delete") {
    const target = rest.join(" ").trim() || subcommand;
    if (!target || target === "remove" || target === "delete") {
      await sendMessage(env, chatId, "Foydalanish: /agents remove 2");
      return;
    }

    const result = await removeAgentFromList(env, userId, target);
    if (!result.ok) {
      await sendMessage(env, chatId, result.error);
      return;
    }

    await sendMessage(
      env,
      chatId,
      `Ro'yxatdan olib tashlandi: ${result.name}\n\n${await formatAgentsList(env, userId, await getNormalizedSession(env, userId))}`,
    );
    return;
  }

  if (args && sub !== "list" && !["remove", "delete"].includes(sub ?? "")) {
    await sendMessage(
      env,
      chatId,
      "Foydalanish:\n/agents\n/agents remove 2",
    );
    return;
  }

  const session = await getNormalizedSession(env, userId);
  await sendChatAction(env, chatId, "typing");
  await sendMessage(env, chatId, await formatAgentsList(env, userId, session));
}

async function handleUse(
  env: Env,
  chatId: number,
  userId: number,
  selector: string,
): Promise<void> {
  if (!selector) {
    await sendMessage(
      env,
      chatId,
      "Foydalanish:\n/use 2\n/use bc_abc123\n\nRo'yxat: /agents",
    );
    return;
  }

  await sendChatAction(env, chatId, "typing");

  try {
    const result = await selectAgent(env, userId, selector);
    if (!result.ok) {
      await sendMessage(env, chatId, result.error);
      return;
    }

    const { entry } = result;
    await sendMessage(
      env,
      chatId,
      [
        `Faol agent tanlandi ★`,
        `Nom: ${entry.name}`,
        `ID: ${entry.agentId}`,
        entry.url ? `URL: ${entry.url}` : null,
        "",
        "Endi oddiy matn yuboring — shu agentga ketadi.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  } catch (error) {
    if (isKvWriteLimitError(error)) {
      await sendMessage(
        env,
        chatId,
        formatKvLimitMessage(
          "Agent tanlandi, lekin sessiya saqlanmadi. Limit yangilangach /use ni qayta bosing.",
        ),
      );
      return;
    }
    throw error;
  }
}

async function handleRepo(
  env: Env,
  chatId: number,
  userId: number,
  repoUrl: string,
): Promise<void> {
  if (!repoUrl.startsWith("https://github.com/")) {
    await sendMessage(
      env,
      chatId,
      "GitHub repo URL kerak:\n/repo https://github.com/user/repo",
    );
    return;
  }

  await updateSession(env, userId, { repoUrl });
  await sendMessage(env, chatId, `Repo saqlandi:\n${repoUrl}`);
}

async function handleFolder(
  env: Env,
  chatId: number,
  userId: number,
  args: string,
): Promise<void> {
  const scope = await resolveWorkspaceScope(env, userId);

  if (!args.trim()) {
    await sendMessage(
      env,
      chatId,
      [
        formatWorkspaceStatus(scope),
        "",
        isSystemAdmin(env, userId)
          ? "Siz tizim adminisiz — src/, scripts/ ni o'zgartira olasiz."
          : "Papka belgilash: /papka my-loyiha",
      ].join("\n"),
    );
    return;
  }

  if (isSystemAdmin(env, userId)) {
    await sendMessage(
      env,
      chatId,
      "Asosiy admin papka cheklovisiz — butun platforma kodiga kira olasiz.",
    );
    return;
  }

  try {
    const folder = await setAdminWorkspaceFolder(env, userId, args);
    await sendMessage(
      env,
      chatId,
      [
        `✅ Ish papkasi saqlandi: ${folder}/`,
        "",
        "Endi agent faqat shu papkada ishlaydi.",
        "Keyingi qadam: /new yoki mavjud agentga vazifa yuboring.",
      ].join("\n"),
    );
  } catch (error) {
    await sendMessage(
      env,
      chatId,
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function handleAdminWorkspace(
  env: Env,
  chatId: number,
  userId: number,
  args: string,
): Promise<void> {
  if (!isBootstrapAdmin(env, userId)) {
    await sendMessage(env, chatId, "Faqat asosiy admin uchun.");
    return;
  }

  const [sub, targetId, ...folderParts] = args.split(/\s+/);
  const subcommand = (sub || "list").toLowerCase();

  if (subcommand === "list") {
    const mappings = await listLegacyWorkspaceMappings(env);
    const allIds = await listAllAdminIds(env);
    const bootstrapIds = new Set(getBootstrapAdminIds(env));

    const lines = await Promise.all(
      allIds
        .filter((id) => !bootstrapIds.has(id))
        .map(async (id) => {
          const folder = await getAdminWorkspaceFolder(env, Number.parseInt(id, 10));
          return `${id} → ${folder ?? "—"}`;
        }),
    );

    await sendMessage(
      env,
      chatId,
      [
        "Admin papkalari:",
        "",
        ...lines,
        "",
        mappings.length ? "Legacy map ham saqlangan." : "",
        "Belgilash: /admin workspace set 123456 ish",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return;
  }

  if (subcommand === "set") {
    const folder = folderParts.join(" ").trim();
    if (!targetId || !/^\d+$/.test(targetId) || !folder) {
      await sendMessage(
        env,
        chatId,
        "Foydalanish: /admin workspace set 123456789 ish",
      );
      return;
    }

    try {
      await setLegacyWorkspaceMapping(env, targetId, folder);
      await sendMessage(
        env,
        chatId,
        `✅ Admin ${targetId} papkasi: ${folder}/`,
      );
    } catch (error) {
      await sendMessage(
        env,
        chatId,
        error instanceof Error ? error.message : String(error),
      );
    }
    return;
  }

  await sendMessage(
    env,
    chatId,
    "/admin workspace list\n/admin workspace set 123456789 ish",
  );
}

async function preparePromptForDispatch(
  env: Env,
  operatorUserId: number,
  prompt: string,
  options: { isNewAgent: boolean; agentEntry?: StoredAgentEntry | null },
): Promise<
  | {
      ok: true;
      wrappedPrompt: string;
      scope: WorkspaceScope;
      workspaceFolder?: string;
      ctx: PromptContext;
    }
  | { ok: false; message: string }
> {
  let ctx = await resolvePromptContext(
    env,
    operatorUserId,
    options.agentEntry,
  );
  const operatorIsBootstrap = isBootstrapAdmin(env, operatorUserId);

  if (
    !operatorIsBootstrap &&
    ctx.mode === "project" &&
    detectOutOfScopeProbe(prompt)
  ) {
    return { ok: false, message: OUT_OF_SCOPE_PROBE_REPLY };
  }

  if (ctx.mode === "awaiting_folder") {
    const folderFromPrompt = detectFolderSetupIntent(prompt);
    if (folderFromPrompt) {
      await setAdminWorkspaceFolder(env, ctx.ownerId, folderFromPrompt);
      ctx = {
        ...ctx,
        mode: "project",
        folder: folderFromPrompt,
      };
    } else if (isLikelyWorkPrompt(prompt) && !options.isNewAgent) {
      return { ok: false, message: NO_WORKSPACE_MESSAGE };
    }
  }

  const wrappedPrompt = buildAgentPrompt(prompt, ctx, {
    isNewAgent: options.isNewAgent,
  });

  const scope: WorkspaceScope =
    ctx.mode === "system"
      ? { kind: "system" }
      : ctx.mode === "project" && ctx.folder
        ? { kind: "folder", folder: ctx.folder }
        : { kind: "none" };

  return {
    ok: true,
    wrappedPrompt,
    scope,
    workspaceFolder: ctx.folder,
    ctx,
  };
}

async function handleAgentInfo(
  env: Env,
  chatId: number,
  userId: number,
): Promise<void> {
  const session = await getNormalizedSession(env, userId);
  const activeId = await resolveActiveAgentId(env, userId, session);

  if (!activeId) {
    await sendMessage(env, chatId, "Faol agent yo'q. /new yoki /agents");
    return;
  }

  try {
    const agent = await getAgent(env, activeId);
    const entry = await getActiveAgentEntry(env, userId, session);
    const pCtx = entry
      ? await resolvePromptContext(env, userId, entry)
      : null;

    await sendMessage(
      env,
      chatId,
      [
        `Agent: ${agent.name}`,
        `ID: ${agent.id}`,
        `Status: ${agent.status}`,
        pCtx?.folder ? `Papka: ${pCtx.folder}/` : null,
        pCtx?.stealth ? `Ega: ${pCtx.ownerId} (siz egasi rejimidasiz)` : null,
        isBootstrapAdmin(env, userId) && entry?.createdBy
          ? `Yaratuvchi: ${entry.createdBy}`
          : null,
        `URL: ${agent.url}`,
        entry?.latestRunId ? `Latest run: ${entry.latestRunId}` : null,
        "",
        isBootstrapAdmin(env, userId)
          ? "Boshqa agent: /agents → /use 2"
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  } catch (error) {
    await sendMessage(
      env,
      chatId,
      `Agent topilmadi: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function resolveStatusRunTarget(
  env: Env,
  userId: number,
  chatId: number,
  session: Awaited<ReturnType<typeof getNormalizedSession>>,
): Promise<{ agentId: string; runId: string } | null> {
  const activeId = await resolveActiveAgentId(env, userId, session);
  const entry = await getActiveAgentEntry(env, userId, session);
  const runId =
    (session?.activeAgentId === activeId ? session.latestRunId : undefined) ??
    entry?.latestRunId ??
    session?.latestRunId;

  if (activeId && runId) {
    return { agentId: activeId, runId };
  }

  const pending = (await listPendingRuns(env))
    .filter((p) => p.userId === userId || p.chatId === chatId)
    .at(-1);

  if (!pending) return null;

  return { agentId: pending.agentId, runId: pending.runId };
}

async function handleStatus(
  env: Env,
  chatId: number,
  userId: number,
): Promise<void> {
  await sendChatAction(env, chatId, "typing");

  const session = await getNormalizedSession(env, userId);
  const target = await resolveStatusRunTarget(env, userId, chatId, session);

  if (!target) {
    await sendMessage(env, chatId, "Hozircha faol run yo'q.\n\nAgent tanlash: /agents");
    return;
  }

  try {
    const run = await getRunForDisplay(env, target.agentId, target.runId);

    if (isTerminal(run.status)) {
      await clearPendingForManualStatus(env, target.runId);
    }

    await sendRunResult(env, chatId, run);
  } catch (error) {
    await sendMessage(
      env,
      chatId,
      `Status olinmadi: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function handleNew(
  env: Env,
  chatId: number,
  userId: number,
  prompt: string,
  ctx: ExecutionContext,
  workerOrigin: string,
): Promise<void> {
  const session = await getNormalizedSession(env, userId);
  const repoUrl = await defaultRepo(env, session, userId);

  if (!repoUrl) {
    await sendMessage(
      env,
      chatId,
      "Avval repo belgilang:\n/repo https://github.com/user/telegram-cursor-bot",
    );
    return;
  }

  const promptCtx = await resolvePromptContext(env, userId, null);
  const wrappedPrompt = buildAgentPrompt(
    prompt || "Yangi agent tayyor.",
    promptCtx,
    { isNewAgent: true },
  );

  await startAgentRun(
    env,
    chatId,
    userId,
    wrappedPrompt,
    repoUrl,
    true,
    ctx,
    workerOrigin,
    promptCtx.folder,
    promptCtx,
  );
}

async function dispatchPrompt(
  env: Env,
  chatId: number,
  userId: number,
  prompt: string,
  ctx: ExecutionContext,
  workerOrigin: string,
): Promise<void> {
  const session = await getNormalizedSession(env, userId);
  const repoUrl = await defaultRepo(env, session, userId);
  const activeId = await resolveActiveAgentId(env, userId, session);

  if (activeId) {
    const entry = await getActiveAgentEntry(env, userId, session);
    const prepared = await preparePromptForDispatch(env, userId, prompt, {
      isNewAgent: false,
      agentEntry: entry,
    });
    if (!prepared.ok) {
      await sendMessage(env, chatId, prepared.message);
      return;
    }

    await continueAgentRun(
      env,
      chatId,
      userId,
      activeId,
      prepared.wrappedPrompt,
      ctx,
      workerOrigin,
      prepared.workspaceFolder,
      prepared.ctx,
    );
    return;
  }

  if (!repoUrl) {
    await sendMessage(
      env,
      chatId,
      "Birinchi marta repo kerak:\n/repo https://github.com/user/repo\n\nKeyin shu matnni qayta yuboring.",
    );
    return;
  }

  const prepared = await preparePromptForDispatch(env, userId, prompt, {
    isNewAgent: true,
  });
  if (!prepared.ok) {
    await sendMessage(env, chatId, prepared.message);
    return;
  }

  await startAgentRun(
    env,
    chatId,
    userId,
    prepared.wrappedPrompt,
    repoUrl,
    false,
    ctx,
    workerOrigin,
    prepared.workspaceFolder,
    prepared.ctx,
  );
}

async function startAgentRun(
  env: Env,
  chatId: number,
  userId: number,
  prompt: string,
  repoUrl: string,
  forceNew: boolean,
  execCtx: ExecutionContext,
  workerOrigin: string,
  workspaceFolder?: string,
  promptCtx?: PromptContext,
): Promise<void> {
  await sendChatAction(env, chatId, "typing");

  const pCtx =
    promptCtx ?? (await resolvePromptContext(env, userId, null));
  const scope: WorkspaceScope =
    pCtx.mode === "system"
      ? { kind: "system" }
      : pCtx.mode === "project" && pCtx.folder
        ? { kind: "folder", folder: pCtx.folder }
        : { kind: "none" };

  let sentToAgent = false;

  try {
    const { agent, run } = await createAgent(env, prompt, repoUrl);
    sentToAgent = true;
    await registerAgent(
      env,
      userId,
      agent,
      run,
      repoUrl,
      workspaceFolder ?? pCtx.folder,
    );
    const agentNumber = (
      await getNormalizedSession(env, userId)
    )?.agents?.findIndex((a) => a.agentId === agent.id);
    const scopeLabel = formatWorkspaceStatus(scope, pCtx);

    await sendMessage(
      env,
      chatId,
      [
        forceNew ? "Yangi agent ochildi." : "Agent ishga tushdi.",
        scopeLabel,
        pCtx.stealth ? "Agent egasiga o'xshash rejimda ishlaydi." : null,
        agentNumber != null && agentNumber >= 0
          ? `Ro'yxatdagi raqam: ${agentNumber + 1}`
          : null,
        workspaceFolder ?? pCtx.folder
          ? `Papka: ${workspaceFolder ?? pCtx.folder}/`
          : null,
        pCtx.mode === "awaiting_folder"
          ? "Avval papka yarating yoki /papka nom bering."
          : null,
        `Agent: ${agent.url}`,
        `Run: ${run.id}`,
        "",
        "Natija tayyor bo'lganda xabar yuboraman...",
        isBootstrapAdmin(env, userId)
          ? "Boshqa agent: /agents → /use 2"
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );

    execCtx.waitUntil(kickoffPendingPoll(env, workerOrigin));
    execCtx.waitUntil(
      trackRunUntilFinished(env, chatId, userId, agent.id, run.id),
    );
  } catch (error) {
    if (isKvWriteLimitError(error)) {
      await sendMessage(
        env,
        chatId,
        formatKvLimitMessage(
          sentToAgent
            ? "Vazifa agentga yuborilgan bo'lishi mumkin. Limit yangilangach /status bilan tekshiring."
            : undefined,
        ),
      );
      return;
    }

    await sendMessage(
      env,
      chatId,
      `Agent ochilmadi: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function continueAgentRun(
  env: Env,
  chatId: number,
  userId: number,
  agentId: string,
  prompt: string,
  execCtx: ExecutionContext,
  workerOrigin: string,
  workspaceFolder?: string,
  promptCtx?: PromptContext,
): Promise<void> {
  await sendChatAction(env, chatId, "typing");

  let sentToAgent = false;

  try {
    const { run } = await createRun(env, agentId, prompt);
    sentToAgent = true;
    const session = await updateAgentRun(env, userId, agentId, run.id);
    const entry = session.agents?.find((a) => a.agentId === agentId);
    const folder = workspaceFolder ?? entry?.workspaceFolder ?? promptCtx?.folder;

    await sendMessage(
      env,
      chatId,
      [
        "Buyruq yuborildi.",
        promptCtx?.stealth ? "(egasi rejimi — chat davom etadi)" : null,
        entry ? `Agent: ${entry.name}` : null,
        folder ? `Papka: ${folder}/` : null,
        `Run: ${run.id}`,
        "",
        "Kutilmoqda...",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    execCtx.waitUntil(kickoffPendingPoll(env, workerOrigin));
    execCtx.waitUntil(
      trackRunUntilFinished(env, chatId, userId, agentId, run.id),
    );
  } catch (error) {
    if (isKvWriteLimitError(error)) {
      await sendMessage(
        env,
        chatId,
        formatKvLimitMessage(
          sentToAgent
            ? "Vazifa agentga yuborilgan bo'lishi mumkin. Limit yangilangach /status bilan tekshiring."
            : undefined,
        ),
      );
      return;
    }

    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("409") || message.includes("agent_busy")) {
      await sendMessage(
        env,
        chatId,
        "Agent hozir band. Biroz kutib /status yoki qayta yuboring.",
      );
      return;
    }

    await sendMessage(env, chatId, `Run yuborilmadi: ${message}`);
  }
}

async function trackRunUntilFinished(
  env: Env,
  chatId: number,
  userId: number,
  agentId: string,
  runId: string,
): Promise<void> {
  const pending = {
    chatId,
    userId,
    agentId,
    runId,
    createdAt: new Date().toISOString(),
  };

  await addPendingRun(env, pending);

  try {
    const run = await pollRunAndFormat(
      env,
      agentId,
      runId,
      TRACK_RUN_MAX_ATTEMPTS,
      TRACK_RUN_INTERVAL_MS,
    );
    if (isTerminal(run.status)) {
      await notifyIfFinished(env, pending);
    }
  } catch (error) {
    console.error(
      `Run ${runId} kuzatilmadi:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}
