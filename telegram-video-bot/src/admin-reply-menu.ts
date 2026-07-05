import {
  ADMIN_REPLY_KEYBOARD,
  BTN_CARDS,
  BTN_CHANNELS,
  BTN_PANEL,
  BTN_SUBSCRIPTION,
  BTN_VIDEO,
  BTN_VIP,
} from "./admin-keyboard";
import { sendAdminPanel } from "./admin-panel-bot";
import {
  clearAdminState,
  getAdminState,
  setAdminState,
} from "./admin-state";
import {
  addPaymentCard,
  listPaymentCards,
  parseCardInput,
  removePaymentCard,
} from "./payment-cards";
import { sendMessage } from "./telegram";
import { removeRequiredChannel } from "./subscription";
import {
  addChannelFromText,
  formatSubscriptionLines,
  getSubscriptionSummary,
  removeChannelByIndex,
  startChannelAddFlow,
  subscriptionInlineKeyboard,
  subscriptionOn,
} from "./subscription-ui";
import {
  channelsMenuInlineKeyboard,
  formatChannelsMenuLines,
  getChannelsMenuData,
  startAdChannelFlow,
} from "./ad-channel-ui";
import { setAdChannel } from "./ad-channel";
import { addVipUser, listVipUserIds, removeVipUser } from "./vip";
import type { Env } from "./types";

type InlineBtn = { text: string; callback_data?: string };

function withKeyboard(
  text: string,
  inline?: InlineBtn[][],
): {
  text: string;
  replyMarkup:
    | { inline_keyboard: InlineBtn[][] }
    | typeof ADMIN_REPLY_KEYBOARD;
} {
  if (inline) {
    return {
      text,
      replyMarkup: { inline_keyboard: inline },
    };
  }
  return { text, replyMarkup: ADMIN_REPLY_KEYBOARD };
}

export async function handleReplyButton(
  env: Env,
  chatId: number,
  userId: number,
  text: string,
  workerOrigin: string,
): Promise<boolean> {
  switch (text.trim()) {
    case BTN_VIDEO:
      await showVideoUploadHelp(env, chatId);
      return true;
    case BTN_SUBSCRIPTION:
      await showSubscriptionMenu(env, chatId);
      return true;
    case BTN_CHANNELS:
      await showChannelsMenu(env, chatId, userId);
      return true;
    case BTN_VIP:
      await showVipMenu(env, chatId);
      return true;
    case BTN_CARDS:
      await showCardsMenu(env, chatId, userId);
      return true;
    case BTN_PANEL:
      await sendAdminPanel(env, chatId, workerOrigin);
      return true;
    default:
      return false;
  }
}

async function showVideoUploadHelp(env: Env, chatId: number): Promise<void> {
  const msg = withKeyboard(
    [
      "📤 Video yuklash",
      "",
      "1) Avval ID raqam yuboring: 5",
      "2) Keyin videoni yuboring",
      "",
      "Yoki videoga caption: 5",
      "yoki: 5 | Film nomi",
    ].join("\n"),
  );
  await sendMessage(env, chatId, msg.text, {
    bot: "admin",
    replyMarkup: msg.replyMarkup,
  });
}

async function showSubscriptionMenu(env: Env, chatId: number): Promise<void> {
  const { config, vipCount } = await getSubscriptionSummary(env);
  const msg = withKeyboard(
    formatSubscriptionLines(config, vipCount).join("\n"),
    subscriptionInlineKeyboard(config),
  );

  await sendMessage(env, chatId, msg.text, {
    bot: "admin",
    replyMarkup: msg.replyMarkup,
  });
}

async function showChannelsMenu(
  env: Env,
  chatId: number,
  _userId: number,
): Promise<void> {
  const { subConfig, adConfig, vipCount } = await getChannelsMenuData(env);
  const msg = withKeyboard(
    formatChannelsMenuLines(subConfig, adConfig, vipCount).join("\n"),
    channelsMenuInlineKeyboard(subConfig, adConfig),
  );

  await sendMessage(env, chatId, msg.text, {
    bot: "admin",
    replyMarkup: msg.replyMarkup,
  });
}

async function showVipMenu(env: Env, chatId: number): Promise<void> {
  const { config, vipCount } = await getSubscriptionSummary(env);
  const ids = await listVipUserIds(env);
  const vipLines =
    ids.length === 0
      ? ["VIP mijoz yo'q."]
      : ids.map((id, i) => `${i + 1}. ${id}`);

  const inline: InlineBtn[][] = [
    [{ text: "➕ VIP qo'shish", callback_data: "adm:vip:add" }],
    [{ text: "📋 VIP ro'yxati", callback_data: "adm:vip:list" }],
    [{ text: "➕ Kanal qo'shish", callback_data: "adm:ch:add" }],
    ...subscriptionInlineKeyboard(config).filter(
      (row) => !row.some((b) => b.callback_data === "adm:ch:add"),
    ),
  ];

  const msg = withKeyboard(
    [
      "⭐ VIP & Majburiy obuna",
      "",
      ...vipLines,
      "",
      `Obuna: ${subscriptionOn(config) ? "✅ Yoniq" : "⏸ O'chiq"}`,
      `Kanallar: ${config.channels.length}`,
      "",
      "VIP — kanalga obuna bo'lmasdan video oladi.",
      "Oddiy foydalanuvchi — kanalga obuna bo'lishi shart.",
    ].join("\n"),
    inline,
  );

  await sendMessage(env, chatId, msg.text, {
    bot: "admin",
    replyMarkup: msg.replyMarkup,
  });
}

