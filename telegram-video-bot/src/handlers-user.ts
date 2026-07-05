import {
  trackUserStart,
  trackVideoDelivered,
  trackVideoRequest,
} from "./analytics";
import { deliverMediaFromAdminFile } from "./mirror";
import { removeBrokenVideo, isVideoPlayable } from "./video-health";
import { sendPaymentCardsToUser } from "./admin-reply-menu";
import {
  checkUserSubscription,
  ensureSubscribed,
  getRequiredChannels,
  getSubscriptionConfig,
  handleSubscriptionCheck,
  sendSubscriptionRequired,
} from "./subscription";
import { buildAdminStatsText } from "./stats";
import {
  countVideos,
  deleteVideo,
  getVideo,
  listVideos,
  saveVideo,
} from "./storage";
import {
  answerCallbackQuery,
  sendDocumentByFileId,
  sendMessage,
  sendVideoByFileId,
} from "./telegram";
import type { Env, TelegramCallbackQuery, TelegramMessage } from "./types";

const DELIVERY_MESSAGES = [
  "🎬 Tayyor! Yoqimli tomosha!",
  "🔥 Mana video — zavqlan!",
  "✨ Sizning videongiz yetkazildi!",
  "🍿 Tomosha qiling!",
  "🚀 Video tayyor — yoqimli vaqt!",
];

const USER_HELP = `🎬 Video bot — @Detskebot

📌 Qanday ishlaydi:
• 1, 2, 3 ... yuboring — video olasiz
• /info 3 — video haqida
• /check — obunani tekshirish
• /karta — to'lov kartalari

👑 Admin: @Detiskebot`;

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

function pickDeliveryMessage(): string {
  return DELIVERY_MESSAGES[
    Math.floor(Math.random() * DELIVERY_MESSAGES.length)
  ]!;
}

function isPublicCommand(text: string): boolean {
  const cmd = text.toLowerCase().split(/\s+/)[0]?.split("@")[0];
  return cmd === "/start" || cmd === "/help" || cmd === "/check" || cmd === "/karta" || cmd === "/ping";
}

export async function handleUserMessage(
  env: Env,
  message: TelegramMessage,
): Promise<void> {
  const userId = message.from?.id;
  const chatId = message.chat.id;

  if (!userId) return;

  const text = message.text?.trim();

  if (message.video || isVideoDocument(message)) {
    await sendMessage(
      env,
      chatId,
      "📤 Video yuklash: @Detiskebot",
    );
    return;
  }

  if (!text) return;

  if (text.startsWith("/")) {
    await handleUserCommand(env, chatId, userId, text, message.from);
    return;
  }

  if (!isPublicCommand(text)) {
    const config = await getSubscriptionConfig(env);
    const channels = await getRequiredChannels(env);
    if (channels.length > 0 && config.enabled) {
      const subscribed = await ensureSubscribed(env, chatId, userId);
      if (!subscribed) return;
    }
  }

  if (/^\d+$/.test(text)) {
    await sendVideoById(env, chatId, userId, Number.parseInt(text, 10));
    return;
  }

  await sendMessage(
    env,
    chatId,
    "🎯 Video olish uchun raqam yuboring.\nMasalan: 1\n\n/help — yordam",
  );
}

async function handleUserCommand(
  env: Env,
  chatId: number,
  userId: number,
  text: string,
  from?: TelegramMessage["from"],
): Promise<void> {
  const [command, ...rest] = text.split(/\s+/);
  const args = rest.join(" ").trim();
  const cmd = command.toLowerCase().split("@")[0];

  switch (cmd) {
    case "/start":
      if (from) await trackUserStart(env, from);
      await sendWelcome(env, chatId, userId);
      return;

    case "/help":
      await sendMessage(env, chatId, USER_HELP);
      return;

    case "/info":
      if (!(await ensureSubscribed(env, chatId, userId))) return;
      await handleInfo(env, chatId, userId, args, false);
      return;

    case "/ping":
      await sendMessage(env, chatId, "🏓 pong");
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
          "👑 Bu buyruq faqat admin botda: @Detiskebot",
        );
        return;
      }
      await sendMessage(env, chatId, "❓ Noma'lum buyruq. /help");
  }
}

