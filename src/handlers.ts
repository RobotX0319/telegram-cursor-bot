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
  getPrimaryBootstrapId,
  isAllowedUser,
  isBootstrapAdmin,
  isPrimaryBootstrapAdmin,
  listAllAdminIds,
  listStoredAdmins,
  removeAdmin,
} from "./admins";
import {
  createAgent,
  createRun,
  formatRunResult,
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
  type PendingRun,
} from "./pending";
import {
  assertKvWritable,
  formatKvLimitMessage,
  isKvWriteLimitError,
} from "./kv-store";
import {
  approveRequest,
  consumeGrantedPrompt,
  createPermissionRequest,
  denyRequest,
} from "./permissions";
import { checkTaskScope } from "./scope";
import { saveCursorApiKey } from "./secrets";
import { defaultRepo, updateSession } from "./session";
import { sendChatAction, sendMessage } from "./telegram";
import type { Env, TelegramMessage } from "./types";
import { provisionUserRepo, syncAllUserRepos, getRepoForUser } from "./user-repos";
import { BUILD_DATE, VERSION } from "./version";

const HELP_TEXT = `Telegram → Cursor Cloud Agent bot

Buyruqlar:
/start — xush kelibsiz
/help — yordam
/status — agent va run holati
/repo <url> — faqat asosiy admin (boshqalar o'z repoda)
/new — yangi cloud agent ochish
/agents — barcha agentlar ro'yxati
/use 2 — agent tanlash (raqam yoki ID)
/agent — faol agent haqida
/request <vazifa> — cheklangan vazifa uchun ruxsat so'rash
/admin list — adminlar ro'yxati
/admin add <id> — yangi admin (+ avtomatik repo)
/admin provision-repos — barcha userlar uchun repo yaratish
/admin remove <id> — adminni olib tashlash
/approve <id> — ruxsat berish (asosiy admin)
/deny <id> — ruxsat rad etish (asosiy admin)
/setkey <key> — Cursor API kalitini saqlash (faqat admin)
/version — bot versiyasi

Har bir admin o'z GitHub repoda ishlaydi (izolyatsiya).
Agent faqat Telegram bot va web interface vazifalarida ishlaydi.
Boshqa vazifa: /request yoki asosiy admindan ruxsat.

Asosiy admin barcha agentlarni ko'radi.
Boshqa adminlar faqat o'z agentlarini ko'radi.`;

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
      await handleCommand(env, chatId, userId, text, ctx, workerOrigin);
      return;
    }

    await dispatchPrompt(env, chatId, userId, text, ctx, workerOrigin);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("handleMessage failed:", msg);
    await sendMessage(
      env,
      chatId,
      isKvWriteLimitError(error)
        ? formatKvLimitMessage()
        : [
            "Bot xatolik berdi. Qayta urinib ko'ring.",
            msg,
            "",
            "/ping — tekshirish",
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

    case "/request":
      await handleRequest(env, chatId, userId, args);
      return;

    case "/approve":
      await handleApprove(env, chatId, userId, args);
      return;

    case "/deny":
      await handleDeny(env, chatId, userId, args);
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

    case "provision-repos":
    case "provision":
      await handleAdminProvisionRepos(env, chatId, userId);
      return;

    case "remove":
    case "delete":
      await handleAdminRemove(env, chatId, value);
      return;

    default:
      await sendMessage(
        env,
        chatId,
        "Foydalanish:\n/admin list\n/admin add 123456789\n/admin provision-repos\n/admin remove 123456789",
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

  const lines: string[] = [];
  for (const id of allIds) {
    const uid = Number.parseInt(id, 10);
    const repo = Number.isNaN(uid) ? null : await getRepoForUser(env, uid);
    const repoLine = repo ? `\n   repo: ${repo}` : "\n   repo: (yaratilmagan)";

    if (bootstrapIds.has(id)) {
      const primaryId = getPrimaryBootstrapId(env);
      const label =
        primaryId === id
          ? "asosiy admin (telegram-cursor-bot)"
          : "asosiy admin (env)";
      lines.push(`${id} — ${label}${repoLine}`);
      continue;
    }

    const info = storedById.get(id);
    lines.push(
      info
        ? `${id} — qo'shilgan (${info.addedBy})${repoLine}`
        : `${id} — admin${repoLine}`,
    );
  }

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

  await sendChatAction(env, chatId, "typing");

  try {
    const { url, created, deployed } = await provisionUserRepo(
      env,
      Number.parseInt(targetId, 10),
      userId,
    );
    await sendMessage(
      env,
      chatId,
      [
        `Yangi admin qo'shildi: ${targetId}`,
        created ? "Yangi GitHub repo yaratildi:" : "Mavjud repo biriktirildi:",
        url,
        deployed
          ? "Worker deploy qilindi (webhook orqali)."
          : "Deploy: git push → avtomatik.",
        "",
        "Endi u faqat o'z repoda ishlaydi.",
      ].join("\n"),
    );
  } catch (error) {
    await sendMessage(
      env,
      chatId,
      [
        `Admin qo'shildi: ${targetId}`,
        `Repo yaratilmadi: ${error instanceof Error ? error.message : String(error)}`,
        "",
        "GITHUB_TOKEN sozlang, keyin: /admin provision-repos",
      ].join("\n"),
    );
  }
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

  await sendChatAction(env, chatId, "typing");

  const result = await selectAgent(env, userId, selector);
  if (!result.ok) {
    await sendMessage(env, chatId, result.error);
    return;
  }

  const { entry } = result;
  await sendMessage(
    env,
    chatId,
    [`Faol agent: ${entry.name} ★`, "", "Matn yuboring — shu agentga ketadi."].join(
      "\n",
    ),
  );
}

async function handleAdminProvisionRepos(
  env: Env,
  chatId: number,
  userId: number,
): Promise<void> {
  if (!isBootstrapAdmin(env, userId)) {
    await sendMessage(env, chatId, "Faqat asosiy admin.");
    return;
  }

  await sendChatAction(env, chatId, "typing");

  try {
    const results = await syncAllUserRepos(env, userId);
    const lines = results.map((r) => {
      const status = r.error
        ? `XATO: ${r.error}`
        : r.deployed
          ? "Worker deploy qilindi"
          : "tayyor";
      const warn =
        r.warnings?.length ? `\n   ⚠ ${r.warnings.join(" ")}` : "";
      return `${r.userId}: ${r.url} (${status})${warn}`;
    });

    await sendMessage(
      env,
      chatId,
      ["Repo natijalari:", "", ...lines].join("\n"),
    );
  } catch (error) {
    await sendMessage(
      env,
      chatId,
      `Provision xato: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function handleRequest(
  env: Env,
  chatId: number,
  userId: number,
  prompt: string,
): Promise<void> {
  if (!prompt) {
    await sendMessage(env, chatId, "Foydalanish: /request <vazifa tavsifi>");
    return;
  }

  const req = await createPermissionRequest(env, userId, chatId, prompt);
  await sendMessage(
    env,
    chatId,
    [
      "Ruxsat so'rovi yuborildi.",
      `ID: ${req.id}`,
      "",
      "Asosiy admin javobini kuting.",
    ].join("\n"),
  );
}

async function handleApprove(
  env: Env,
  chatId: number,
  userId: number,
  requestId: string,
): Promise<void> {
  if (!isBootstrapAdmin(env, userId)) {
    await sendMessage(env, chatId, "Faqat asosiy admin /approve ishlata oladi.");
    return;
  }

  if (!requestId) {
    await sendMessage(env, chatId, "Foydalanish: /approve <so'rov_id>");
    return;
  }

  const req = await approveRequest(env, requestId, userId);
  if (!req) {
    await sendMessage(env, chatId, "So'rov topilmadi yoki allaqachon hal qilingan.");
    return;
  }

  await sendMessage(env, chatId, `Tasdiqlandi: ${requestId} → user ${req.userId}`);
}

async function handleDeny(
  env: Env,
  chatId: number,
  userId: number,
  requestId: string,
): Promise<void> {
  if (!isBootstrapAdmin(env, userId)) {
    await sendMessage(env, chatId, "Faqat asosiy admin /deny ishlata oladi.");
    return;
  }

  if (!requestId) {
    await sendMessage(env, chatId, "Foydalanish: /deny <so'rov_id>");
    return;
  }

  const req = await denyRequest(env, requestId, userId);
  if (!req) {
    await sendMessage(env, chatId, "So'rov topilmadi yoki allaqachon hal qilingan.");
    return;
  }

  await sendMessage(env, chatId, `Rad etildi: ${requestId}`);
}

async function ensureScopeAllowed(
  env: Env,
  chatId: number,
  userId: number,
  prompt: string,
): Promise<boolean> {
  if (isBootstrapAdmin(env, userId)) return true;

  if (await consumeGrantedPrompt(env, userId, prompt)) return true;

  const scope = checkTaskScope(prompt);
  if (scope.ok) return true;

  if (scope.reason === "blocked") {
    await sendMessage(env, chatId, scope.message);
    return false;
  }

  await sendMessage(
    env,
    chatId,
    [
      scope.message,
      "",
      "Ruxsat so'rash: /request " + prompt.slice(0, 200),
    ].join("\n"),
  );
  return false;
}

async function handleRepo(
  env: Env,
  chatId: number,
  userId: number,
  repoUrl: string,
): Promise<void> {
  if (!isBootstrapAdmin(env, userId)) {
    await sendMessage(
      env,
      chatId,
      "Repo faqat avtomatik biriktiriladi.\n/admin list — sizning repoingiz",
    );
    return;
  }

  if (isPrimaryBootstrapAdmin(env, userId)) {
    const fixed = await getRepoForUser(env, userId);
    await sendMessage(
      env,
      chatId,
      fixed
        ? `Asosiy admin doim shu repoda ishlaydi:\n${fixed}\n\nO'zgartirib bo'lmaydi.`
        : "DEFAULT_GITHUB_REPO sozlanmagan.",
    );
    return;
  }

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
        `Holat: ${agent.status}`,
        entry?.latestRunId ? "Oxirgi vazifa bajarilgan." : null,
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
  const activeId =
    session?.activeAgentId ??
    (await resolveActiveAgentId(env, userId, session));
  const entry = activeId
    ? await getActiveAgentEntry(env, userId, session)
    : null;
  const runId = session?.latestRunId ?? entry?.latestRunId;

  if (!activeId) {
    await sendMessage(env, chatId, "Faol agent yo'q.\n\n/agents → /use 1");
    return;
  }

  if (!runId) {
    await sendMessage(
      env,
      chatId,
      "Hali vazifa yuborilmagan.\n\nMatn yuboring yoki /new",
    );
    return;
  }

  try {
    const run = await getRun(env, activeId, runId);

    if (isTerminal(run.status)) {
      await clearPendingForManualStatus(env, runId);
    }

    await sendMessage(env, chatId, formatRunResult(run));
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
      "Repo topilmadi.\nAsosiy admin: /admin provision-repos",
    );
    return;
  }

  if (!(await ensureScopeAllowed(env, chatId, userId, prompt))) return;

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
  const repoUrl = await defaultRepo(env, session, userId);
  const activeId = await resolveActiveAgentId(env, userId, session);

  if (!(await ensureScopeAllowed(env, chatId, userId, prompt))) return;

  if (activeId) {
    await continueAgentRun(env, chatId, userId, activeId, prompt, ctx, workerOrigin);
    return;
  }

  if (!repoUrl) {
    await sendMessage(
      env,
      chatId,
      "Repo topilmadi.\nAsosiy admin: /admin provision-repos",
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

  let sentToAgent = false;

  try {
    await assertKvWritable(env.SESSIONS);

    const { agent, run } = await createAgent(env, prompt, repoUrl);
    sentToAgent = true;
    await registerAgent(env, userId, agent, run, repoUrl);

    const pending: PendingRun = {
      chatId,
      userId,
      agentId: agent.id,
      runId: run.id,
      createdAt: new Date().toISOString(),
    };
    await addPendingRun(env, pending);

    await sendMessage(
      env,
      chatId,
      forceNew
        ? "Yangi agent ochildi. Kutilmoqda..."
        : "Yuborildi. Kutilmoqda...",
    );

    ctx.waitUntil(kickoffPendingPoll(env, workerOrigin));
    ctx.waitUntil(trackRunUntilFinished(env, pending));
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
  ctx: ExecutionContext,
  workerOrigin: string,
): Promise<void> {
  await sendChatAction(env, chatId, "typing");

  let sentToAgent = false;

  try {
    await assertKvWritable(env.SESSIONS);

    const { run } = await createRun(env, agentId, prompt);
    sentToAgent = true;
    await updateAgentRun(env, userId, agentId, run.id);

    const pending: PendingRun = {
      chatId,
      userId,
      agentId,
      runId: run.id,
      createdAt: new Date().toISOString(),
    };
    await addPendingRun(env, pending);

    await sendMessage(env, chatId, "Yuborildi. Kutilmoqda...");

    ctx.waitUntil(kickoffPendingPoll(env, workerOrigin));
    ctx.waitUntil(trackRunUntilFinished(env, pending));
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
  pending: PendingRun,
): Promise<void> {
  try {
    const run = await pollRunAndFormat(
      env,
      pending.agentId,
      pending.runId,
      3,
      3000,
    );
    if (isTerminal(run.status)) {
      await notifyIfFinished(env, pending);
    }
  } catch (error) {
    console.error(
      `Run ${pending.runId} kuzatilmadi:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}
