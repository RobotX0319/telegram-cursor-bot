import type { BotTexts, Env } from "./types";

const TEXTS_KEY = "meta:bot_texts";

export const DEFAULT_TEXTS: BotTexts = {
  welcome:
    "👋 Salom! @Detskebot ga xush kelibsiz!\n\n🎬 Kutubxonada {total} ta kino bor\n\nVideo olish: raqam yuboring (masalan: 1)",
  help: `🎬 Video bot — @Detskebot

📌 Qanday ishlaydi:
• 1, 2, 3 ... yuboring — kino olasiz
• /info 3 — kino haqida
• /check — obunani tekshirish
• /karta — to'lov kartalari

👑 Admin: @Detiskebot`,
  notFound: "❌ Kino topilmadi: {code}",
  blocked: "🚫 Siz bloklangansiz. Admin bilan bog'laning.",
  deliveryMessages: [
    "🎬 Tayyor! Yoqimli tomosha!",
    "🔥 Mana kino — zavqlan!",
    "✨ Sizning filmingiz yetkazildi!",
    "🍿 Tomosha qiling!",
    "🚀 Kino tayyor — yoqimli vaqt!",
  ],
};

export async function getBotTexts(env: Env): Promise<BotTexts> {
  const raw = await env.VIDEOS.get(TEXTS_KEY);
  if (!raw) return { ...DEFAULT_TEXTS };
  try {
    return { ...DEFAULT_TEXTS, ...(JSON.parse(raw) as Partial<BotTexts>) };
  } catch {
    return { ...DEFAULT_TEXTS };
  }
}

export async function saveBotTexts(
  env: Env,
  texts: Partial<BotTexts>,
): Promise<BotTexts> {
  const current = await getBotTexts(env);
  const merged = { ...current, ...texts };
  await env.VIDEOS.put(TEXTS_KEY, JSON.stringify(merged));
  return merged;
}

export async function updateBotText(
  env: Env,
  key: keyof Omit<BotTexts, "deliveryMessages">,
  value: string,
): Promise<BotTexts> {
  return saveBotTexts(env, { [key]: value });
}

export function applyTextTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  let result = template;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replaceAll(`{${k}}`, String(v));
  }
  return result;
}