async function sendWelcome(
  env: Env,
  chatId: number,
  userId: number,
): Promise<void> {
  const total = await countVideos(env);
  const sub = await getSubscriptionConfig(env);
  const channels = await getRequiredChannels(env);
  const result = await checkUserSubscription(env, userId);

  const lines = [
    "👋 Salom! @Detskebot ga xush kelibsiz!",
    "",
    `🎬 Kutubxonada ${total} ta video bor`,
    "",
  ];

  if (channels.length > 0 && sub.enabled) {
    lines.push(
      result.subscribed
        ? "✅ Obuna tasdiqlangan — video olishingiz mumkin!"
        : "📢 Avval kanalga obuna bo'ling 👇",
      "",
    );
  }

  lines.push("Video olish: raqam yuboring (masalan: 1)");

  await sendMessage(env, chatId, lines.join("\n"), {
    replyMarkup: USER_START_KEYBOARD,
  });

  if (channels.length > 0 && sub.enabled && !result.subscribed) {
    await sendSubscriptionRequired(env, chatId, userId, result);
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

  await trackVideoRequest(env, userId);

  const video = await getVideo(env, id);

  if (!video) {
    await sendMessage(env, chatId, `❌ Video topilmadi: ${id}`);
    return;
  }

  const playable = await isVideoPlayable(env, video);
  if (!playable) {
    await removeBrokenVideo(env, id);
    await sendMessage(
      env,
      chatId,
      `❌ Video (ID: ${id}) ishlamaydi va o'chirildi.\nAdmin yangi video yuklaydi.`,
    );
    return;
  }

  const caption = video.caption
    ? `🎬 ID: ${id}\n${video.caption}`
    : `🎬 ID: ${id}`;

  let delivered = false;

  if (video.fileId) {
    delivered =
      video.kind === "video"
        ? await sendVideoByFileId(env, chatId, video.fileId, caption)
        : await sendDocumentByFileId(env, chatId, video.fileId, caption);
  }

  if (!delivered) {
    const adminFileId = video.adminFileId ?? video.fileId;
    if (!adminFileId) {
      await removeBrokenVideo(env, id);
      await sendMessage(
        env,
        chatId,
        `❌ Video (ID: ${id}) topilmadi va o'chirildi.`,
      );
      return;
    }

    const result = await deliverMediaFromAdminFile(
      env,
      adminFileId,
      video.kind,
      chatId,
      caption,
    );

    if (!result.ok) {
      await removeBrokenVideo(env, id);
      await sendMessage(
        env,
        chatId,
        `❌ Video (ID: ${id}) yuborilmadi va o'chirildi.\nAdmin qayta yuklaydi.`,
      );
      return;
    }

    if (result.fileId !== video.fileId) {
      await saveVideo(env, { ...video, fileId: result.fileId });
    }
    delivered = true;
  }

  if (delivered) {
    await trackVideoDelivered(env, userId);
    await sendMessage(env, chatId, pickDeliveryMessage());
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
    `🎬 Video #${video.id}`,
    `📌 ${title}`,
    `📁 Turi: ${video.kind}`,
    video.mimeType ? `🎞 ${video.mimeType}` : null,
    `📅 ${formatDate(video.uploadedAt)}`,
  ];

  if (showAdminMeta) {
    lines.push(`👤 Admin ID: ${video.uploadedBy}`);
  }

  lines.push("", "Olish uchun shu raqamni yuboring 👆");

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
  const text = await buildAdminStatsText(env);
  await sendMessage(env, chatId, text, { bot: "admin" });
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

  const result = await checkUserSubscription(env, userId);
  if (result.subscribed) {
    await answerCallbackQuery(env, query.id, "Obuna tasdiqlandi! 🎉");
    await sendMessage(
      env,
      chatId,
      [
        "🎉 Zo'r! Obuna tasdiqlandi!",
        "",
        "Endi video ID yuboring 🎬",
        "Masalan: 1",
      ].join("\n"),
    );
    return;
  }

  await answerCallbackQuery(env, query.id, "Hali obuna bo'lmadingiz ❌");
  await sendSubscriptionRequired(env, chatId, userId, result);
}
