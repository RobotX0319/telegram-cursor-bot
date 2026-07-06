import {
  countVideos,
  deleteVideo,
  getVideo,
  listVideos,
  registerVideo,
} from "./storage";
import { getAdminPanelUrl } from "./admin";
import {
  ensureSubscribed,
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
import { isAdminUser } from "./admins";
import type { Env, TelegramCallbackQuery, TelegramMessage } from "./types";

const USER_HELP = `Video bot (@Detskebot)

- 1, 2, 3 ... yuboring — videoni faqat chatda ko'rasiz
- Yuklab olish va forward qilish cheklangan
- /info 3 — video haqida ma'lumot
- /check — obunani tekshirish
- /help — yordam`;

const ADMIN_USER_HELP = `Admin (@Detskebot da)

- Video yuklang — avtomatik ID beriladi va saqlanadi
- /list — videolar ro'yxati
- /delete 5 — videoni o'chirish
- /stats — statistika
- /info 3 — video tafsilotlari`;

const ADMIN_HELP = `Boshqaruv boti (@Detiskebot)

- /panel — web admin panel
- /list — barcha videolar ro'yxati
- /delete 5 — videoni o'chirish
- /stats — statistika
- /info 3 — video tafsilotlari

Video yuklash: @Detskebot ga video yuboring`;

export function isAdmin(env: Env, userId: number): boolean {
  return isAdminUser(env, userId);
}

export async function handleUserMessage(
  env: Env,
  message: TelegramMessage,
): Promise<void> {
  const userId = message.from?.id;
  const chatId = message.chat.id;

  if (!userId) return;

  const text = message.text?.trim();
  const isCheckCommand = text?.toLowerCase().split("@")[0] === "/check";
  const admin = isAdmin(env, userId);

  if (message.video || isVideoDocument(message)) {
    if (admin) {
      await handleVideoUpload(env, chatId, userId, message);
    } else {
      await sendMessage(
        env,
        "user",
        chatId,
        "Video olish uchun ID yuboring.\nMasalan: 1",
      );
    }
    return;
  }

  if (!admin && !isCheckCommand) {
    const subscribed = await ensureSubscribed(env, chatId, userId);
    if (!subscribed) return;
  }

  if (message.document) {
    if (admin) {
      await sendMessage(env, "user", chatId, "Faqat video fayl yuklang.");
    } else {
      await sendMessage(
        env,
        "user",
        chatId,
        "Video olish uchun ID yuboring.\nMasalan: 1",
      );
    }
    return;
  }

  if (!text) return;

  if (text.startsWith("/")) {
    await handleUserCommand(env, chatId, userId, text, admin);
    return;
  }

  if (/^\d+$/.test(text)) {
    await sendVideoById(env, chatId, Number.parseInt(text, 10));
    return;
  }

  await sendMessage(
    env,
    "user",
    chatId,
    "Video olish uchun raqam yuboring.\nMasalan: 1\n\n/help — yordam",
  );
}

export async function handleAdminMessage(
  env: Env,
  message: TelegramMessage,
  workerOrigin: string,
): Promise<void> {
  const userId = message.from?.id;
  const chatId = message.chat.id;

  if (!userId) return;

  if (!isAdmin(env, userId)) {
    await sendMessage(
      env,
      "admin",
      chatId,
      "Bu bot faqat admin uchun.\nFoydalanuvchilar uchun boshqa botdan foydalaning.",
    );
    return;
  }

  if (message.video || isVideoDocument(message)) {
    await sendMessage(
      env,
      "admin",
      chatId,
      "Video yuklash uchun @Detskebot ga yuboring.\n\nBu bot faqat boshqaruv uchun (/panel, /list, /delete).",
    );
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
    "admin",
    chatId,
    "Buyruq yuboring: /panel, /list, /help\n\nVideo yuklash: @Detskebot",
  );
}

async function handleUserCommand(
  env: Env,
  chatId: number,
  userId: number,
  text: string,
  admin: boolean,
): Promise<void> {
  const [command, ...rest] = text.split(/\s+/);
  const args = rest.join(" ").trim();
  const cmd = command.toLowerCase().split("@")[0];

  switch (cmd) {
    case "/start":
      await sendMessage(
        env,
        "user",
        chatId,
        "Salom! Video olish uchun ID yuboring.\nMasalan: 1\n\nVideoni faqat shu chatda ko'rish mumkin.\n/help — yordam",
      );
      return;

    case "/help":
      await sendMessage(env, "user", chatId, admin ? ADMIN_USER_HELP : USER_HELP);
      return;

    case "/list":
      if (!admin) {
        await sendMessage(env, "user", chatId, "Bu buyruq faqat admin uchun.");
        return;
      }
      await handleList(env, chatId, "user");
      return;

    case "/delete":
      if (!admin) {
        await sendMessage(env, "user", chatId, "Bu buyruq faqat admin uchun.");
        return;
      }
      await handleDelete(env, chatId, args, "user");
      return;

    case "/stats":
      if (!admin) {
        await sendMessage(env, "user", chatId, "Bu buyruq faqat admin uchun.");
        return;
      }
      await handleStats(env, chatId, "user");
      return;

    case "/info":
      await handleInfo(env, chatId, userId, args, false);
      return;

    case "/ping":
      await sendMessage(env, "user", chatId, "pong");
      return;

    case "/check":
      await handleSubscriptionCheck(env, chatId, userId);
      return;

    default:
      await sendMessage(env, "user", chatId, "Noma'lum buyruq. /help");
  }
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
        "admin",
        chatId,
        "Boshqaruv boti.\n/panel — admin panel\n/help — yordam\n\nVideo yuklash: @Detskebot ga video yuboring.",
      );
      return;

    case "/help":
      await sendMessage(env, "admin", chatId, ADMIN_HELP);
      return;

    case "/list":
      await handleList(env, chatId, "admin");
      return;

    case "/delete":
      await handleDelete(env, chatId, args, "admin");
      return;

    case "/stats":
      await handleStats(env, chatId, "admin");
      return;

    case "/info":
      await handleInfo(env, chatId, userId, args, true);
      return;

    case "/panel":
      await handlePanel(env, chatId, workerOrigin);
      return;

    case "/ping":
      await sendMessage(env, "admin", chatId, "pong");
      return;

    default:
      await sendMessage(env, "admin", chatId, "Noma'lum buyruq. /help");
  }
}

