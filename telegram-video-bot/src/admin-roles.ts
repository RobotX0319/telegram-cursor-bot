import { getAdminIds } from "./bots";
import type { AdminRecord, AdminRole, Env } from "./types";

const ADMIN_PREFIX = "admin:";

function adminKey(userId: number): string {
  return `${ADMIN_PREFIX}${userId}`;
}

export async function isSuperAdmin(
  env: Env,
  userId: number,
): Promise<boolean> {
  const envIds = await getAdminIds(env);
  if (envIds.has(String(userId))) return true;
  const record = await getAdminRecord(env, userId);
  return record?.role === "super";
}

export async function getAdminRecord(
  env: Env,
  userId: number,
): Promise<AdminRecord | null> {
  const raw = await env.VIDEOS.get(adminKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminRecord;
  } catch {
    return null;
  }
}

export async function getAdminRole(
  env: Env,
  userId: number,
): Promise<AdminRole | null> {
  if (await isSuperAdmin(env, userId)) return "super";
  const record = await getAdminRecord(env, userId);
  return record?.role ?? null;
}

export async function isPanelAdmin(
  env: Env,
  userId: number,
): Promise<boolean> {
  const envIds = await getAdminIds(env);
  if (envIds.has(String(userId))) return true;
  const record = await getAdminRecord(env, userId);
  return record !== null;
}

export async function listAdminRecords(env: Env): Promise<AdminRecord[]> {
  const list = await env.VIDEOS.list({ prefix: ADMIN_PREFIX });
  const records: AdminRecord[] = [];
  for (const key of list.keys) {
    const raw = await env.VIDEOS.get(key.name);
    if (!raw) continue;
    try {
      records.push(JSON.parse(raw) as AdminRecord);
    } catch {
      /* skip */
    }
  }
  const envIds = await getAdminIds(env);
  for (const id of envIds) {
    const numId = Number.parseInt(id, 10);
    if (!records.some((r) => r.userId === numId)) {
      records.push({
        userId: numId,
        role: "super",
        addedAt: "—",
        addedBy: 0,
      });
    }
  }
  return records.sort((a, b) => a.userId - b.userId);
}

export async function addAdminRecord(
  env: Env,
  userId: number,
  role: AdminRole,
  addedBy: number,
  name?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^\d+$/.test(String(userId))) {
    return { ok: false, error: "Noto'g'ri ID" };
  }
  const existing = await getAdminRecord(env, userId);
  if (existing) {
    return { ok: false, error: "Bu admin allaqachon mavjud" };
  }
  const record: AdminRecord = {
    userId,
    role,
    name,
    addedAt: new Date().toISOString(),
    addedBy,
  };
  await env.VIDEOS.put(adminKey(userId), JSON.stringify(record));
  return { ok: true };
}

export async function removeAdminRecord(
  env: Env,
  userId: number,
): Promise<boolean> {
  const envIds = await getAdminIds(env);
  if (envIds.has(String(userId))) return false;
  const existing = await getAdminRecord(env, userId);
  if (!existing) return false;
  await env.VIDEOS.delete(adminKey(userId));
  return true;
}

export function roleLabel(role: AdminRole): string {
  return role === "super" ? "⭐ Super-admin" : "👤 Admin";
}
