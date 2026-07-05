import { ensureBotTokens, getUserBotToken } from "./bots";
import { trackSubscriptionCheck } from "./analytics";
import { sendMessage } from "./telegram";
import type {
  Env,
  RequiredChannel,
  SubscriptionConfig,
  StoredChannel,
} from "./types";
import { isVipUser } from "./vip";

const SUBSCRIPTION_KEY = "meta:subscription";
const TELEGRAM_API = "https://api.telegram.org";

const SUBSCRIBED_STATUSES = new Set([
  "creator",
  "administrator",
  "member",
]);

export type { RequiredChannel };

export interface ChannelMemberStats {
  id: string;
  title: string;
  memberCount: number | null;
  botCanCheck: boolean;
}

export interface SubscriptionCheckResult {
  subscribed: boolean;
  missing: RequiredChannel[];
  apiErrors: string[];
}

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

async function telegramApi<T>(
  env: Env,
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; result?: T; description?: string }> {
  await ensureBotTokens(env);
  const token = getUserBotToken(env);
  if (!token) return { ok: false, description: "Bot token yo'q" };

  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as {
    ok: boolean;
    result?: T;
    description?: string;
  };

  if (!data.ok) {
    console.error(`Telegram ${method} failed:`, data.description);
  }

  return data;
}

export async function resolveChannelChat(
  env: Env,
  input: string,
): Promise<
  | { ok: true; id: string; title: string; username?: string; url?: string }
  | { ok: false; error: string }
