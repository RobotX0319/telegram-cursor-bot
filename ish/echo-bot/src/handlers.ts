import { copyMessage, sendMessage } from "./telegram";
import type { Env, TelegramMessage } from "./types";

const HELP_TEXT = `Echo bot

Yozgan xabaringiz sizga qaytariladi.

Buyruqlar:
/start — boshlash
/help — yordam
/ping — tekshirish

Oddiy matn yuboring — bot aynan shu matnni qaytaradi.`;

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
    await sendMessage(env, chatId, text);
    return;
  }

  const copied = await copyMessage(env, chatId, chatId, message.message_id);
  if (!copied) {
    await sendMessage(
      env,
      chatId,
      "Bu turdagi xabarni qaytarib bo'lmadi. Matn yuboring.",
    );
  }
}

async function handleCommand(
  env: Env,
  chatId: number,
  text: string,
): Promise<void> {
  const command = text.split(/\s+/)[0]!.toLowerCase().split("@")[0];

  switch (command) {
    case "/start":
      await sendMessage(
        env,
        chatId,
        "Salom! Men echo botman.\n\nYozgan xabaringizni sizga qaytaraman.\n\n/help — yordam",
      );
      return;

    case "/help":
      await sendMessage(env, chatId, HELP_TEXT);
      return;

    case "/ping":
      await sendMessage(env, chatId, "pong");
      return;

    default:
      await sendMessage(env, chatId, text);
  }
}
