import { getAdminPanelUrl } from "./admin";
import { getAdminPanelPath, getWebhookSecret } from "./config";
import type { Env } from "./types";

/** Eski reply keyboard tugmalarini olib tashlash */
export function adminPanelKeyboard(_env: Env, _workerOrigin?: string) {
  return { remove_keyboard: true as const };
}

export function isReplyButton(_text: string): boolean {
  return false;
}

export function getWebPanelUrl(
  env: Env,
  fallbackOrigin?: string,
): string | null {
  const origin = env.WORKER_PUBLIC_URL?.trim() || fallbackOrigin?.trim();
  if (!origin) return null;
  return getAdminPanelUrl(
    origin,
    getWebhookSecret(env),
    getAdminPanelPath(env),
  );
}
