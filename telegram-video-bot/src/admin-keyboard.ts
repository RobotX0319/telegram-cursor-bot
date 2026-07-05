import { getAdminPanelUrl } from "./admin";
import { getAdminPanelPath, getWebhookSecret } from "./config";
import type { Env } from "./types";

/** Admin panel — chap pastdagi tugma */
export const BTN_PANEL = "🎛 Admin panel";

export const REPLY_BUTTON_TEXTS = new Set([BTN_PANEL]);

export function isReplyButton(text: string): boolean {
  return REPLY_BUTTON_TEXTS.has(text.trim());
}

/** Chap tomonda Web App tugmasi (reply keyboard) */
export function getWebPanelUrl(env: Env): string | null {
  const origin = env.WORKER_PUBLIC_URL?.trim();
  if (!origin) return null;
  return getAdminPanelUrl(
    origin,
    getWebhookSecret(env),
    getAdminPanelPath(env),
  );
}

export function adminPanelKeyboard(env: Env) {
  const url = getWebPanelUrl(env);
  if (!url) {
    return { remove_keyboard: true as const };
  }

  return {
    keyboard: [[{ text: BTN_PANEL, web_app: { url } }]],
    resize_keyboard: true,
    persistent: true,
  };
}
