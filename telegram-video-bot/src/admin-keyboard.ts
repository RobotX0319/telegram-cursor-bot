/** Admin panel — bitta tugma */
export const BTN_PANEL = "🎛 Admin panel";

/** Eski reply klaviatura o'rniga menyu tugmasi ishlatiladi */
export const ADMIN_REPLY_KEYBOARD = {
  remove_keyboard: true as const,
};

export const REPLY_BUTTON_TEXTS = new Set([BTN_PANEL]);

export function isReplyButton(text: string): boolean {
  return REPLY_BUTTON_TEXTS.has(text.trim());
}
