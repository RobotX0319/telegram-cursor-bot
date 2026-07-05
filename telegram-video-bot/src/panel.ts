import { logAdminAction, formatLogEntry, getAdminLogs } from "./admin-log";
import {
  addAdminRecord,
  isSuperAdmin,
  listAdminRecords,
  removeAdminRecord,
  roleLabel,
} from "./admin-roles";
import {
  clearAdminState,
  getAdminState,
  setAdminState,
} from "./admin-state";
import {
  clearAdChannel,
  clearAdTemplate,
} from "./ad-channel";
import {
  startAdChannelFlow,
  startAdTemplateFlow,
  toggleAdChannel,
} from "./ad-channel-ui";
import {
  countNewUsersInPeriod,
  countNewUsersThisMonth,
  getBotStats,
  topNotFound,
} from "./analytics";
import {
  createBroadcast,
  formatBroadcastJob,
  listBroadcasts,
  runBroadcast,
} from "./broadcast";
import {
  formatMovieInfo,
  getTopMovies,
  movieName,
  searchMovies,
  updateMovieField,
} from "./content";
import { countVideos, deleteVideo, getVideo, listVideos } from "./storage";
import { buildAdminStatsText } from "./stats";
import {
  formatSubscriptionLines,
  getSubscriptionSummary,
  removeChannelByIndex,
  startChannelAddFlow,
  subscriptionInlineKeyboard,
  toggleSubscription,
} from "./subscription-ui";
import {
  channelsMenuInlineKeyboard,
  formatChannelsMenuLines,
  getChannelsMenuData,
} from "./ad-channel-ui";
import { DEFAULT_TEXTS, getBotTexts } from "./settings";
import {
  answerCallbackQuery,
  editMessageText,
  sendMessage,
} from "./telegram";
import {
  blockUser,
  formatUserLine,
  listUsers,
  unblockUser,
} from "./users";
import {
  addVipUser,
  formatVipRecord,
  listVipRecords,
  removeVipUser,
} from "./vip";
import type { Env } from "./types";

const PAGE = 6;

type Btn = { text: string; url?: string; callback_data?: string };

function back(to = "p:menu"): Btn[] {
  return [{ text: "◀️ Orqaga", callback_data: to }];
}

function kb(rows: Btn[][]): { inline_keyboard: Btn[][] } {
  return { inline_keyboard: rows };
}

export async function sendAdminPanel(
  env: Env,
  chatId: number,
  _workerOrigin: string,
): Promise<void> {
  const total = await countVideos(env);
  const users = await listUsers(env);
  const stats = await getBotStats(env);

  await sendMessage(
    env,
    chatId,
    [
      "🎛 Admin panel",
      "",
      `🎬 Kinolar: ${total}`,
      `👥 Foydalanuvchilar: ${users.length || Object.keys(stats.users).length}`,
      `📊 So'rovlar: ${stats.totalVideoRequests}`,
      "",
      "Bo'limni tanlang 👇",
    ].join("\n"),
    { bot: "admin", replyMarkup: kb(mainMenu()) },
  );
}

function mainMenu(): Btn[][] {
  return [
    [
      { text: "🎬 Kontent", callback_data: "p:cnt" },
      { text: "👥 Foydalanuvchilar", callback_data: "p:usr" },
    ],
    [
      { text: "📊 Statistika", callback_data: "p:st" },
      { text: "📣 Broadcast", callback_data: "p:bc" },
    ],
    [
      { text: "⚙️ Sozlamalar", callback_data: "p:set" },
      { text: "🔐 Xavfsizlik", callback_data: "p:sec" },
    ],
  ];
}

