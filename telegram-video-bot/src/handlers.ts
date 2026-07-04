import {
  countVideos,
  deleteVideo,
  getNextVideoId,
  getVideo,
  listVideos,
  saveVideo,
} from "./storage";
import { getAdminPanelUrl } from "./admin";
import {
  ensureSubscribed,
  getRequiredChannels,
  handleSubscriptionCheck,
  isUserSubscribed,
  sendSubscriptionRequired,
} from "./subscription";
import {
  answerCallbackQuery,
  sendDocumentByFileId,
  sendMessage,
  sendVideoByFileId,
} from "./telegram";
import type { Env, StoredVideo, TelegramCallbackQuery, TelegramMessage } from "./types";

const HELP_TEXT = `Video bot

Foydalanuvchi:
- 1, 2, 3 ... yuboring — shu ID dagi videoni olasiz
- /info 3 — video haqida ma'lumot (yubormasdan)
- /check — obunani tekshirish

Admin:
- Video yuklang — avtomatik ID beriladi
- /panel — web admin panel havolasi
- /list — barcha videolar ro'yxati
- /info 3 — video tafsilotlari
- /delete 5 — videoni o'chirish
- /stats — statistika`;

export function isAdmin(env: Env, userId: number): boolean {
  return String(userId) === env.TELEGRAM_ADMIN_ID;
}

export async function handleMessage(
  env: Env,
  message: TelegramMessage,
  workerOrigin: string,
): Promise<void> {
  const userId = message.from?.id;
  const chatId = message.chat.id;

  if (!userId) return;

  const text = message.text?.trim();
  const isCheckCommand = text?.toLowerCase().split("@")[0] === "/check";

  if (
    !isAdmin(env, userId) &&
    !isCheckCommand
  ) {
    const channels = await getRequiredChannels(env);
    if (channels.length > 0) {
      const subscribed = await ensureSubscribed(env, chatId, userId);
      if (!subscribed) return;
    }
  }

  if (message.video || isVideoDocument(message)) {
    if (!isAdmin(env, userId)) {
      await sendMessage(
        env,
        chatId,
        "Faqat admin video yuklay oladi.\n\nVideo olish uchun ID yuboring: masalan 1",
      );
      return;
    }

    await handleAdminUpload(env, chatId, userId, message);
    return;
  }

  if (!text) return;

  if (text.startsWith("/")) {
    await handleCommand(env, chatId, userId, text, workerOrigin);
    return;
  }

  if (/^\d+$/.test(text)) {
    await sendVideoById(env, chatId, Number.parseInt(text, 10));
    return;
  }

  await sendMessage(
    env,
    chatId,
    "Video olish uchun raqam yuboring.\nMasalan: 1\n\n/help — yordam",
  );
}

async function handleCommand(
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
        "Salom! Video olish uchun ID yuboring.\nMasalan: 1\n\n/help — yordam",
      );
      return;

    case "/help":
      await sendMessage(env, chatId, HELP_TEXT);
      return;

    case "/list":
      if (!isAdmin(env, userId)) {
        await sendMessage(env, chatId, "Bu buyruq faqat admin uchun.");
        return;
      }
      await handleList(env, chatId);
      return;

    case "/delete":
      if (!isAdmin(env, userId)) {
        await sendMessage(env, chatId, "Bu buyruq faqat admin uchun.");
        return;
      }
      await handleDelete(env, chatId, args);
      return;

    case "/stats":
      if (!isAdmin(env, userId)) {
        await sendMessage(env, chatId, "Bu buyruq faqat admin uchun.");
        return;
      }
      await handleStats(env, chatId);
      return;

    case "/info":
      await handleInfo(env, chatId, userId, args);
      return;

    case "/panel":
      if (!isAdmin(env, userId)) {
        await sendMessage(env, chatId, "Bu buyruq faqat admin uchun.");
        return;
      }
      await handlePanel(env, chatId, workerOrigin);
      return;

    case "/ping":
      await sendMessage(env, chatId, "pong");
      return;

    case "/check":
      await handleSubscriptionCheck(env, chatId, userId);
      return;

    default:
      await sendMessage(env, chatId, "Noma'lum buyruq. /help");
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
    await sendMessage(env, chatId, "Video topilmadi. Qayta yuboring.");
    return;
  }

  const id = await getNextVideoId(env);
  const caption = message.caption?.trim();

  const stored: StoredVideo = video
    ? {
        id,
        fileId: video.file_id,
        fileUniqueId: video.file_unique_id,
        kind: "video",
        caption,
        mimeType: "video/mp4",
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
      }
    : {
        id,
        fileId: document!.file_id,
        fileUniqueId: document!.file_unique_id,
        kind: "document",
        caption,
        fileName: document!.file_name,
        mimeType: document!.mime_type,
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
      };

  await saveVideo(env, stored);

  const lines = [
    `Video saqlandi.`,
    `ID: ${id}`,
    "",
    "Foydalanuvchilar shu raqamni yuborib videoni olishadi.",
  ];

  if (caption) {
    lines.push("", `Caption: ${caption}`);
  }

  await sendMessage(env, chatId, lines.join("\n"));
}

