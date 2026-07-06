import type { Env, StoredVideo } from "./types";

const COUNTER_KEY = "meta:next_id";
const VIDEO_PREFIX = "video:";
const UNIQUE_PREFIX = "unique:";

function videoKey(id: number): string {
  return `${VIDEO_PREFIX}${id}`;
}

function uniqueKey(fileUniqueId: string): string {
  return `${UNIQUE_PREFIX}${fileUniqueId}`;
}

function coordinator(env: Env) {
  const id = env.VIDEO_COORDINATOR.idFromName("global");
  return env.VIDEO_COORDINATOR.get(id);
}

async function syncCoordinatorCounter(env: Env): Promise<void> {
  const raw = await env.VIDEOS.get(COUNTER_KEY);
  const kvCounter = raw ? Number.parseInt(raw, 10) : 0;

  let maxFromList = 0;
  const list = await env.VIDEOS.list({ prefix: VIDEO_PREFIX });
  for (const key of list.keys) {
    const id = Number.parseInt(key.name.slice(VIDEO_PREFIX.length), 10);
    if (!Number.isNaN(id) && id > maxFromList) maxFromList = id;
  }

  const minCounter = Math.max(kvCounter, maxFromList);
  await coordinator(env).fetch("http://coordinator/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minCounter }),
  });

  const backfillDone = await env.VIDEOS.get("meta:unique_backfill");
  if (!backfillDone) {
    for (const key of list.keys) {
      const videoRaw = await env.VIDEOS.get(key.name);
      if (!videoRaw) continue;
      try {
        const video = JSON.parse(videoRaw) as StoredVideo;
        if (video.fileUniqueId && video.id) {
          await env.VIDEOS.put(uniqueKey(video.fileUniqueId), String(video.id));
        }
      } catch {
        // skip
      }
    }
    await env.VIDEOS.put("meta:unique_backfill", "1");
  }
}

export type RegisterVideoResult =
  | { status: "created"; id: number }
  | { status: "duplicate"; id: number };

/** Atomik ID + takroriy video tekshiruvi (parallel yuklashlar uchun) */
export async function registerVideo(
  env: Env,
  video: Omit<StoredVideo, "id">,
): Promise<RegisterVideoResult> {
  await syncCoordinatorCounter(env);

  const existingKv = await env.VIDEOS.get(uniqueKey(video.fileUniqueId));
  if (existingKv) {
    const id = Number.parseInt(existingKv, 10);
    if (!Number.isNaN(id)) {
      return { status: "duplicate", id };
    }
  }

  const allocRes = await coordinator(env).fetch("http://coordinator/allocate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileUniqueId: video.fileUniqueId }),
  });

  if (!allocRes.ok) {
    throw new Error(`ID ajratilmadi: ${allocRes.status}`);
  }

  const alloc = (await allocRes.json()) as {
    status: "created" | "duplicate";
    id: number;
  };

  if (alloc.status === "duplicate") {
    return { status: "duplicate", id: alloc.id };
  }

  const stored: StoredVideo = { ...video, id: alloc.id };
  await env.VIDEOS.put(videoKey(alloc.id), JSON.stringify(stored));
  await env.VIDEOS.put(uniqueKey(video.fileUniqueId), String(alloc.id));
  await env.VIDEOS.put(COUNTER_KEY, String(alloc.id));

  return { status: "created", id: alloc.id };
}

export async function saveVideo(
  env: Env,
  video: StoredVideo,
): Promise<void> {
  await env.VIDEOS.put(videoKey(video.id), JSON.stringify(video));
}

export async function getVideo(
  env: Env,
  id: number,
): Promise<StoredVideo | null> {
  const raw = await env.VIDEOS.get(videoKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredVideo;
  } catch {
    return null;
  }
}

export async function findVideoByUniqueId(
  env: Env,
  fileUniqueId: string,
): Promise<StoredVideo | null> {
  const raw = await env.VIDEOS.get(uniqueKey(fileUniqueId));
  if (!raw) return null;
  const id = Number.parseInt(raw, 10);
  if (Number.isNaN(id)) return null;
  return getVideo(env, id);
}

export async function deleteVideo(env: Env, id: number): Promise<boolean> {
  const existing = await getVideo(env, id);
  if (!existing) return false;

  await env.VIDEOS.delete(videoKey(id));
  await env.VIDEOS.delete(uniqueKey(existing.fileUniqueId));

  await coordinator(env).fetch("http://coordinator/release", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileUniqueId: existing.fileUniqueId }),
  });

  return true;
}

export async function listVideos(env: Env): Promise<StoredVideo[]> {
  const list = await env.VIDEOS.list({ prefix: VIDEO_PREFIX });
  const videos: StoredVideo[] = [];

  for (const key of list.keys) {
    const raw = await env.VIDEOS.get(key.name);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as StoredVideo;
      if (parsed.id && parsed.fileId) {
        videos.push(parsed);
      }
    } catch {
      // skip corrupt entries
    }
  }

  return videos.sort((a, b) => a.id - b.id);
}

export async function countVideos(env: Env): Promise<number> {
  const videos = await listVideos(env);
  return videos.length;
}

/** @deprecated registerVideo ishlating */
export async function getNextVideoId(env: Env): Promise<number> {
  void env;
  throw new Error("getNextVideoId ishlatilmaydi — registerVideo ishlating");
}