export async function handleAdminPanelCallback(
  env: Env,
  chatId: number,
  messageId: number,
  data: string,
  adminId: number,
  workerOrigin: string,
): Promise<void> {
  const parts = data.split(":");
  const section = parts[1];

  switch (section) {
    case "menu":
      await showMain(env, chatId, messageId);
      break;
    case "cnt":
      await showContentMenu(env, chatId, messageId);
      break;
    case "lst":
      await showMovieList(env, chatId, messageId, Number(parts[2] ?? 0));
      break;
    case "srch":
      await startMovieSearch(env, chatId, adminId);
      break;
    case "bulk":
      await startBulkUpload(env, chatId, adminId);
      break;
    case "minf":
      await showMovieInfo(env, chatId, messageId, Number(parts[2]));
      break;
    case "medit":
      await startMovieEdit(env, chatId, adminId, Number(parts[2]), parts[3]!);
      break;
    case "mdel":
      await confirmMovieDelete(env, chatId, messageId, Number(parts[2]));
      break;
    case "mdelok":
      await doMovieDelete(env, chatId, messageId, Number(parts[2]), adminId);
      break;
    case "usr":
      await showUsersMenu(env, chatId, messageId);
      break;
    case "ulst":
      await showUserList(env, chatId, messageId, Number(parts[2] ?? 0));
      break;
    case "usrc":
      await startUserSearch(env, chatId, adminId);
      break;
    case "uinf":
      await showUserInfo(env, chatId, messageId, Number(parts[2]), adminId);
      break;
    case "ublk":
      await toggleUserBlock(env, chatId, messageId, Number(parts[2]), adminId);
      break;
    case "uvip":
      await startVipForUser(env, chatId, adminId, Number(parts[2]));
      break;
    case "uviprm":
      await removeUserVip(env, chatId, messageId, Number(parts[2]), adminId);
      break;
    case "st":
      await showStatsMenu(env, chatId, messageId);
      break;
    case "stmain":
      await showMainStats(env, chatId, messageId);
      break;
    case "st404":
      await show404Stats(env, chatId, messageId);
      break;
    case "sttop":
      await showTopMovies(env, chatId, messageId);
      break;
    case "stgr":
      await showGrowthStats(env, chatId, messageId);
      break;
    case "bc":
      await showBroadcastMenu(env, chatId, messageId);
      break;
    case "bcnew":
      await startBroadcast(env, chatId, adminId, parts[2] as "all" | "vip");
      break;
    case "bcrun":
      await executeBroadcast(env, chatId, messageId, parts[2]!, adminId);
      break;
    case "bclst":
      await showBroadcastList(env, chatId, messageId);
      break;
    case "set":
      await showSettingsMenu(env, chatId, messageId);
      break;
    case "setsub":
      await showSubSettings(env, chatId, messageId);
      break;
    case "setad":
      await showAdSettings(env, chatId, messageId);
      break;
    case "settxt":
      await showTextSettings(env, chatId, messageId);
      break;
    case "edtxt":
      await startTextEdit(env, chatId, adminId, parts[2]!);
      break;
    case "subon":
      await toggleSub(env, chatId, messageId, true, adminId);
      break;
    case "suboff":
      await toggleSub(env, chatId, messageId, false, adminId);
      break;
    case "chadd":
      await startChannelAddFlow(env, chatId, adminId);
      break;
    case "chdel":
      await removeChannel(env, chatId, messageId, Number(parts[2]), adminId);
      break;
    case "adch":
      await startAdChannelFlow(env, chatId, adminId);
      break;
    case "adtpl":
      await startAdTemplateFlow(env, chatId, adminId);
      break;
    case "adon":
      await toggleAdChannel(env, true);
      await showAdSettings(env, chatId, messageId);
      break;
    case "adoff":
      await toggleAdChannel(env, false);
      await showAdSettings(env, chatId, messageId);
      break;
    case "adchdel":
      await clearAdChannel(env);
      await showAdSettings(env, chatId, messageId);
      break;
    case "adtpldel":
      await clearAdTemplate(env);
      await showAdSettings(env, chatId, messageId);
      break;
    case "sec":
      await showSecurityMenu(env, chatId, messageId, adminId);
      break;
    case "logs":
      await showAdminLogs(env, chatId, messageId);
      break;
    case "admins":
      await showAdminsList(env, chatId, messageId, adminId);
      break;
    case "admadd":
      if (await isSuperAdmin(env, adminId)) {
        await startAddAdmin(env, chatId, adminId, parts[2] as "super" | "admin");
      }
      break;
    case "admdel":
      if (await isSuperAdmin(env, adminId)) {
        await removeAdmin(env, chatId, messageId, Number(parts[2]), adminId);
      }
      break;
    default:
      await editMessageText(env, chatId, messageId, "Noma'lum.", {
        bot: "admin",
        replyMarkup: kb([back()]),
      });
  }
}

export async function handleAdminBotCallback(
  env: Env,
  query: import("./types").TelegramCallbackQuery,
  workerOrigin: string,
): Promise<void> {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const data = query.data;
  const adminId = query.from.id;

  if (!chatId || !messageId || !data) {
    await answerCallbackQuery(env, query.id, undefined, "admin");
    return;
  }

  await answerCallbackQuery(env, query.id, undefined, "admin");

  if (data.startsWith("p:")) {
    await handleAdminPanelCallback(
      env,
      chatId,
      messageId,
      data,
      adminId,
      workerOrigin,
    );
  }
}

async function showMain(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  const total = await countVideos(env);
  const stats = await getBotStats(env);
  await editMessageText(
    env,
    chatId,
    messageId,
    [
      "🎛 Admin panel",
      "",
      `🎬 Kinolar: ${total}`,
      `👥 Foydalanuvchilar: ${Object.keys(stats.users).length}`,
      "",
      "Bo'limni tanlang 👇",
    ].join("\n"),
    { bot: "admin", replyMarkup: kb(mainMenu()) },
  );
}

async function showContentMenu(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  const total = await countVideos(env);
  await editMessageText(
    env,
    chatId,
    messageId,
    [
      "🎬 Kontent boshqaruvi",
      "",
      `Jami: ${total} ta kino`,
      "",
      "• Ro'yxat — barcha kinolar",
      "• Qidiruv — kod, nom, janr",
      "• Toplu yuklash — bir nechta kod",
      "",
      "Yuklash: ID yuboring (masalan: 5), keyin video.",
    ].join("\n"),
    {
      bot: "admin",
      replyMarkup: kb([
        [
          { text: "📋 Ro'yxat", callback_data: "p:lst:0" },
          { text: "🔍 Qidiruv", callback_data: "p:srch" },
        ],
        [{ text: "📦 Toplu yuklash", callback_data: "p:bulk" }],
        back(),
      ]),
    },
  );
}

