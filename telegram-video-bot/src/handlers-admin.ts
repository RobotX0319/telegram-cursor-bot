import { sendAdminPanel } from "./admin-panel-bot";
import { getAdminIds, hasAdminBot, isAdmin } from "./bots";
import {
  handleDelete,
  handleInfo,
  handleList,
  handleStats,
} from "./handlers-user";
import { mirrorFileToUserBot } from "./mirror";
import {
  clearPendingVideoId,
  ensureCounterAtLeast,
  getPendingVideoId,
  getVideo,
  saveVideo,
  setPendingVideoId,
} from "./storage";
import { sendMessage } from "./telegram";
import {
  parseIdCommand,
  parseIdFromText,
  parseManualVideoId,
} from "./video-id";
import type { Env, StoredVideo, TelegramMessage } from "./types";

const ADMIN_KEYBOARD = {
  keyboard: [[{ text: "📱 Admin panel" }]],
  resize_keyboard: true,
};

const ADMIN_HELP = `Admin bot — @Detiskebot

📤 Video yuklash (o'zingiz ID belgilaysiz):

1-usul — avval raqam, keyin video:
  5
  (keyin videoni yuboring → ID: 5)

2-usul — videoga caption:
  5
  yoki: 5 | Film nomi

/id 5 — keyingi video shu ID bilan

📱 /panel — admin panel
📋 /list — videolar
🗑 /delete 5 — o'chirish

Foydalanuvchilar: @Detskebot`;

export async function handleAdminBotMessage(
  env: Env,
  message: TelegramMessage,
  workerOrigin: string,
): Promise<void> {
  const userId = message.from?.id;
  const chatId = message.chat.id;

  if (!userId) return;

  if (!hasAdminBot(env)) {
    await sendMessage(env, chatId, "Admin bot sozlanmagan.", { bot: "admin" });
    return;
  }

  const adminIds = await getAdminIds(env);
  if (adminIds.size === 0) {
    await sendMessage(
      env,
      chatId,
      [
        "Admin hali sozlanmagan.",
        "",
        `Sizning Telegram ID: ${userId}`,
      ].join("\n"),
      { bot: "admin" },
    );
    return;
  }

  if (!(await isAdmin(env, userId))) {
    await sendMessage(
      env,
      chatId,
      "Bu bot faqat adminlar uchun.\n\nVideo olish: @Detskebot",
      { bot: "admin" },
    );
    return;
  }

  if (message.video || isVideoDocument(message)) {
    await handleAdminUpload(env, chatId, userId, message);
    return;
  }

  const text = message.text?.trim();
  if (!text) return;

  if (text === "📱 Admin panel") {
    await sendAdminPanel(env, chatId, workerOrigin);
    return;
  }

  if (text.startsWith("/")) {
    await handleAdminCommand(env, chatId, userId, text, workerOrigin);
    return;
  }

  const manualId = parseIdFromText(text);
  if (manualId !== null) {
    await setPendingVideoId(env, userId, manualId);
    await sendMessage(
      env,
      chatId,
      `✅ Keyingi video ID: ${manualId}\n\nEndi videoni yuboring.`,
      { bot: "admin", replyMarkup: ADMIN_KEYBOARD },
    );
    return;
  }

  await sendMessage(
    env,
    chatId,
    "Video ID raqamini yuboring (masalan: 5), keyin videoni yuklang.\n\n/help — yordam",
    { bot: "admin", replyMarkup: ADMIN_KEYBOARD },
  );
}

