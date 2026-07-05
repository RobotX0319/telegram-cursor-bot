import { ensureBotTokens, getAdminBotToken, getUserBotToken } from "./bots";
import { deleteVideo, getVideo } from "./storage";
import type { Env, StoredVideo } from "./types";

const TELEGRAM_API = "https://api.telegram.org";

async function fileExists(token: string, fileId: string): Promise<boolean> {
  if (!token || !fileId) return false;

  const response = await fetch(
    `${TELEGRAM_API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const data = (await response.json()) as {
    ok?: boolean;
    result?: { file_path?: string };
  };
  return Boolean(data.ok && data.result?.file_path);
}

export async function adminFileExists(
  env: Env,
  adminFileId?: string,
): Promise<boolean> {
  if (!adminFileId) return false;
  await ensureBotTokens(env);
  return fileExists(getAdminBotToken(env), adminFileId);
}

export async function userFileExists(
  env: Env,
  fileId?: string,
): Promise<boolean> {
  if (!fileId) return false;
  await ensureBotTokens(env);
  return fileExists(getUserBotToken(env), fileId);
}

/** Botda ko'rinadigan / yuboriladigan video. */
export async function isVideoPlayable(
  env: Env,
  video: StoredVideo,
): Promise<boolean> {
  if (await adminFileExists(env, video.adminFileId)) return true;
  if (await userFileExists(env, video.fileId)) return true;
  return false;
}

/** Buzilgan videoni o'chiradi. O'chirilgan bo'lsa true. */
export async function removeBrokenVideo(
  env: Env,
  id: number,
): Promise<boolean> {
  const video = await getVideo(env, id);
  if (!video) return false;
  if (await isVideoPlayable(env, video)) return false;
  await deleteVideo(env, id);
  return true;
}

export async function resolveExistingVideoForUpload(
  env: Env,
  id: number,
): Promise<
  | { ok: true; clearedBroken: boolean }
  | { ok: false; reason: "occupied" }
> {
  const existing = await getVideo(env, id);
  if (!existing) return { ok: true, clearedBroken: false };

  if (await isVideoPlayable(env, existing)) {
    return { ok: false, reason: "occupied" };
  }

  await deleteVideo(env, id);
  return { ok: true, clearedBroken: true };
}