async function showMovieList(
  env: Env,
  chatId: number,
  messageId: number,
  page: number,
): Promise<void> {
  const movies = await listVideos(env);
  if (movies.length === 0) {
    await editMessageText(env, chatId, messageId, "📋 Hozircha kino yo'q.", {
      bot: "admin",
      replyMarkup: kb([back("p:cnt")]),
    });
    return;
  }

  const pages = Math.ceil(movies.length / PAGE);
  const p = Math.max(0, Math.min(page, pages - 1));
  const slice = movies.slice(p * PAGE, (p + 1) * PAGE);

  const lines = slice.map(
    (m) => `#${m.id} · ${movieName(m)} · 👁${m.views ?? 0}`,
  );
  const rows: Btn[][] = slice.map((m) => [
    { text: `ℹ️ #${m.id}`, callback_data: `p:minf:${m.id}` },
    { text: "🗑", callback_data: `p:mdel:${m.id}` },
  ]);

  const nav: Btn[] = [];
  if (p > 0) nav.push({ text: "⬅️", callback_data: `p:lst:${p - 1}` });
  if (p < pages - 1) nav.push({ text: "➡️", callback_data: `p:lst:${p + 1}` });
  if (nav.length) rows.push(nav);
  rows.push(back("p:cnt"));

  await editMessageText(
    env,
    chatId,
    messageId,
    [`📋 Kinolar (${movies.length})`, `Sahifa ${p + 1}/${pages}`, "", ...lines].join(
      "\n",
    ),
    { bot: "admin", replyMarkup: kb(rows) },
  );
}

async function startMovieSearch(
  env: Env,
  chatId: number,
  adminId: number,
): Promise<void> {
  await setAdminState(env, adminId, "await_movie_search");
  await sendMessage(
    env,
    chatId,
    "🔍 Qidiruv — kod, nom yoki janr yuboring.\n\nBekor: /cancel",
    { bot: "admin" },
  );
}

async function startBulkUpload(
  env: Env,
  chatId: number,
  adminId: number,
): Promise<void> {
  await setAdminState(env, adminId, "await_bulk_ids");
  await sendMessage(
    env,
    chatId,
    [
      "📦 Toplu yuklash",
      "",
      "Kino kodlarini yuboring:",
      "1, 2, 3, 4",
      "yoki har birini yangi qatorda",
      "",
      "Keyin har bir kod uchun videoni ketma-ket yuboring.",
      "",
      "Bekor: /cancel",
    ].join("\n"),
    { bot: "admin" },
  );
}

async function showMovieInfo(
  env: Env,
  chatId: number,
  messageId: number,
  id: number,
): Promise<void> {
  const movie = await getVideo(env, id);
  if (!movie) {
    await editMessageText(env, chatId, messageId, `Kino topilmadi: ${id}`, {
      bot: "admin",
      replyMarkup: kb([back("p:lst:0")]),
    });
    return;
  }

  await editMessageText(
    env,
    chatId,
    messageId,
    formatMovieInfo(movie, true),
    {
      bot: "admin",
      replyMarkup: kb([
        [
          { text: "✏️ Nom", callback_data: `p:medit:${id}:name` },
          { text: "📝 Tavsif", callback_data: `p:medit:${id}:description` },
        ],
        [
          { text: "🎭 Janr", callback_data: `p:medit:${id}:genre` },
          { text: "📅 Yil", callback_data: `p:medit:${id}:year` },
        ],
        [
          { text: "🗑 O'chirish", callback_data: `p:mdel:${id}` },
          { text: "📋 Ro'yxat", callback_data: "p:lst:0" },
        ],
        back("p:cnt"),
      ]),
    },
  );
}

async function startMovieEdit(
  env: Env,
  chatId: number,
  adminId: number,
  id: number,
  field: string,
): Promise<void> {
  const labels: Record<string, string> = {
    name: "nom",
    description: "tavsif",
    genre: "janr",
    year: "yil",
  };
  await setAdminState(env, adminId, "await_movie_edit", { movieId: id, field });
  await sendMessage(
    env,
    chatId,
    `✏️ Kino #${id} — yangi ${labels[field] ?? field} yuboring.\n\nBekor: /cancel`,
    { bot: "admin" },
  );
}

async function confirmMovieDelete(
  env: Env,
  chatId: number,
  messageId: number,
  id: number,
): Promise<void> {
  const movie = await getVideo(env, id);
  await editMessageText(
    env,
    chatId,
    messageId,
    [`🗑 Kino #${id} o'chirilsinmi?`, "", movie ? movieName(movie) : ""].join(
      "\n",
    ),
    {
      bot: "admin",
      replyMarkup: kb([
        [
          { text: "✅ Ha", callback_data: `p:mdelok:${id}` },
          { text: "❌ Yo'q", callback_data: `p:minf:${id}` },
        ],
      ]),
    },
  );
}

async function doMovieDelete(
  env: Env,
  chatId: number,
  messageId: number,
  id: number,
  adminId: number,
): Promise<void> {
  const ok = await deleteVideo(env, id);
  if (ok) {
    await logAdminAction(env, adminId, "kino_o'chirish", `#${id}`);
  }
  await editMessageText(
    env,
    chatId,
    messageId,
    ok ? `✅ Kino #${id} o'chirildi.` : `Kino topilmadi: ${id}`,
    {
      bot: "admin",
      replyMarkup: kb([
        [{ text: "📋 Ro'yxat", callback_data: "p:lst:0" }],
        back("p:cnt"),
      ]),
    },
  );
}

