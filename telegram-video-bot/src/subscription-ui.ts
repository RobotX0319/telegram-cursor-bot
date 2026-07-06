import { setAdminState } from "./admin-state";
import { sendMessage } from "./telegram";
import {
  addRequiredChannel,
  getSubscriptionConfig,
  removeRequiredChannel,
  setSubscriptionEnabled,
} from "./subscription";
import { listVipUserIds } from "./vip";
import type { Env, SubscriptionConfig } from "./types";
import { adminPanelKeyboard } from "./admin-keyboard";

type InlineBtn = { text: string; callback_data?: string };

export function subscriptionOn(config: SubscriptionConfig): boolean {
  return config.channels.length > 0;
}

export function formatSubscriptionLines(
  config: SubscriptionConfig,
  vipCount: number,
): string[] {
  const on = subscriptionOn(config);
  const channelLines =
    config.channels.length === 0
      ? ["Kanal ulangan emas."]
      : config.channels.map((c, i) => `${i + 1}. ${c.title ?? c.id}`);

  return [
    "📢 Majburiy obuna",
    "",
    `Holat: ${on ? "✅ Yoniq" : "⏸ O'chiq"}`,
    `Kanallar: ${config.channels.length}`,
    `⭐ VIP mijozlar: ${vipCount} (obunasiz ishlaydi)`,
    "",
    "Majburiy obuna kanallari:",
    ...channelLines,
    "",
    "➕ Kanal qo'shish — @kanal yuboring yoki tugma",
    "➖ O'chirish — kanal yonidagi tugma",
  ];
}

export function subscriptionInlineKeyboard(
  config: SubscriptionConfig,
): InlineBtn[][] {
  const on = subscriptionOn(config);
  const rows: InlineBtn[][] = [];

  rows.push([{ text: "➕ Kanal qo'shish", callback_data: "adm:ch:add" }]);

  for (let i = 0; i < config.channels.length; i++) {
    const ch = config.channels[i]!;
    const label = (ch.title ?? ch.id).slice(0, 28);
    rows.push([
      {
        text: `🗑 ${label}`,
        callback_data: `adm:ch:del:${i}`,
      },
    ]);
  }

  if (config.channels.length > 0) {
    rows.push([
      on
        ? { text: "🔴 Obunani o'chirish", callback_data: "adm:suboff" }
        : { text: "🟢 Obunani yoqish", callback_data: "adm:subon" },
    ]);
  }

  return rows;
}

export async function startChannelAddFlow(
  env: Env,
  chatId: number,
  userId: number,
): Promise<void> {
  await setAdminState(env, userId, "await_channel");
  await sendMessage(
    env,
    chatId,
    [
      "📡 Kanal qo'shish",
      "",
      "@kanal yoki https://t.me/kanal yuboring.",
      "",
      "Bot kanalda admin bo'lishi kerak.",
      "Bekor: /cancel",
    ].join("\n"),
    { bot: "admin", replyMarkup: adminPanelKeyboard(env) },
  );
}

export async function removeChannelByIndex(
  env: Env,
  index: number,
): Promise<{ ok: true; config: SubscriptionConfig } | { ok: false; error: string }> {
  const config = await getSubscriptionConfig(env);
  const channel = config.channels[index];
  if (!channel) {
    return { ok: false, error: "Kanal topilmadi" };
  }
  const next = await removeRequiredChannel(env, channel.id);
  return { ok: true, config: next };
}

export async function addChannelFromText(
  env: Env,
  text: string,
): Promise<{ ok: true; config: SubscriptionConfig } | { ok: false; error: string }> {
  const result = await addRequiredChannel(env, text);
  if (!result.ok) return result;
  return { ok: true, config: result.config };
}

export async function toggleSubscription(
  env: Env,
  enabled: boolean,
): Promise<SubscriptionConfig> {
  return setSubscriptionEnabled(env, enabled);
}

export async function getSubscriptionSummary(env: Env): Promise<{
  config: SubscriptionConfig;
  vipCount: number;
}> {
  const [config, vipIds] = await Promise.all([
    getSubscriptionConfig(env),
    listVipUserIds(env),
  ]);
  return { config, vipCount: vipIds.length };
}
