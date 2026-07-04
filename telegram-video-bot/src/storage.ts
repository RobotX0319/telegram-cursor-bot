import type { Env, StoredVideo } from "./types";

const COUNTER_KEY = "meta:next_id";
const VIDEO_PREFIX = "video:";

function videoKey(id: number): string {
  return `${VIDEO_PREFIX}${id}`;
}

export async function getNextVideoId(env: Env): Promise<number> {
  const current = await env.VIDEOS.get(COUNTER_KEY);
  const next = current ? Number.parseInt(current, 10) + 1 : 1;
  await env.VIDEOS.put(COUNTER_KEY, String(next));
  return next;
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
  return JSON.parse(raw) as StoredVideo;
}

export async function deleteVideo(env: Env, id: number): Promise<boolean> {
  const existing = await getVideo(env, id);
  if (!existing) return false;
  await env.VIDEOS.delete(videoKey(id));
  return true;
}

export async function listVideos(env: Env): Promise<StoredVideo[]> {
  const list = await env.VIDEOS.list({ prefix: VIDEO_PREFIX });
  const videos: StoredVideo[] = [];

  for (const key of list.keys) {
    const raw = await env.VIDEOS.get(key.name);
    if (!raw) continue;
    videos.push(JSON.parse(raw) as StoredVideo);
  }

  return videos.sort((a, b) => a.id - b.id);
}

export async function countVideos(env: Env): Promise<number> {
  const list = await env.VIDEOS.list({ prefix: VIDEO_PREFIX });
  return list.keys.length;
}