async function handleAdminCommand(
  env: Env,
  chatId: number,
  userId: number,
  text: string,
  workerOrigin: string,
): Promise<void> {
  const [command, ...rest] = text.split(/\s+/);
  const args = rest.join(" ").trim();
  const cmd = command.toLowerCase().split("@")[0];

  switch (cmd) {
    case "/start":
      await sendMessage(
        env,
        chatId,
        "Salom, admin!\n\nAvval ID raqam yuboring (masalan: 5), keyin video yuklang.",
        { bot: "admin", replyMarkup: ADMIN_KEYBOARD },
      );
      await sendAdminPanel(env, chatId, workerOrigin);
      return;

    case "/help":
      await sendMessage(env, chatId, ADMIN_HELP, {
        bot: "admin",
        replyMarkup: ADMIN_KEYBOARD,
      });
      return;

    case "/panel":
      await sendAdminPanel(env, chatId, workerOrigin);
      return;

    case "/id":
    case "/upload": {
      const id = parseIdCommand(args);
      if (id === null) {
        await sendMessage(env, chatId, "Foydalanish: /id 5", {
          bot: "admin",
          replyMarkup: ADMIN_KEYBOARD,
        });
        return;
      }
      await setPendingVideoId(env, userId, id);
      await sendMessage(
        env,
        chatId,
        `✅ Keyingi video ID: ${id}\n\nEndi videoni yuboring.`,
        { bot: "admin", replyMarkup: ADMIN_KEYBOARD },
      );
      return;
    }

    case "/list":
      await handleList(env, chatId);
      return;

    case "/delete":
      await handleDelete(env, chatId, args);
      return;

    case "/stats":
      await handleStats(env, chatId);
      return;

    case "/info":
      await handleInfo(env, chatId, args, true);
      return;

    case "/ping":
      await sendMessage(env, chatId, "pong", { bot: "admin" });
      return;

    default:
      await sendMessage(env, chatId, "Noma'lum buyruq. /help", {
        bot: "admin",
        replyMarkup: ADMIN_KEYBOARD,
      });
  }
}

function isVideoDocument(message: TelegramMessage): boolean {
  const doc = message.document;
  if (!doc?.mime_type) return false;
  return doc.mime_type.startsWith("video/");
}

async function resolveUploadId(
  env: Env,
  userId: number,
  caption?: string,
): Promise<{ id: number; title?: string } | null> {
  const fromCaption = parseManualVideoId(caption);
  if (fromCaption) return fromCaption;

  const pending = await getPendingVideoId(env, userId);
  if (pending !== null) return { id: pending };

  return null;
}

async function handleAdminUpload(
  env: Env,
  chatId: number,
  userId: number,
  message: TelegramMessage,
): Promise<void> {
  const video = message.video;
  const document = message.document;

  if (!video && !document) {
    await sendMessage(env, chatId, "Video topilmadi. Qayta yuboring.", {
      bot: "admin",
    });
    return;
  }

  const resolved = await resolveUploadId(env, userId, message.caption?.trim());
  if (!resolved) {
    await sendMessage(
      env,
      chatId,
      [
        "Video uchun ID kerak.",
        "",
        "1) Avval raqam yuboring: 5",
        "   Keyin videoni yuklang",
        "",
        "2) Yoki videoga caption qo'ying: 5",
        "   yoki: 5 | Film nomi",
        "",
        "Buyruq: /id 5",
      ].join("\n"),
      { bot: "admin", replyMarkup: ADMIN_KEYBOARD },
    );
    return;
  }

  const { id, title } = resolved;
  const existing = await getVideo(env, id);
  if (existing) {
    await sendMessage(
      env,
      chatId,
      `ID ${id} band.\n\n/delete ${id} — o'chirish\nBoshqa raqam tanlang.`,
      { bot: "admin", replyMarkup: ADMIN_KEYBOARD },
    );
    return;
  }

  const kind = video ? "video" : "document";
  const adminFileId = video?.file_id ?? document!.file_id;
  const adminUniqueId = video?.file_unique_id ?? document!.file_unique_id;
  const displayCaption = title ?? undefined;

  const userFileId = await mirrorFileToUserBot(
    env,
    adminFileId,
    kind,
    userId,
  );

  if (!userFileId) {
    await sendMessage(
      env,
      chatId,
      [
        "Video saqlanmadi.",
        "",
        "Avval @Detskebot da /start bosing, keyin qayta yuklang.",
      ].join("\n"),
      { bot: "admin" },
    );
    return;
  }

  const stored: StoredVideo = video
    ? {
        id,
        fileId: userFileId,
        fileUniqueId: adminUniqueId,
        kind: "video",
        caption: displayCaption,
        mimeType: "video/mp4",
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
      }
    : {
        id,
        fileId: userFileId,
        fileUniqueId: adminUniqueId,
        kind: "document",
        caption: displayCaption,
        fileName: document!.file_name,
        mimeType: document!.mime_type,
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
      };

  await saveVideo(env, stored);
  await ensureCounterAtLeast(env, id);
  await clearPendingVideoId(env, userId);

  const lines = [
    `✅ Saqlandi — ID: ${id}`,
    "",
    "Foydalanuvchilar @Detskebot ga shu raqamni yuboradi.",
  ];

  if (displayCaption) {
    lines.push("", displayCaption);
  }

  await sendMessage(env, chatId, lines.join("\n"), {
    bot: "admin",
    replyMarkup: ADMIN_KEYBOARD,
  });
}
