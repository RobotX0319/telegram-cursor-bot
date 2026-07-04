import { sendMessage } from "./telegram";
import type { Env } from "./types";

const SUBSCRIBED_STATUSES = new Set([
  "creator",
  "administrator",
  "member",
  "restricted",
]);

export interface RequiredChannel {
  id: string;
  title: string;
  url?: string;
}

export function getRequiredChannels(env: Env): RequiredChannel[] {
  const raw = env.REQUIRED_CHANNELS?.trim();
  if (!raw) return [];

  return raw.split(",").map((entry) => {
    const id = entry.trim();
    const title = id.startsWith("@") ? id : `Kanal ${id}`;
    const url = channelUrl(id);
    return { id, title, url };
  });
}

function channelUrl(channelId: string): string | undefined {
  if (channelId.startsWith("@")) {
    return `https://t.me/${channelId.slice(1)}`;
  }
  return undefined;
}

export async function isUserSubscribed(
  env: Env,
  userId: number,
): Promise<boolean> {
  const channels = getRequiredChannels(env);
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
  const channels = getRequiredChannels(env);
  const lines = [
    "Botdan foydalanish uchun quyidagi kanal(lar)ga obuna bo'ling:",
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
  if (getRequiredChannels(env).length === 0) return true;

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
