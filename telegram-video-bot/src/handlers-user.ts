import {
  countVideos,
  deleteVideo,
  getVideo,
  listVideos,
  saveVideo,
} from "./storage";
import { deliverMediaFromAdminFile } from "./mirror";
import { sendPaymentCardsToUser } from "./admin-reply-menu";
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
import type { Env, TelegramCallbackQuery, TelegramMessage } from "./types";

const USER_HELP = `Video bot — @Detskebot

- 1, 2, 3 ... yuboring — videoni olasiz
- /info 3 — video haqida ma'lumot
- /check — obunani tekshirish
- /karta — to'lov kartalari

Adminlar uchun: @Detiskebot`;

const ADMIN_ONLY_COMMANDS = new Set([
  "/panel",
  "/list",
  "/delete",
  "/stats",
  "/id",
  "/upload",
  "/vipremove",
]);

const USER_START_KEYBOARD = {
  remove_keyboard: true,
};

export async function handleUserMessage(
  env: Env,
  message: TelegramMessage,
): Promise<void> {
  const userId = message.from?.id;
  const chatId = message.chat.id;

  if (!userId) return;

  const text = message.text?.trim();
  const isCheckCommand = text?.toLowerCase().split("@")[0] === "/check";

  if (!isCheckCommand) {
    const channels = await getRequiredChannels(env);
    if (channels.length > 0) {
      const subscribed = await ensureSubscribed(env, chatId, userId);
      if (!subscribed) return;
    }
  }

  if (message.video || isVideoDocument(message)) {
    await sendMessage(
      env,
      chatId,
      "Video yuklash faqat admin bot orqali: @Detiskebot",
    );
    return;
  }

  if (!text) return;

  if (text.startsWith("/")) {
    await handleUserCommand(env, chatId, userId, text);
    return;
  }

  if (/^\d+$/.test(text)) {
    await sendVideoById(env, chatId, userId, Number.parseInt(text, 10));
    return;
  }

  await sendMessage(
    env,
    chatId,
    "Video olish uchun raqam yuboring.\nMasalan: 1\n\n/help — yordam",
  );
}

async function handleUserCommand(
  env: Env,
  chatId: number,
  userId: number,
  text: string,
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
        { replyMarkup: USER_START_KEYBOARD },
      );
      return;

    case "/help":
      await sendMessage(env, chatId, USER_HELP);
      return;

    case "/info":
      await handleInfo(env, chatId, userId, args, false);
      return;

    case "/ping":
      await sendMessage(env, chatId, "pong");
      return;

    case "/check":
      await handleSubscriptionCheck(env, chatId, userId);
      return;

    case "/karta":
      await sendPaymentCardsToUser(env, chatId);
      return;

    default:
      if (ADMIN_ONLY_COMMANDS.has(cmd)) {
        await sendMessage(
          env,
          chatId,
          "Bu buyruq faqat admin botda: @Detiskebot",
        );
        return;
      }
      await sendMessage(env, chatId, "Noma'lum buyruq. /help");
  }
}

function isVideoDocument(message: TelegramMessage): boolean {
  const doc = message.document;
  if (!doc?.mime_type) return false;
  return doc.mime_type.startsWith("video/");
}

export async function sendVideoById(
  env: Env,
  chatId: number,
  userId: number,
  id: number,
): Promise<void> {
  if (!(await ensureSubscribed(env, chatId, userId))) {
    return;
  }

  const video = await getVideo(env, id);

  if (!video) {
    await sendMessage(env, chatId, `Video topilmadi: ${id}`);
    return;
  }

  const caption = video.caption ? `ID: ${id}\n${video.caption}` : `ID: ${id}`;

  if (video.fileId) {
    const sent =
      video.kind === "video"
        ? await sendVideoByFileId(env, chatId, video.fileId, caption)
        : await sendDocumentByFileId(env, chatId, video.fileId, caption);

    if (sent) return;
  }

  const adminFileId = video.adminFileId ?? video.fileId;
  if (!adminFileId) {
    await sendMessage(
      env,
      chatId,
      `Video yuborilmadi (ID: ${id}). Admin bilan bog'laning.`,
    );
    return;
  }

  const delivered = await deliverMediaFromAdminFile(
    env,
    adminFileId,
    video.kind,
    chatId,
    caption,
  );

  if (!delivered.ok) {
    await sendMessage(
      env,
      chatId,
      `Video yuborilmadi (ID: ${id}). Admin bilan bog'laning.`,
    );
    return;
  }

  if (delivered.fileId !== video.fileId) {
    await saveVideo(env, { ...video, fileId: delivered.fileId });
  }
}

export async function handleInfo(
  env: Env,
  chatId: number,
  userId: number,
  args: string,
  showAdminMeta: boolean,
): Promise<void> {
  if (!showAdminMeta && !(await ensureSubscribed(env, chatId, userId))) {
    return;
  }

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

  if (showAdminMeta) {
    lines.push(`Admin ID: ${video.uploadedBy}`);
  }

  lines.push("", "Videoni olish uchun shu raqamni @Detskebot ga yuboring.");

  await sendMessage(env, chatId, lines.filter(Boolean).join("\n"));
}

export async function handleList(env: Env, chatId: number): Promise<void> {
  const videos = await listVideos(env);

  if (videos.length === 0) {
    await sendMessage(env, chatId, "Hozircha video yo'q.", { bot: "admin" });
    return;
  }

  const lines = videos.map((video) => {
    const title = video.caption ?? video.fileName ?? "Video";
    return `${video.id}. ${title}`;
  });

  await sendMessage(
    env,
    chatId,
    ["Videolar:", "", ...lines].join("\n"),
    { bot: "admin" },
  );
}

export async function handleDelete(
  env: Env,
  chatId: number,
  args: string,
): Promise<void> {
  if (!/^\d+$/.test(args)) {
    await sendMessage(env, chatId, "Foydalanish: /delete 5", { bot: "admin" });
    return;
  }

  const id = Number.parseInt(args, 10);
  const deleted = await deleteVideo(env, id);

  if (!deleted) {
    await sendMessage(env, chatId, `Video topilmadi: ${id}`, { bot: "admin" });
    return;
  }

  await sendMessage(env, chatId, `Video o'chirildi: ${id}`, { bot: "admin" });
}

export async function handleStats(env: Env, chatId: number): Promise<void> {
  const total = await countVideos(env);
  await sendMessage(env, chatId, `Jami videolar: ${total}`, { bot: "admin" });
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" });
}

export async function handleCallbackQuery(
  env: Env,
  query: TelegramCallbackQuery,
): Promise<void> {
  const userId = query.from.id;
  const chatId = query.message?.chat.id;
  const data = query.data;

  if (!chatId || !data) {
    await answerCallbackQuery(env, query.id);
    return;
  }

  if (data.startsWith("adm:")) {
    await answerCallbackQuery(env, query.id);
    return;
  }

  if (data !== "check_sub") {
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
