import { markdownToTelegramHtml } from "./format";
import type { Env } from "./types";

const TELEGRAM_API = "https://api.telegram.org";

export async function sendMessage(
  env: Env,
  chatId: number,
  text: string,
): Promise<void> {
  const html = markdownToTelegramHtml(text);
  const chunks = splitMessage(html, 4096);

  for (const chunk of chunks) {
    const sent = await sendChunk(env, chatId, chunk, "HTML");
    if (!sent) {
      const plainChunks = splitMessage(text, 4096);
      for (const plain of plainChunks) {
        await sendChunk(env, chatId, plain);
      }
      return;
    }
  }
}

async function sendChunk(
  env: Env,
  chatId: number,
  text: string,
  parseMode?: "HTML",
): Promise<boolean> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };
  if (parseMode) body.parse_mode = parseMode;

  const response = await fetch(
    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (response.ok) return true;

  const errorBody = await response.text();
  console.error("Telegram sendMessage failed:", response.status, errorBody);
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

export async function setBotCommands(env: Env): Promise<boolean> {
  const response = await fetch(
    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/setMyCommands`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [{ command: "ping", description: "Tekshirish" }],
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    console.error("Telegram setMyCommands failed:", response.status, body);
    return false;
  }

  return true;
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
