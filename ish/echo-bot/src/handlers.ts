import { askGemini } from "./gemini";
import { sendMessage } from "./telegram";
import type { Env, TelegramMessage } from "./types";

const HELP_TEXT = `Gemini AI bot

Barcha javoblar Gemini AI orqali beriladi.

/ping — ulanishni tekshirish

Savol yuboring — AI javob qaytaradi.`;

export async function handleMessage(
  env: Env,
  message: TelegramMessage,
): Promise<void> {
  const chatId = message.chat.id;
  const text = message.text?.trim();

  if (text?.startsWith("/")) {
    await handleCommand(env, chatId, text);
    return;
  }

  if (text) {
    await replyWithGemini(env, chatId, text);
    return;
  }

  await sendMessage(
    env,
    chatId,
    "Faqat matn yuboring — Gemini AI javob beradi.",
  );
}

async function handleCommand(
  env: Env,
  chatId: number,
  text: string,
): Promise<void> {
  const command = text.split(/\s+/)[0]!.toLowerCase().split("@")[0];

  switch (command) {
    case "/ping":
      await sendMessage(env, chatId, "pong");
      return;

    case "/start":
      await sendMessage(
        env,
        chatId,
        "Salom! Men Gemini AI botman.\n\nSavol yuboring — javobni AI beradi.\n\n/help — yordam",
      );
      return;

    case "/help":
      await sendMessage(env, chatId, HELP_TEXT);
      return;

    default:
      await replyWithGemini(env, chatId, text);
  }
}

async function replyWithGemini(
  env: Env,
  chatId: number,
  prompt: string,
): Promise<void> {
  try {
    const reply = await askGemini(env, prompt);
    await sendMessage(env, chatId, reply);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Noma'lum xato";
    await sendMessage(env, chatId, `Xato: ${msg}`);
  }
}
