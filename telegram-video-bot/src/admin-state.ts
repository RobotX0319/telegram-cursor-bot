import type { Env } from "./types";

const STATE_PREFIX = "admin_state:";

export type AdminStateMode =
  | "await_channel"
  | "await_ad_channel"
  | "await_ad_template"
  | "await_vip_add"
  | "await_vip_remove"
  | "await_card"
  | "await_card_remove"
  | "await_movie_edit"
  | "await_movie_search"
  | "await_bulk_ids"
  | "await_broadcast_text"
  | "await_broadcast_media"
  | "await_broadcast_schedule"
  | "await_text_edit"
  | "await_admin_add"
  | "await_user_search"
  | "await_vip_expiry";

export interface AdminStateData {
  movieId?: number;
  field?: string;
  bulkQueue?: number[];
  broadcastId?: string;
  broadcastTarget?: "all" | "vip";
  textKey?: string;
  searchFilter?: string;
  adminRole?: string;
  vipUserId?: number;
}

export interface AdminState {
  mode: AdminStateMode;
  data?: AdminStateData;
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
  data?: AdminStateData,
): Promise<void> {
  await env.VIDEOS.put(
    `${STATE_PREFIX}${userId}`,
    JSON.stringify({ mode, data }),
    { expirationTtl: 3600 },
  );
}

export async function updateAdminStateData(
  env: Env,
  userId: number,
  patch: Partial<AdminStateData>,
): Promise<void> {
  const state = await getAdminState(env, userId);
  if (!state) return;
  state.data = { ...state.data, ...patch };
  await env.VIDEOS.put(
    `${STATE_PREFIX}${userId}`,
    JSON.stringify(state),
    { expirationTtl: 3600 },
  );
}

export async function clearAdminState(
  env: Env,
  userId: number,
): Promise<void> {
  await env.VIDEOS.delete(`${STATE_PREFIX}${userId}`);
}

export async function popBulkId(
  env: Env,
  userId: number,
): Promise<number | null> {
  const state = await getAdminState(env, userId);
  const queue = state?.data?.bulkQueue;
  if (!queue?.length) return null;
  const [, ...rest] = queue;
  if (rest.length === 0) {
    await clearAdminState(env, userId);
    return null;
  }
  await setAdminState(env, userId, "await_bulk_ids", {
    ...state?.data,
    bulkQueue: rest,
  });
  return rest[0] ?? null;
}

export async function peekBulkId(
  env: Env,
  userId: number,
): Promise<number | null> {
  const state = await getAdminState(env, userId);
  return state?.data?.bulkQueue?.[0] ?? null;
}
