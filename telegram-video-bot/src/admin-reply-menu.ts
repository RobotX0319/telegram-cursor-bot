import {
  adminPanelKeyboard,
  BTN_PANEL,
  BTN_WEB,
  getWebPanelUrl,
} from "./admin-keyboard";
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
  subscriptionOn,
} from "./subscription-ui";
import { setAdChannel } from "./ad-channel";
import { addVipUser, removeVipUser } from "./vip";
import {
  handlePanelStateInput,
  sendAdminPanel,
} from "./panel";
import type { BotKind } from "./bots";
import type { Env } from "./types";

function panelBot(_env: Env, _chatId: number): BotKind {
  return "admin";
}

export async function handleReplyButton(
  env: Env,
  chatId: number,
  userId: number,
  text: string,
  workerOrigin: string,
): Promise<boolean> {
  if (text.trim() === BTN_PANEL) {
    await sendAdminPanel(env, chatId, workerOrigin, panelBot(env, chatId));
    return true;
  }

  if (text.trim() === BTN_WEB) {
    const url = getWebPanelUrl(env, workerOrigin);
    if (!url) {
      await sendMessage(env, chatId, "Web panel URL sozlanmagan.", {
        bot: panelBot(env, chatId),
        replyMarkup: adminPanelKeyboard(env, workerOrigin),
      });
      return true;
    }
    await sendMessage(env, chatId, "🌐 Web admin panel — tugmani bosing:", {
      bot: panelBot(env, chatId),
      replyMarkup: {
        inline_keyboard: [[{ text: "🌐 Ochish", url }]],
      },
    });
    return true;
  }

  return false;
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
      bot: panelBot(env, chatId),
      replyMarkup: adminPanelKeyboard(env),
    });
    return true;
  }

  if (text.toLowerCase() === "/skip") {
    const { skipBroadcastMedia } = await import("./panel");
    if (await skipBroadcastMedia(env, chatId, userId)) return true;
  }

  if (await handlePanelStateInput(env, chatId, userId, text)) {
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
      { bot: panelBot(env, chatId), replyMarkup: adminPanelKeyboard(env) },
    );
    return true;
  }

  const result = await addChannelFromText(env, text);
  if (!result.ok) {
    await sendMessage(env, chatId, result.error, {
      bot: panelBot(env, chatId),
      replyMarkup: adminPanelKeyboard(env),
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
    { bot: panelBot(env, chatId), replyMarkup: adminPanelKeyboard(env) },
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
      bot: panelBot(env, chatId),
      replyMarkup: adminPanelKeyboard(env),
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
      "Endi 🖼 Rasm shablon yuboring (Sozlamalar → Reklama).",
    ].join("\n"),
    { bot: panelBot(env, chatId), replyMarkup: adminPanelKeyboard(env) },
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
      bot: panelBot(env, chatId),
      replyMarkup: adminPanelKeyboard(env),
    });
    return true;
  }

  const id = Number.parseInt(text.trim(), 10);
  const result = await addVipUser(env, id, userId);
  await clearAdminState(env, userId);
  await sendMessage(
    env,
    chatId,
    result.ok ? `✅ VIP qo'shildi: ${id}` : result.error,
    { bot: panelBot(env, chatId), replyMarkup: adminPanelKeyboard(env) },
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
    { bot: panelBot(env, chatId), replyMarkup: adminPanelKeyboard(env) },
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
        bot: panelBot(env, chatId),
        replyMarkup: adminPanelKeyboard(env),
      });
      return true;
    }
    const ok = await removePaymentCard(env, Number.parseInt(idStr, 10));
    await clearAdminState(env, userId);
    await sendMessage(
      env,
      chatId,
      ok ? "✅ Karta o'chirildi." : "Karta topilmadi.",
      { bot: panelBot(env, chatId), replyMarkup: adminPanelKeyboard(env) },
    );
    return true;
  }

  const parsed = parseCardInput(text);
  if (!parsed) {
    await sendMessage(
      env,
      chatId,
      "Format: Nomi | 8600123456789012\nYoki: Nomi | https://...",
      { bot: panelBot(env, chatId), replyMarkup: adminPanelKeyboard(env) },
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
    { bot: panelBot(env, chatId), replyMarkup: adminPanelKeyboard(env) },
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
    { bot: panelBot(env, chatId), replyMarkup: adminPanelKeyboard(env) },
  );
}

export async function sendVipList(env: Env, chatId: number): Promise<void> {
  const { listVipRecords, formatVipRecord } = await import("./vip");
  const records = await listVipRecords(env);
  const text =
    records.length === 0
      ? "VIP ro'yxat bo'sh."
      : ["VIP mijozlar:", "", ...records.map(formatVipRecord)].join("\n");
  await sendMessage(env, chatId, text, {
    bot: panelBot(env, chatId),
    replyMarkup: adminPanelKeyboard(env),
  });
}

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

export { startAdChannelFlow, startAdTemplateFlow } from "./ad-channel-ui";
