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
  getRun,
  isTerminal,
  pollRunAndFormat,
} from "./cursor";
import {
  addPendingRun,
  clearPendingForManualStatus,
  kickoffPendingPoll,
  notifyIfFinished,
} from "./pending";
import {
  STICKER_STATUSES,
  listStatusStickers,
  setStatusStickerFileId,
} from "./stickers";
import { saveCursorApiKey, resolveCursorApiKey } from "./secrets";
import { defaultRepo, updateSession } from "./session";
import { sendChatAction, sendMessage, sendRunResult } from "./telegram";
import type { Env, TelegramMessage } from "./types";
import { BUILD_DATE, VERSION } from "./version";

const HELP_TEXT = `Telegram → Cursor Cloud Agent bot

Buyruqlar:
/start — xush kelibsiz
/help — yordam
/status — agent va run holati
/repo <url> — GitHub repo (masalan https://github.com/user/repo)
/new — yangi cloud agent ochish
/agents — barcha agentlar ro'yxati
/use 2 — agent tanlash (raqam yoki ID)
/agent — faol agent haqida
/admin list — adminlar ro'yxati
/admin add <id> — yangi admin qo'shish
/admin remove <id> — adminni olib tashlash
/setkey <key> — Cursor API kalitini saqlash (faqat admin)
/version — bot versiyasi
/setsticker finished — stickerga javob qilib natija stikeri saqlash

Barcha adminlar bir xil agentlar va repo bilan ishlaydi.

Asosiy admin barcha agentlarni ko'radi.
Boshqa adminlar faqat o'z agentlarini ko'radi.

Oddiy matn yuboring — agentga vazifa ( /ask shart emas )

Masalan:
README ga o'rnatish bo'limini qo'sh
Yoki: src/index.ts dagi xatoni tuzat

Agent Cloudflare Worker kodini ham shu repoda o'zgartirishi mumkin.`;

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
      await sendMessage(env, chatId, HELP_TEXT);
      return;

    case "/status":
      await handleStatus(env, chatId, userId);
      return;

    case "/repo":
      await handleRepo(env, chatId, userId, args);
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
      await sendMessage(env, chatId, "pong");
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

    default:
      await sendMessage(
        env,
        chatId,
        "Foydalanish:\n/admin list\n/admin add 123456789\n/admin remove 123456789",
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

  const lines = allIds.map((id) => {
    if (bootstrapIds.has(id)) return `${id} — asosiy admin (env)`;
    const info = storedById.get(id);
    return info
      ? `${id} — qo'shilgan (${info.addedBy})`
      : `${id} — admin`;
  });

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
    `Yangi admin qo'shildi: ${targetId}\nEndi u botdan foydalanishi mumkin.`,
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
    await sendMessage(
      env,
      chatId,
      [
        `Agent: ${agent.name}`,
        `ID: ${agent.id}`,
        `Status: ${agent.status}`,
        `URL: ${agent.url}`,
        entry?.latestRunId ? `Latest run: ${entry.latestRunId}` : null,
        "",
        "Boshqa agent: /agents → /use 2",
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

async function handleStatus(
  env: Env,
  chatId: number,
  userId: number,
): Promise<void> {
  const session = await getNormalizedSession(env, userId);
  const activeId = await resolveActiveAgentId(env, userId, session);
  const entry = await getActiveAgentEntry(env, userId, session);
  const runId = entry?.latestRunId ?? session?.latestRunId;

  if (!activeId || !runId) {
    await sendMessage(env, chatId, "Hozircha faol run yo'q.\n\nAgent tanlash: /agents");
    return;
  }

  try {
    const run = await getRun(env, activeId, runId);

    if (isTerminal(run.status)) {
      await clearPendingForManualStatus(env, runId);
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
  const repoUrl = defaultRepo(env, session);

  if (!repoUrl) {
    await sendMessage(
      env,
      chatId,
      "Avval repo belgilang:\n/repo https://github.com/user/telegram-cursor-bot",
    );
    return;
  }

  await startAgentRun(env, chatId, userId, prompt, repoUrl, true, ctx, workerOrigin);
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
  const repoUrl = defaultRepo(env, session);
  const activeId = await resolveActiveAgentId(env, userId, session);

  if (activeId) {
    await continueAgentRun(env, chatId, userId, activeId, prompt, ctx, workerOrigin);
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

  await startAgentRun(env, chatId, userId, prompt, repoUrl, false, ctx, workerOrigin);
}

async function startAgentRun(
  env: Env,
  chatId: number,
  userId: number,
  prompt: string,
  repoUrl: string,
  forceNew: boolean,
  ctx: ExecutionContext,
  workerOrigin: string,
): Promise<void> {
  await sendChatAction(env, chatId, "typing");

  try {
    const { agent, run } = await createAgent(env, prompt, repoUrl);
    const session = await registerAgent(env, userId, agent, run, repoUrl);
    const agentNumber = session.agents?.findIndex((a) => a.agentId === agent.id);

    await sendMessage(
      env,
      chatId,
      [
        forceNew ? "Yangi agent ochildi." : "Agent ishga tushdi.",
        agentNumber != null && agentNumber >= 0
          ? `Ro'yxatdagi raqam: ${agentNumber + 1}`
          : null,
        `Agent: ${agent.url}`,
        `Run: ${run.id}`,
        "",
        "Natija tayyor bo'lganda xabar yuboraman...",
        "Boshqa agent: /agents → /use 2",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    ctx.waitUntil(kickoffPendingPoll(env, workerOrigin));
    ctx.waitUntil(
      trackRunUntilFinished(env, chatId, userId, agent.id, run.id),
    );
  } catch (error) {
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
  ctx: ExecutionContext,
  workerOrigin: string,
): Promise<void> {
  await sendChatAction(env, chatId, "typing");

  try {
    const { run } = await createRun(env, agentId, prompt);
    const session = await updateAgentRun(env, userId, agentId, run.id);
    const entry = session.agents?.find((a) => a.agentId === agentId);

    await sendMessage(
      env,
      chatId,
      [
        `Buyruq yuborildi.`,
        entry ? `Agent: ${entry.name}` : null,
        `Run: ${run.id}`,
        "",
        "Kutilmoqda...",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    ctx.waitUntil(kickoffPendingPoll(env, workerOrigin));
    ctx.waitUntil(
      trackRunUntilFinished(env, chatId, userId, agentId, run.id),
    );
  } catch (error) {
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
    const run = await pollRunAndFormat(env, agentId, runId, 3, 3000);
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
