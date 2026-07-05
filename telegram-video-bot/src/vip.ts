import type { Env, VipRecord } from "./types";

const VIP_KEY = "config:vip_users";
const VIP_RECORDS_KEY = "config:vip_records";

async function getVipRecords(env: Env): Promise<VipRecord[]> {
  const raw = await env.VIDEOS.get(VIP_RECORDS_KEY);
  if (raw) {
    try {
      const records = JSON.parse(raw) as VipRecord[];
      if (Array.isArray(records)) return records;
    } catch {
      /* migrate */
    }
  }

  const legacy = await env.VIDEOS.get(VIP_KEY);
  if (!legacy) return [];
  try {
    const ids = JSON.parse(legacy) as string[];
    if (!Array.isArray(ids)) return [];
    const now = new Date().toISOString();
    return ids.filter(Boolean).map((id) => ({
      userId: id,
      addedAt: now,
      addedBy: 0,
    }));
  } catch {
    return [];
  }
}

async function saveVipRecords(env: Env, records: VipRecord[]): Promise<void> {
  await env.VIDEOS.put(VIP_RECORDS_KEY, JSON.stringify(records));
  await env.VIDEOS.put(
    VIP_KEY,
    JSON.stringify(records.map((r) => r.userId)),
  );
}

function isExpired(record: VipRecord): boolean {
  if (!record.expiresAt) return false;
  return new Date(record.expiresAt).getTime() < Date.now();
}

export async function listVipRecords(env: Env): Promise<VipRecord[]> {
  const records = await getVipRecords(env);
  return records.filter((r) => !isExpired(r));
}

export async function listVipUserIds(env: Env): Promise<string[]> {
  const records = await listVipRecords(env);
  return records.map((r) => r.userId);
}

export async function isVipUser(env: Env, userId: number): Promise<boolean> {
  const ids = await listVipUserIds(env);
  return ids.includes(String(userId));
}

export async function addVipUser(
  env: Env,
  userId: number,
  addedBy = 0,
  expiresAt?: string,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = String(userId).trim();
  if (!/^\d+$/.test(id)) {
    return { ok: false, error: "Noto'g'ri Telegram ID" };
  }

  const records = await getVipRecords(env);
  const existing = records.find((r) => r.userId === id);
  if (existing && !isExpired(existing)) {
    return { ok: false, error: "Bu mijoz allaqachon VIP" };
  }

  const filtered = records.filter((r) => r.userId !== id);
  filtered.push({
    userId: id,
    expiresAt,
    addedBy,
    addedAt: new Date().toISOString(),
    note,
  });
  await saveVipRecords(env, filtered);
  return { ok: true };
}

export async function removeVipUser(
  env: Env,
  userId: number,
): Promise<boolean> {
  const id = String(userId);
  const records = await getVipRecords(env);
  const next = records.filter((x) => x.userId !== id);
  if (next.length === records.length) return false;
  await saveVipRecords(env, next);
  return true;
}

export function formatVipRecord(record: VipRecord): string {
  const exp = record.expiresAt
    ? new Date(record.expiresAt).toLocaleDateString("uz-UZ", {
        timeZone: "Asia/Tashkent",
      })
    : "♾ Cheksiz";
  return `${record.userId} — ${exp}`;
}

export function parseVipExpiry(text: string): string | undefined {
  const t = text.trim().toLowerCase();
  if (!t || t === "cheksiz" || t === "forever" || t === "0") return undefined;
  const days = Number.parseInt(t, 10);
  if (Number.isFinite(days) && days > 0) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
  }
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  return undefined;
}
