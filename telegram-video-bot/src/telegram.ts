import type { Env } from "./types";

const TELEGRAM_API = "https://api.telegram.org";

export const BOT_COMMANDS = [
  { command: "start", description: "Botni boshlash" },
  { command: "help", description: "Yordam" },
  { command: "info", description: "Video haqida ma'lumot" },
  { command: "list", description: "Videolar ro'yxati (admin)" },
  { command: "delete", description: "Video o'chirish (admin)" },
  { command: "stats", description: "Statistika (admin)" },
  { command: "panel", description: "Admin panel (admin)" },
  { command: "check", description: "Obunani tekshirish" },
  { command: "ping", description: "Tekshirish" },
] as const;

export async function setBotCommands(env: Env): Promise<boolean> {
  const response = await fetch(
    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/setMyCommands`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands: BOT_COMMANDS }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    console.error("Telegram setMyCommands failed:", response.status, body);
    return false;
  }

  return true;
}

export async function sendMessage(
  env: Env,
  chatId: number,
  text: string,
  options?: {
    replyMarkup?: {
      inline_keyboard: Array<
        Array<{ text: string; url?: string; callback_data?: string }>
      >;
    };
  },
): Promise<void> {
  const response = await fetch(
    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    console.error("Telegram sendMessage failed:", response.status, body);
  }
}

export async function answerCallbackQuery(
  env: Env,
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  const response = await fetch(
    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
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

export async function sendVideoByFileId(
  env: Env,
  chatId: number,
  fileId: string,
  caption?: string,
): Promise<boolean> {
  const response = await fetch(
    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendVideo`,
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
    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`,
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
): Promise<{ ok: boolean; status: number; body: string }> {
  const webhookUrl = `${workerOrigin.replace(/\/$/, "")}/webhook`;
  const response = await setWebhook(
    env.TELEGRAM_BOT_TOKEN,
    webhookUrl,
    env.TELEGRAM_WEBHOOK_SECRET,
  );
  const body = await response.text();
  const commandsSet = response.ok ? await setBotCommands(env) : false;
  return {
    ok: response.ok,
    status: response.status,
    body: commandsSet
      ? body
      : `${body}\n(setMyCommands failed — buyruqlar menyusi o'rnatilmadi)`,
  };
}

export async function getWebhookInfo(env: Env): Promise<unknown> {
  const response = await fetch(
    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`,
  );
  return response.json();
}
