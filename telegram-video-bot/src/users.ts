import type { Env, StoredUser, TelegramUser } from "./types";

const USER_PREFIX = "user:";

function userKey(id: number): string {
  return `${USER_PREFIX}${id}`;
}

export async function getUser(
  env: Env,
  userId: number,
): Promise<StoredUser | null> {
  const raw = await env.VIDEOS.get(userKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export async function saveUser(env: Env, user: StoredUser): Promise<void> {
  await env.VIDEOS.put(userKey(user.id), JSON.stringify(user));
}

export async function syncUser(
  env: Env,
  tg: TelegramUser,
): Promise<StoredUser> {
  const now = new Date().toISOString();
  const existing = await getUser(env, tg.id);
  const user: StoredUser = {
    id: tg.id,
    firstSeen: existing?.firstSeen ?? now,
    lastSeen: now,
    name: tg.first_name ?? existing?.name,
    username: tg.username ?? existing?.username,
    videosWatched: existing?.videosWatched ?? 0,
    blocked: existing?.blocked ?? false,
    blockedAt: existing?.blockedAt,
    blockedBy: existing?.blockedBy,
  };
  await saveUser(env, user);
  return user;
}

export async function trackUserVideo(
  env: Env,
  userId: number,
): Promise<void> {
  const user = await getUser(env, userId);
  if (!user) return;
  user.videosWatched += 1;
  user.lastSeen = new Date().toISOString();
  await saveUser(env, user);
}

export async function isUserBlocked(
  env: Env,
  userId: number,
): Promise<boolean> {
  const user = await getUser(env, userId);
  return user?.blocked ?? false;
}

export async function blockUser(
  env: Env,
  userId: number,
  adminId: number,
): Promise<boolean> {
  const user = await getUser(env, userId);
  if (!user) {
    const now = new Date().toISOString();
    await saveUser(env, {
      id: userId,
      firstSeen: now,
      lastSeen: now,
      videosWatched: 0,
      blocked: true,
      blockedAt: now,
      blockedBy: adminId,
    });
    return true;
  }
  if (user.blocked) return false;
  user.blocked = true;
  user.blockedAt = new Date().toISOString();
  user.blockedBy = adminId;
  await saveUser(env, user);
  return true;
}

export async function unblockUser(
  env: Env,
  userId: number,
): Promise<boolean> {
  const user = await getUser(env, userId);
  if (!user?.blocked) return false;
  user.blocked = false;
  user.blockedAt = undefined;
  user.blockedBy = undefined;
  await saveUser(env, user);
  return true;
}

export async function listUsers(env: Env): Promise<StoredUser[]> {
  const list = await env.VIDEOS.list({ prefix: USER_PREFIX });
  const users: StoredUser[] = [];
  for (const key of list.keys) {
    const raw = await env.VIDEOS.get(key.name);
    if (!raw) continue;
    try {
      users.push(JSON.parse(raw) as StoredUser);
    } catch {
      /* skip */
    }
  }
  return users.sort(
    (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
  );
}

export async function searchUsers(
  env: Env,
  query: string,
): Promise<StoredUser[]> {
  const q = query.trim().toLowerCase();
  const all = await listUsers(env);
  if (!q) return all;
  return all.filter(
    (u) =>
      String(u.id).includes(q) ||
      (u.name ?? "").toLowerCase().includes(q) ||
      (u.username ?? "").toLowerCase().includes(q),
  );
}

export function formatUserLine(u: StoredUser): string {
  const name = u.name ?? u.username ?? "—";
  const status = u.blocked ? "🚫" : "✅";
  const vip = "";
  return `${status} ${u.id} · ${name} · ${u.videosWatched} ta`;
}
