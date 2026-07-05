import type { Env } from "./types";

const STATE_PREFIX = "admin_state:";

export type AdminStateMode =
  | "await_channel"
  | "await_ad_channel"
  | "await_ad_template"
  | "await_vip_add"
  | "await_vip_remove"
  | "await_card"
  | "await_card_remove";

export interface AdminState {
  mode: AdminStateMode;
}

export async function getAdminState(
  env: Env,
  userId: number,
): Promise<AdminState | null> {
  const raw = await env.VIDEOS.get(`${STATE_PREFIX}${userId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminState;
  } catch {
    return null;
  }
}

export async function setAdminState(
  env: Env,
  userId: number,
  mode: AdminStateMode,
): Promise<void> {
  await env.VIDEOS.put(
    `${STATE_PREFIX}${userId}`,
    JSON.stringify({ mode }),
    { expirationTtl: 3600 },
  );
}

export async function clearAdminState(
  env: Env,
  userId: number,
): Promise<void> {
  await env.VIDEOS.delete(`${STATE_PREFIX}${userId}`);
}
