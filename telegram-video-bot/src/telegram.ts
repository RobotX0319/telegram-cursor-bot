import type { Env } from "./types";

const TELEGRAM_API = "https://api.telegram.org";

export type BotKind = "user" | "admin";

export function getBotToken(env: Env, bot: BotKind): string {
  return bot === "admin"
    ? env.TELEGRAM_ADMIN_BOT_TOKEN
    : env.TELEGRAM_BOT_TOKEN;
}

export const USER_BOT_COMMANDS = [
  { command: "start", description: "Botni boshlash" },
  { command: "help", description: "Yordam" },
  { command: "info", description: "Video haqida ma'lumot" },
  { command: "check", description: "Obunani tekshirish" },
  { command: "ping", description: "Tekshirish" },
] as const;

export const ADMIN_BOT_COMMANDS = [
  { command: "start", description: "Admin bot" },
  { command: "help", description: "Yordam" },
  { command: "list", description: "Videolar ro'yxati" },
  { command: "delete", description: "Video o'chirish" },
  { command: "stats", description: "Statistika" },
  { command: "panel", description: "Web admin panel" },
  { command: "info", description: "Video tafsilotlari" },
  { command: "ping", description: "Tekshirish" },
] as const;

export async function setBotCommands(
  env: Env,
  bot: BotKind,
): Promise<boolean> {
  const token = getBotToken(env, bot);
  const commands = bot === "admin" ? ADMIN_BOT_COMMANDS : USER_BOT_COMMANDS;

  const response = await fetch(`${TELEGRAM_API}/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`setMyCommands (${bot}) failed:`, response.status, body);
    return false;
  }

  return true;
}

export async function sendMessage(
  env: Env,
  bot: BotKind,
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
  const token = getBotToken(env, bot);
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
    console.error(`sendMessage (${bot}) failed:`, response.status, body);
  }
}

export async function answerCallbackQuery(
  env: Env,
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  const token = getBotToken(env, "user");
  const response = await fetch(
    `${TELEGRAM_API}/bot${token}/answerCallbackQuery`,
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
  const token = getBotToken(env, "user");
  const response = await fetch(`${TELEGRAM_API}/bot${token}/sendVideo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      video: fileId,
      protect_content: true,
      supports_streaming: true,
      ...(caption ? { caption } : {}),
    }),
  });

  if (response.ok) return true;

  const body = await response.text();
  console.error("sendVideo failed:", response.status, body);
  return false;
}

export async function sendDocumentByFileId(
  env: Env,
  chatId: number,
  fileId: string,
  caption?: string,
): Promise<boolean> {
  const token = getBotToken(env, "user");
  const response = await fetch(`${TELEGRAM_API}/bot${token}/sendDocument`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      document: fileId,
      protect_content: true,
      ...(caption ? { caption } : {}),
    }),
  });

  if (response.ok) return true;

  const body = await response.text();
  console.error("sendDocument failed:", response.status, body);
  return false;
}

export async function setAdminMenuButton(
  env: Env,
  workerOrigin: string,
): Promise<void> {
  const token = getBotToken(env, "admin");
  const appUrl = `${workerOrigin.replace(/\/$/, "")}/admin/app`;

  const response = await fetch(`${TELEGRAM_API}/bot${token}/setChatMenuButton`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      menu_button: {
        type: "web_app",
        text: "Admin panel",
        web_app: { url: appUrl },
      },
    }),
  });

  if (!response.ok) {
    console.error("setChatMenuButton failed:", await response.text());
  }
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
  admin: { ok: boolean; status: number; body: string };
}> {
  const base = workerOrigin.replace(/\/$/, "");
  const secret = env.TELEGRAM_WEBHOOK_SECRET;

  const userResponse = await setWebhook(
    env.TELEGRAM_BOT_TOKEN,
    `${base}/webhook`,
    secret,
  );
  const userBody = await userResponse.text();
  if (userResponse.ok) {
    await setBotCommands(env, "user");
  }

  const adminResponse = await setWebhook(
    env.TELEGRAM_ADMIN_BOT_TOKEN,
    `${base}/webhook/admin`,
    secret,
  );
  const adminBody = await adminResponse.text();
  if (adminResponse.ok) {
    await setBotCommands(env, "admin");
    await setAdminMenuButton(env, base);
  }

  return {
    user: { ok: userResponse.ok, status: userResponse.status, body: userBody },
    admin: {
      ok: adminResponse.ok,
      status: adminResponse.status,
      body: adminBody,
    },
  };
}

export async function getWebhookInfo(
  env: Env,
): Promise<{ user: unknown; admin: unknown }> {
  const [userRes, adminRes] = await Promise.all([
    fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`),
    fetch(
      `${TELEGRAM_API}/bot${env.TELEGRAM_ADMIN_BOT_TOKEN}/getWebhookInfo`,
    ),
  ]);

  return {
    user: await userRes.json(),
    admin: await adminRes.json(),
  };
}
