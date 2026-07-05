import { formatRunResult, getRun, isTerminal } from "./cursor";
import { putJsonIfChanged, putTextIfChanged } from "./kv-store";
import { sendMessage } from "./telegram";
import type { Env } from "./types";

export interface PendingRun {
  chatId: number;
  userId: number;
  agentId: string;
  runId: string;
  createdAt: string;
}

const PENDING_INDEX_KEY = "pending:index";
const LAST_POLL_KEY = "pending:last_poll";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Free KV: 1000 writes/day — poll kamroq */
const MIN_POLL_MS = 30 * 60 * 1000;

async function loadPendingIndex(env: Env): Promise<PendingRun[]> {
  const raw = await env.SESSIONS.get(PENDING_INDEX_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingRun[];
  } catch {
    return [];
  }
}

async function savePendingIndex(
  env: Env,
  pending: PendingRun[],
): Promise<void> {
  if (pending.length === 0) {
    try {
      await env.SESSIONS.delete(PENDING_INDEX_KEY);
    } catch (error) {
      console.error("KV delete pending:index:", error);
    }
    return;
  }
  await putJsonIfChanged(env.SESSIONS, PENDING_INDEX_KEY, pending);
}

export async function addPendingRun(
  env: Env,
  pending: PendingRun,
): Promise<void> {
  const list = await loadPendingIndex(env);
  if (list.some((p) => p.runId === pending.runId)) return;
  list.push(pending);
  await savePendingIndex(env, list);
}

export async function removePendingRun(
  env: Env,
  runId: string,
): Promise<void> {
  const list = await loadPendingIndex(env);
  const next = list.filter((p) => p.runId !== runId);
  if (next.length === list.length) return;
  await savePendingIndex(env, next);
}

export async function listPendingRuns(env: Env): Promise<PendingRun[]> {
  return loadPendingIndex(env);
}

export async function notifyIfFinished(
  env: Env,
  pending: PendingRun,
): Promise<boolean> {
  const run = await getRun(env, pending.agentId, pending.runId);
  if (!isTerminal(run.status)) return false;

  await sendMessage(env, pending.chatId, formatRunResult(run));
  return true;
}

export async function processPendingRuns(
  env: Env,
  force = false,
): Promise<number> {
  if (!force) {
    const lastRaw = await env.SESSIONS.get(LAST_POLL_KEY);
    if (lastRaw) {
      const elapsed = Date.now() - Number(lastRaw);
      if (elapsed >= 0 && elapsed < MIN_POLL_MS) return 0;
    }
  }

  const pendingRuns = await loadPendingIndex(env);
  if (pendingRuns.length === 0) {
    return 0;
  }

  const now = Date.now();
  let notified = 0;
  const remaining: PendingRun[] = [];

  for (const pending of pendingRuns) {
    try {
      const age = now - new Date(pending.createdAt).getTime();
      if (age > MAX_AGE_MS) continue;

      if (await notifyIfFinished(env, pending)) {
        notified++;
        continue;
      }

      remaining.push(pending);
    } catch (error) {
      console.error(
        `Pending run ${pending.runId} tekshirilmadi:`,
        error instanceof Error ? error.message : String(error),
      );
      remaining.push(pending);
    }
  }

  if (notified > 0 || remaining.length !== pendingRuns.length) {
    await savePendingIndex(env, remaining);
  }

  await putTextIfChanged(env.SESSIONS, LAST_POLL_KEY, String(Date.now()), {
    expirationTtl: 60 * 60 * 24,
  });

  return notified;
}

export async function continuePollingPendingRuns(
  env: Env,
  _workerOrigin?: string,
): Promise<void> {
  await processPendingRuns(env, false);
}

export async function kickoffPendingPoll(
  _env: Env,
  _workerOrigin?: string,
): Promise<void> {
  // no-op: KV yozuvlarini tejash
}

export async function clearPendingForManualStatus(
  env: Env,
  runId: string,
): Promise<void> {
  await removePendingRun(env, runId);
}
