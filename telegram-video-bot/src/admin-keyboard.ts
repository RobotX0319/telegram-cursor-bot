/** Pastki panel (ReplyKeyboard) tugma matnlari — boshqa fayllarda ham shu constant ishlatiladi. */
export const BTN_VIDEO = "📤 Video yuklash";
export const BTN_SUBSCRIPTION = "📢 Majburiy obuna";
export const BTN_CHANNELS = "📡 Kanallar sozlamalari";
export const BTN_VIP = "⭐ VIP mijozlar";
export const BTN_CARDS = "💳 Karta ulash";
export const BTN_PANEL = "📱 Admin panel";

export const ADMIN_REPLY_KEYBOARD = {
  keyboard: [
    [{ text: BTN_VIDEO }, { text: BTN_SUBSCRIPTION }],
    [{ text: BTN_CHANNELS }],
    [{ text: BTN_VIP }, { text: BTN_CARDS }],
    [{ text: BTN_PANEL }],
  ],
  resize_keyboard: true,
};

export const REPLY_BUTTON_TEXTS = new Set([
  BTN_VIDEO,
  BTN_SUBSCRIPTION,
  BTN_CHANNELS,
  BTN_VIP,
  BTN_CARDS,
  BTN_PANEL,
]);

export function isReplyButton(text: string): boolean {
  return REPLY_BUTTON_TEXTS.has(text.trim());
}
