import type { Env } from "./types";

/** Vars (wrangler.jsonc) ustun — Cloudflare secret eski bo'lsa ham yangi kalit ishlaydi. */
export function getWebhookSecret(env: Env): string {
  return env.WEBHOOK_KEY?.trim() || env.TELEGRAM_WEBHOOK_SECRET;
}