async function showUsersMenu(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  const users = await listUsers(env);
  const vips = await listVipRecords(env);
  await editMessageText(
    env,
    chatId,
    messageId,
    [
      "👥 Foydalanuvchilar",
      "",
      `Jami: ${users.length}`,
      `⭐ VIP: ${vips.length}`,
      "",
      "Ro'yxat, qidiruv, bloklash va VIP boshqaruvi.",
    ].join("\n"),
    {
      bot: "admin",
      replyMarkup: kb([
        [
          { text: "📋 Ro'yxat", callback_data: "p:ulst:0" },
          { text: "🔍 Qidiruv", callback_data: "p:usrc" },
        ],
        back(),
      ]),
    },
  );
}

async function showUserList(
  env: Env,
  chatId: number,
  messageId: number,
  page: number,
): Promise<void> {
  const users = await listUsers(env);
  if (users.length === 0) {
    await editMessageText(env, chatId, messageId, "Foydalanuvchi yo'q.", {
      bot: "admin",
      replyMarkup: kb([back("p:usr")]),
    });
    return;
  }

  const pages = Math.ceil(users.length / PAGE);
  const p = Math.max(0, Math.min(page, pages - 1));
  const slice = users.slice(p * PAGE, (p + 1) * PAGE);

  const lines = slice.map(formatUserLine);
  const rows: Btn[][] = slice.map((u) => [
    { text: `👤 ${u.id}`, callback_data: `p:uinf:${u.id}` },
  ]);

  const nav: Btn[] = [];
  if (p > 0) nav.push({ text: "⬅️", callback_data: `p:ulst:${p - 1}` });
  if (p < pages - 1) nav.push({ text: "➡️", callback_data: `p:ulst:${p + 1}` });
  if (nav.length) rows.push(nav);
  rows.push(back("p:usr"));

  await editMessageText(
    env,
    chatId,
    messageId,
    [`👥 Foydalanuvchilar`, `Sahifa ${p + 1}/${pages}`, "", ...lines].join(
      "\n",
    ),
    { bot: "admin", replyMarkup: kb(rows) },
  );
}

async function startUserSearch(
  env: Env,
  chatId: number,
  adminId: number,
): Promise<void> {
  await setAdminState(env, adminId, "await_user_search");
  await sendMessage(
    env,
    chatId,
    "🔍 ID, ism yoki username yuboring.\n\nBekor: /cancel",
    { bot: "admin" },
  );
}

async function showUserInfo(
  env: Env,
  chatId: number,
  messageId: number,
  userId: number,
  adminId: number,
): Promise<void> {
  const users = await listUsers(env);
  const user = users.find((u) => u.id === userId);
  const stats = await getBotStats(env);
  const stat = stats.users[String(userId)];
  const isVip = await listVipRecords(env).then((r) =>
    r.some((v) => v.userId === String(userId)),
  );

  const lines = [
    `👤 Foydalanuvchi: ${userId}`,
    user?.name ? `Ism: ${user.name}` : null,
    user?.username ? `@${user.username}` : null,
    `Qo'shilgan: ${stat?.firstSeen ? new Date(stat.firstSeen).toLocaleDateString("uz-UZ") : "—"}`,
    `Oxirgi faollik: ${user?.lastSeen ?? stat?.lastSeen ?? "—"}`,
    `Ko'rgan kinolar: ${user?.videosWatched ?? stat?.videos ?? 0}`,
    user?.blocked ? "🚫 BLOKLANGAN" : "✅ Faol",
    isVip ? "⭐ VIP" : null,
  ];

  const rows: Btn[][] = [
    [
      {
        text: user?.blocked ? "✅ Blokdan chiqarish" : "🚫 Bloklash",
        callback_data: `p:ublk:${userId}`,
      },
    ],
  ];

  if (isVip) {
    rows.push([
      { text: "❌ VIP olib tashlash", callback_data: `p:uviprm:${userId}` },
    ]);
  } else {
    rows.push([{ text: "⭐ VIP berish", callback_data: `p:uvip:${userId}` }]);
  }
  rows.push(back("p:ulst:0"));

  await editMessageText(env, chatId, messageId, lines.filter(Boolean).join("\n"), {
    bot: "admin",
    replyMarkup: kb(rows),
  });
}

async function toggleUserBlock(
  env: Env,
  chatId: number,
  messageId: number,
  userId: number,
  adminId: number,
): Promise<void> {
  const users = await listUsers(env);
  const user = users.find((u) => u.id === userId);
  if (user?.blocked) {
    await unblockUser(env, userId);
    await logAdminAction(env, adminId, "blokdan_chiqarish", String(userId));
  } else {
    await blockUser(env, userId, adminId);
    await logAdminAction(env, adminId, "bloklash", String(userId));
  }
  await showUserInfo(env, chatId, messageId, userId, adminId);
}

async function startVipForUser(
  env: Env,
  chatId: number,
  adminId: number,
  userId: number,
): Promise<void> {
  await setAdminState(env, adminId, "await_vip_expiry", { vipUserId: userId });
  await sendMessage(
    env,
    chatId,
    [
      `⭐ VIP berish: ${userId}`,
      "",
      "Muddat yuboring:",
      "• 30 — 30 kun",
      "• cheksiz — abadiy",
      "• 2026-12-31 — aniq sana",
      "",
      "Bekor: /cancel",
    ].join("\n"),
    { bot: "admin" },
  );
}

