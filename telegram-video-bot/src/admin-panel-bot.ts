import { getAdminPanelPath, getWebhookSecret } from "./config";
import { getAdminPanelUrl } from "./admin";
import { countVideos, deleteVideo, getVideo, listVideos } from "./storage";
import {
  getSubscriptionConfig,
  setSubscriptionEnabled,
} from "./subscription";
import {
  answerCallbackQuery,
  editMessageText,
  sendMessage,
} from "./telegram";
import type { Env, StoredVideo } from "./types";

const PAGE_SIZE = 8;

type InlineBtn = { text: string; url?: string; callback_data?: string };

function mainMenuKeyboard(): InlineBtn[][] {
  return [
    [
      { text: "📊 Statistika", callback_data: "adm:stats" },
      { text: "📋 Videolar", callback_data: "adm:list:0" },
    ],
    [
      { text: "📢 Obuna", callback_data: "adm:sub" },
      { text: "🌐 Web panel", callback_data: "adm:web" },
    ],
    [{ text: "❓ Yordam", callback_data: "adm:help" }],
  ];
}

function backRow(): InlineBtn[] {
  return [{ text: "◀️ Asosiy menyu", callback_data: "adm:menu" }];
}

export async function sendAdminPanel(
  env: Env,
  chatId: number,
  workerOrigin: string,
): Promise<void> {
  const total = await countVideos(env);
  const sub = await getSubscriptionConfig(env);
  const subOn = sub.enabled && sub.channels.length > 0;

  await sendMessage(
    env,
    chatId,
    [
      "🎛 Admin panel",
      "",
      `📹 Videolar: ${total}`,
      `📢 Majburiy obuna: ${subOn ? "Yoniq" : "O'chiq"}`,
      `📡 Kanallar: ${sub.channels.length}`,
      "",
      "Video yuklash — avval ID (masalan: 5), keyin video yuboring.",
      "Foydalanuvchilar @Detskebot orqali video oladi.",
    ].join("\n"),
    {
      bot: "admin",
      replyMarkup: { inline_keyboard: mainMenuKeyboard() },
    },
  );
}

export async function handleAdminPanelCallback(
  env: Env,
  chatId: number,
  messageId: number,
  data: string,
  workerOrigin: string,
): Promise<void> {
  const parts = data.split(":");
  const action = parts[1];

  switch (action) {
    case "menu":
      await showMainMenu(env, chatId, messageId);
      break;
    case "stats":
      await showStats(env, chatId, messageId);
      break;
    case "list":
      await showVideoList(env, chatId, messageId, Number(parts[2] ?? 0));
      break;
    case "info":
      await showVideoInfo(env, chatId, messageId, Number(parts[2]));
      break;
    case "del":
      await confirmDelete(env, chatId, messageId, Number(parts[2]));
      break;
    case "delok":
      await doDelete(env, chatId, messageId, Number(parts[2]));
      break;
    case "sub":
      await showSubscription(env, chatId, messageId);
      break;
    case "subon":
      await toggleSub(env, chatId, messageId, true);
      break;
    case "suboff":
      await toggleSub(env, chatId, messageId, false);
      break;
    case "web":
      await showWebPanel(env, chatId, messageId, workerOrigin);
      break;
    case "help":
      await showHelp(env, chatId, messageId);
      break;
    default:
      await editMessageText(env, chatId, messageId, "Noma'lum buyruq.", {
        bot: "admin",
        replyMarkup: { inline_keyboard: [backRow()] },
      });
  }
}

async function showMainMenu(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  const total = await countVideos(env);
  const sub = await getSubscriptionConfig(env);
  const subOn = sub.enabled && sub.channels.length > 0;

  await editMessageText(
    env,
    chatId,
    messageId,
    [
      "🎛 Admin panel",
      "",
      `📹 Videolar: ${total}`,
      `📢 Majburiy obuna: ${subOn ? "Yoniq" : "O'chiq"}`,
      `📡 Kanallar: ${sub.channels.length}`,
      "",
      "Video yuklash — avval ID, keyin video.",
    ].join("\n"),
    {
      bot: "admin",
      replyMarkup: { inline_keyboard: mainMenuKeyboard() },
    },
  );
}

