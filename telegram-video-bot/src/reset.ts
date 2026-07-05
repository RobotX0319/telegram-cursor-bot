import type { Env } from "./types";

const KEEP_KEYS = new Set([
  "config:user_bot_token",
  "config:admin_bot_token",
  "config:admin_ids",
]);

export interface BotResetResult {
  deleted: number;
  kept: string[];
  errors: string[];
}

/** Barcha bot ma'lumotlarini o'chiradi (tokenlar va admin ID saqlanadi). */
export async function resetBotData(env: Env): Promise<BotResetResult> {
  const kept: string[] = [];
  const errors: string[] = [];
  let deleted = 0;

  let cursor: string | undefined;
  do {
    const page = await env.VIDEOS.list({ cursor, limit: 1000 });
    for (const key of page.keys) {
      if (KEEP_KEYS.has(key.name)) {
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