async function removeUserVip(
  env: Env,
  chatId: number,
  messageId: number,
  userId: number,
  adminId: number,
): Promise<void> {
  await removeVipUser(env, userId);
  await logAdminAction(env, adminId, "vip_olib_tashlash", String(userId));
  await showUserInfo(env, chatId, messageId, userId, adminId);
}

async function showStatsMenu(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  await editMessageText(
    env,
    chatId,
    messageId,
    "📊 Statistika va monitoring",
    {
      bot: "admin",
      replyMarkup: kb([
        [
          { text: "📈 Umumiy", callback_data: "p:stmain" },
          { text: "🏆 Top kinolar", callback_data: "p:sttop" },
        ],
        [
          { text: "❌ Topilmadi (404)", callback_data: "p:st404" },
          { text: "📅 O'sish", callback_data: "p:stgr" },
        ],
        back(),
      ]),
    },
  );
}

async function showMainStats(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  const text = await buildAdminStatsText(env);
  await editMessageText(env, chatId, messageId, text, {
    bot: "admin",
    replyMarkup: kb([back("p:st")]),
  });
}

async function show404Stats(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  const stats = await getBotStats(env);
  const top = topNotFound(stats, 15);
  const lines =
    top.length === 0
      ? ["Hech qanday 404 yozuvi yo'q."]
      : top.map((t, i) => `${i + 1}. Kod ${t.code} — ${t.count} marta`);

  await editMessageText(
    env,
    chatId,
    messageId,
    ["❌ Topilmagan kodlar (404)", "", "Qaysi kinoni qo'shish kerak:", "", ...lines].join(
      "\n",
    ),
    { bot: "admin", replyMarkup: kb([back("p:st")]) },
  );
}

async function showTopMovies(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  const top = await getTopMovies(env, 15);
  const lines =
    top.length === 0
      ? ["Hozircha ma'lumot yo'q."]
      : top.map(
          (m, i) => `${i + 1}. #${m.id} ${movieName(m)} — 👁${m.views ?? 0}`,
        );

  await editMessageText(
    env,
    chatId,
    messageId,
    ["🏆 Eng ko'p ko'rilgan kinolar", "", ...lines].join("\n"),
    { bot: "admin", replyMarkup: kb([back("p:st")]) },
  );
}

async function showGrowthStats(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  const stats = await getBotStats(env);
  await editMessageText(
    env,
    chatId,
    messageId,
    [
      "📅 Foydalanuvchilar o'sishi",
      "",
      `Bugun (24s): ${countNewUsersInPeriod(stats, 1)}`,
      `7 kun: ${countNewUsersInPeriod(stats, 7)}`,
      `30 kun: ${countNewUsersInPeriod(stats, 30)}`,
      `Bu oy: ${countNewUsersThisMonth(stats)}`,
      `Jami: ${Object.keys(stats.users).length}`,
    ].join("\n"),
    { bot: "admin", replyMarkup: kb([back("p:st")]) },
  );
}

async function showBroadcastMenu(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  await editMessageText(
    env,
    chatId,
    messageId,
    [
      "📣 Broadcast — xabar yuborish",
      "",
      "Barchaga yoki faqat VIP'larga.",
      "Matn, rasm yoki video bilan.",
      "Rejalashtirish mumkin.",
    ].join("\n"),
    {
      bot: "admin",
      replyMarkup: kb([
        [
          { text: "📨 Hammaga", callback_data: "p:bcnew:all" },
          { text: "⭐ VIP", callback_data: "p:bcnew:vip" },
        ],
        [{ text: "📋 Tarix", callback_data: "p:bclst" }],
        back(),
      ]),
    },
  );
}

async function startBroadcast(
  env: Env,
  chatId: number,
  adminId: number,
  target: "all" | "vip",
): Promise<void> {
  await setAdminState(env, adminId, "await_broadcast_text", {
    broadcastTarget: target,
  });
  const label = target === "vip" ? "VIP'larga" : "Hammaga";
  await sendMessage(
    env,
    chatId,
    [
      `📣 Broadcast (${label})`,
      "",
      "Xabar matnini yuboring.",
      "Keyin rasm/video yuborishingiz mumkin (ixtiyoriy).",
      "Rejalash uchun: vaqt | matn",
      "Masalan: 2026-07-06 10:00 | Salom!",
      "",
      "Bekor: /cancel",
    ].join("\n"),
    { bot: "admin" },
  );
}

async function showBroadcastList(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  const jobs = await listBroadcasts(env).then((j) => j.slice(0, 8));
  const lines =
    jobs.length === 0
      ? ["Broadcast tarixi bo'sh."]
      : jobs.map((j, i) => `${i + 1}.\n${formatBroadcastJob(j)}`);

  const rows: Btn[][] = jobs
    .filter((j) => j.status === "pending" && !j.scheduledAt)
    .slice(0, 3)
    .map((j) => [
      { text: `▶️ Yuborish`, callback_data: `p:bcrun:${j.id}` },
    ]);

  rows.push(back("p:bc"));

  await editMessageText(
    env,
    chatId,
    messageId,
    ["📋 Broadcast tarixi", "", ...lines].join("\n\n"),
    { bot: "admin", replyMarkup: kb(rows) },
  );
}

