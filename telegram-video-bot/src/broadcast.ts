import { getBotStats } from "./analytics";
import { listVipUserIds } from "./vip";
import {
  sendMessage,
  sendPhotoByFileId,
  sendVideoByFileId,
} from "./telegram";
import type { BroadcastJob, Env } from "./types";

const BROADCAST_PREFIX = "broadcast:";

function broadcastKey(id: string): string {
  return `${BROADCAST_PREFIX}${id}`;
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createBroadcast(
  env: Env,
  params: {
    text: string;
    target: "all" | "vip";
    createdBy: number;
    mediaFileId?: string;
    mediaType?: "photo" | "video";
    scheduledAt?: string;
  },
): Promise<BroadcastJob> {
  const job: BroadcastJob = {
    id: newId(),
    text: params.text,
    target: params.target,
    mediaFileId: params.mediaFileId,
    mediaType: params.mediaType,
    scheduledAt: params.scheduledAt,
    status: params.scheduledAt ? "pending" : "pending",
    stats: { total: 0, sent: 0, failed: 0 },
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  };
  await env.VIDEOS.put(broadcastKey(job.id), JSON.stringify(job));
  return job;
}

export async function getBroadcast(
  env: Env,
  id: string,
): Promise<BroadcastJob | null> {
  const raw = await env.VIDEOS.get(broadcastKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BroadcastJob;
  } catch {
    return null;
  }
}

export async function saveBroadcast(
  env: Env,
  job: BroadcastJob,
): Promise<void> {
  await env.VIDEOS.put(broadcastKey(job.id), JSON.stringify(job));
}

export async function listBroadcasts(env: Env): Promise<BroadcastJob[]> {
  const list = await env.VIDEOS.list({ prefix: BROADCAST_PREFIX });
  const jobs: BroadcastJob[] = [];
  for (const key of list.keys) {
    const raw = await env.VIDEOS.get(key.name);
    if (!raw) continue;
    try {
      jobs.push(JSON.parse(raw) as BroadcastJob);
    } catch {
      /* skip */
    }
  }
  return jobs.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

async function getTargetUserIds(
  env: Env,
  target: "all" | "vip",
): Promise<number[]> {
  if (target === "vip") {
    const ids = await listVipUserIds(env);
    return ids.map((id) => Number.parseInt(id, 10)).filter(Number.isFinite);
  }
  const stats = await getBotStats(env);
  return Object.keys(stats.users)
    .map((id) => Number.parseInt(id, 10))
    .filter(Number.isFinite);
}

export async function runBroadcast(
  env: Env,
  jobId: string,
): Promise<BroadcastJob | null> {
  const job = await getBroadcast(env, jobId);
  if (!job || job.status === "done" || job.status === "cancelled") {
    return job;
  }

  job.status = "running";
  await saveBroadcast(env, job);

  const userIds = await getTargetUserIds(env, job.target);
  job.stats.total = userIds.length;

  for (const userId of userIds) {
    try {
      let ok = false;
      if (job.mediaFileId && job.mediaType === "photo") {
        ok = await sendPhotoByFileId(env, userId, job.mediaFileId, job.text);
      } else if (job.mediaFileId && job.mediaType === "video") {
        ok = await sendVideoByFileId(env, userId, job.mediaFileId, job.text);
      } else {
        await sendMessage(env, userId, job.text);
        ok = true;
      }
      if (ok) job.stats.sent += 1;
      else job.stats.failed += 1;
    } catch {
      job.stats.failed += 1;
    }
  }

  job.status = "done";
  await saveBroadcast(env, job);
  return job;
}

export async function processDueBroadcasts(env: Env): Promise<number> {
  const jobs = await listBroadcasts(env);
  const now = Date.now();
  let processed = 0;

  for (const job of jobs) {
    if (job.status !== "pending" || !job.scheduledAt) continue;
    if (new Date(job.scheduledAt).getTime() > now) continue;
    await runBroadcast(env, job.id);
    processed += 1;
  }

  return processed;
}

export function formatBroadcastJob(job: BroadcastJob): string {
  const target = job.target === "vip" ? "VIP" : "Hammaga";
  const status =
    job.status === "done"
      ? "✅ Tugadi"
      : job.status === "running"
        ? "⏳ Yuborilmoqda"
        : job.status === "cancelled"
          ? "❌ Bekor"
          : job.scheduledAt
            ? `📅 ${new Date(job.scheduledAt).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })}`
            : "⏳ Kutilmoqda";
  return [
    `📣 ${target}`,
    status,
    `📊 ${job.stats.sent}/${job.stats.total} yetkazildi`,
    job.stats.failed ? `❌ ${job.stats.failed} xato` : null,
    job.text.slice(0, 80) + (job.text.length > 80 ? "…" : ""),
  ]
    .filter(Boolean)
    .join("\n");
}
