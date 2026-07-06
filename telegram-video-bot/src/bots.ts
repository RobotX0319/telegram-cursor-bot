import type { Env } from "./types";

export type BotKind = "user" | "admin";

const KV_USER_TOKEN = "config:user_bot_token";
const KV_ADMIN_TOKEN = "config:admin_bot_token";
const KV_ADMIN_IDS = "config:admin_ids";

let cachedUserToken = "";
let cachedAdminToken = "";
let tokensLoaded = false;

export async function ensureBotTokens(env: Env): Promise<void> {
  if (tokensLoaded) return;

  cachedUserToken =
    env.TELEGRAM_BOT_TOKEN?.trim() ||
    (await env.VIDEOS.get(KV_USER_TOKEN)) ||
    "";

  cachedAdminToken =
    env.TELEGRAM_ADMIN_BOT_TOKEN?.trim() ||
    (await env.VIDEOS.get(KV_ADMIN_TOKEN)) ||
    "";

  tokensLoaded = true;
}

export function invalidateBotTokenCache(): void {
  tokensLoaded = false;
  cachedUserToken = "";
  cachedAdminToken = "";
}

export function getUserBotToken(env: Env): string {
  return env.TELEGRAM_BOT_TOKEN?.trim() || cachedUserToken;
}

export function getAdminBotToken(env: Env): string {
  return env.TELEGRAM_ADMIN_BOT_TOKEN?.trim() || cachedAdminToken;
}

export function getBotToken(env: Env, kind: BotKind): string {
  return kind === "admin" ? getAdminBotToken(env) : getUserBotToken(env);
}

export function hasAdminBot(env: Env): boolean {
  return Boolean(getAdminBotToken(env).trim());
}

export async function saveBotTokens(
  env: Env,
  tokens: { userToken?: string; adminToken?: string; adminIds?: string },
): Promise<void> {
  if (tokens.userToken?.trim()) {
    await env.VIDEOS.put(KV_USER_TOKEN, tokens.userToken.trim());
  }
  if (tokens.adminToken?.trim()) {
    await env.VIDEOS.put(KV_ADMIN_TOKEN, tokens.adminToken.trim());
  }
  if (tokens.adminIds !== undefined) {
    const trimmed = tokens.adminIds.trim();
    if (trimmed) {
      await env.VIDEOS.put(KV_ADMIN_IDS, trimmed);
    } else {
      await env.VIDEOS.delete(KV_ADMIN_IDS);
    }
  }
  invalidateBotTokenCache();
  await ensureBotTokens(env);
}

export async function getAdminIds(env: Env): Promise<Set<string>> {
  const ids = new Set<string>();
  const single = env.TELEGRAM_ADMIN_ID?.trim();
  if (single) ids.add(single);

  const list = env.TELEGRAM_ADMIN_IDS?.trim();
  if (list) {
    for (const id of list.split(",")) {
      const trimmed = id.trim();
      if (trimmed) ids.add(trimmed);
    }
  }

  const fromKv = await env.VIDEOS.get(KV_ADMIN_IDS);
  if (fromKv) {
    for (const id of fromKv.split(",")) {
      const trimmed = id.trim();
      if (trimmed) ids.add(trimmed);
    }
  }

  return ids;
}

export async function isAdmin(env: Env, userId: number): Promise<boolean> {
  const ids = await getAdminIds(env);
  if (ids.size === 0) return false;
  return ids.has(String(userId));
}

/** @Detiskebot — foydalanuvchini adminlar ro'yxatiga qo'shadi */
export async function grantAdminAccess(env: Env, userId: number): Promise<void> {
  if (await isAdmin(env, userId)) return;
  const ids = await getAdminIds(env);
  ids.add(String(userId));
  await saveBotTokens(env, { adminIds: [...ids].join(",") });
}