async function executeBroadcast(
  env: Env,
  chatId: number,
  messageId: number,
  jobId: string,
  adminId: number,
): Promise<void> {
  await editMessageText(env, chatId, messageId, "⏳ Yuborilmoqda...", {
    bot: "admin",
  });
  const job = await runBroadcast(env, jobId);
  if (job) {
    await logAdminAction(
      env,
      adminId,
      "broadcast",
      `${job.stats.sent}/${job.stats.total}`,
    );
  }
  await editMessageText(
    env,
    chatId,
    messageId,
    job ? formatBroadcastJob(job) : "Broadcast topilmadi.",
    { bot: "admin", replyMarkup: kb([back("p:bc")]) },
  );
}

async function showSettingsMenu(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  await editMessageText(
    env,
    chatId,
    messageId,
    "⚙️ Sozlamalar",
    {
      bot: "admin",
      replyMarkup: kb([
        [
          { text: "📢 Obuna", callback_data: "p:setsub" },
          { text: "📡 Reklama", callback_data: "p:setad" },
        ],
        [{ text: "💬 Bot matnlari", callback_data: "p:settxt" }],
        back(),
      ]),
    },
  );
}

async function showSubSettings(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  const { config, vipCount } = await getSubscriptionSummary(env);
  const keyboard: Btn[][] = subscriptionInlineKeyboard(config).map((row) =>
    row.map((b) => ({
      text: b.text,
      callback_data: b.callback_data
        ?.replace("adm:subon", "p:subon")
        .replace("adm:suboff", "p:suboff")
        .replace("adm:ch:add", "p:chadd")
        .replace(/^adm:ch:del:(\d+)$/, "p:chdel:$1") ?? "p:set",
    })),
  );
  keyboard.push(back("p:set"));

  await editMessageText(
    env,
    chatId,
    messageId,
    [
      ...formatSubscriptionLines(config, vipCount),
      "",
      "Kanal qo'shing — majburiy obuna ishlaydi.",
    ].join("\n"),
    { bot: "admin", replyMarkup: kb(keyboard) },
  );
}

async function showAdSettings(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  const { subConfig, adConfig, vipCount } = await getChannelsMenuData(env);
  const keyboard: Btn[][] = channelsMenuInlineKeyboard(subConfig, adConfig).map(
    (row) =>
      row.map((b) => ({
        text: b.text,
        callback_data: b.callback_data
          ?.replace("adm:ad:ch", "p:adch")
          .replace("adm:ad:tpl", "p:adtpl")
          .replace("adm:ad:on", "p:adon")
          .replace("adm:ad:off", "p:adoff")
          .replace("adm:ad:chdel", "p:adchdel")
          .replace("adm:ad:tpldel", "p:adtpldel") ?? "p:set",
      })),
  );
  keyboard.push(back("p:set"));

  await editMessageText(
    env,
    chatId,
    messageId,
    formatChannelsMenuLines(subConfig, adConfig, vipCount).join("\n"),
    { bot: "admin", replyMarkup: kb(keyboard) },
  );
}

async function showTextSettings(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  const texts = await getBotTexts(env);
  await editMessageText(
    env,
    chatId,
    messageId,
    [
      "💬 Bot matnlari",
      "",
      "Welcome, help, notFound va blocked matnlari.",
      "O'zgaruvchi: {total}, {code}",
    ].join("\n"),
    {
      bot: "admin",
      replyMarkup: kb([
        [
          { text: "👋 Welcome", callback_data: "p:edtxt:welcome" },
          { text: "❓ Help", callback_data: "p:edtxt:help" },
        ],
        [
          { text: "❌ Not found", callback_data: "p:edtxt:notFound" },
          { text: "🚫 Blocked", callback_data: "p:edtxt:blocked" },
        ],
        back("p:set"),
      ]),
    },
  );
}

async function startTextEdit(
  env: Env,
  chatId: number,
  adminId: number,
  key: string,
): Promise<void> {
  const texts = await getBotTexts(env);
  const current =
    key in texts
      ? String(texts[key as keyof typeof texts])
      : DEFAULT_TEXTS[key as keyof typeof DEFAULT_TEXTS] ?? "";
  await setAdminState(env, adminId, "await_text_edit", { textKey: key });
  await sendMessage(
    env,
    chatId,
    [`✏️ Yangi matn (${key}):`, "", `Hozirgi:`, current.slice(0, 500), "", "Bekor: /cancel"].join(
      "\n",
    ),
    { bot: "admin" },
  );
}

async function toggleSub(
  env: Env,
  chatId: number,
  messageId: number,
  enabled: boolean,
  adminId: number,
): Promise<void> {
  await toggleSubscription(env, enabled);
  await logAdminAction(env, adminId, "obuna", enabled ? "yoqildi" : "o'chirildi");
  await showSubSettings(env, chatId, messageId);
}

async function removeChannel(
  env: Env,
  chatId: number,
  messageId: number,
  index: number,
  adminId: number,
): Promise<void> {
  await removeChannelByIndex(env, index);
  await logAdminAction(env, adminId, "kanal_o'chirish", String(index));
  await showSubSettings(env, chatId, messageId);
}