function isVideoDocument(message: TelegramMessage): boolean {
  const doc = message.document;
  if (!doc?.mime_type) return false;
  return doc.mime_type.startsWith("video/");
}

async function handleVideoUpload(
  env: Env,
  chatId: number,
  userId: number,
  message: TelegramMessage,
): Promise<void> {
  const video = message.video;
  const document = message.document;

  if (!video && !document) {
    await sendMessage(env, "user", chatId, "Video topilmadi. Qayta yuboring.");
    return;
  }

  const caption = message.caption?.trim();

  const payload = video
    ? {
        fileId: video.file_id,
        fileUniqueId: video.file_unique_id,
        kind: "video" as const,
        caption,
        mimeType: video.mime_type ?? "video/mp4",
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
      }
    : {
        fileId: document!.file_id,
        fileUniqueId: document!.file_unique_id,
        kind: "document" as const,
        caption,
        fileName: document!.file_name,
        mimeType: document!.mime_type,
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
      };

  try {
    const result = await registerVideo(env, payload);

    if (result.status === "duplicate") {
      await sendMessage(
        env,
        "user",
        chatId,
        `Takrorlandi — bu video allaqachon saqlangan.\nID: ${result.id}`,
      );
      return;
    }

    const lines = [
      "Video saqlandi.",
      `ID: ${result.id}`,
      "",
      "Foydalanuvchilar shu raqamni yuborib videoni olishadi.",
    ];

    if (caption) {
      lines.push("", `Caption: ${caption}`);
    }

    await sendMessage(env, "user", chatId, lines.join("\n"));
  } catch (error) {
    console.error(
      "Video saqlanmadi:",
      error instanceof Error ? error.message : String(error),
    );
    await sendMessage(
      env,
      "user",
      chatId,
      "Video saqlanmadi. Biroz kutib qayta yuboring.",
    );
  }
}

async function sendVideoById(
  env: Env,
  chatId: number,
  id: number,
): Promise<void> {
  const video = await getVideo(env, id);

  if (!video) {
    await sendMessage(env, "user", chatId, `Video topilmadi: ${id}`);
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
      "user",
      chatId,
      `Video yuborilmadi (ID: ${id}). Admin bilan bog'laning.`,
    );
  }
}

async function handleList(
  env: Env,
  chatId: number,
  bot: "user" | "admin",
): Promise<void> {
  const videos = await listVideos(env);

  if (videos.length === 0) {
    await sendMessage(env, bot, chatId, "Hozircha video yo'q.");
    return;
  }

  const lines = videos.map((video) => {
    const title = video.caption ?? video.fileName ?? "Video";
    return `${video.id}. ${title}`;
  });

  await sendMessage(env, bot, chatId, ["Videolar:", "", ...lines].join("\n"));
}

async function handleDelete(
  env: Env,
  chatId: number,
  args: string,
  bot: "user" | "admin",
): Promise<void> {
  if (!/^\d+$/.test(args)) {
    await sendMessage(env, bot, chatId, "Foydalanish: /delete 5");
    return;
  }

  const id = Number.parseInt(args, 10);
  const deleted = await deleteVideo(env, id);

  if (!deleted) {
    await sendMessage(env, bot, chatId, `Video topilmadi: ${id}`);
    return;
  }

  await sendMessage(env, bot, chatId, `Video o'chirildi: ${id}`);
}

async function handleStats(
  env: Env,
  chatId: number,
  bot: "user" | "admin",
): Promise<void> {
  const total = await countVideos(env);
  await sendMessage(env, bot, chatId, `Jami videolar: ${total}`);
}

async function handleInfo(
  env: Env,
  chatId: number,
  userId: number,
  args: string,
  adminBot: boolean,
): Promise<void> {
  if (!/^\d+$/.test(args)) {
    await sendMessage(
      env,
      adminBot ? "admin" : "user",
      chatId,
      "Foydalanish: /info 3",
    );
    return;
  }

  const id = Number.parseInt(args, 10);
  const video = await getVideo(env, id);

  if (!video) {
    await sendMessage(
      env,
      adminBot ? "admin" : "user",
      chatId,
      `Video topilmadi: ${id}`,
    );
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

  if (adminBot && isAdmin(env, userId)) {
    lines.push(`Admin ID: ${video.uploadedBy}`);
  }

  lines.push("", "Videoni olish uchun shu raqamni yuboring.");

  await sendMessage(
    env,
    adminBot ? "admin" : "user",
    chatId,
    lines.filter(Boolean).join("\n"),
  );
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
    "admin",
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
      "user",
      chatId,
      "✅ Obuna tasdiqlandi!\n\nVideo olish uchun ID yuboring.\nMasalan: 1",
    );
    return;
  }

  await answerCallbackQuery(env, query.id, "Hali obuna bo'lmadingiz!");
  await sendSubscriptionRequired(env, chatId);
}

/** @deprecated handleUserMessage / handleAdminMessage ishlating */
export async function handleMessage(
  env: Env,
  message: TelegramMessage,
  workerOrigin: string,
): Promise<void> {
  await handleUserMessage(env, message);
  void workerOrigin;
}