async function showCardsMenu(
  env: Env,
  chatId: number,
  userId: number,
): Promise<void> {
  const cards = await listPaymentCards(env);
  const lines =
    cards.length === 0
      ? ["Karta/havola yo'q."]
      : cards.map((c) => `${c.id}. ${c.title}\n   ${c.value}`);

  await setAdminState(env, userId, "await_card");

  const msg = withKeyboard(
    [
      "💳 Karta ulash",
      "",
      "To'lov kartalari yoki havolalar (@Detskebot da ko'rsatiladi).",
      "",
      ...lines,
      "",
      "➕ Qo'shish: Nomi | 8600123456789012",
      "   yoki: Nomi | https://...",
      "➖ O'chirish: o'chirish 1",
      "",
      "Bekor: /cancel",
    ].join("\n"),
  );

  await sendMessage(env, chatId, msg.text, {
    bot: "admin",
    replyMarkup: msg.replyMarkup,
  });
}

export async function handleAdminStateInput(
  env: Env,
  chatId: number,
  userId: number,
  text: string,
): Promise<boolean> {
  if (text.toLowerCase() === "/cancel") {
    await clearAdminState(env, userId);
    await sendMessage(env, chatId, "Bekor qilindi.", {
      bot: "admin",
      replyMarkup: ADMIN_REPLY_KEYBOARD,
    });
    return true;
  }

  const state = await getAdminState(env, userId);
  if (!state) return false;

  switch (state.mode) {
    case "await_channel":
      return handleChannelInput(env, chatId, userId, text);
    case "await_ad_channel":
      return handleAdChannelInput(env, chatId, userId, text);
    case "await_vip_add":
      return handleVipAddInput(env, chatId, userId, text);
    case "await_vip_remove":
      return handleVipRemoveInput(env, chatId, userId, text);
    case "await_card":
      return handleCardInput(env, chatId, userId, text);
    case "await_card_remove":
      return handleCardRemoveInput(env, chatId, userId, text);
    default:
      return false;
  }
}

