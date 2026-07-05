import { getAdminIds, isAdmin, saveBotTokens } from "./bots";
import { isReplyButton } from "./admin-keyboard";
import { handleAdminBotMessage } from "./handlers-admin";
import { sendAdminPanel } from "./panel";
import { sendMessage } from "./telegram";
import type { Env, TelegramMessage } from "./types";

const KV_ADMIN_IDS = "config:admin_ids";

const ADMIN_COMMANDS = new Set([
  "/panel",
  "/admin",
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

/** @Detskebot da /panel — admin panelni ochish */
export async function openUserAdminPanel(
  env: Env,
  chatId: number,
  userId: number,
): Promise<void> {
  const kvAdmins = await env.VIDEOS.get(KV_ADMIN_IDS);

  if (!kvAdmins?.trim()) {
    await saveBotTokens(env, { adminIds: String(userId) });
    await sendAdminPanel(env, chatId, "", "user");
    return;
  }

  if (!(await isAdmin(env, userId))) {
    const ids = await getAdminIds(env);
    await sendMessage(
      env,
      chatId,
      [
        "⛔ Admin panel — ruxsat yo'q",
        "",
        `Sizning Telegram ID: ${userId}`,
        "",
        `Hozir adminlar: ${[...ids].join(", ")}`,
      ].join("\n"),
    );
    return;
  }

  await sendAdminPanel(env, chatId, "", "user");
}

/** Admin media va boshqa buyruqlar @Detskebot orqali */
export async function tryAdminOnUserBot(
  env: Env,
  message: TelegramMessage,
  workerOrigin: string,
): Promise<boolean> {
  const userId = message.from?.id;
  if (!userId) return false;

  const text = message.text?.trim();
  const cmd = text?.split(/\s+/)[0]?.toLowerCase().split("@")[0];

  if (cmd === "/panel" || cmd === "/admin") {
    return false;
  }

  const kvAdmins = await env.VIDEOS.get(KV_ADMIN_IDS);
  if (!kvAdmins?.trim()) {
    if (cmd === "/start") return false;
    if (text?.startsWith("/")) {
      await saveBotTokens(env, { adminIds: String(userId) });
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
    const c = text.split(/\s+/)[0]?.toLowerCase().split("@")[0];
    if (c && !ADMIN_COMMANDS.has(c) && text.startsWith("/")) {
      return false;
    }
  }

  await handleAdminBotMessage(env, message, workerOrigin, "user");
  return true;
}