> {
  const normalized = normalizeChannelId(input);
  if (!normalized) {
    return { ok: false, error: "Kanal ID kiritilmagan" };
  }

  const chat = await telegramApi<{
    id: number;
    title?: string;
    username?: string;
    type?: string;
  }>(env, "getChat", { chat_id: normalized });

  if (!chat.ok || !chat.result) {
    return {
      ok: false,
      error:
        chat.description ??
        "Kanal topilmadi. @Detskebot kanalda admin bo'lishi kerak.",
    };
  }

  const { id, title, username } = chat.result;
  return {
    ok: true,
    id: String(id),
    title: title ?? channelTitle(normalized),
    username: username ?? undefined,
    url: username ? `https://t.me/${username}` : channelUrl(normalized),
  };
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
  const resolved = await resolveChannelChat(env, input);
  if (!resolved.ok) return resolved;

  const config = await getSubscriptionConfig(env);
  if (config.channels.some((c) => c.id === resolved.id)) {
    return { ok: false, error: "Kanal allaqachon mavjud" };
  }

  const member = await verifyBotInChannel(env, resolved.id);
  if (!member) {
    return {
      ok: false,
      error: "@Detskebot kanalda admin emas. Avval admin qiling.",
    };
  }

  const channel: StoredChannel = {
    id: resolved.id,
    title: title?.trim() || resolved.title,
    url: customUrl?.trim() || resolved.url,
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
  config.channels = config.channels.filter(
    (c) => c.id !== id && c.id !== channelId,
  );
  if (config.channels.length === 0) {
    config.enabled = false;
  }
  await saveSubscriptionConfig(env, config);
  return config;
}

function isActiveMember(status: string, isMember?: boolean): boolean {
  if (status === "restricted") return isMember === true;
  return SUBSCRIBED_STATUSES.has(status);
}

async function verifyBotInChannel(env: Env, chatId: string): Promise<boolean> {
  const me = await telegramApi<{ id: number }>(env, "getMe", {});
  if (!me.ok || !me.result) return false;

  const status = await getChatMemberStatus(env, chatId, me.result.id);
  if (typeof status === "object" && !status.ok) return false;
  return status === "member";
}

type MemberStatus =
  | { ok: true; status: string; is_member?: boolean }
  | { ok: false; reason: "bot_not_admin" | "error" };

async function getChatMemberStatus(
  env: Env,
  chatId: string,
  userId: number,
): Promise<MemberStatus | "left" | "kicked" | "member"> {
  const data = await telegramApi<{
    status: string;
    is_member?: boolean;
  }>(env, "getChatMember", { chat_id: chatId, user_id: userId });

  if (!data.ok || !data.result) {
    const desc = data.description ?? "";
    if (
      desc.includes("CHAT_ADMIN_REQUIRED") ||
      desc.includes("bot is not a member")
    ) {
      return { ok: false, reason: "bot_not_admin" };
    }
    return { ok: false, reason: "error" };
  }

  const { status, is_member } = data.result;
  if (isActiveMember(status, is_member)) return "member";
  return status as "left" | "kicked";
}

export async function checkUserSubscription(
  env: Env,
  userId: number,
): Promise<SubscriptionCheckResult> {
  if (await isVipUser(env, userId)) {
    return { subscribed: true, missing: [], apiErrors: [] };
  }

  const channels = await getRequiredChannels(env);
  if (channels.length === 0) {
    return { subscribed: true, missing: [], apiErrors: [] };
  }

  const missing: RequiredChannel[] = [];
  const apiErrors: string[] = [];

  for (const channel of channels) {
    const result = await getChatMemberStatus(env, channel.id, userId);
    if (result === "member") continue;

    if (typeof result === "object" && !result.ok) {
      if (result.reason === "bot_not_admin") {
        apiErrors.push(`${channel.title}: bot admin emas`);
      } else {
        apiErrors.push(`${channel.title}: tekshirilmadi`);
      }
      missing.push(channel);
      continue;
    }

    missing.push(channel);
  }

  const subscribed = missing.length === 0 && apiErrors.length === 0;
  await trackSubscriptionCheck(env, subscribed);

  return { subscribed, missing, apiErrors };
}

export async function isUserSubscribed(
  env: Env,
  userId: number,
): Promise<boolean> {
  const result = await checkUserSubscription(env, userId);
  return result.subscribed;
}

export async function getChannelMemberStats(
  env: Env,
): Promise<ChannelMemberStats[]> {
  const channels = await getRequiredChannels(env);
  const stats: ChannelMemberStats[] = [];

  for (const channel of channels) {
    const countData = await telegramApi<number>(env, "getChatMemberCount", {
      chat_id: channel.id,
    });

    const botCheck = await verifyBotInChannel(env, channel.id);

    stats.push({
      id: channel.id,
      title: channel.title,
      memberCount: countData.ok ? countData.result ?? null : null,
      botCanCheck: botCheck,
    });
  }

  return stats;
}

export async function sendSubscriptionRequired(
  env: Env,
  chatId: number,
  result?: SubscriptionCheckResult,
): Promise<void> {
  const channels = await getRequiredChannels(env);
  const check = result ?? (await checkUserSubscription(env, chatId));

  const lines = [
    "🔒 Video olish uchun kanalga obuna bo'ling!",
    "",
    "📢 Obuna kanallari:",
    ...channels.map((c) => {
      const miss = check.missing.some((m) => m.id === c.id);
      return miss ? `  ❌ ${c.title}` : `  ✅ ${c.title}`;
    }),
  ];

  if (check.apiErrors.length > 0) {
    lines.push("", "⚠️ Admin: bot kanalda admin bo'lishi kerak!");
  }

  lines.push("", "Obuna bo'lgach «✅ Tekshirish» tugmasini bosing 👇");

  const buttons: Array<
    Array<{ text: string; url?: string; callback_data?: string }>
  > = channels
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

  const result = await checkUserSubscription(env, userId);
  if (!result.subscribed) {
    await sendSubscriptionRequired(env, chatId, result);
    return false;
  }

  return true;
}

export async function handleSubscriptionCheck(
  env: Env,
  chatId: number,
  userId: number,
): Promise<void> {
  const result = await checkUserSubscription(env, userId);
  if (result.subscribed) {
    await sendMessage(
      env,
      chatId,
      [
        "🎉 Obuna tasdiqlandi!",
        "",
        "Endi video ID yuboring 🎬",
        "Masalan: 1",
      ].join("\n"),
    );
    return;
  }

  await sendSubscriptionRequired(env, chatId, result);
}

export function subscriptionActive(config: SubscriptionConfig): boolean {
  return config.enabled && config.channels.length > 0;
}
