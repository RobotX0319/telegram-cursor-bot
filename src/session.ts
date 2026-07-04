import type { Env, UserSession } from "./types";

function sessionKey(userId: number): string {
  return `user:${userId}`;
}

export async function getSession(
  env: Env,
  userId: number,
): Promise<UserSession | null> {
  const raw = await env.SESSIONS.get(sessionKey(userId));
  if (!raw) return null;
  return JSON.parse(raw) as UserSession;
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

export function defaultRepo(env: Env, session: UserSession | null): string | null {
  return session?.repoUrl ?? env.DEFAULT_GITHUB_REPO ?? null;
}
