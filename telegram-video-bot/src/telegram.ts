import type { BotKind } from "./bots";
import {
  ensureBotTokens,
  getAdminBotToken,
  getBotToken,
  getUserBotToken,
} from "./bots";
import { getWebhookSecret } from "./config";
import type { Env } from "./types";

const TELEGRAM_API = "https://api.telegram.org";

export const USER_BOT_COMMANDS = [
  { command: "start", description: "Botni boshlash" },
  { command: "help", description: "Yordam" },
  { command: "info", description: "Video haqida ma'lumot" },
  { command: "check", description: "Obunani tekshirish" },
  { command: "ping", description: "Tekshirish" },
] as const;

export const ADMIN_BOT_COMMANDS = [
  { command: "start", description: "Admin botni boshlash" },
  { command: "help", description: "Yordam" },
  { command: "list", description: "Videolar ro'yxati" },
  { command: "delete", description: "Video o'chirish" },
  { command: "stats", description: "Statistika" },
  { command: "panel", description: "Admin panel (bot ichida)" },
  { command: "info", description: "Video haqida ma'lumot" },
  { command: "ping", description: "Tekshirish" },
] as const;

export async function setBotCommands(
  env: Env,
  kind: BotKind,
): Promise<boolean> {
  const token = getBotToken(env, kind);
  const commands =
    kind === "admin" ? ADMIN_BOT_COMMANDS : USER_BOT_COMMANDS;

  const response = await fetch(`${TELEGRAM_API}/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Telegram setMyCommands (${kind}) failed:`, response.status, body);
    return false;
  }

  return true;
}

export async function sendMessage(
  env: Env,
  chatId: number,
  text: string,
  options?: {
    bot?: BotKind;
    replyMarkup?:
      | {
          inline_keyboard: Array<
            Array<{ text: string; url?: string; callback_data?: string }>
          >;
        }
      | {
          keyboard: Array<Array<{ text: string }>>;
          resize_keyboard?: boolean;
        };
  },
): Promise<void> {
  const token = getBotToken(env, options?.bot ?? "user");
  const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("Telegram sendMessage failed:", response.status, body);
  }
}

export async function answerCallbackQuery(
  env: Env,
  callbackQueryId: string,
  text?: string,
  bot: BotKind = "user",
): Promise<void> {
  const response = await fetch(
    `${TELEGRAM_API}/bot${getBotToken(env, bot)}/answerCallbackQuery`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        ...(text ? { text, show_alert: true } : {}),
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    console.error("answerCallbackQuery failed:", response.status, body);
  }
}

export async function editMessageText(
  env: Env,
  chatId: number,
  messageId: number,
  text: string,
  options?: {
    bot?: BotKind;
    replyMarkup?: {
      inline_keyboard: Array<
        Array<{ text: string; url?: string; callback_data?: string }>
      >;
    };
  },
): Promise<void> {
  const token = getBotToken(env, options?.bot ?? "user");
  const response = await fetch(`${TELEGRAM_API}/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("editMessageText failed:", response.status, body);
  }
}

export async function sendVideoByFileId(
  env: Env,
  chatId: number,
  fileId: string,
  caption?: string,
): Promise<boolean> {
  const response = await fetch(
    `${TELEGRAM_API}/bot${getUserBotToken(env)}/sendVideo`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        video: fileId,
        ...(caption ? { caption } : {}),
      }),
    },
  );

  if (response.ok) return true;

  const body = await response.text();
  console.error("Telegram sendVideo failed:", response.status, body);
  return false;
}

export async function sendDocumentByFileId(
  env: Env,
  chatId: number,
  fileId: string,
  caption?: string,
): Promise<boolean> {
  const response = await fetch(
    `${TELEGRAM_API}/bot${getUserBotToken(env)}/sendDocument`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        document: fileId,
        ...(caption ? { caption } : {}),
      }),
    },
  );

  if (response.ok) return true;

  const body = await response.text();
  console.error("Telegram sendDocument failed:", response.status, body);
  return false;
}

export async function setWebhook(
  token: string,
  webhookUrl: string,
  secret: string,
): Promise<Response> {
  return fetch(`${TELEGRAM_API}/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    }),
  });
}

export async function configureWebhookFromEnv(
  env: Env,
  workerOrigin: string,
): Promise<{
  user: { ok: boolean; status: number; body: string };
  admin?: { ok: boolean; status: number; body: string };
}> {
  await ensureBotTokens(env);
  const origin = workerOrigin.replace(/\/$/, "");
  const secret = getWebhookSecret(env);
  const userToken = getUserBotToken(env);
  const adminToken = getAdminBotToken(env);

  const userResponse = await setWebhook(
    userToken,
    `${origin}/webhook`,
    secret,
  );
  const userBody = await userResponse.text();
  if (userResponse.ok) {
    await setBotCommands(env, "user");
  }

  const result: {
    user: { ok: boolean; status: number; body: string };
    admin?: { ok: boolean; status: number; body: string };
  } = {
    user: {
      ok: userResponse.ok,
      status: userResponse.status,
      body: userBody,
    },
  };

  const adminTokenTrimmed = adminToken.trim();
  if (adminTokenTrimmed) {
    const adminResponse = await setWebhook(
      adminTokenTrimmed,
      `${origin}/webhook-admin`,
      secret,
    );
    const adminBody = await adminResponse.text();
    if (adminResponse.ok) {
      await setBotCommands(env, "admin");
    }
    result.admin = {
      ok: adminResponse.ok,
      status: adminResponse.status,
      body: adminBody,
    };
  }

  return result;
}

export async function getWebhookInfo(env: Env): Promise<unknown> {
  await ensureBotTokens(env);
  const userToken = getUserBotToken(env);
  const adminToken = getAdminBotToken(env);

  const userInfo = await fetch(
    `${TELEGRAM_API}/bot${userToken}/getWebhookInfo`,
  ).then((r) => r.json());

  if (!adminToken.trim()) {
    return { user: userInfo };
  }

  const adminInfo = await fetch(
    `${TELEGRAM_API}/bot${adminToken}/getWebhookInfo`,
  ).then((r) => r.json());

  return { user: userInfo, admin: adminInfo };
}
