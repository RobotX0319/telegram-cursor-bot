import { getAdminIds, hasAdminBot, isAdmin } from "./bots";
import {
  handleDelete,
  handleInfo,
  handleList,
  handlePanel,
  handleStats,
} from "./handlers-user";
import { mirrorFileToUserBot } from "./mirror";
import { getNextVideoId, saveVideo } from "./storage";
import { sendMessage } from "./telegram";
import type { Env, StoredVideo, TelegramMessage } from "./types";

const ADMIN_HELP = `Admin bot — @Detiskebot

- Video yuklang — avtomatik ID beriladi (@Detskebot da ko'rinadi)
- /panel — web admin panel
- /list — barcha videolar
- /info 3 — video tafsilotlari
- /delete 5 — videoni o'chirish
- /stats — statistika

Foydalanuvchilar video oladi: @Detskebot`;

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
        "",
        "Cloudflare secret qo'shing:",
        "TELEGRAM_ADMIN_ID=" + userId,
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

  if (text.startsWith("/")) {
    await handleAdminCommand(env, chatId, userId, text, workerOrigin);
    return;
  }

  await sendMessage(
    env,
    chatId,
    "Admin buyruqlari: /help\n\nVideo yuklash uchun fayl yuboring.",
    { bot: "admin" },
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
        "Admin bot.\n\nVideo yuklang yoki /help",
        { bot: "admin" },
      );
      return;

    case "/help":
      await sendMessage(env, chatId, ADMIN_HELP, { bot: "admin" });
      return;

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

    case "/panel":
      await handlePanel(env, chatId, workerOrigin);
      return;

    case "/ping":
      await sendMessage(env, chatId, "pong", { bot: "admin" });
      return;

    default:
      await sendMessage(env, chatId, "Noma'lum buyruq. /help", { bot: "admin" });
  }
}

function isVideoDocument(message: TelegramMessage): boolean {
  const doc = message.document;
  if (!doc?.mime_type) return false;
  return doc.mime_type.startsWith("video/");
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

  const kind = video ? "video" : "document";
  const adminFileId = video?.file_id ?? document!.file_id;
  const adminUniqueId = video?.file_unique_id ?? document!.file_unique_id;

  await sendMessage(env, chatId, "Video qabul qilindi, tayyorlanmoqda...", {
    bot: "admin",
  });

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

  const id = await getNextVideoId(env);
  const caption = message.caption?.trim();

  const stored: StoredVideo = video
    ? {
        id,
        fileId: userFileId,
        fileUniqueId: adminUniqueId,
        kind: "video",
        caption,
        mimeType: "video/mp4",
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
      }
    : {
        id,
        fileId: userFileId,
        fileUniqueId: adminUniqueId,
        kind: "document",
        caption,
        fileName: document!.file_name,
        mimeType: document!.mime_type,
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
      };

  await saveVideo(env, stored);

  const lines = [
    `✅ Video saqlandi.`,
    `ID: ${id}`,
    "",
    "Foydalanuvchilar @Detskebot ga shu raqamni yuboradi.",
  ];

  if (caption) {
    lines.push("", `Caption: ${caption}`);
  }

  await sendMessage(env, chatId, lines.join("\n"), { bot: "admin" });
}
