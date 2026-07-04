import { formatRunResult, getRun, isTerminal } from "./cursor";
import { sendMessage } from "./telegram";
import type { Env } from "./types";

export interface PendingRun {
  chatId: number;
  userId: number;
  agentId: string;
  runId: string;
  createdAt: string;
}

const PENDING_PREFIX = "pending:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function pendingKey(runId: string): string {
  return `${PENDING_PREFIX}${runId}`;
}

export async function addPendingRun(
  env: Env,
  pending: PendingRun,
): Promise<void> {
  await env.SESSIONS.put(pendingKey(pending.runId), JSON.stringify(pending));
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

  return pending;
}

export async function notifyIfFinished(
  env: Env,
  pending: PendingRun,
): Promise<boolean> {
  const run = await getRun(env, pending.agentId, pending.runId);

  if (!isTerminal(run.status)) return false;

  const key = pendingKey(pending.runId);
  const raw = await env.SESSIONS.get(key);
  if (!raw) return false;

  await env.SESSIONS.delete(key);
  await sendMessage(env, pending.chatId, formatRunResult(run));
  return true;
}

export async function processPendingRuns(env: Env): Promise<void> {
  const pendingRuns = await listPendingRuns(env);
  const now = Date.now();

  for (const pending of pendingRuns) {
    try {
      const age = now - new Date(pending.createdAt).getTime();
      if (age > MAX_AGE_MS) {
        await removePendingRun(env, pending.runId);
        continue;
      }

      await notifyIfFinished(env, pending);
    } catch (error) {
      console.error(
        `Pending run ${pending.runId} tekshirilmadi:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
