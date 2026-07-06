import { getRunForDisplay, isTerminal, sleep } from "./cursor";
import { schedulePendingPoller } from "./pending-poller";
import { getWebhookSecrets, sendRunResult } from "./telegram";
import type { Env } from "./types";

export interface PendingRun {
  chatId: number;
  userId: number;
  agentId: string;
  runId: string;
  createdAt: string;
}

const PENDING_PREFIX = "pending:";
const NOTIFIED_PREFIX = "notified:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 30_000;
/** Har bir HTTP chaqiruv ~30s limit ichida 2 marta tekshiradi, keyin zanjir davom etadi. */
const CYCLES_PER_INVOCATION = 2;

export const TRACK_RUN_MAX_ATTEMPTS = 4;
export const TRACK_RUN_INTERVAL_MS = 5000;

function resolveWorkerOrigin(env: Env, origin?: string): string {
  const url = env.WORKER_PUBLIC_URL || origin || "";
  return url.replace(/\/$/, "");
}

function pollPendingUrl(env: Env, workerOrigin: string): string {
  const key = getWebhookSecrets(env)[0] ?? env.TELEGRAM_WEBHOOK_SECRET;
  return `${workerOrigin}/admin/poll-pending?key=${encodeURIComponent(key)}`;
}

function pendingKey(runId: string): string {
  return `${PENDING_PREFIX}${runId}`;
}

function notifiedKey(runId: string): string {
  return `${NOTIFIED_PREFIX}${runId}`;
}

export async function addPendingRun(
  env: Env,
  pending: PendingRun,
): Promise<void> {
  await env.SESSIONS.put(pendingKey(pending.runId), JSON.stringify(pending));
  await schedulePendingPoller(env);
}

export async function removePendingRun(
  env: Env,
  runId: string,
): Promise<void> {
  await env.SESSIONS.delete(pendingKey(runId));
}

export async function listPendingRuns(env: Env): Promise<PendingRun[]> {
  const list = await env.SESSIONS.list({ prefix: PENDING_PREFIX });
  const pending: PendingRun[] = [];

  for (const key of list.keys) {
    const raw = await env.SESSIONS.get(key.name);
    if (!raw) continue;
    pending.push(JSON.parse(raw) as PendingRun);
  }

  return pending.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

async function claimNotification(env: Env, runId: string): Promise<boolean> {
  const key = notifiedKey(runId);
  const existing = await env.SESSIONS.get(key);
  if (existing) return false;

  await env.SESSIONS.put(key, new Date().toISOString(), {
    expirationTtl: 60 * 60 * 24 * 7,
  });
  return true;
}

export async function notifyIfFinished(
  env: Env,
  pending: PendingRun,
): Promise<boolean> {
  const run = await getRunForDisplay(env, pending.agentId, pending.runId);
  if (!isTerminal(run.status)) return false;

  const pendingRaw = await env.SESSIONS.get(pendingKey(pending.runId));
  if (!pendingRaw) return false;

  if (!(await claimNotification(env, pending.runId))) return false;

  if (run.status === "FINISHED") {
    try {
      const { deployUserWorkerFromRepoForUser } = await import("./user-deploy");
      await deployUserWorkerFromRepoForUser(env, pending.userId);
    } catch (error) {
      console.error(
        `Agent deploy (${pending.userId}):`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  await env.SESSIONS.delete(pendingKey(pending.runId));
  await sendRunResult(env, pending.chatId, run);
  return true;
}

export async function processPendingRuns(env: Env): Promise<number> {
  const pendingRuns = await listPendingRuns(env);
  const now = Date.now();
  let notified = 0;

  for (const pending of pendingRuns) {
    try {
      const age = now - new Date(pending.createdAt).getTime();
      if (age > MAX_AGE_MS) {
        await removePendingRun(env, pending.runId);
        continue;
      }

      if (await notifyIfFinished(env, pending)) {
        notified++;
      }
    } catch (error) {
      console.error(
        `Pending run ${pending.runId} tekshirilmadi:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return notified;
}

export async function continuePollingPendingRuns(
  env: Env,
  workerOrigin?: string,
): Promise<void> {
  const origin = resolveWorkerOrigin(env, workerOrigin);
  if (!origin) {
    console.error("Worker origin topilmadi — polling to'xtatildi");
    return;
  }

  for (let cycle = 0; cycle < CYCLES_PER_INVOCATION; cycle++) {
    const notified = await processPendingRuns(env);
    if (notified > 0) {
      console.log(`Pending poll: ${notified} ta natija yuborildi`);
    }

    const remaining = await listPendingRuns(env);
    if (remaining.length === 0) return;

    await sleep(POLL_INTERVAL_MS);
  }

  const remaining = await listPendingRuns(env);
  if (remaining.length === 0) return;

  try {
    const response = await fetch(pollPendingUrl(env, origin));
    if (!response.ok) {
      console.error("Poll chain failed:", response.status, await response.text());
    }
  } catch (error) {
    console.error(
      "Poll chain fetch failed:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function kickoffPendingPoll(
  env: Env,
  workerOrigin?: string,
): Promise<void> {
  if (await schedulePendingPoller(env)) return;

  await processPendingRuns(env);

  const origin = resolveWorkerOrigin(env, workerOrigin);
  if (!origin) {
    console.error("Worker origin topilmadi — poll kickoff o'tkazib yuborildi");
    return;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(pollPendingUrl(env, origin));
      if (response.ok) return;

      console.error(
        "Pending poll kickoff failed:",
        response.status,
        await response.text(),
      );
    } catch (error) {
      console.error(
        "Pending poll kickoff failed:",
        error instanceof Error ? error.message : String(error),
      );
    }

    await sleep(1000);
  }
}

export async function clearPendingForManualStatus(
  env: Env,
  runId: string,
): Promise<void> {
  await claimNotification(env, runId);
  await removePendingRun(env, runId);
}
