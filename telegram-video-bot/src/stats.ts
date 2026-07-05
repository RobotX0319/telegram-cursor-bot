import {
  countActiveUsers,
  getBotStats,
  topUsers,
} from "./analytics";
import { countVideos, listVideos } from "./storage";
import {
  getChannelMemberStats,
  getSubscriptionConfig,
  subscriptionActive,
} from "./subscription";
import { listVipUserIds } from "./vip";
import type { Env } from "./types";

export async function buildAdminStatsText(env: Env): Promise<string> {
  const [total, videos, sub, stats, channelStats, vipCount] =
    await Promise.all([
      countVideos(env),
      listVideos(env),
      getSubscriptionConfig(env),
      getBotStats(env),
      getChannelMemberStats(env),
      listVipUserIds(env),
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

  const lines = [
    "📊 Bot statistikasi",
    "",
    "🎬 Videolar",
    `  Jami: ${total}`,
    `  Oxirgi yuklash: ${lastUpload}`,
    "",
    "👥 Foydalanuvchilar",
    `  Bot foydalanuvchilari: ${totalUsers}`,
    `  Faol (7 kun): ${activeUsers}`,
    `  Video so'rovlar: ${stats.totalVideoRequests}`,
    `  Yetkazilgan: ${stats.totalVideoDelivered}`,
    "",
    "📢 Obuna",
    `  Holat: ${subscriptionActive(sub) ? "✅ Yoniq" : "⏸ O'chiq"}`,
    `  Kanallar: ${sub.channels.length}`,
    `  Tekshiruvlar: ${stats.subscriptionChecks}`,
    `  O'tgan: ${stats.subscriptionPassed}`,
    `  ⭐ VIP: ${vipCount.length}`,
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

  if (top.length > 0) {
    lines.push("", "🏆 Top ko'ruvchilar:");
    for (const u of top) {
      const name = u.name ?? u.username ?? "Foydalanuvchi";
      lines.push(`  🥇 ${name} — ${u.videos} ta video`);
    }
  }

  return lines.join("\n");
}

export async function getAdminStatsJson(env: Env): Promise<Record<string, unknown>> {
  const [total, sub, stats, channelStats, vipCount] = await Promise.all([
    countVideos(env),
    getSubscriptionConfig(env),
    getBotStats(env),
    getChannelMemberStats(env),
    listVipUserIds(env),
  ]);

  return {
    videos: total,
    users: Object.keys(stats.users).length,
    activeUsers7d: countActiveUsers(stats, 7),
    videoRequests: stats.totalVideoRequests,
    videoDelivered: stats.totalVideoDelivered,
    subscriptionChecks: stats.subscriptionChecks,
    subscriptionPassed: stats.subscriptionPassed,
    subscription: sub,
    channelStats,
    vipCount: vipCount.length,
    topUsers: topUsers(stats, 5),
  };
}
