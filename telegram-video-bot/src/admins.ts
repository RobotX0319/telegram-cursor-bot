import type { Env } from "./types";

export function getAdminIds(env: Env): string[] {
  const raw = env.TELEGRAM_ADMIN_IDS?.trim() || env.TELEGRAM_ADMIN_ID?.trim();
  if (!raw) return [];

  return [
    ...new Set(
      raw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
}

export function isAdminUser(env: Env, userId: number): boolean {
  return getAdminIds(env).includes(String(userId));
}
