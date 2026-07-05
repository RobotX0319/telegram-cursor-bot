import { getAdminPanelUrl } from "./admin";
import { getAdminPanelPath, getWebhookSecret } from "./config";
import type { Env } from "./types";

/** Admin panel — chap pastdagi tugma (chat ichidagi inline panel) */
export const BTN_PANEL = "🎛 Admin panel";

/** Web admin panel — BotFather domenisiz ham ishlaydi */
export const BTN_WEB = "🌐 Web panel";

export const REPLY_BUTTON_TEXTS = new Set([BTN_PANEL, BTN_WEB]);

export function isReplyButton(text: string): boolean {
  return REPLY_BUTTON_TEXTS.has(text.trim());
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

/** Chap tomonda reply keyboard (web_app emas — domen talab qilmaydi) */
export function adminPanelKeyboard(env: Env, workerOrigin?: string) {
  const rows: Array<Array<{ text: string }>> = [[{ text: BTN_PANEL }]];
  if (getWebPanelUrl(env, workerOrigin)) {
    rows.push([{ text: BTN_WEB }]);
  }

  return {
    keyboard: rows,
    resize_keyboard: true,
    persistent: true,
  };
}
