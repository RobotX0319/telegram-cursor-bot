import type { Env } from "./types";

/** Vars (wrangler.jsonc) ustun — Cloudflare secret eski bo'lsa ham yangi kalit ishlaydi. */
export function getWebhookSecret(env: Env): string {
  return env.WEBHOOK_KEY?.trim() || env.TELEGRAM_WEBHOOK_SECRET;
}

/** Web admin panel yo'li — har bir bot/agent uchun alohida (masalan /admin1, /admin2). */
export function getAdminPanelPath(env: Env): string {
  const raw = env.ADMIN_PANEL_PATH?.trim() || "/admin1";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

export function isAdminPanelPath(env: Env, pathname: string): boolean {
  const base = getAdminPanelPath(env);
  return pathname === base || pathname.startsWith(`${base}/`);
}
