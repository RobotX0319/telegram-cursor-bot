import type { Env, RunStatus } from "./types";

const STICKER_PREFIX = "sticker:";

function stickerKey(status: string): string {
  return `${STICKER_PREFIX}${status.toLowerCase()}`;
}

export async function getStatusStickerFileId(
  env: Env,
  status: RunStatus,
): Promise<string | null> {
  return env.SESSIONS.get(stickerKey(status));
}

export async function setStatusStickerFileId(
  env: Env,
  status: string,
  fileId: string,
): Promise<void> {
  await env.SESSIONS.put(stickerKey(status), fileId);
}

export async function listStatusStickers(
  env: Env,
): Promise<Array<{ status: string; fileId: string }>> {
  const list = await env.SESSIONS.list({ prefix: STICKER_PREFIX });
  const stickers: Array<{ status: string; fileId: string }> = [];

  for (const key of list.keys) {
    const fileId = await env.SESSIONS.get(key.name);
    if (!fileId) continue;
    stickers.push({
      status: key.name.slice(STICKER_PREFIX.length),
      fileId,
    });
  }

  return stickers.sort((a, b) => a.status.localeCompare(b.status));
}

export const STICKER_STATUSES = [
  "finished",
  "error",
  "cancelled",
  "expired",
  "running",
  "creating",
] as const;
