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
    const raw = await store.get(key);
    if (raw != null) {
      await store.delete(key);
      removed.push(key);
    }
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
