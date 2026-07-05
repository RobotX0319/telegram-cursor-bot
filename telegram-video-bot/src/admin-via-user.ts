import type { BotKind } from "./bots";
import { getAdminIds, isAdmin, saveBotTokens } from "./bots";
import { isReplyButton } from "./admin-keyboard";
import { handleAdminBotMessage } from "./handlers-admin";
import type { Env, TelegramMessage } from "./types";

const ADMIN_COMMANDS = new Set([
  "/panel",
  "/list",
  "/delete",
  "/stats",
  "/id",
  "/upload",
  "/vipremove",
  "/help",
  "/cancel",
  "/reset",
  "/ping",
  "/info",
]);

function isVideoDocument(message: TelegramMessage): boolean {
  const doc = message.document;
  if (!doc?.mime_type) return false;
  return doc.mime_type.startsWith("video/");
}

function isImageDocument(message: TelegramMessage): boolean {
  const doc = message.document;
  if (!doc?.mime_type) return false;
  return doc.mime_type.startsWith("image/");
}

/** Admin @Detskebot orqali panel va yuklash (Detiskebot ulanmagan bo'lsa). */
export async function tryAdminOnUserBot(
  env: Env,
  message: TelegramMessage,
  workerOrigin: string,
): Promise<boolean> {
  const userId = message.from?.id;
  if (!userId) return false;

  const adminIds = await getAdminIds(env);
  const text = message.text?.trim();
  const cmd = text?.split(/\s+/)[0]?.toLowerCase().split("@")[0];

  if (adminIds.size === 0 && (cmd === "/panel" || cmd === "/start")) {
    await saveBotTokens(env, { adminIds: String(userId) });
    if (cmd === "/start") {
      return false;
    }
  } else if (!(await isAdmin(env, userId))) {
    return false;
  }
  const isAdminMedia =
    Boolean(message.video || message.animation || message.photo?.length) ||
    isVideoDocument(message) ||
    isImageDocument(message);

  const isAdminText =
    Boolean(text) &&
    (text!.startsWith("/") ||
      isReplyButton(text!) ||
      /^\d+$/.test(text!) ||
      /^o'?chirish\s+\d/i.test(text!) ||
      text!.includes("|"));

  if (!isAdminMedia && !isAdminText) return false;

  if (text) {
    const cmd = text.split(/\s+/)[0]?.toLowerCase().split("@")[0];
    if (cmd && !ADMIN_COMMANDS.has(cmd) && text.startsWith("/")) {
      return false;
    }
  }

  await handleAdminBotMessage(env, message, workerOrigin, "user");
  return true;
}

export function adminCallbackBot(data: string): BotKind {
  return data.startsWith("pu:") ? "user" : "admin";
}
