import {
  countActiveUsers,
  countNewUsersInPeriod,
  countNewUsersThisMonth,
  getBotStats,
  topNotFound,
  topUsers,
} from "./analytics";
import { getTopMovies, movieName } from "./content";
import { countVideos, listVideos } from "./storage";
import {
  getChannelMemberStats,
  getSubscriptionConfig,
  subscriptionActive,
} from "./subscription";
import { listVipRecords } from "./vip";
import type { Env } from "./types";

export async function buildAdminStatsText(env: Env): Promise<string> {
  const [total, videos, sub, stats, channelStats, vipRecords] =
    await Promise.all([
      countVideos(env),
      listVideos(env),
      getSubscriptionConfig(env),
      getBotStats(env),
      getChannelMemberStats(env),
      listVipRecords(env),
    ]);

  let lastUpload = "—";
  if (videos.length > 0) {
    const last = videos[videos.length - 1]!;
    lastUpload = new Date(last.uploadedAt).toLocaleString("uz-UZ", {
      timeZone: "Asia/Tashkent",
    });
  }

  const activeUsers = countActiveUsers(stats, 7);
  const totalUsers = Object.keys(stats.users).length;
  const top = topUsers(stats, 3);
  const notFound = topNotFound(stats, 5);
  const topMovies = await getTopMovies(env, 5);

  const lines = [
    "📊 Bot statistikasi",
    "",
    "🎬 Kinolar",
    `  Jami: ${total}`,
    `  Oxirgi yuklash: ${lastUpload}`,
    "",
    "👥 Foydalanuvchilar",
    `  Jami: ${totalUsers}`,
    `  Faol (7 kun): ${activeUsers}`,
    `  Yangi (30 kun): ${countNewUsersInPeriod(stats, 30)}`,
    `  Bu oy: ${countNewUsersThisMonth(stats)}`,
    `  So'rovlar: ${stats.totalVideoRequests}`,
    `  Yetkazilgan: ${stats.totalVideoDelivered}`,
    "",
    "📢 Obuna",
    `  Holat: ${subscriptionActive(sub) ? "✅ Yoniq" : "⏸ O'chiq"}`,
    `  Kanallar: ${sub.channels.length}`,
    `  Tekshiruvlar: ${stats.subscriptionChecks}`,
    `  O'tgan: ${stats.subscriptionPassed}`,
    `  ⭐ VIP: ${vipRecords.length}`,
  ];

  if (channelStats.length > 0) {
    lines.push("", "📡 Kanal obunachilari:");
    for (const ch of channelStats) {
      const count =
        ch.memberCount !== null
          ? `${ch.memberCount.toLocaleString("uz-UZ")} obunachi`
          : "noma'lum";
      const botOk = ch.botCanCheck ? "✅" : "⚠️ bot admin emas";
      lines.push(`  ${ch.title}: ${count} ${botOk}`);
    }
  }

  if (topMovies.length > 0) {
    lines.push("", "🏆 Top kinolar:");
    for (const m of topMovies) {
      lines.push(`  #${m.id} ${movieName(m)} — 👁${m.views ?? 0}`);
    }
  }

  if (notFound.length > 0) {
    lines.push("", "❌ Ko'p qidirilgan (topilmadi):");
    for (const n of notFound) {
      lines.push(`  Kod ${n.code} — ${n.count} marta`);
    }
  }

  if (top.length > 0) {
    lines.push("", "👤 Top ko'ruvchilar:");
    for (const u of top) {
      const name = u.name ?? u.username ?? "Foydalanuvchi";
      lines.push(`  ${name} — ${u.videos} ta`);
    }
  }

  return lines.join("\n");
}

export async function getAdminStatsJson(env: Env): Promise<Record<string, unknown>> {
  const [total, sub, stats, channelStats, vipRecords] = await Promise.all([
    countVideos(env),
    getSubscriptionConfig(env),
    getBotStats(env),
    getChannelMemberStats(env),
    listVipRecords(env),
  ]);

  return {
    videos: total,
    users: Object.keys(stats.users).length,
    activeUsers7d: countActiveUsers(stats, 7),
    newUsers30d: countNewUsersInPeriod(stats, 30),
    newUsersMonth: countNewUsersThisMonth(stats),
    videoRequests: stats.totalVideoRequests,
    videoDelivered: stats.totalVideoDelivered,
    subscriptionChecks: stats.subscriptionChecks,
    subscriptionPassed: stats.subscriptionPassed,
    notFoundTop: topNotFound(stats, 10),
    subscription: sub,
    channelStats,
    vipCount: vipRecords.length,
    topUsers: topUsers(stats, 5),
    topMovies: await getTopMovies(env, 10),
  };
}
