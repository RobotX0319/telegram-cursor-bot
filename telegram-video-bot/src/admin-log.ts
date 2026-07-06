import type { AdminLogEntry, Env } from "./types";

const LOG_KEY = "meta:admin_logs";
const MAX_LOGS = 200;

export async function getAdminLogs(env: Env): Promise<AdminLogEntry[]> {
  const raw = await env.VIDEOS.get(LOG_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as AdminLogEntry[];
  } catch {
    return [];
  }
}

export async function logAdminAction(
  env: Env,
  adminId: number,
  action: string,
  detail?: string,
): Promise<void> {
  const logs = await getAdminLogs(env);
  const entry: AdminLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    adminId,
    action,
    detail,
    at: new Date().toISOString(),
  };
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  await env.VIDEOS.put(LOG_KEY, JSON.stringify(logs));
}

export function formatLogEntry(entry: AdminLogEntry): string {
  const time = new Date(entry.at).toLocaleString("uz-UZ", {
    timeZone: "Asia/Tashkent",
  });
  const detail = entry.detail ? ` — ${entry.detail}` : "";
  return `${time}\n👤 ${entry.adminId}: ${entry.action}${detail}`;
}
