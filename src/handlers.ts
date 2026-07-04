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
} from "./pending";
import { defaultRepo, getSession, updateSession } from "./session";
import { sendChatAction, sendMessage } from "./telegram";
import type { Env, TelegramMessage } from "./types";

const HELP_TEXT = `Telegram → Cursor Cloud Agent bot

Buyruqlar:
/start — xush kelibsiz
/help — yordam
/status — agent va run holati
/repo <url> — GitHub repo (masalan https://github.com/user/repo)
/new — yangi cloud agent ochish
/agent — faol agent haqida

Oddiy matn yoki /ask <prompt> — agentga vazifa yuborish

Masalan:
/ask README ga o'rnatish bo'limini qo'sh
Yoki shunchaki: src/index.ts dagi xatoni tuzat

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

  if (env.ALLOWED_USER_ID && String(userId) !== env.ALLOWED_USER_ID) {
    await sendMessage(
      env,
      chatId,
      "Ruxsat yo'q. ALLOWED_USER_ID ga Telegram user ID ni qo'shing.",
    );
    return;
  }

  if (text.startsWith("/")) {
    await handleCommand(env, chatId, userId, text, ctx, workerOrigin);
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

    case "/agent":
      await handleAgentInfo(env, chatId, userId);
      return;

    case "/ask":
      if (!args) {
        await sendMessage(env, chatId, "Foydalanish: /ask <prompt>");
        return;
      }
      await dispatchPrompt(env, chatId, userId, args, ctx, workerOrigin);
      return;

    case "/ping":
      await sendMessage(env, chatId, "pong");
      return;

    default:
      await sendMessage(env, chatId, "Noma'lum buyruq. /help");
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

async function handleAgentInfo(
  env: Env,
  chatId: number,
  userId: number,
): Promise<void> {
  const session = await getSession(env, userId);
  if (!session?.agentId) {
    await sendMessage(env, chatId, "Faol agent yo'q. /new yoki matn yuboring.");
    return;
  }

  try {
    const agent = await getAgent(env, session.agentId);
    await sendMessage(
      env,
      chatId,
      [
        `Agent: ${agent.name}`,
        `ID: ${agent.id}`,
        `Status: ${agent.status}`,
        `URL: ${agent.url}`,
        session.latestRunId ? `Latest run: ${session.latestRunId}` : null,
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
  const session = await getSession(env, userId);
  if (!session?.agentId || !session.latestRunId) {
    await sendMessage(env, chatId, "Hozircha faol run yo'q.");
    return;
  }

  try {
    const run = await getRun(env, session.agentId, session.latestRunId);

    if (isTerminal(run.status)) {
      await clearPendingForManualStatus(env, session.latestRunId);
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
  const session = await getSession(env, userId);
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
  const session = await getSession(env, userId);
  const repoUrl = defaultRepo(env, session);

  if (session?.agentId) {
    await continueAgentRun(env, chatId, userId, session.agentId, prompt, ctx, workerOrigin);
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

    await updateSession(env, userId, {
      agentId: agent.id,
      repoUrl,
      latestRunId: run.id,
    });

    await sendMessage(
      env,
      chatId,
      [
        forceNew ? "Yangi agent ochildi." : "Agent ishga tushdi.",
        `Agent: ${agent.url}`,
        `Run: ${run.id}`,
        "",
        "Natija tayyor bo'lganda xabar yuboraman...",
      ].join("\n"),
    );

    ctx.waitUntil(
      trackRunUntilFinished(env, chatId, userId, agent.id, run.id, workerOrigin),
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

    await updateSession(env, userId, {
      agentId,
      latestRunId: run.id,
    });

    await sendMessage(
      env,
      chatId,
      [`Buyruq yuborildi.`, `Run: ${run.id}`, "", "Kutilmoqda..."].join("\n"),
    );

    ctx.waitUntil(
      trackRunUntilFinished(env, chatId, userId, agentId, run.id, workerOrigin),
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
  workerOrigin: string,
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
    // waitUntil faqat ~30 soniya ishlaydi — tez tugagan runlar uchun qisqa polling
    const run = await pollRunAndFormat(env, agentId, runId, 5, 5000);
    if (isTerminal(run.status)) {
      await notifyIfFinished(env, pending);
      return;
    }
  } catch (error) {
    console.error(
      `Run ${runId} kuzatilmadi:`,
      error instanceof Error ? error.message : String(error),
    );
  }

  await kickoffPendingPoll(env, workerOrigin);
}
