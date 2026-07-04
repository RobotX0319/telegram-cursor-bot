import { getBootstrapAdminIds } from "./admins";
import type { Env, UserSession } from "./types";

function sessionKey(userId: number): string {
  return `user:${userId}`;
}

/** Asosiy admin sessiyasi — barcha adminlar shu agentlar bilan ishlaydi */
export function getWorkspaceOwnerId(env: Env): number | null {
  const ids = getBootstrapAdminIds(env);
  if (ids.length === 0) return null;

  const parsed = Number.parseInt(ids[0], 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function getSessionUserId(env: Env, requestUserId: number): number {
  return getWorkspaceOwnerId(env) ?? requestUserId;
}

export async function getSession(
  env: Env,
  userId: number,
): Promise<UserSession | null> {
  const raw = await env.SESSIONS.get(sessionKey(userId));
  if (!raw) return null;
  return JSON.parse(raw) as UserSession;
}

export async function getWorkspaceSession(
  env: Env,
  requestUserId: number,
): Promise<UserSession | null> {
  return getSession(env, getSessionUserId(env, requestUserId));
}

export async function saveSession(
  env: Env,
  userId: number,
  session: UserSession,
): Promise<void> {
  session.updatedAt = new Date().toISOString();
  await env.SESSIONS.put(sessionKey(userId), JSON.stringify(session));
}

export async function updateSession(
  env: Env,
  userId: number,
  patch: Partial<UserSession>,
): Promise<UserSession> {
  const current =
    (await getSession(env, userId)) ??
    ({ updatedAt: new Date().toISOString() } satisfies UserSession);
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await saveSession(env, userId, next);
  return next;
}

export async function updateWorkspaceSession(
  env: Env,
  requestUserId: number,
  patch: Partial<UserSession>,
): Promise<UserSession> {
  return updateSession(env, getSessionUserId(env, requestUserId), patch);
}

export function defaultRepo(env: Env, session: UserSession | null): string | null {
  return session?.repoUrl ?? env.DEFAULT_GITHUB_REPO ?? null;
}