async function showSecurityMenu(
  env: Env,
  chatId: number,
  messageId: number,
  adminId: number,
): Promise<void> {
  const super_ = await isSuperAdmin(env, adminId);
  const rows: Btn[][] = [
    [{ text: "📜 Admin loglar", callback_data: "p:logs" }],
    [{ text: "👑 Adminlar", callback_data: "p:admins" }],
  ];
  if (super_) {
    rows.push([
      { text: "➕ Admin qo'shish", callback_data: "p:admadd:admin" },
    ]);
  }
  rows.push(back());

  await editMessageText(
    env,
    chatId,
    messageId,
    [
      "🔐 Xavfsizlik",
      "",
      "Admin loglar va adminlar ro'yxati.",
      super_ ? "Siz super-adminsiz." : "Siz oddiy adminsiz.",
    ].join("\n"),
    { bot: "admin", replyMarkup: kb(rows) },
  );
}

async function showAdminLogs(
  env: Env,
  chatId: number,
  messageId: number,
): Promise<void> {
  const logs = await getAdminLogs(env);
  const lines =
    logs.length === 0
      ? ["Log yo'q."]
      : logs.slice(0, 12).map(formatLogEntry);

  await editMessageText(
    env,
    chatId,
    messageId,
    ["📜 Admin loglar", "", ...lines].join("\n\n"),
    { bot: "admin", replyMarkup: kb([back("p:sec")]) },
  );
}

async function showAdminsList(
  env: Env,
  chatId: number,
  messageId: number,
  adminId: number,
): Promise<void> {
  const admins = await listAdminRecords(env);
  const super_ = await isSuperAdmin(env, adminId);
  const lines = admins.map(
    (a) => `${roleLabel(a.role)} — ${a.userId}${a.name ? ` (${a.name})` : ""}`,
  );

  const rows: Btn[][] = super_
    ? admins
        .filter((a) => a.role !== "super" && a.userId !== adminId)
        .slice(0, 5)
        .map((a) => [
          {
            text: `🗑 ${a.userId}`,
            callback_data: `p:admdel:${a.userId}`,
          },
        ])
    : [];

  rows.push(back("p:sec"));

  await editMessageText(
    env,
    chatId,
    messageId,
    ["👑 Adminlar", "", ...lines].join("\n"),
    { bot: "admin", replyMarkup: kb(rows) },
  );
}

async function startAddAdmin(
  env: Env,
  chatId: number,
  adminId: number,
  role: "super" | "admin",
): Promise<void> {
  await setAdminState(env, adminId, "await_admin_add", { adminRole: role });
  await sendMessage(
    env,
    chatId,
    `➕ Yangi ${roleLabel(role)} — Telegram ID yuboring.\n\nBekor: /cancel`,
    { bot: "admin" },
  );
}

async function removeAdmin(
  env: Env,
  chatId: number,
  messageId: number,
  userId: number,
  adminId: number,
): Promise<void> {
  const ok = await removeAdminRecord(env, userId);
  if (ok) await logAdminAction(env, adminId, "admin_o'chirish", String(userId));
  await showAdminsList(env, chatId, messageId, adminId);
}

