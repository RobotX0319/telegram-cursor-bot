import { adminPanelKeyboard, isReplyButton } from "./admin-keyboard";
import { sendAdminPanel, handleBroadcastMedia } from "./panel";
import {
  handleAdminStateInput,
  handleReplyButton,
} from "./admin-reply-menu";
import { ADMIN_BOT, USER_BOT, adminRedirectText } from "./bot-labels";
import { getAdminIds, hasAdminBot, isAdmin, saveBotTokens } from "./bots";

const KV_ADMIN_IDS = "config:admin_ids";

async function ensureDetiskebotAdmin(
  env: Env,
  userId: number,
  viaUserBot: boolean,
): Promise<boolean> {
  if (viaUserBot) return (await isAdmin(env, userId));

  const kvAdmins = await env.VIDEOS.get(KV_ADMIN_IDS);
  if (!kvAdmins?.trim()) {
    await saveBotTokens(env, { adminIds: String(userId) });
    return true;
  }
  return isAdmin(env, userId);
}
import {
  handleDelete,
  handleInfo,
  handleList,
  handleStats,
} from "./handlers-user";
import { mirrorFileToUserBot, mirrorPhotoToUserBot } from "./mirror";
import { postVideoAd, setAdTemplate } from "./ad-channel";
import { resolveExistingVideoForUpload, adminFileExists } from "./video-health";
import { resetBotData, resetBotFully } from "./reset";
import {
  clearAdminState,
  getAdminState,
  peekBulkId,
  popBulkId,
} from "./admin-state";
import {
  clearPendingAdTemplate,
  clearPendingVideoId,
  ensureCounterAtLeast,
  getPendingAdTemplate,
  getPendingVideoId,
  getVideo,
  saveVideo,
  setPendingAdTemplate,
  setPendingVideoId,
} from "./storage";
import { sendMessage } from "./telegram";
import { removeVipUser } from "./vip";
import {
  parseIdCommand,
  parseIdFromText,
  parseManualVideoId,
} from "./video-id";
import type { BotKind } from "./bots";
import type { Env, StoredVideo, TelegramMessage } from "./types";

const adminMsgBot = new Map<number, BotKind>();

function replyBot(_env: Env, userId: number): BotKind {
  return adminMsgBot.get(userId) ?? "admin";
}

function adminBot(env: Env, userId: number): { bot: BotKind } {
  return { bot: replyBot(env, userId) };
}

const ADMIN_HELP = `${ADMIN_BOT} — Admin bot

🎛 Admin panel — chap pastdagi «🎛 Admin panel» tugmasi
📋 Buyruqlar — chap menyu (☰)
📤 Kino yuklash — avval ID (masalan: 5), keyin video
📋 /list — kinolar ro'yxati
📊 /stats — statistika
/cancel — bekor qilish

👥 Foydalanuvchilar: ${USER_BOT}`;

