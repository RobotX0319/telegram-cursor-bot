import type { Env } from "./types";

const VIP_KEY = "config:vip_users";

export async function listVipUserIds(env: Env): Promise<string[]> {
  const raw = await env.VIDEOS.get(VIP_KEY);
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function isVipUser(env: Env, userId: number): Promise<boolean> {
  const ids = await listVipUserIds(env);
  return ids.includes(String(userId));
}

export async function addVipUser(
  env: Env,
  userId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = String(userId).trim();
  if (!/^\d+$/.test(id)) {
    return { ok: false, error: "Noto'g'ri Telegram ID" };
  }

  const ids = await listVipUserIds(env);
  if (ids.includes(id)) {
    return { ok: false, error: "Bu mijoz allaqachon VIP" };
  }

  ids.push(id);
  await env.VIDEOS.put(VIP_KEY, JSON.stringify(ids));
  return { ok: true };
}

export async function removeVipUser(
  env: Env,
  userId: number,
): Promise<boolean> {
  const id = String(userId);
  const ids = await listVipUserIds(env);
  const next = ids.filter((x) => x !== id);
  if (next.length === ids.length) return false;
  await env.VIDEOS.put(VIP_KEY, JSON.stringify(next));
  return true;
}
