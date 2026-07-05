import {
  ensureBotTokens,
  hasAdminBot,
  invalidateBotTokenCache,
  saveBotTokens,
} from "./bots";
import {
  getBotUsername,
  setAdminPanelMenuButton,
  setBotCommands,
  setWebhook,
} from "./telegram";
import { getWebhookSecret } from "./config";
import type { Env } from "./types";

export async function connectAdminBotToken(
  env: Env,
  workerOrigin: string,
  adminToken: string,
): Promise<{
  ok: boolean;
  error?: string;
  username?: string | null;
  webhook?: { ok: boolean; status: number; body: string };
}> {
  const token = adminToken.trim();
  if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    return { ok: false, error: "Noto'g'ri bot token formati" };
  }

  await saveBotTokens(env, { adminToken: token });
  invalidateBotTokenCache();
  await ensureBotTokens(env);

  const origin = workerOrigin.replace(/\/$/, "");
  const secret = getWebhookSecret(env);
  const response = await setWebhook(
    token,
    `${origin}/webhook-admin`,
    secret,
  );
  const body = await response.text();
  const username = response.ok ? await getBotUsername(env, "admin") : null;

  if (response.ok) {
    await setBotCommands(env, "admin");
    await setAdminPanelMenuButton(env);
  }

  return {
    ok: response.ok,
    username,
    webhook: { ok: response.ok, status: response.status, body },
  };
}

export async function getAdminBotStatus(env: Env): Promise<{
  connected: boolean;
  username: string | null;
}> {
  await ensureBotTokens(env);
  const connected = hasAdminBot(env);
  const username = connected ? await getBotUsername(env, "admin") : null;
  return { connected, username };
}

let adminWebhookReady = false;

export async function ensureDetiskebotReady(
  env: Env,
  _workerOrigin: string,
): Promise<void> {
  if (adminWebhookReady) return;

  await ensureBotTokens(env);
  const fromEnv = env.TELEGRAM_ADMIN_BOT_TOKEN?.trim();
  const fromKv = await env.VIDEOS.get("config:admin_bot_token");
  const adminToken = fromEnv || fromKv?.trim() || "";

  if (!adminToken) return;

  if (!fromKv?.trim() && fromEnv) {
    await saveBotTokens(env, { adminToken: fromEnv });
    invalidateBotTokenCache();
    await ensureBotTokens(env);
  }

  if (!hasAdminBot(env)) return;

  await setBotCommands(env, "admin");
  await setAdminPanelMenuButton(env);
  adminWebhookReady = true;
}
