import type { Env } from "./types";

export interface StoredAdmin {
  userId: string;
  addedBy: string;
  addedAt: string;
}

const ADMIN_PREFIX = "admin:";

function adminKey(userId: string): string {
  return `${ADMIN_PREFIX}${userId}`;
}

export function getBootstrapAdminIds(env: Env): string[] {
  const ids = new Set<string>();

  if (env.ALLOWED_USER_ID?.trim()) {
    ids.add(env.ALLOWED_USER_ID.trim());
  }

  if (env.ALLOWED_USER_IDS?.trim()) {
    for (const part of env.ALLOWED_USER_IDS.split(",")) {
      const id = part.trim();
      if (id) ids.add(id);
    }
  }

  return [...ids];
}

export function isBootstrapAdmin(env: Env, userId: number): boolean {
  return getBootstrapAdminIds(env).includes(String(userId));
}

export async function listStoredAdmins(env: Env): Promise<StoredAdmin[]> {
  const list = await env.SESSIONS.list({ prefix: ADMIN_PREFIX });
  const admins: StoredAdmin[] = [];

  for (const key of list.keys) {
    const raw = await env.SESSIONS.get(key.name);
    if (!raw) continue;
    admins.push(JSON.parse(raw) as StoredAdmin);
  }

  return admins.sort(
    (a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime(),
  );
}

export async function isAllowedUser(env: Env, userId: number): Promise<boolean> {
  if (isBootstrapAdmin(env, userId)) return true;

  const raw = await env.SESSIONS.get(adminKey(String(userId)));
  return raw != null;
}

export async function listAllAdminIds(env: Env): Promise<string[]> {
  const ids = new Set(getBootstrapAdminIds(env));
  for (const admin of await listStoredAdmins(env)) {
    ids.add(admin.userId);
  }
  return [...ids].sort((a, b) => Number(a) - Number(b));
}

export async function addAdmin(
  env: Env,
  userId: string,
  addedBy: number,
): Promise<"added" | "exists"> {
  if (getBootstrapAdminIds(env).includes(userId)) {
    return "exists";
  }

  const key = adminKey(userId);
  const existing = await env.SESSIONS.get(key);
  if (existing) return "exists";

  const admin: StoredAdmin = {
    userId,
    addedBy: String(addedBy),
    addedAt: new Date().toISOString(),
  };

  await env.SESSIONS.put(key, JSON.stringify(admin));
  return "added";
}

export async function removeAdmin(
  env: Env,
  userId: string,
): Promise<"removed" | "not_found" | "protected"> {
  if (getBootstrapAdminIds(env).includes(userId)) {
    return "protected";
  }

  const key = adminKey(userId);
  const existing = await env.SESSIONS.get(key);
  if (!existing) return "not_found";

  await env.SESSIONS.delete(key);
  return "removed";
}
