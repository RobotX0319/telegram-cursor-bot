/** Admin panel — bitta tugma */
export const BTN_PANEL = "🎛 Admin panel";

export const ADMIN_REPLY_KEYBOARD = {
  keyboard: [[{ text: BTN_PANEL }]],
  resize_keyboard: true,
};

export const REPLY_BUTTON_TEXTS = new Set([BTN_PANEL]);

export function isReplyButton(text: string): boolean {
  return REPLY_BUTTON_TEXTS.has(text.trim());
}