export async function handleAdminBotMessage(
  env: Env,
  message: TelegramMessage,
  workerOrigin: string,
  botKind: import("./bots").BotKind = "admin",
): Promise<void> {
  const userId = message.from?.id;
  const chatId = message.chat.id;
  const viaUserBot = botKind === "user";

  if (!userId) return;

  adminMsgBot.set(userId, botKind);

  if (viaUserBot) {
    await sendMessage(env, chatId, adminRedirectText());
    return;
  }

  if (!hasAdminBot(env)) {
    await sendMessage(
      env,
      chatId,
      [
        `⚠️ ${ADMIN_BOT} hali ulanmagan.`,
        "",
        "Admin token ulang, keyin qayta /start yuboring.",
      ].join("\n"),
      { bot: "admin" },
    );
    return;
  }

  const allowed = await ensureDetiskebotAdmin(env, userId, viaUserBot);
  if (!allowed) {
    await sendMessage(
      env,
      chatId,
      [
        "⛔ Bu bot faqat adminlar uchun.",
        "",
        `Sizning ID: ${userId}`,
        "",
        "/meningid — ID ko'rish",
        "/adminol — o'zingizni admin qilish (birinchi marta)",
      ].join("\n"),
      { bot: adminMsgBot.get(userId) ?? replyBot(env, userId) },
    );
    return;
  }

  if (message.video || isVideoDocument(message) || message.animation) {
    const state = await getAdminState(env, userId);
    if (state?.mode === "await_broadcast_media") {
      const fileId =
        message.video?.file_id ??
        message.animation?.file_id ??
        message.document!.file_id;
      await handleBroadcastMedia(env, chatId, userId, fileId, "video");
      return;
    }
    await handleAdminUpload(env, chatId, userId, message);
    return;
  }

  if (message.photo && message.photo.length > 0) {
    await handleAdminPhoto(env, chatId, userId, message);
    return;
  }

  if (isImageDocument(message)) {
    await handleAdminImageDocument(env, chatId, userId, message);
    return;
  }

  const text = message.text?.trim();
  if (!text) return;

  if (isReplyButton(text)) {
    await handleReplyButton(env, chatId, userId, text, workerOrigin);
    return;
  }

  if (text.startsWith("/")) {
    await handleAdminCommand(env, chatId, userId, text, workerOrigin, botKind);
    return;
  }

  if (await handleAdminStateInput(env, chatId, userId, text)) {
    return;
  }

  const vipRemove = text.match(/^o'?chirish\s+(\d{8,})$/i);
  if (vipRemove) {
    const id = Number.parseInt(vipRemove[1]!, 10);
    const ok = await removeVipUser(env, id);
    await sendMessage(
      env,
      chatId,
      ok ? `✅ VIP o'chirildi: ${id}` : "VIP topilmadi.",
      { bot: adminMsgBot.get(userId) ?? replyBot(env, userId), replyMarkup: adminPanelKeyboard(env) },
    );
    return;
  }

  const manualId = parseIdFromText(text);
  if (manualId !== null) {
      await setPendingVideoId(env, userId, manualId);
      await sendMessage(
        env,
        chatId,
        [
          `✅ Keyingi video ID: ${manualId}`,
          "",
          "1) Ixtiyoriy: reklama rasm shablon yuboring",
          "2) Keyin videoni yuboring",
        ].join("\n"),
        { bot: adminMsgBot.get(userId) ?? replyBot(env, userId), replyMarkup: adminPanelKeyboard(env) },
      );
    return;
  }

  await sendMessage(
    env,
    chatId,
    "🎛 Admin panel: /panel\n\nVideo yuklash: ID yuboring (masalan: 5), keyin video.\n\n/help — yordam",
    { bot: adminMsgBot.get(userId) ?? replyBot(env, userId), replyMarkup: adminPanelKeyboard(env) },
  );
}

async function handleAdminCommand(
  env: Env,
  chatId: number,
  userId: number,
  text: string,
  workerOrigin: string,
  botKind: BotKind = "admin",
): Promise<void> {
  const [command, ...rest] = text.split(/\s+/);
  const args = rest.join(" ").trim();
  const cmd = command.toLowerCase().split("@")[0];

  switch (cmd) {
    case "/meningid":
      await sendMessage(
        env,
        chatId,
        `🆔 Sizning Telegram ID: \`${userId}\``,
        { bot: adminMsgBot.get(userId) ?? replyBot(env, userId) },
      );
      return;

    case "/adminol": {
      const kvAdmins = await env.VIDEOS.get(KV_ADMIN_IDS);
      if (kvAdmins?.trim() && !(await isAdmin(env, userId))) {
        await saveBotTokens(env, { adminIds: String(userId) });
        await sendMessage(
          env,
          chatId,
          [
            "✅ Siz admin qilib qo'shildingiz!",
            "",
            "/panel — boshqaruv paneli",
            "Video: ID (masalan 5), keyin video yuboring",
          ].join("\n"),
          {
            bot: adminMsgBot.get(userId) ?? replyBot(env, userId),
            replyMarkup: adminPanelKeyboard(env),
          },
        );
        await sendAdminPanel(env, chatId, workerOrigin, botKind);
        return;
      }
      if (await isAdmin(env, userId)) {
        await sendMessage(env, chatId, "✅ Siz allaqachon adminsiz.", {
          bot: adminMsgBot.get(userId) ?? replyBot(env, userId),
        });
        return;
      }
      await saveBotTokens(env, { adminIds: String(userId) });
      await sendMessage(
        env,
        chatId,
        "✅ Admin ro'yxatiga qo'shildingiz! /panel yuboring.",
        {
          bot: adminMsgBot.get(userId) ?? replyBot(env, userId),
          replyMarkup: adminPanelKeyboard(env),
        },
      );
      await sendAdminPanel(env, chatId, workerOrigin, botKind);
      return;
    }

    case "/start":
      await sendMessage(
        env,
        chatId,
        [
          "👋 Salom, admin!",
          "",
          `${ADMIN_BOT} — kino boshqaruv boti`,
          "",
          "🎛 Admin panel: chap pastdagi tugma",
          "📋 Buyruqlar: chap menyu ☰",
          "📤 Video: ID yuboring (5), keyin video",
          "",
          "/panel — chat ichidagi panel",
        ].join("\n"),
        { bot: adminMsgBot.get(userId) ?? replyBot(env, userId), replyMarkup: adminPanelKeyboard(env) },
      );
      await sendAdminPanel(env, chatId, workerOrigin, botKind);
      return;

    case "/cancel":
      await handleAdminStateInput(env, chatId, userId, "/cancel");
      return;

    case "/help":
      await sendMessage(env, chatId, ADMIN_HELP, {
        bot: adminMsgBot.get(userId) ?? replyBot(env, userId),
        replyMarkup: adminPanelKeyboard(env),
      });
      return;

    case "/panel":
      await sendAdminPanel(env, chatId, workerOrigin, botKind);
      return;

    case "/id":
    case "/upload": {
      const id = parseIdCommand(args);
      if (id === null) {
        await sendMessage(env, chatId, "Foydalanish: /id 5", {
          bot: adminMsgBot.get(userId) ?? replyBot(env, userId),
          replyMarkup: adminPanelKeyboard(env),
        });
        return;
      }
      await setPendingVideoId(env, userId, id);
      await sendMessage(
        env,
        chatId,
        [
          `✅ Keyingi video ID: ${id}`,
          "",
          "1) Ixtiyoriy: reklama rasm shablon yuboring",
          "2) Keyin videoni yuboring",
        ].join("\n"),
        { bot: adminMsgBot.get(userId) ?? replyBot(env, userId), replyMarkup: adminPanelKeyboard(env) },
      );
      return;
    }

    case "/vipremove": {
      const id = parseIdCommand(args);
      if (id === null) {
        await sendMessage(env, chatId, "Foydalanish: /vipremove 123456789", {
          bot: adminMsgBot.get(userId) ?? replyBot(env, userId),
          replyMarkup: adminPanelKeyboard(env),
        });
        return;
      }
      const ok = await removeVipUser(env, id);
      await sendMessage(
        env,
        chatId,
        ok ? `✅ VIP o'chirildi: ${id}` : "VIP topilmadi.",
        { bot: adminMsgBot.get(userId) ?? replyBot(env, userId), replyMarkup: adminPanelKeyboard(env) },
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
      await handleInfo(env, chatId, userId, args, true);
      return;

    case "/ping":
      await sendMessage(env, chatId, "pong", { bot: adminMsgBot.get(userId) ?? replyBot(env, userId) });
      return;

    case "/reset": {
      const mode = args.toUpperCase();
      if (mode !== "RESET" && mode !== "FULL") {
        await sendMessage(
          env,
          chatId,
          [
            "⚠️ Tizimni yangilash",
            "",
            "/reset RESET — videolar, kanallar, VIP, statistika o'chiriladi. Tokenlar qoladi.",
            "",
            "/reset FULL — butun tizim KV dan to'liq o'chiriladi (tokenlar ham). Keyin botlarni qayta ulash kerak.",
            "",
            "Tasdiqlash: /reset RESET yoki /reset FULL",
          ].join("\n"),
          { bot: adminMsgBot.get(userId) ?? replyBot(env, userId), replyMarkup: adminPanelKeyboard(env) },
        );
        return;
      }
      const full = mode === "FULL";
      await sendMessage(
        env,
        chatId,
        full ? "⏳ Butun tizim to'liq o'chirilmoqda..." : "⏳ Ma'lumotlar tozalanmoqda...",
        { bot: adminMsgBot.get(userId) ?? replyBot(env, userId) },
      );
      const result = full ? await resetBotFully(env) : await resetBotData(env);
      await sendMessage(
        env,
        chatId,
        full
          ? [
              "✅ Butun tizim yangilandi!",
              "",
              `O'chirildi: ${result.deleted} ta yozuv (tokenlar ham)`,
              result.errors.length ? `⚠️ Xato: ${result.errors.length} ta` : "",
              "",
              "Keyingi qadamlar:",
              "1) Bot tokenlarini qayta ulang",
              "2) Kanallarni sozlang",
              "3) Videolarni ID 1 dan yuklang",
            ]
              .filter(Boolean)
              .join("\n")
          : [
              "🗑 Bot tozalandi — 0 dan boshlaysiz!",
              "",
              `O'chirildi: ${result.deleted} ta yozuv`,
              "",
              "Endi:",
              "1) Kanallar sozlamalari",
              "2) Video yuklash (ID: 1 dan)",
            ].join("\n"),
        { bot: adminMsgBot.get(userId) ?? replyBot(env, userId), replyMarkup: adminPanelKeyboard(env) },
      );
      return;
    }

    default:
      await sendMessage(env, chatId, "Noma'lum buyruq. /help", {
        bot: adminMsgBot.get(userId) ?? replyBot(env, userId),
        replyMarkup: adminPanelKeyboard(env),
      });
  }
}

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

async function saveAdminImageTemplate(
  env: Env,
  chatId: number,
  userId: number,
  adminFileId: string,
  mode: "global" | "upload",
): Promise<void> {
  const userFileId = await mirrorPhotoToUserBot(env, adminFileId, userId);

  if (!userFileId) {
    await sendMessage(
      env,
      chatId,
      [
        "Rasm saqlanmadi.",
        "",
        "Avval @Detskebot da /start bosing, keyin qayta yuboring.",
      ].join("\n"),
      { bot: adminMsgBot.get(userId) ?? replyBot(env, userId) },
    );
    return;
  }

  if (mode === "global") {
    const config = await setAdTemplate(env, userFileId);
    await clearAdminState(env, userId);
    const lines = [
      "✅ Rasm shablon saqlandi.",
      config.channelId
        ? "Reklama yoqildi — video yuklanganda kanalga tushadi."
        : "Endi 📢 Reklama kanalini ulang (Kanallar sozlamalari).",
    ];
    await sendMessage(env, chatId, lines.join("\n"), {
      bot: adminMsgBot.get(userId) ?? replyBot(env, userId),
      replyMarkup: adminPanelKeyboard(env),
    });
    return;
  }

  await setPendingAdTemplate(env, userId, userFileId);
  const pendingId = await getPendingVideoId(env, userId);
  await sendMessage(
    env,
    chatId,
    [
      "✅ Reklama rasmi tayyor.",
      pendingId !== null
        ? `Endi ID ${pendingId} uchun videoni yuboring.`
        : "Avval video ID yuboring, keyin videoni yuboring.",
    ].join("\n"),
    { bot: adminMsgBot.get(userId) ?? replyBot(env, userId), replyMarkup: adminPanelKeyboard(env) },
  );
}

async function handleAdminPhoto(
  env: Env,
  chatId: number,
  userId: number,
  message: TelegramMessage,
): Promise<void> {
  const state = await getAdminState(env, userId);
  const photos = message.photo!;
  const largest = photos[photos.length - 1]!;

  if (state?.mode === "await_broadcast_media") {
    await handleBroadcastMedia(env, chatId, userId, largest.file_id, "photo");
    return;
  }

  if (state?.mode === "await_ad_template") {
    await saveAdminImageTemplate(env, chatId, userId, largest.file_id, "global");
    return;
  }

  const pendingId = await getPendingVideoId(env, userId);
  const bulkId = await peekBulkId(env, userId);
  if (pendingId !== null || bulkId !== null) {
    await saveAdminImageTemplate(env, chatId, userId, largest.file_id, "upload");
    return;
  }

  await sendMessage(
    env,
    chatId,
    [
      "Reklama rasmi uchun avval video ID yuboring: 5",
      "yoki Sozlamalar → Reklama → Rasm shablon",
    ].join("\n"),
    { bot: adminMsgBot.get(userId) ?? replyBot(env, userId), replyMarkup: adminPanelKeyboard(env) },
  );
}

async function handleAdminImageDocument(
  env: Env,
  chatId: number,
  userId: number,
  message: TelegramMessage,
): Promise<void> {
  const doc = message.document;
  if (!doc) return;
  await handleAdminPhoto(env, chatId, userId, {
    ...message,
    photo: [{ file_id: doc.file_id, file_unique_id: doc.file_unique_id, width: 0, height: 0 }],
  });
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

  const bulk = await peekBulkId(env, userId);
  if (bulk !== null) return { id: bulk };

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
  const animation = message.animation;

  if (!video && !document && !animation) {
    await sendMessage(env, chatId, "Video topilmadi. Qayta yuboring.", {
      bot: adminMsgBot.get(userId) ?? replyBot(env, userId),
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
        "ID yuboring: 5",
        "yoki /panel → Toplu yuklash",
      ].join("\n"),
      { bot: adminMsgBot.get(userId) ?? replyBot(env, userId), replyMarkup: adminPanelKeyboard(env) },
    );
    return;
  }

  const hadPending = (await getPendingVideoId(env, userId)) !== null;
  const usedBulk = !hadPending && (await peekBulkId(env, userId)) !== null;

  const { id, title } = resolved;
  const slot = await resolveExistingVideoForUpload(env, id);
  if (!slot.ok) {
    await sendMessage(
      env,
      chatId,
      [
        `🔴 ID ${id} band!`,
        "",
        "Bu raqam boshqa video uchun ishlatilmoqda.",
        "",
        `/delete ${id} — o'chirish`,
        "Yoki boshqa ID tanlang (masalan: " + (id + 1) + ")",
      ].join("\n"),
      { bot: adminMsgBot.get(userId) ?? replyBot(env, userId), replyMarkup: adminPanelKeyboard(env) },
    );
    return;
  }

  if (slot.clearedBroken) {
    await sendMessage(
      env,
      chatId,
      `ℹ️ ID ${id} dagi eski buzilgan video o'chirildi — yangi video yuklanmoqda...`,
      { bot: adminMsgBot.get(userId) ?? replyBot(env, userId) },
    );
  }

  const kind = video || animation ? "video" : "document";
  const adminFileId =
    video?.file_id ?? animation?.file_id ?? document!.file_id;
  const adminUniqueId =
    video?.file_unique_id ??
    animation?.file_unique_id ??
    document!.file_unique_id;
  const displayCaption = title ?? undefined;

  const sourceOk = await adminFileExists(env, adminFileId);
  if (!sourceOk) {
    await sendMessage(
      env,
      chatId,
      [
        "❌ Video saqlanmadi — fayl topilmadi.",
        "",
        "Qayta yuboring yoki boshqa ID tanlang.",
      ].join("\n"),
      { bot: adminMsgBot.get(userId) ?? replyBot(env, userId), replyMarkup: adminPanelKeyboard(env) },
    );
    return;
  }

  const userFileId = await mirrorFileToUserBot(
    env,
    adminFileId,
    kind,
    userId,
  );

  const stored: StoredVideo = video
    ? {
        id,
        fileId: userFileId ?? "",
        adminFileId,
        fileUniqueId: adminUniqueId,
        kind: "video",
        name: displayCaption,
        caption: displayCaption,
        mimeType: "video/mp4",
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
        views: 0,
      }
    : {
        id,
        fileId: userFileId ?? "",
        adminFileId,
        fileUniqueId: adminUniqueId,
        kind: "document",
        name: displayCaption,
        caption: displayCaption,
        fileName: document!.file_name,
        mimeType: document!.mime_type,
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
        views: 0,
      };

  await saveVideo(env, stored);
  await ensureCounterAtLeast(env, id);
  await clearPendingVideoId(env, userId);

  const bulkNext = usedBulk ? await popBulkId(env, userId) : null;

  const pendingTemplate = await getPendingAdTemplate(env, userId);
  const adResult = await postVideoAd(
    env,
    id,
    displayCaption,
    pendingTemplate ?? undefined,
  );
  if (pendingTemplate) {
    await clearPendingAdTemplate(env, userId);
  }

  const lines = [
    `✅ Saqlandi — ID: ${id}`,
    "",
    "Foydalanuvchilar @Detskebot ga shu raqamni yuboradi.",
  ];

  if (!userFileId) {
    lines.push("", "ℹ️ Video birinchi so'rovda yuboriladi.");
  }

  if (adResult.ok) {
    lines.push("", "📢 Reklama kanalga yuborildi.");
  } else if ("error" in adResult) {
    lines.push("", `⚠️ ${adResult.error}`);
  } else if (pendingTemplate) {
    lines.push(
      "",
      "⚠️ Reklama yuborilmadi. Kanallar sozlamalarida reklama kanalini ulang va yoqing.",
    );
  }

  if (displayCaption) {
    lines.push("", displayCaption);
  }

  if (bulkNext !== null) {
    lines.push("", `📦 Keyingi ID: ${bulkNext} — videoni yuboring.`);
  }

  await sendMessage(env, chatId, lines.join("\n"), {
    bot: adminMsgBot.get(userId) ?? replyBot(env, userId),
    replyMarkup: adminPanelKeyboard(env),
  });
}