async function showStats(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  const total = await countVideos(env);
  const videos = await listVideos(env);
  const sub = await getSubscriptionConfig(env);

  let lastUpload = "—";
  if (videos.length > 0) {
    const last = videos[videos.length - 1]!;
    lastUpload = new Date(last.uploadedAt).toLocaleString("uz-UZ", {
      timeZone: "Asia/Tashkent",
    });
  }

  await editMessageText(
    env,
    chatId,
    messageId,
    [
      "📊 Statistika",
      "",
      `Jami videolar: ${total}`,
      `Oxirgi yuklash: ${lastUpload}`,
      `Obuna: ${sub.enabled ? "Yoniq" : "O'chiq"}`,
      `Kanallar: ${sub.channels.length}`,
    ].join("\n"),
    {
      bot: "admin",
      replyMarkup: { inline_keyboard: [backRow()] },
    },
  );
}

async function showVideoList(
  env: Env,
  chatId: number,
  messageId: number,
  page: number,
): Promise<void> {
  const videos = await listVideos(env);

  if (videos.length === 0) {
    await editMessageText(
      env,
      chatId,
      messageId,
      "📋 Hozircha video yo'q.\n\nVideo yuklang — avtomatik ID beriladi.",
      {
        bot: "admin",
        replyMarkup: { inline_keyboard: [backRow()] },
      },
    );
    return;
  }

  const totalPages = Math.ceil(videos.length / PAGE_SIZE);
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const slice = videos.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const lines = slice.map(formatVideoLine);
  const keyboard: InlineBtn[][] = slice.map((v) => [
    {
      text: `🗑 #${v.id} o'chirish`,
      callback_data: `adm:del:${v.id}`,
    },
    {
      text: `ℹ️ #${v.id}`,
      callback_data: `adm:info:${v.id}`,
    },
  ]);

  const nav: InlineBtn[] = [];
  if (safePage > 0) {
    nav.push({ text: "⬅️", callback_data: `adm:list:${safePage - 1}` });
  }
  if (safePage < totalPages - 1) {
    nav.push({ text: "➡️", callback_data: `adm:list:${safePage + 1}` });
  }
  if (nav.length) keyboard.push(nav);
  keyboard.push(backRow());

  await editMessageText(
    env,
    chatId,
    messageId,
    [
      `📋 Videolar (${videos.length})`,
      `Sahifa ${safePage + 1}/${totalPages}`,
      "",
      ...lines,
    ].join("\n"),
    {
      bot: "admin",
      replyMarkup: { inline_keyboard: keyboard },
    },
  );
}

function formatVideoLine(video: StoredVideo): string {
  const title = video.caption ?? video.fileName ?? "Video";
  const short =
    title.length > 28 ? `${title.slice(0, 28)}…` : title;
  return `#${video.id} · ${short}`;
}

async function showVideoInfo(
  env: Env,
  chatId: number,
  messageId: number,
  id: number,
): Promise<void> {
  const video = await getVideo(env, id);
  if (!video) {
    await editMessageText(env, chatId, messageId, `Video topilmadi: ${id}`, {
      bot: "admin",
      replyMarkup: { inline_keyboard: [backRow()] },
    });
    return;
  }

  const title = video.caption ?? video.fileName ?? "Video";
  await editMessageText(
    env,
    chatId,
    messageId,
    [
      `ℹ️ Video #${video.id}`,
      "",
      `Nom: ${title}`,
      `Turi: ${video.kind}`,
      video.mimeType ? `Format: ${video.mimeType}` : null,
      `Yuklangan: ${new Date(video.uploadedAt).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })}`,
      "",
      "Foydalanuvchi @Detskebot ga raqam yuboradi.",
    ]
      .filter(Boolean)
      .join("\n"),
    {
      bot: "admin",
      replyMarkup: {
        inline_keyboard: [
          [
            { text: "🗑 O'chirish", callback_data: `adm:del:${id}` },
            { text: "📋 Ro'yxat", callback_data: "adm:list:0" },
          ],
          backRow(),
        ],
      },
    },
  );
}

