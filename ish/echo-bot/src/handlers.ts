import { askGemini } from "./gemini";
import { copyMessage, sendMessage } from "./telegram";
import type { Env, TelegramMessage } from "./types";

const HELP_TEXT = `Gemini AI bot

Yozgan savolingizga Gemini AI javob beradi.

Buyruqlar:
/ping — tekshirish

Oddiy matn yuboring — AI javob qaytaradi.`;

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
    try {
      const reply = await askGemini(env, text);
      await sendMessage(env, chatId, reply);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Noma'lum xato";
      await sendMessage(env, chatId, `Xato: ${msg}`);
    }
    return;
  }

  const copied = await copyMessage(env, chatId, chatId, message.message_id);
  if (!copied) {
    await sendMessage(
      env,
      chatId,
      "Bu turdagi xabarni qayta ishlay olmayman. Matn yuboring.",
    );
  }
}

async function handleCommand(
  env: Env,
  chatId: number,
  text: string,
): Promise<void> {
  const command = text.split(/\s+/)[0]!.toLowerCase().split("@")[0];
  const args = text.slice(command.length).trim();

  switch (command) {
    case "/start":
      await sendMessage(
        env,
        chatId,
        "Salom! Men Gemini AI botman.\n\nSavol yuboring — AI javob beradi.\n\n/help — yordam",
      );
      return;

    case "/help":
      await sendMessage(env, chatId, HELP_TEXT);
      return;

    case "/ping":
      await sendMessage(env, chatId, "pong");
      return;

    default:
      if (args) {
        await sendMessage(env, chatId, "⏳ O'ylayapman...");
        try {
          const reply = await askGemini(env, args);
          await sendMessage(env, chatId, reply);
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Noma'lum xato";
          await sendMessage(env, chatId, `Xato: ${msg}`);
        }
      } else {
        await sendMessage(env, chatId, `Noma'lum buyruq: ${command}`);
      }
  }
}
