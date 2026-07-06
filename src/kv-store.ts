import type { BotStorage, BotStoragePutOptions } from "./bot-storage";
import { getBotStorage, usesSupabaseStorage } from "./bot-storage";
import type { Env } from "./types";

export { getBotStorage, usesSupabaseStorage };

export class KvWriteLimitExceeded extends Error {
  constructor() {
    super("KV daily write limit exceeded");
    this.name = "KvWriteLimitExceeded";
  }
}

export function isKvWriteLimitError(error: unknown): boolean {
  if (error instanceof KvWriteLimitExceeded) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /exceeded|429|limit/i.test(message);
}

/** Keyingi UTC 00:00 — KV kunlik limiti yangilanishi */
export function getKvLimitResetAt(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
}

/** KV limit tekshiruvi — Supabase yoqilganda kerak emas */
export async function assertKvWritable(env: Env): Promise<void> {
  if (usesSupabaseStorage(env)) return;

  const store = getBotStorage(env);
  try {
    await store.put("kv:write_probe", String(Date.now()), { expirationTtl: 120 });
  } catch (error) {
    if (isKvWriteLimitError(error)) {
      throw new KvWriteLimitExceeded();
    }
    throw error;
  }
}

export function formatKvLimitMessage(extra?: string): string {
  const reset = getKvLimitResetAt();
  const tashkent = reset.toLocaleString("uz-UZ", {
    timeZone: "Asia/Tashkent",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const utc = reset.toISOString().replace("T", " ").slice(0, 16) + " UTC";

  return [
    "KV kunlik limiti tugadi (1000 yozuv/kun).",
    "",
    "Natija saqlanmaydi va xabar kechikishi mumkin.",
    `Limit yangilanishi: ${tashkent} (Toshkent)`,
    `UTC: ${utc}`,
    "",
    "Hozir ishlaydi: /ping, /agents (faqat o'qish)",
    extra ?? "Limit yangilangach qayta urinib ko'ring.",
  ].join("\n");
}

export async function putJsonIfChanged(
  store: BotStorage,
  key: string,
  value: unknown,
): Promise<boolean> {
  const serialized = JSON.stringify(value);
  const existing = await store.get(key);
  if (existing === serialized) return false;

  try {
    await store.put(key, serialized);
    return true;
  } catch (error) {
    if (isKvWriteLimitError(error)) {
      console.error(`KV put skipped (${key}): daily write limit`);
      return false;
    }
    throw error;
  }
}

export async function putJsonRequired(
  store: BotStorage,
  key: string,
  value: unknown,
): Promise<void> {
  const serialized = JSON.stringify(value);
  const existing = await store.get(key);
  if (existing === serialized) return;

  try {
    await store.put(key, serialized);
  } catch (error) {
    if (isKvWriteLimitError(error)) {
      throw new KvWriteLimitExceeded();
    }
    throw error;
  }
}

export async function putTextIfChanged(
  store: BotStorage,
  key: string,
  value: string,
  options?: BotStoragePutOptions,
): Promise<boolean> {
  const existing = await store.get(key);
  if (existing === value) return false;

  try {
    await store.put(key, value, options);
    return true;
  } catch (error) {
    if (isKvWriteLimitError(error)) {
      console.error(`KV put skipped (${key}): daily write limit`);
      return false;
    }
    throw error;
  }
}

export async function putTextRequired(
  store: BotStorage,
  key: string,
  value: string,
  options?: BotStoragePutOptions,
): Promise<void> {
  const existing = await store.get(key);
  if (existing === value) return;

  try {
    await store.put(key, value, options);
  } catch (error) {
    if (isKvWriteLimitError(error)) {
      throw new KvWriteLimitExceeded();
    }
    throw error;
  }
}
