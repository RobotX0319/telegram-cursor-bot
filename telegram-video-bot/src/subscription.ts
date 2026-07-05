import { sendMessage } from "./telegram";
import type { Env, RequiredChannel, SubscriptionConfig, StoredChannel } from "./types";
import { isVipUser } from "./vip";

const SUBSCRIPTION_KEY = "meta:subscription";

const SUBSCRIBED_STATUSES = new Set([
  "creator",
  "administrator",
  "member",
]);

export type { RequiredChannel };

function channelUrl(channelId: string, customUrl?: string): string | undefined {
  if (customUrl?.trim()) return customUrl.trim();
  if (channelId.startsWith("@")) {
    return `https://t.me/${channelId.slice(1)}`;
  }
  return undefined;
}

function channelTitle(channelId: string, title?: string): string {
  return title?.trim() || (channelId.startsWith("@") ? channelId : `Kanal ${channelId}`);
}

function parseChannelsFromEnv(env: Env): StoredChannel[] {
  const raw = env.REQUIRED_CHANNELS?.trim();
  if (!raw) return [];

  return raw.split(",").map((entry) => {
    const id = normalizeChannelId(entry.trim());
    return {
      id,
      title: channelTitle(id),
      url: channelUrl(id),
      addedAt: new Date().toISOString(),
    };
  });
}

export function normalizeChannelId(input: string): string {
  const value = input.trim();
  if (!value) return value;

  const tmeMatch = value.match(
    /^https?:\/\/(?:www\.)?t\.me\/([A-Za-z0-9_+]+)\/?$/,
  );
  if (tmeMatch) {
    const slug = tmeMatch[1];
    if (slug.startsWith("+") || slug.startsWith("joinchat")) return value;
    return `@${slug}`;
  }

  if (/^-?\d+$/.test(value)) return value;
  return value.startsWith("@") ? value : `@${value}`;
}

export async function getSubscriptionConfig(
  env: Env,
): Promise<SubscriptionConfig> {
  const raw = await env.VIDEOS.get(SUBSCRIPTION_KEY);
  if (raw) {
    return JSON.parse(raw) as SubscriptionConfig;
  }

  const envChannels = parseChannelsFromEnv(env);
  return {
    enabled: envChannels.length > 0,
    channels: envChannels,
  };
}

export async function saveSubscriptionConfig(
  env: Env,
  config: SubscriptionConfig,
): Promise<void> {
  await env.VIDEOS.put(SUBSCRIPTION_KEY, JSON.stringify(config));
}

export async function getRequiredChannels(env: Env): Promise<RequiredChannel[]> {
  const config = await getSubscriptionConfig(env);
  if (config.channels.length === 0) return [];

  return config.channels.map((channel) => ({
    id: channel.id,
    title: channelTitle(channel.id, channel.title),
    url: channelUrl(channel.id, channel.url),
  }));
}

export async function setSubscriptionEnabled(
  env: Env,
  enabled: boolean,
): Promise<SubscriptionConfig> {
  const config = await getSubscriptionConfig(env);
  config.enabled = enabled;
  await saveSubscriptionConfig(env, config);
  return config;
}

export async function addRequiredChannel(
  env: Env,
  input: string,
  customUrl?: string,
  title?: string,
): Promise<{ ok: true; config: SubscriptionConfig } | { ok: false; error: string }> {
  const id = normalizeChannelId(input);
  if (!id) {
    return { ok: false, error: "Kanal ID kiritilmagan" };
  }

  const config = await getSubscriptionConfig(env);
  if (config.channels.some((c) => c.id === id)) {
    return { ok: false, error: "Kanal allaqachon mavjud" };
  }

  const channel: StoredChannel = {
    id,
    title: title?.trim() || channelTitle(id),
    url: customUrl?.trim() || channelUrl(id),
    addedAt: new Date().toISOString(),
  };

  config.channels.push(channel);
  config.enabled = true;
  await saveSubscriptionConfig(env, config);
  return { ok: true, config };
}

export async function removeRequiredChannel(
  env: Env,
  channelId: string,
): Promise<SubscriptionConfig> {
  const id = normalizeChannelId(channelId);
  const config = await getSubscriptionConfig(env);
  config.channels = config.channels.filter((c) => c.id !== id);
  if (config.channels.length === 0) {
    config.enabled = false;
  }
  await saveSubscriptionConfig(env, config);
  return config;
}

export async function isUserSubscribed(
  env: Env,
  userId: number,
): Promise<boolean> {
  if (await isVipUser(env, userId)) return true;

  const channels = await getRequiredChannels(env);
  if (channels.length === 0) return true;

  for (const channel of channels) {
    const member = await getChatMember(env, channel.id, userId);
    if (!member || !isActiveMember(member.status, member.is_member)) {
      return false;
    }
  }

  return true;
}

function isActiveMember(status: string, isMember?: boolean): boolean {
  if (status === "restricted") return isMember === true;
  return SUBSCRIBED_STATUSES.has(status);
}

async function getChatMember(
  env: Env,
  chatId: string,
  userId: number,
): Promise<{ status: string; is_member?: boolean } | null> {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getChatMember`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, user_id: userId }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    console.error("getChatMember failed:", chatId, response.status, body);
    return null;
  }

  const data = (await response.json()) as {
    ok: boolean;
    result?: { status: string; is_member?: boolean };
  };

  return data.ok && data.result ? data.result : null;
}

export async function sendSubscriptionRequired(
  env: Env,
  chatId: number,
): Promise<void> {
  const channels = await getRequiredChannels(env);
  const lines = [
    "⛔ Video olish uchun avval kanal(lar)ga obuna bo'ling.",
    "",
    "Obuna bo'lmagan foydalanuvchiga video berilmaydi.",
    "",
    ...channels.map((c) => `• ${c.title}`),
    "",
    "Obuna bo'lgach «Tekshirish» tugmasini bosing yoki /check yuboring.",
  ];

  const buttons: Array<Array<{ text: string; url?: string; callback_data?: string }>> =
    channels
      .filter((c) => c.url)
      .map((c) => [{ text: `📢 ${c.title}`, url: c.url! }]);

  buttons.push([{ text: "✅ Tekshirish", callback_data: "check_sub" }]);

  await sendMessage(env, chatId, lines.join("\n"), {
    replyMarkup: { inline_keyboard: buttons },
  });
}

export async function ensureSubscribed(
  env: Env,
  chatId: number,
  userId: number,
): Promise<boolean> {
  const channels = await getRequiredChannels(env);
  if (channels.length === 0) return true;

  const subscribed = await isUserSubscribed(env, userId);
  if (!subscribed) {
    await sendSubscriptionRequired(env, chatId);
    return false;
  }

  return true;
}

export async function handleSubscriptionCheck(
  env: Env,
  chatId: number,
  userId: number,
): Promise<void> {
  const subscribed = await isUserSubscribed(env, userId);
  if (subscribed) {
    await sendMessage(
      env,
      chatId,
      "✅ Obuna tasdiqlandi!\n\nVideo olish uchun ID yuboring.\nMasalan: 1",
    );
    return;
  }

  await sendSubscriptionRequired(env, chatId);
}