async function sendVideoById(
  env: Env,
  chatId: number,
  id: number,
): Promise<void> {
  const video = await getVideo(env, id);

  if (!video) {
    await sendMessage(env, chatId, `Video topilmadi: ${id}`);
    return;
  }

  const caption = video.caption ? `ID: ${id}\n${video.caption}` : `ID: ${id}`;

  const sent =
    video.kind === "video"
      ? await sendVideoByFileId(env, chatId, video.fileId, caption)
      : await sendDocumentByFileId(env, chatId, video.fileId, caption);

  if (!sent) {
    await sendMessage(
      env,
      chatId,
      `Video yuborilmadi (ID: ${id}). Admin bilan bog'laning.`,
    );
  }
}

async function handleList(env: Env, chatId: number): Promise<void> {
  const videos = await listVideos(env);

  if (videos.length === 0) {
    await sendMessage(env, chatId, "Hozircha video yo'q.");
    return;
  }

  const lines = videos.map((video) => {
    const title = video.caption ?? video.fileName ?? "Video";
    return `${video.id}. ${title}`;
  });

  await sendMessage(env, chatId, ["Videolar:", "", ...lines].join("\n"));
}

async function handleDelete(
  env: Env,
  chatId: number,
  args: string,
): Promise<void> {
  if (!/^\d+$/.test(args)) {
    await sendMessage(env, chatId, "Foydalanish: /delete 5");
    return;
  }

  const id = Number.parseInt(args, 10);
  const deleted = await deleteVideo(env, id);

  if (!deleted) {
    await sendMessage(env, chatId, `Video topilmadi: ${id}`);
    return;
  }

  await sendMessage(env, chatId, `Video o'chirildi: ${id}`);
}

async function handleStats(env: Env, chatId: number): Promise<void> {
  const total = await countVideos(env);
  await sendMessage(env, chatId, `Jami videolar: ${total}`);
}

async function handleInfo(
  env: Env,
  chatId: number,
  userId: number,
  args: string,
): Promise<void> {
  if (!/^\d+$/.test(args)) {
    await sendMessage(env, chatId, "Foydalanish: /info 3");
    return;
  }

  const id = Number.parseInt(args, 10);
  const video = await getVideo(env, id);

  if (!video) {
    await sendMessage(env, chatId, `Video topilmadi: ${id}`);
    return;
  }

  const title = video.caption ?? video.fileName ?? "Video";
  const lines = [
    `Video #${video.id}`,
    `Nom: ${title}`,
    `Turi: ${video.kind}`,
    video.mimeType ? `Format: ${video.mimeType}` : null,
    `Yuklangan: ${formatDate(video.uploadedAt)}`,
  ];

  if (isAdmin(env, userId)) {
    lines.push(`Admin ID: ${video.uploadedBy}`);
  }

  lines.push("", "Videoni olish uchun shu raqamni yuboring.");

  await sendMessage(env, chatId, lines.filter(Boolean).join("\n"));
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" });
}

async function handlePanel(
  env: Env,
  chatId: number,
  workerOrigin: string,
): Promise<void> {
  const url = getAdminPanelUrl(workerOrigin, env.TELEGRAM_WEBHOOK_SECRET);
  await sendMessage(
    env,
    chatId,
    [
      "Admin panel:",
      url,
      "",
      "Videolarni ko'rish va o'chirish mumkin.",
      "Havolani hech kimga bermang.",
    ].join("\n"),
  );
}

export async function handleCallbackQuery(
  env: Env,
  query: TelegramCallbackQuery,
): Promise<void> {
  const userId = query.from.id;
  const chatId = query.message?.chat.id;

  if (!chatId || query.data !== "check_sub") {
    await answerCallbackQuery(env, query.id);
    return;
  }

  const subscribed = await isUserSubscribed(env, userId);
  if (subscribed) {
    await answerCallbackQuery(env, query.id, "Obuna tasdiqlandi!");
    await sendMessage(
      env,
      chatId,
      "✅ Obuna tasdiqlandi!\n\nVideo olish uchun ID yuboring.\nMasalan: 1",
    );
    return;
  }

  await answerCallbackQuery(env, query.id, "Hali obuna bo'lmadingiz!");
  await sendSubscriptionRequired(env, chatId);
}