async function confirmDelete(
  env: Env,
  chatId: number,
  messageId: number,
  id: number,
): Promise<void> {
  const video = await getVideo(env, id);
  if (!video) {
    await editMessageText(env, chatId, messageId, `Video topilmadi: ${id}`, {
      bot: "admin",
      replyMarkup: { inline_keyboard: [backRow()] },
    });
    return;
  }

  const title = video.caption ?? video.fileName ?? "Video";
  await editMessageText(
    env,
    chatId,
    messageId,
    [`🗑 Video #${id} o'chirilsinmi?`, "", title].join("\n"),
    {
      bot: "admin",
      replyMarkup: {
        inline_keyboard: [
          [
            { text: "✅ Ha, o'chirish", callback_data: `adm:delok:${id}` },
            { text: "❌ Bekor", callback_data: "adm:list:0" },
          ],
        ],
      },
    },
  );
}

async function doDelete(
  env: Env,
  chatId: number,
  messageId: number,
  id: number,
): Promise<void> {
  const deleted = await deleteVideo(env, id);
  const text = deleted
    ? `✅ Video #${id} o'chirildi.`
    : `Video topilmadi: ${id}`;

  await editMessageText(env, chatId, messageId, text, {
    bot: "admin",
    replyMarkup: {
      inline_keyboard: [
        [{ text: "📋 Videolar", callback_data: "adm:list:0" }],
        backRow(),
      ],
    },
  });
}

async function showSubscription(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  const sub = await getSubscriptionConfig(env);
  const channelLines =
    sub.channels.length === 0
      ? ["Kanal qo'shilmagan."]
      : sub.channels.map((c) => `• ${c.title ?? c.id}`);

  const keyboard: InlineBtn[][] = [];
  if (sub.enabled) {
    keyboard.push([{ text: "🔴 O'chirish", callback_data: "adm:suboff" }]);
  } else if (sub.channels.length > 0) {
    keyboard.push([{ text: "🟢 Yoqish", callback_data: "adm:subon" }]);
  }
  keyboard.push(backRow());

  await editMessageText(
    env,
    chatId,
    messageId,
    [
      "📢 Majburiy obuna",
      "",
      `Holat: ${sub.enabled ? "Yoniq" : "O'chiq"}`,
      "",
      ...channelLines,
      "",
      "Kanal qo'shish/o'chirish: web panel → Obuna bo'limi.",
    ].join("\n"),
    {
      bot: "admin",
      replyMarkup: { inline_keyboard: keyboard },
    },
  );
}

async function toggleSub(
  env: Env,
  chatId: number,
  messageId: number,
  enabled: boolean,
): Promise<void> {
  await setSubscriptionEnabled(env, enabled);
  await showSubscription(env, chatId, messageId);
}

async function showWebPanel(
  env: Env,
  chatId: number,
  messageId: number,
  workerOrigin: string,
): Promise<void> {
  const url = getAdminPanelUrl(
    workerOrigin,
    getWebhookSecret(env),
    getAdminPanelPath(env),
  );

  await editMessageText(
    env,
    chatId,
    messageId,
    ["🌐 Web admin panel", "", url, "", "Havolani hech kimga bermang."].join(
      "\n",
    ),
    {
      bot: "admin",
      replyMarkup: {
        inline_keyboard: [[{ text: "🌐 Panelni ochish", url }], backRow()],
      },
    },
  );
}

async function showHelp(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  await editMessageText(
    env,
    chatId,
    messageId,
    [
      "❓ Yordam",
      "",
      "• Avval ID (5), keyin video yoki caption: 5",
      "• /panel — admin panel",
      "• Tugmalar orqali boshqaring",
      "",
      "Foydalanuvchilar: @Detskebot",
    ].join("\n"),
    {
      bot: "admin",
      replyMarkup: { inline_keyboard: [backRow()] },
    },
  );
}

export async function handleAdminBotCallback(
  env: Env,
  query: import("./types").TelegramCallbackQuery,
  workerOrigin: string,
): Promise<void> {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const data = query.data;

  if (!chatId || !messageId || !data?.startsWith("adm:")) {
    await answerCallbackQuery(env, query.id, undefined, "admin");
    return;
  }

  await answerCallbackQuery(env, query.id, undefined, "admin");
  await handleAdminPanelCallback(
    env,
    chatId,
    messageId,
    data,
    workerOrigin,
  );
}