export async function handlePanelStateInput(
  env: Env,
  chatId: number,
  adminId: number,
  text: string,
): Promise<boolean> {
  const state = await getAdminState(env, adminId);
  if (!state) return false;

  switch (state.mode) {
    case "await_movie_search": {
      const results = await searchMovies(env, text);
      await clearAdminState(env, adminId);
      if (results.length === 0) {
        await sendMessage(env, chatId, "Hech narsa topilmadi.", { bot: "admin" });
        return true;
      }
      const lines = results
        .slice(0, 15)
        .map((m) => `#${m.id} · ${movieName(m)} · ${m.genre ?? "—"}`);
      await sendMessage(
        env,
        chatId,
        ["🔍 Natijalar:", "", ...lines].join("\n"),
        { bot: "admin" },
      );
      return true;
    }

    case "await_bulk_ids": {
      const { parseBulkIds } = await import("./content");
      const ids = parseBulkIds(text);
      if (ids.length === 0) {
        await sendMessage(env, chatId, "Kodlar topilmadi. Masalan: 1,2,3", {
          bot: "admin",
        });
        return true;
      }
      await setAdminState(env, adminId, "await_bulk_ids", { bulkQueue: ids });
      await sendMessage(
        env,
        chatId,
        [
          `✅ ${ids.length} ta kod navbatga qo'yildi:`,
          ids.join(", "),
          "",
          `Endi ID ${ids[0]} uchun videoni yuboring.`,
        ].join("\n"),
        { bot: "admin" },
      );
      return true;
    }

    case "await_movie_edit": {
      const id = state.data?.movieId;
      const field = state.data?.field;
      if (!id || !field) return false;
      const result = await updateMovieField(env, id, field, text);
      await clearAdminState(env, adminId);
      if (!result.ok) {
        await sendMessage(env, chatId, result.error, { bot: "admin" });
        return true;
      }
      await logAdminAction(env, adminId, "kino_tahrir", `#${id} ${field}`);
      await sendMessage(
        env,
        chatId,
        `✅ Kino #${id} yangilandi.\n\n${formatMovieInfo(result.video, true)}`,
        { bot: "admin" },
      );
      return true;
    }

    case "await_broadcast_text": {
      const target = state.data?.broadcastTarget ?? "all";
      let broadcastText = text;
      let scheduledAt: string | undefined;

      const scheduleMatch = text.match(/^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2})\s*\|\s*(.+)$/s);
      if (scheduleMatch) {
        scheduledAt = new Date(scheduleMatch[1]!.replace(" ", "T")).toISOString();
        broadcastText = scheduleMatch[2]!.trim();
      }

      const job = await createBroadcast(env, {
        text: broadcastText,
        target,
        createdBy: adminId,
        scheduledAt,
      });
      await setAdminState(env, adminId, "await_broadcast_media", {
        broadcastId: job.id,
      });
      await sendMessage(
        env,
        chatId,
        scheduledAt
          ? `📅 Rejalashtirildi: ${scheduleMatch![1]}\n\nRasm/video yuboring (ixtiyoriy) yoki /skip`
          : "✅ Matn saqlandi.\n\nRasm/video yuboring (ixtiyoriy) yoki /skip",
        { bot: "admin" },
      );
      return true;
    }

    case "await_text_edit": {
      const key = state.data?.textKey;
      if (!key) return false;
      const { updateBotText } = await import("./settings");
      await updateBotText(
        env,
        key as "welcome" | "help" | "notFound" | "blocked",
        text,
      );
      await clearAdminState(env, adminId);
      await logAdminAction(env, adminId, "matn_tahrir", key);
      await sendMessage(env, chatId, `✅ ${key} matni yangilandi.`, {
        bot: "admin",
      });
      return true;
    }

    case "await_admin_add": {
      const role = (state.data?.adminRole ?? "admin") as "super" | "admin";
      const id = Number.parseInt(text.trim(), 10);
      if (!Number.isFinite(id)) {
        await sendMessage(env, chatId, "Noto'g'ri ID", { bot: "admin" });
        return true;
      }
      const result = await addAdminRecord(env, id, role, adminId);
      await clearAdminState(env, adminId);
      if (result.ok) {
        await logAdminAction(env, adminId, "admin_qo'shish", `${id} (${role})`);
      }
      await sendMessage(
        env,
        chatId,
        result.ok ? `✅ Admin qo'shildi: ${id}` : result.error,
        { bot: "admin" },
      );
      return true;
    }

    case "await_user_search": {
      const { searchUsers } = await import("./users");
      const results = await searchUsers(env, text);
      await clearAdminState(env, adminId);
      if (results.length === 0) {
        await sendMessage(env, chatId, "Topilmadi.", { bot: "admin" });
        return true;
      }
      const lines = results.slice(0, 15).map(formatUserLine);
      await sendMessage(
        env,
        chatId,
        ["🔍 Natijalar:", "", ...lines].join("\n"),
        { bot: "admin" },
      );
      return true;
    }

    case "await_vip_expiry": {
      const userId = state.data?.vipUserId;
      if (!userId) return false;
      const { parseVipExpiry } = await import("./vip");
      const expiresAt = parseVipExpiry(text);
      const result = await addVipUser(env, userId, adminId, expiresAt);
      await clearAdminState(env, adminId);
      if (result.ok) {
        await logAdminAction(env, adminId, "vip_berish", String(userId));
      }
      await sendMessage(
        env,
        chatId,
        result.ok
          ? `✅ VIP berildi: ${userId}${expiresAt ? `\nMuddat: ${expiresAt.slice(0, 10)}` : " (cheksiz)"}`
          : result.error,
        { bot: "admin" },
      );
      return true;
    }

    default:
      return false;
  }
}

export async function handleBroadcastMedia(
  env: Env,
  chatId: number,
  adminId: number,
  fileId: string,
  mediaType: "photo" | "video",
): Promise<boolean> {
  const state = await getAdminState(env, adminId);
  if (state?.mode !== "await_broadcast_media" || !state.data?.broadcastId) {
    return false;
  }

  const { getBroadcast, saveBroadcast } = await import("./broadcast");
  const job = await getBroadcast(env, state.data.broadcastId);
  if (!job) {
    await clearAdminState(env, adminId);
    return true;
  }

  job.mediaFileId = fileId;
  job.mediaType = mediaType;
  await saveBroadcast(env, job);
  await clearAdminState(env, adminId);

  if (!job.scheduledAt) {
    await runBroadcast(env, job.id);
    await logAdminAction(env, adminId, "broadcast", job.id);
    await sendMessage(
      env,
      chatId,
      `✅ Broadcast yuborildi.\n\n${formatBroadcastJob(job)}`,
      { bot: "admin" },
    );
  } else {
    await sendMessage(
      env,
      chatId,
      `✅ Broadcast rejalashtirildi.\n\n${formatBroadcastJob(job)}`,
      { bot: "admin" },
    );
  }
  return true;
}

export async function skipBroadcastMedia(
  env: Env,
  chatId: number,
  adminId: number,
): Promise<boolean> {
  const state = await getAdminState(env, adminId);
  if (state?.mode !== "await_broadcast_media" || !state.data?.broadcastId) {
    return false;
  }

  const jobId = state.data.broadcastId;
  await clearAdminState(env, adminId);

  const { getBroadcast, runBroadcast } = await import("./broadcast");
  const job = await getBroadcast(env, jobId);
  if (job && !job.scheduledAt) {
    await runBroadcast(env, jobId);
    await logAdminAction(env, adminId, "broadcast", jobId);
    await sendMessage(
      env,
      chatId,
      job ? `✅ Broadcast yuborildi.\n\n${formatBroadcastJob(job)}` : "Xato",
      { bot: "admin" },
    );
  } else if (job) {
    await sendMessage(
      env,
      chatId,
      `✅ Rejalashtirildi.\n\n${formatBroadcastJob(job)}`,
      { bot: "admin" },
    );
  }
  return true;
}

export { searchMovies };
