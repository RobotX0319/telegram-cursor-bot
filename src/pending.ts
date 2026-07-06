import { getRunForDisplay, isTerminal } from "./cursor";
import { getBotStorage, putJsonIfChanged } from "./kv-store";
import { schedulePendingPoller } from "./pending-poller";
import { sendRunResult } from "./telegram";
import type { Env } from "./types";

export interface PendingRun {
  chatId: number;
  userId: number;
  agentId: string;
  runId: string;
  createdAt: string;
}

/** Bitta kalit — har run uchun alohida KV put o'rniga */
const PENDING_INDEX_KEY = "pending:index";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const TRACK_RUN_MAX_ATTEMPTS = 4;
export const TRACK_RUN_INTERVAL_MS = 5000;

async function loadPendingIndex(env: Env): Promise<PendingRun[]> {
  const raw = await getBotStorage(env).get(PENDING_INDEX_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingRun[];
  } catch {
    console.error("Corrupt pending:index");
    return [];
  }
}

async function savePendingIndex(
  env: Env,
  pending: PendingRun[],
): Promise<void> {
  await putJsonIfChanged(getBotStorage(env), PENDING_INDEX_KEY, pending);
}

export async function addPendingRun(
  env: Env,
  pending: PendingRun,
): Promise<void> {
  const list = await loadPendingIndex(env);
  if (list.some((p) => p.runId === pending.runId)) {
    await schedulePendingPoller(env);
    return;
  }
  list.push(pending);
  await savePendingIndex(env, list);
  await schedulePendingPoller(env);
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
  const pending = await loadPendingIndex(env);
  return pending.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

async function deliverFinishedRun(
  env: Env,
  pending: PendingRun,
  run: Awaited<ReturnType<typeof getRunForDisplay>>,
): Promise<void> {
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

  await sendRunResult(env, pending.chatId, run);
}

export async function notifyIfFinished(
  env: Env,
  pending: PendingRun,
): Promise<boolean> {
  const list = await loadPendingIndex(env);
  if (!list.some((p) => p.runId === pending.runId)) return false;

  const run = await getRunForDisplay(env, pending.agentId, pending.runId);
  if (!isTerminal(run.status)) return false;

  await savePendingIndex(
    env,
    list.filter((p) => p.runId !== pending.runId),
  );
  await deliverFinishedRun(env, pending, run);
  return true;
}

export async function processPendingRuns(env: Env): Promise<number> {
  const pendingRuns = await loadPendingIndex(env);
  if (pendingRuns.length === 0) return 0;

  const now = Date.now();
  let notified = 0;
  const stillPending: PendingRun[] = [];

  for (const pending of pendingRuns) {
    try {
      const age = now - new Date(pending.createdAt).getTime();
      if (age > MAX_AGE_MS) continue;

      const run = await getRunForDisplay(env, pending.agentId, pending.runId);
      if (!isTerminal(run.status)) {
        stillPending.push(pending);
        continue;
      }

      await deliverFinishedRun(env, pending, run);
      notified++;
    } catch (error) {
      console.error(
        `Pending run ${pending.runId} tekshirilmadi:`,
        error instanceof Error ? error.message : String(error),
      );
      stillPending.push(pending);
    }
  }

  if (stillPending.length !== pendingRuns.length) {
    await savePendingIndex(env, stillPending);
  }

  return notified;
}

export async function continuePollingPendingRuns(
  env: Env,
  _workerOrigin?: string,
): Promise<void> {
  await processPendingRuns(env);
}

export async function kickoffPendingPoll(
  env: Env,
  _workerOrigin?: string,
): Promise<void> {
  if (await schedulePendingPoller(env)) {
    await processPendingRuns(env);
    return;
  }
  await processPendingRuns(env);
}

export async function clearPendingForManualStatus(
  env: Env,
  runId: string,
): Promise<void> {
  await removePendingRun(env, runId);
}
