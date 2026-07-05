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
  { command: "karta", description: "To'lov kartalari" },
  { command: "ping", description: "Tekshirish" },
] as const;

export const ADMIN_BOT_COMMANDS = [
  { command: "start", description: "Admin botni boshlash" },
  { command: "help", description: "Yordam" },
  { command: "panel", description: "Admin panel" },
  { command: "adminol", description: "Admin bo'lish" },
  { command: "meningid", description: "Telegram ID" },
  { command: "id", description: "Keyingi kino ID si" },
  { command: "list", description: "Kinolar ro'yxati" },
  { command: "delete", description: "Kino o'chirish" },
  { command: "stats", description: "Statistika" },
  { command: "info", description: "Kino haqida" },
  { command: "ping", description: "Tekshirish" },
] as const;

export async function deleteBotCommands(
  env: Env,
  kind: BotKind,
): Promise<boolean> {
  const token = getBotToken(env, kind);
  const response = await fetch(`${TELEGRAM_API}/bot${token}/deleteMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Telegram deleteMyCommands (${kind}) failed:`, response.status, body);
    return false;
  }

  return true;
}

export async function resetBotMenuButton(
  env: Env,
  kind: BotKind,
): Promise<boolean> {
  const token = getBotToken(env, kind);
  const response = await fetch(
    `${TELEGRAM_API}/bot${token}/setChatMenuButton`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menu_button: { type: "default" } }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    console.error(`Telegram setChatMenuButton (${kind}) failed:`, response.status, body);
    return false;
  }

  return true;
}

export async function getBotUsername(
  env: Env,
  kind: BotKind,
): Promise<string | null> {
  const token = getBotToken(env, kind);
  const response = await fetch(`${TELEGRAM_API}/bot${token}/getMe`);
  if (!response.ok) return null;

  const data = (await response.json()) as {
    ok?: boolean;
    result?: { username?: string };
  };
  return data.ok && data.result?.username ? `@${data.result.username}` : null;
}

export async function setBotCommands(
  env: Env,
  kind: BotKind,
): Promise<boolean> {
  const token = getBotToken(env, kind);
  const commands =
    kind === "admin" ? ADMIN_BOT_COMMANDS : USER_BOT_COMMANDS;

  await deleteBotCommands(env, kind);

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

  if (kind === "user") {
    await resetBotMenuButton(env, "user");
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
        }
      | { remove_keyboard: true };
  },
): Promise<boolean> {
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

  if (response.ok) return true;

  const body = await response.text();
  console.error("Telegram sendMessage failed:", response.status, body);

  if (options?.replyMarkup) {
    const retry = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return retry.ok;
  }

  return false;
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

export async function sendPhotoByFileId(
  env: Env,
  chatId: number | string,
  fileId: string,
  caption?: string,
): Promise<boolean> {
  const response = await fetch(
    `${TELEGRAM_API}/bot${getUserBotToken(env)}/sendPhoto`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: fileId,
        ...(caption ? { caption } : {}),
      }),
    },
  );

  if (response.ok) return true;

  const body = await response.text();
  console.error("Telegram sendPhoto failed:", response.status, body);
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
  user: { ok: boolean; status: number; body: string; username?: string | null };
  admin?: { ok: boolean; status: number; body: string; username?: string | null };
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
  let userUsername: string | null = null;
  if (userResponse.ok) {
    await setBotCommands(env, "user");
    userUsername = await getBotUsername(env, "user");
  }

  const result: {
    user: { ok: boolean; status: number; body: string; username?: string | null };
    admin?: { ok: boolean; status: number; body: string; username?: string | null };
  } = {
    user: {
      ok: userResponse.ok,
      status: userResponse.status,
      body: userBody,
      username: userUsername,
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
    let adminUsername: string | null = null;
    if (adminResponse.ok) {
      await setBotCommands(env, "admin");
      adminUsername = await getBotUsername(env, "admin");
    }
    result.admin = {
      ok: adminResponse.ok,
      status: adminResponse.status,
      body: adminBody,
      username: adminUsername,
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
