import type { Env, TelegramUser } from "./types";

const STATS_KEY = "meta:bot_stats";

export interface UserStat {
  firstSeen: string;
  lastSeen: string;
  videos: number;
  name?: string;
  username?: string;
}

export interface BotStats {
  totalStarts: number;
  totalVideoRequests: number;
  totalVideoDelivered: number;
  subscriptionChecks: number;
  subscriptionPassed: number;
  notFoundCounts: Record<string, number>;
  users: Record<string, UserStat>;
}

function emptyStats(): BotStats {
  return {
    totalStarts: 0,
    totalVideoRequests: 0,
    totalVideoDelivered: 0,
    subscriptionChecks: 0,
    subscriptionPassed: 0,
    notFoundCounts: {},
    users: {},
  };
}

export async function getBotStats(env: Env): Promise<BotStats> {
  const raw = await env.VIDEOS.get(STATS_KEY);
  if (!raw) return emptyStats();
  try {
    return { ...emptyStats(), ...(JSON.parse(raw) as BotStats) };
  } catch {
    return emptyStats();
  }
}

async function saveBotStats(env: Env, stats: BotStats): Promise<void> {
  await env.VIDEOS.put(STATS_KEY, JSON.stringify(stats));
}

export async function trackUserStart(
  env: Env,
  user: TelegramUser,
): Promise<void> {
  const stats = await getBotStats(env);
  stats.totalStarts += 1;
  const id = String(user.id);
  const now = new Date().toISOString();
  const existing = stats.users[id];
  stats.users[id] = {
    firstSeen: existing?.firstSeen ?? now,
    lastSeen: now,
    videos: existing?.videos ?? 0,
    name: user.first_name ?? existing?.name,
    username: user.username ?? existing?.username,
  };
  await saveBotStats(env, stats);
}

export async function trackVideoRequest(env: Env, userId: number): Promise<void> {
  const stats = await getBotStats(env);
  stats.totalVideoRequests += 1;
  const id = String(userId);
  const now = new Date().toISOString();
  const existing = stats.users[id];
  if (existing) {
    existing.lastSeen = now;
  } else {
    stats.users[id] = { firstSeen: now, lastSeen: now, videos: 0 };
  }
  await saveBotStats(env, stats);
}

export async function trackVideoDelivered(
  env: Env,
  userId: number,
): Promise<void> {
  const stats = await getBotStats(env);
  stats.totalVideoDelivered += 1;
  const id = String(userId);
  const now = new Date().toISOString();
  const existing = stats.users[id];
  if (existing) {
    existing.videos += 1;
    existing.lastSeen = now;
  } else {
    stats.users[id] = { firstSeen: now, lastSeen: now, videos: 1 };
  }
  await saveBotStats(env, stats);
}

export async function trackSubscriptionCheck(
  env: Env,
  passed: boolean,
): Promise<void> {
  const stats = await getBotStats(env);
  stats.subscriptionChecks += 1;
  if (passed) stats.subscriptionPassed += 1;
  await saveBotStats(env, stats);
}

export function countActiveUsers(stats: BotStats, days = 7): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return Object.values(stats.users).filter(
    (u) => new Date(u.lastSeen).getTime() >= cutoff,
  ).length;
}

export function topUsers(stats: BotStats, limit = 5): UserStat[] {
  return Object.values(stats.users)
    .sort((a, b) => b.videos - a.videos)
    .slice(0, limit);
}

export async function trackNotFound(
  env: Env,
  code: number,
): Promise<void> {
  const stats = await getBotStats(env);
  const key = String(code);
  stats.notFoundCounts[key] = (stats.notFoundCounts[key] ?? 0) + 1;
  await saveBotStats(env, stats);
}

export function topNotFound(
  stats: BotStats,
  limit = 10,
): Array<{ code: string; count: number }> {
  return Object.entries(stats.notFoundCounts ?? {})
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function countNewUsersInPeriod(
  stats: BotStats,
  days: number,
): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return Object.values(stats.users).filter(
    (u) => new Date(u.firstSeen).getTime() >= cutoff,
  ).length;
}

export function countNewUsersThisMonth(stats: BotStats): number {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return Object.values(stats.users).filter(
    (u) => new Date(u.firstSeen).getTime() >= monthStart,
  ).length;
}
