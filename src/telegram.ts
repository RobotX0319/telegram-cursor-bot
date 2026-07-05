import type { Env } from "./types";
import type { CursorRun } from "./types";
import {
  formatRunResultHtml,
  formatRunResultPlain,
  statusEmoji,
  statusLabel,
} from "./messages";

const TELEGRAM_API = "https://api.telegram.org";

export const BOT_COMMANDS = [
  { command: "start", description: "Botni boshlash" },
  { command: "help", description: "Yordam" },
  { command: "status", description: "Agent holati" },
  { command: "repo", description: "GitHub repo belgilash" },
  { command: "new", description: "Yangi agent ochish" },
  { command: "agents", description: "Agentlar ro'yxati" },
  { command: "use", description: "Agent tanlash" },
  { command: "agent", description: "Faol agent haqida" },
  { command: "admin", description: "Adminlar boshqaruvi" },
  { command: "setkey", description: "Cursor API key saqlash" },
  { command: "ping", description: "Tekshirish" },
  { command: "version", description: "Bot versiyasi" },
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
  options?: { parseMode?: "Markdown" | "HTML"; disablePreview?: boolean },
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
          ...(options?.disablePreview
            ? { disable_web_page_preview: true }
            : {}),
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      console.error("Telegram sendMessage failed:", response.status, body);
    }
  }
}

export async function sendRunResult(
  env: Env,
  chatId: number,
  run: CursorRun,
): Promise<void> {
  const html = formatRunResultHtml(run);
  const plain = formatRunResultPlain(run);

  if (html.length <= 4096) {
    const sent = await trySendHtml(env, chatId, html);
    if (sent) return;
  }

  // HTML xato yoki juda uzun — qisqa sarlavha + oddiy matn
  const header = `${statusEmoji(run.status)} ${statusLabel(run.status)}`;
  await sendMessage(env, chatId, header);

  for (const chunk of splitMessage(plain, 4096)) {
    await sendMessage(env, chatId, chunk);
  }
}

async function trySendHtml(
  env: Env,
  chatId: number,
  html: string,
): Promise<boolean> {
  const response = await fetch(
    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    },
  );

  if (response.ok) return true;

  const body = await response.text();
  console.error("Telegram HTML send failed:", response.status, body);
  return false;
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

export function bootstrapWebhookSecret(botToken: string): string {
  const botId = botToken.split(":")[0]?.trim();
  return botId ? `tg_${botId}_bootstrap` : "";
}

export function getWebhookSecrets(env: Env): string[] {
  const secrets = new Set<string>();
  if (env.TELEGRAM_WEBHOOK_SECRET?.trim()) {
    secrets.add(env.TELEGRAM_WEBHOOK_SECRET.trim());
  }
  const bootstrap = bootstrapWebhookSecret(env.TELEGRAM_BOT_TOKEN);
  if (bootstrap && isValidWebhookSecret(bootstrap)) {
    secrets.add(bootstrap);
  }
  return [...secrets];
}

export function isAcceptedWebhookSecret(env: Env, secret: string | null): boolean {
  if (!secret) return false;
  return getWebhookSecrets(env).includes(secret);
}

export function isValidWebhookSecret(secret: string): boolean {
  return WEBHOOK_SECRET_PATTERN.test(secret);
}

export async function configureWebhookFromEnv(
  env: Env,
  workerOrigin: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const secret =
    env.TELEGRAM_WEBHOOK_SECRET?.trim() ||
    bootstrapWebhookSecret(env.TELEGRAM_BOT_TOKEN);

  if (!secret || !isValidWebhookSecret(secret)) {
    return {
      ok: false,
      status: 400,
      body: JSON.stringify({
        error:
          "TELEGRAM_WEBHOOK_SECRET yoki TELEGRAM_BOT_TOKEN kerak. Secret faqat A-Z, a-z, 0-9, _ va - belgilaridan iborat bo'lishi kerak.",
      }),
    };
  }

  const webhookUrl = `${workerOrigin.replace(/\/$/, "")}/webhook`;
  const response = await setWebhook(
    env.TELEGRAM_BOT_TOKEN,
    webhookUrl,
    secret,
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
