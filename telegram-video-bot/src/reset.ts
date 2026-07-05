import { invalidateBotTokenCache } from "./bots";
import type { Env } from "./types";

const TOKEN_KEYS = new Set([
  "config:user_bot_token",
  "config:admin_bot_token",
  "config:admin_ids",
]);

export interface BotResetResult {
  deleted: number;
  kept: string[];
  errors: string[];
  mode: "data" | "full";
}

export interface ResetOptions {
  /** true = KV dagi hamma narsa o'chiriladi (tokenlar ham) */
  full?: boolean;
}

async function deleteAllKvKeys(
  env: Env,
  keepKeys: Set<string>,
): Promise<Omit<BotResetResult, "mode">> {
  const kept: string[] = [];
  const errors: string[] = [];
  let deleted = 0;

  let cursor: string | undefined;
  do {
    const page = await env.VIDEOS.list({ cursor, limit: 1000 });
    for (const key of page.keys) {
      if (keepKeys.has(key.name)) {
        kept.push(key.name);
        continue;
      }
      try {
        await env.VIDEOS.delete(key.name);
        deleted += 1;
      } catch {
        errors.push(key.name);
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return { deleted, kept, errors };
}

/** Ma'lumotlarni o'chiradi. full=true bo'lsa KV to'liq tozalanadi. */
export async function resetBotData(
  env: Env,
  options: ResetOptions = {},
): Promise<BotResetResult> {
  const full = options.full ?? false;
  const keepKeys = full ? new Set<string>() : TOKEN_KEYS;
  const result = await deleteAllKvKeys(env, keepKeys);

  if (full) {
    invalidateBotTokenCache();
  }

  return {
    ...result,
    mode: full ? "full" : "data",
  };
}

/** Butun KV — 0 dan yangi boshlash. */
export async function resetBotFully(env: Env): Promise<BotResetResult> {
  return resetBotData(env, { full: true });
}
