import type { Env } from "./types";

const TELEGRAM_API = "https://api.telegram.org";

export async function sendMessage(
  env: Env,
  chatId: number,
  text: string,
): Promise<void> {
  const response = await fetch(
    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    console.error("Telegram sendMessage failed:", response.status, body);
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
      allowed_updates: ["message"],
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
  return { ok: response.ok, status: response.status, body };
}

export async function getWebhookInfo(env: Env): Promise<unknown> {
  const response = await fetch(
    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`,
  );
  return response.json();
}
