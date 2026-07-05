import { getAdChannelConfig, setAdEnabled } from "./ad-channel";
import { setAdminState } from "./admin-state";
import { sendMessage } from "./telegram";
import { getSubscriptionConfig } from "./subscription";
import { listVipUserIds } from "./vip";
import type { AdChannelConfig, Env, SubscriptionConfig } from "./types";
import { ADMIN_REPLY_KEYBOARD } from "./admin-keyboard";

type InlineBtn = { text: string; callback_data?: string };

export function formatAdChannelLines(config: AdChannelConfig): string[] {
  const ready = Boolean(config.channelId && config.templateFileId);
  return [
    "📢 Reklama (bot kanali)",
    "",
    `Holat: ${config.enabled && ready ? "✅ Yoniq" : "⏸ O'chiq"}`,
    `Kanal: ${config.channelTitle ?? config.channelId ?? "ulanmagan"}`,
    `Rasm shablon: ${config.templateFileId ? "✅ o'rnatilgan" : "❌ yo'q"}`,
    "",
    "Video yuklanganda shablon rasm + matn reklama kanalga tushadi.",
    "@Detskebot reklama kanalda admin bo'lishi kerak.",
  ];
}

export function adChannelInlineKeyboard(
  config: AdChannelConfig,
): InlineBtn[][] {
  const ready = Boolean(config.channelId && config.templateFileId);
  const rows: InlineBtn[][] = [
    [{ text: "📢 Reklama kanali", callback_data: "adm:ad:ch" }],
    [{ text: "🖼 Rasm shablon", callback_data: "adm:ad:tpl" }],
  ];

  if (config.channelId) {
    rows.push([
      { text: "🗑 Reklama kanalini o'chirish", callback_data: "adm:ad:chdel" },
    ]);
  }
  if (config.templateFileId) {
    rows.push([
      { text: "🗑 Shablonni o'chirish", callback_data: "adm:ad:tpldel" },
    ]);
  }

  if (ready) {
    rows.push([
      config.enabled
        ? { text: "🔴 Reklamani o'chirish", callback_data: "adm:ad:off" }
        : { text: "🟢 Reklamani yoqish", callback_data: "adm:ad:on" },
    ]);
  }

  return rows;
}

export function formatChannelsMenuLines(
  subConfig: SubscriptionConfig,
  adConfig: AdChannelConfig,
  vipCount: number,
): string[] {
  const channelLines =
    subConfig.channels.length === 0
      ? ["Kanal ulangan emas."]
      : subConfig.channels.map((c, i) => `${i + 1}. ${c.title ?? c.id}`);

  return [
    "📡 Kanal sozlamalari",
    "",
    "Majburiy obuna:",
    `Holat: ${subConfig.channels.length > 0 ? "✅ Yoniq" : "⏸ O'chiq"}`,
    `Kanallar: ${subConfig.channels.length}`,
    `⭐ VIP: ${vipCount}`,
    "",
    ...channelLines,
    "",
    ...formatAdChannelLines(adConfig),
  ];
}

export function channelsMenuInlineKeyboard(
  subConfig: SubscriptionConfig,
  adConfig: AdChannelConfig,
): InlineBtn[][] {
  const rows: InlineBtn[][] = [];

  rows.push([{ text: "➕ Obuna kanali", callback_data: "adm:ch:add" }]);

  for (let i = 0; i < subConfig.channels.length; i++) {
    const ch = subConfig.channels[i]!;
    const label = (ch.title ?? ch.id).slice(0, 28);
    rows.push([{ text: `🗑 ${label}`, callback_data: `adm:ch:del:${i}` }]);
  }

  if (subConfig.channels.length > 0) {
    rows.push([
      subConfig.enabled
        ? { text: "🔴 Obunani o'chirish", callback_data: "adm:suboff" }
        : { text: "🟢 Obunani yoqish", callback_data: "adm:subon" },
    ]);
  }

  rows.push(...adChannelInlineKeyboard(adConfig));

  return rows;
}

export async function startAdChannelFlow(
  env: Env,
  chatId: number,
  userId: number,
): Promise<void> {
  await setAdminState(env, userId, "await_ad_channel");
  await sendMessage(
    env,
    chatId,
    [
      "📢 Reklama kanali",
      "",
      "Video yuklanganda reklama shu kanalga tushadi.",
      "",
      "@kanal yoki https://t.me/kanal yuboring.",
      "@Detskebot kanalda admin bo'lishi kerak.",
      "",
      "Bekor: /cancel",
    ].join("\n"),
    { bot: "admin", replyMarkup: ADMIN_REPLY_KEYBOARD },
  );
}

export async function startAdTemplateFlow(
  env: Env,
  chatId: number,
  userId: number,
): Promise<void> {
  await setAdminState(env, userId, "await_ad_template");
  await sendMessage(
    env,
    chatId,
    [
      "🖼 Rasm shablon",
      "",
      "Reklama uchun rasm yuboring (photo).",
      "Har bir yangi video uchun shu rasm ishlatiladi.",
      "",
      "Bekor: /cancel",
    ].join("\n"),
    { bot: "admin", replyMarkup: ADMIN_REPLY_KEYBOARD },
  );
}

export async function toggleAdChannel(
  env: Env,
  enabled: boolean,
): Promise<AdChannelConfig> {
  return setAdEnabled(env, enabled);
}

export async function getChannelsMenuData(env: Env): Promise<{
  subConfig: SubscriptionConfig;
  adConfig: AdChannelConfig;
  vipCount: number;
}> {
  const [subConfig, adConfig, vipIds] = await Promise.all([
    getSubscriptionConfig(env),
    getAdChannelConfig(env),
    listVipUserIds(env),
  ]);
  return { subConfig, adConfig, vipCount: vipIds.length };
}
