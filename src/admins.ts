import { putJsonIfChanged, putTextIfChanged } from "./kv-store";
import type { Env } from "./types";

export interface StoredAdmin {
  userId: string;
  addedBy: string;
  addedAt: string;
  repoUrl?: string;
  repoName?: string;
}

const ADMIN_PREFIX = "admin:";
const BOOTSTRAP_REPO_KEY = "config:bootstrap_repo";

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

/** Faqat ALLOWED_USER_ID — asosiy loyiha repoda ishlaydi. */
export function getPrimaryBootstrapId(env: Env): string | null {
  return env.ALLOWED_USER_ID?.trim() || null;
}

export function isPrimaryBootstrapAdmin(env: Env, userId: number): boolean {
  const primary = getPrimaryBootstrapId(env);
  return primary !== null && primary === String(userId);
}

export async function getBootstrapRepo(env: Env): Promise<string | null> {
  const fromKv = await env.SESSIONS.get(BOOTSTRAP_REPO_KEY);
  if (fromKv?.trim()) return fromKv.trim();
  return env.DEFAULT_GITHUB_REPO?.trim() ?? null;
}

export async function updateBootstrapRepo(
  env: Env,
  repoUrl: string,
): Promise<void> {
  await putTextIfChanged(env.SESSIONS, BOOTSTRAP_REPO_KEY, repoUrl);
}

export async function getAdminProfile(
  env: Env,
  userId: number,
): Promise<StoredAdmin | null> {
  if (isBootstrapAdmin(env, userId)) {
    const repoUrl = isPrimaryBootstrapAdmin(env, userId)
      ? ((await getBootstrapRepo(env)) ??
        env.DEFAULT_GITHUB_REPO?.trim() ??
        undefined)
      : ((await import("./user-repos")).getStoredUserRepo(env, userId) ??
        undefined);
    return {
      userId: String(userId),
      addedBy: "env",
      addedAt: "",
      repoUrl,
    };
  }

  const raw = await env.SESSIONS.get(adminKey(String(userId)));
  if (!raw) return null;
  const admin = JSON.parse(raw) as StoredAdmin;

  if (!admin.repoUrl) {
    const { getStoredUserRepo } = await import("./user-repos");
    const stored = await getStoredUserRepo(env, userId);
    if (stored) admin.repoUrl = stored;
  }

  return admin;
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

  await putJsonIfChanged(env.SESSIONS, key, admin);
  return "added";
}

export async function setAdminRepo(
  env: Env,
  userId: string,
  repoUrl: string,
  updatedBy: number,
): Promise<void> {
  const key = adminKey(userId);
  const raw = await env.SESSIONS.get(key);
  const admin: StoredAdmin = raw
    ? (JSON.parse(raw) as StoredAdmin)
    : {
        userId,
        addedBy: String(updatedBy),
        addedAt: new Date().toISOString(),
      };

  admin.repoUrl = repoUrl;
  admin.repoName = repoUrl.split("/").pop();

  await putJsonIfChanged(env.SESSIONS, key, admin);
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
