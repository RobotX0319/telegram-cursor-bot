import { getBotStorage, putJsonIfChanged } from "./kv-store";
import type { Env, StoredAgentEntry } from "./types";

const LEGACY_MAP_KEY = "config:admin_workspaces";

function adminKey(userId: string): string {
  return `admin:${userId}`;
}

function workspaceKey(userId: string): string {
  return `workspace:${userId}`;
}

function userRepoKey(userId: string): string {
  return `userrepo:${userId}`;
}

function sessionKey(userId: string): string {
  return `user:${userId}`;
}

/** Admin va unga bog'liq barcha platforma ma'lumotlarini o'chirish */
export async function purgeAdminData(
  env: Env,
  userId: string,
): Promise<string[]> {
  const store = getBotStorage(env);
  const removed: string[] = [];

  for (const key of [
    adminKey(userId),
    workspaceKey(userId),
    userRepoKey(userId),
    sessionKey(userId),
  ]) {
    await store.delete(key);
    removed.push(key);
  }

  const legacyRaw = await store.get(LEGACY_MAP_KEY);
  if (legacyRaw) {
    try {
      const map = JSON.parse(legacyRaw) as Record<string, string>;
      if (map[userId]) {
        delete map[userId];
        await putJsonIfChanged(store, LEGACY_MAP_KEY, map);
        removed.push(`${LEGACY_MAP_KEY}:${userId}`);
      }
    } catch {
      // corrupt legacy map — skip
    }
  }

  const ownerId = Number.parseInt(userId, 10);
  const metaList = await store.list({ prefix: "agentmeta:" });
  for (const key of metaList.keys) {
    const raw = await store.get(key.name);
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw) as StoredAgentEntry;
      if (entry.createdBy === ownerId) {
        await store.delete(key.name);
        removed.push(key.name);
      }
    } catch {
      // skip corrupt entry
    }
  }

  return removed;
}

function isBootstrapUserId(env: Env, userId: string): boolean {
  const ids = new Set<string>();
  if (env.ALLOWED_USER_ID?.trim()) ids.add(env.ALLOWED_USER_ID.trim());
  if (env.ALLOWED_USER_IDS?.trim()) {
    for (const part of env.ALLOWED_USER_IDS.split(",")) {
      const id = part.trim();
      if (id) ids.add(id);
    }
  }
  return ids.has(userId);
}

/** Admin yozuvi bo'lmasa ham Supabase/KV dan tozalash */
export async function forcePurgeUser(
  env: Env,
  userId: string,
): Promise<{ ok: true; purged: string[] } | { ok: false; error: string }> {
  if (isBootstrapUserId(env, userId)) {
    return { ok: false, error: "Asosiy adminni o'chirib bo'lmaydi." };
  }

  const purged = await purgeAdminData(env, userId);
  return { ok: true, purged };
}
