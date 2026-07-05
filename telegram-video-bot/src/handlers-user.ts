import { isAdmin } from "./bots";
import { tryAdminOnUserBot, openUserAdminPanel } from "./admin-via-user";
import { handleAdminPanelCallback } from "./panel";
import {
  trackNotFound,
  trackUserStart,
  trackVideoDelivered,
  trackVideoRequest,
} from "./analytics";
import { incrementMovieViews, movieName } from "./content";
import { deliverMediaFromAdminFile } from "./mirror";
import { applyTextTemplate, getBotTexts } from "./settings";
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
import {
  countVideos,
  deleteVideo,
  getVideo,
  listVideos,
  saveVideo,
} from "./storage";
import { isUserBlocked, syncUser, trackUserVideo } from "./users";
import {
  answerCallbackQuery,
  sendDocumentByFileId,
  sendMessage,
  sendVideoByFileId,
} from "./telegram";
import type { Env, TelegramCallbackQuery, TelegramMessage } from "./types";

const USER_START_KEYBOARD = {
  remove_keyboard: true as const,
};

const ADMIN_ONLY_COMMANDS = new Set([
  "/panel",
  "/list",
  "/delete",
  "/stats",
  "/id",
  "/upload",
  "/vipremove",
]);

function pickDeliveryMessage(messages: string[]): string {
  return messages[Math.floor(Math.random() * messages.length)]!;
}

function isPublicCommand(text: string): boolean {
  const cmd = text.toLowerCase().split(/\s+/)[0]?.split("@")[0];
  return cmd === "/start" || cmd === "/help" || cmd === "/check" || cmd === "/karta" || cmd === "/ping";
}

export async function handleUserMessage(
  env: Env,
  message: TelegramMessage,
  workerOrigin = "",
): Promise<void> {
  const userId = message.from?.id;
  const chatId = message.chat.id;

  if (!userId) return;

  if (message.from) {
    await syncUser(env, message.from);
  }

  const text = message.text?.trim();
  if (text) {
    const cmd = text.split(/\s+/)[0]?.toLowerCase().split("@")[0];
    if (cmd === "/panel" || cmd === "/admin") {
      await openUserAdminPanel(env, chatId, userId);
      return;
    }
  }

  if (await tryAdminOnUserBot(env, message, workerOrigin)) {
    return;
  }

  if (await isUserBlocked(env, userId)) {
    const texts = await getBotTexts(env);
    await sendMessage(env, chatId, texts.blocked);
    return;
  }

  if (!text) return;

  if (message.video || isVideoDocument(message)) {
    if (!(await isAdmin(env, userId))) {
      await sendMessage(env, chatId, "📤 Video yuklash: @Detiskebot");
    }
    return;
  }

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
    "🎯 Kino olish uchun raqam yuboring.\nMasalan: 1\n\n/help — yordam",
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
  const texts = await getBotTexts(env);

  switch (cmd) {
    case "/start":
      if (from) await trackUserStart(env, from);
      await sendWelcome(env, chatId, userId);
      return;

    case "/help":
      await sendMessage(env, chatId, texts.help);
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
        await openUserAdminPanel(env, chatId, userId);
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
  const texts = await getBotTexts(env);

  let welcome = applyTextTemplate(texts.welcome, { total });

  if (channels.length > 0 && sub.enabled) {
    welcome += result.subscribed
      ? "\n\n✅ Obuna tasdiqlangan — kino olishingiz mumkin!"
      : "\n\n📢 Avval kanalga obuna bo'ling 👇";
  }

  await sendMessage(env, chatId, welcome, {
    replyMarkup: USER_START_KEYBOARD,
  });

  if (await isAdmin(env, userId)) {
    await sendMessage(
      env,
      chatId,
      "👑 Admin: /panel — boshqaruv paneli",
    );
  }

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
    await trackNotFound(env, id);
    const texts = await getBotTexts(env);
    await sendMessage(
      env,
      chatId,
      applyTextTemplate(texts.notFound, { code: id }),
    );
    return;
  }

  const playable = await isVideoPlayable(env, video);
  if (!playable) {
    await removeBrokenVideo(env, id);
    await sendMessage(
      env,
      chatId,
      `❌ Kino (ID: ${id}) ishlamaydi va o'chirildi.\nAdmin yangi kino yuklaydi.`,
    );
    return;
  }

  const title = movieName(video);
  const caption = `🎬 ID: ${id}\n${title}`;

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
        `❌ Kino (ID: ${id}) topilmadi va o'chirildi.`,
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
        `❌ Kino (ID: ${id}) yuborilmadi va o'chirildi.\nAdmin qayta yuklaydi.`,
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
    await trackUserVideo(env, userId);
    await incrementMovieViews(env, id);
    const texts = await getBotTexts(env);
    await sendMessage(env, chatId, pickDeliveryMessage(texts.deliveryMessages));
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
    await sendMessage(env, chatId, `Kino topilmadi: ${id}`);
    return;
  }

  const { formatMovieInfo } = await import("./content");
  const lines = [
    formatMovieInfo(video, showAdminMeta),
    "",
    "Olish uchun shu raqamni yuboring 👆",
  ];

  if (showAdminMeta) {
    lines.splice(1, 0, `👤 Admin ID: ${video.uploadedBy}`);
  }

  await sendMessage(env, chatId, lines.join("\n"));
}

export async function handleList(env: Env, chatId: number): Promise<void> {
  const videos = await listVideos(env);

  if (videos.length === 0) {
    await sendMessage(env, chatId, "Hozircha kino yo'q.", { bot: "admin" });
    return;
  }

  const lines = videos.map((video) => `${video.id}. ${movieName(video)}`);

  await sendMessage(
    env,
    chatId,
    ["Kinolar:", "", ...lines].join("\n"),
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
    await sendMessage(env, chatId, `Kino topilmadi: ${id}`, { bot: "admin" });
    return;
  }

  await sendMessage(env, chatId, `Kino o'chirildi: ${id}`, { bot: "admin" });
}

export async function handleStats(env: Env, chatId: number): Promise<void> {
  const { buildAdminStatsText } = await import("./stats");
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
  workerOrigin = "",
): Promise<void> {
  const userId = query.from.id;
  const chatId = query.message?.chat.id;
  const data = query.data;

  if (!chatId || !data) {
    await answerCallbackQuery(env, query.id);
    return;
  }

  if ((data.startsWith("p:") || data.startsWith("pu:")) && (await isAdmin(env, userId))) {
    const messageId = query.message?.message_id;
    if (messageId) {
      const answerBot = data.startsWith("pu:") ? "user" : "admin";
      await answerCallbackQuery(env, query.id, undefined, answerBot);
      await handleAdminPanelCallback(
        env,
        chatId,
        messageId,
        data,
        userId,
        workerOrigin,
      );
      return;
    }
  }

  if (data.startsWith("adm:") || data.startsWith("p:") || data.startsWith("pu:")) {
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
        "Endi kino ID yuboring 🎬",
        "Masalan: 1",
      ].join("\n"),
    );
    return;
  }

  await answerCallbackQuery(env, query.id, "Hali obuna bo'lmadingiz ❌");
  await sendSubscriptionRequired(env, chatId, userId, result);
}
