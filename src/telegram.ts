import type { Env } from "./types";

const TELEGRAM_API = "https://api.telegram.org";

export async function sendMessage(
  env: Env,
  chatId: number,
  text: string,
  options?: { parseMode?: "Markdown" | "HTML" },
): Promise<void> {
  const chunks = splitMessage(text, 4096);
  for (const chunk of chunks) {
    const response = await fetch(
      `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      console.error("Telegram sendMessage failed:", response.status, body);
    }
  }
}

export async function sendChatAction(
  env: Env,
  chatId: number,
  action: "typing" | "upload_document" = "typing",
): Promise<void> {
  await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
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

const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

export function isValidWebhookSecret(secret: string): boolean {
  return WEBHOOK_SECRET_PATTERN.test(secret);
}

export async function configureWebhookFromEnv(
  env: Env,
  workerOrigin: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  if (!isValidWebhookSecret(env.TELEGRAM_WEBHOOK_SECRET)) {
    return {
      ok: false,
      status: 400,
      body: JSON.stringify({
        error:
          "TELEGRAM_WEBHOOK_SECRET faqat A-Z, a-z, 0-9, _ va - belgilaridan iborat bo'lishi kerak (1-256 belgi). Masalan: tg_cursor_bot_secret_2026",
      }),
    };
  }

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

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen / 2) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

export function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}