async function handleChannelInput(
  env: Env,
  chatId: number,
  userId: number,
  text: string,
): Promise<boolean> {
  const lower = text.toLowerCase();
  if (lower.startsWith("o'chirish ") || lower.startsWith("ochirish ")) {
    const channel = text.replace(/^o'?chirish\s+/i, "").trim();
    const config = await removeRequiredChannel(env, channel);
    await clearAdminState(env, userId);
    await sendMessage(
      env,
      chatId,
      `✅ Kanal o'chirildi.\nQolgan: ${config.channels.length}`,
      { bot: "admin", replyMarkup: ADMIN_REPLY_KEYBOARD },
    );
    return true;
  }

  const result = await addChannelFromText(env, text);
  if (!result.ok) {
    await sendMessage(env, chatId, result.error, {
      bot: "admin",
      replyMarkup: ADMIN_REPLY_KEYBOARD,
    });
    return true;
  }

  await clearAdminState(env, userId);
  const on = subscriptionOn(result.config);
  await sendMessage(
    env,
    chatId,
    [
      `✅ Kanal qo'shildi.`,
      `Jami kanallar: ${result.config.channels.length}`,
      on ? "Majburiy obuna yoqildi." : "",
    ]
      .filter(Boolean)
      .join("\n"),
    { bot: "admin", replyMarkup: ADMIN_REPLY_KEYBOARD },
  );
  return true;
}

async function handleAdChannelInput(
  env: Env,
  chatId: number,
  userId: number,
  text: string,
): Promise<boolean> {
  const result = await setAdChannel(env, text);
  if (!result.ok) {
    await sendMessage(env, chatId, result.error, {
      bot: "admin",
      replyMarkup: ADMIN_REPLY_KEYBOARD,
    });
    return true;
  }

  await clearAdminState(env, userId);
  await sendMessage(
    env,
    chatId,
    [
      `✅ Reklama kanali ulandi: ${result.config.channelTitle ?? result.config.channelId}`,
      "",
      "Endi 🖼 Rasm shablon yuboring (Kanallar sozlamalari).",
    ].join("\n"),
    { bot: "admin", replyMarkup: ADMIN_REPLY_KEYBOARD },
  );
  return true;
}

async function handleVipAddInput(
  env: Env,
  chatId: number,
  userId: number,
  text: string,
): Promise<boolean> {
  if (!/^\d+$/.test(text.trim())) {
    await sendMessage(env, chatId, "Telegram ID raqam bo'lishi kerak.", {
      bot: "admin",
      replyMarkup: ADMIN_REPLY_KEYBOARD,
    });
    return true;
  }

  const id = Number.parseInt(text.trim(), 10);
  const result = await addVipUser(env, id);
  await clearAdminState(env, userId);
  await sendMessage(
    env,
    chatId,
    result.ok ? `✅ VIP qo'shildi: ${id}` : result.error,
    { bot: "admin", replyMarkup: ADMIN_REPLY_KEYBOARD },
  );
  return true;
}

async function handleVipRemoveInput(
  env: Env,
  chatId: number,
  userId: number,
  text: string,
): Promise<boolean> {
  const id = Number.parseInt(text.trim(), 10);
  const ok = await removeVipUser(env, id);
  await clearAdminState(env, userId);
  await sendMessage(
    env,
    chatId,
    ok ? `✅ VIP o'chirildi: ${id}` : "VIP topilmadi.",
    { bot: "admin", replyMarkup: ADMIN_REPLY_KEYBOARD },
  );
  return true;
}

async function handleCardInput(
  env: Env,
  chatId: number,
  userId: number,
  text: string,
): Promise<boolean> {
  const lower = text.toLowerCase();
  if (lower.startsWith("o'chirish ") || lower.startsWith("ochirish ")) {
    const idStr = text.replace(/^o'?chirish\s+/i, "").trim();
    if (!/^\d+$/.test(idStr)) {
      await sendMessage(env, chatId, "Foydalanish: o'chirish 1", {
        bot: "admin",
        replyMarkup: ADMIN_REPLY_KEYBOARD,
      });
      return true;
    }
    const ok = await removePaymentCard(env, Number.parseInt(idStr, 10));
    await clearAdminState(env, userId);
    await sendMessage(
      env,
      chatId,
      ok ? "✅ Karta o'chirildi." : "Karta topilmadi.",
      { bot: "admin", replyMarkup: ADMIN_REPLY_KEYBOARD },
    );
    return true;
  }

  const parsed = parseCardInput(text);
  if (!parsed) {
    await sendMessage(
      env,
      chatId,
      "Format: Nomi | 8600123456789012\nYoki: Nomi | https://...",
      { bot: "admin", replyMarkup: ADMIN_REPLY_KEYBOARD },
    );
    return true;
  }

  const result = await addPaymentCard(
    env,
    parsed.title,
    parsed.value,
    userId,
  );
  await clearAdminState(env, userId);
  await sendMessage(
    env,
    chatId,
    result.ok
      ? `✅ Karta qo'shildi (#${result.card.id}): ${result.card.title}`
      : result.error,
    { bot: "admin", replyMarkup: ADMIN_REPLY_KEYBOARD },
  );
  return true;
}

async function handleCardRemoveInput(
  env: Env,
  chatId: number,
  userId: number,
  text: string,
): Promise<boolean> {
  return handleCardInput(env, chatId, userId, `o'chirish ${text.trim()}`);
}

export async function startVipAddFlow(
  env: Env,
  chatId: number,
  userId: number,
): Promise<void> {
  await setAdminState(env, userId, "await_vip_add");
  await sendMessage(
    env,
    chatId,
    "VIP qo'shish — Telegram user ID yuboring.\n\nBekor: /cancel",
    { bot: "admin", replyMarkup: ADMIN_REPLY_KEYBOARD },
  );
}

export async function sendVipList(env: Env, chatId: number): Promise<void> {
  const ids = await listVipUserIds(env);
  const text =
    ids.length === 0
      ? "VIP ro'yxat bo'sh."
      : ["VIP mijozlar:", "", ...ids.map((id) => `• ${id}`)].join("\n");
  await sendMessage(env, chatId, text, {
    bot: "admin",
    replyMarkup: ADMIN_REPLY_KEYBOARD,
  });
}

export async function sendChannelsMenu(
  env: Env,
  chatId: number,
): Promise<void> {
  const { subConfig, adConfig, vipCount } = await getChannelsMenuData(env);
  await sendMessage(
    env,
    chatId,
    formatChannelsMenuLines(subConfig, adConfig, vipCount).join("\n"),
    {
      bot: "admin",
      replyMarkup: {
        inline_keyboard: channelsMenuInlineKeyboard(subConfig, adConfig),
      },
    },
  );
}

export { startAdChannelFlow, startAdTemplateFlow } from "./ad-channel-ui";

export async function sendPaymentCardsToUser(
  env: Env,
  chatId: number,
): Promise<void> {
  const cards = await listPaymentCards(env);
  if (cards.length === 0) return;

  const lines = [
    "💳 To'lov kartalari:",
    "",
    ...cards.map((c) => `${c.id}. ${c.title}\n${c.value}`),
  ];
  await sendMessage(env, chatId, lines.join("\n"));
}
