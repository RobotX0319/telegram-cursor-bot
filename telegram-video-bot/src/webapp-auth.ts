import { isAdminUser } from "./admins";
import {
  getPanelTokenFromRequest,
  verifyPanelSession,
} from "./panel-session";
import type { Env } from "./types";

function parseInitData(initData: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of initData.split("&")) {
    const [rawKey, rawValue] = part.split("=");
    if (!rawKey) continue;
    map.set(
      decodeURIComponent(rawKey),
      decodeURIComponent(rawValue ?? ""),
    );
  }
  return map;
}

function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(
  key: BufferSource,
  data: string,
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(data),
  );
}

async function webAppSecretKey(botToken: string): Promise<ArrayBuffer> {
  return hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
}

/** Telegram WebApp initData tekshiruvi */
export async function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 86400,
): Promise<{ ok: true; userId: number } | { ok: false; error: string }> {
  if (!initData.trim()) {
    return { ok: false, error: "initData yo'q" };
  }

  const params = parseInitData(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, error: "hash yo'q" };

  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = await webAppSecretKey(botToken);
  const calculated = await hmacSha256(secretKey, dataCheckString);

  if (bufferToHex(calculated) !== hash) {
    return { ok: false, error: "initData noto'g'ri" };
  }

  const authDate = Number.parseInt(params.get("auth_date") ?? "", 10);
  if (!Number.isNaN(authDate)) {
    const age = Math.floor(Date.now() / 1000) - authDate;
    if (age > maxAgeSec) {
      return { ok: false, error: "initData muddati tugagan" };
    }
  }

  const userRaw = params.get("user");
  if (!userRaw) return { ok: false, error: "user yo'q" };

  try {
    const user = JSON.parse(userRaw) as { id?: number };
    if (!user.id) return { ok: false, error: "user id yo'q" };
    return { ok: true, userId: user.id };
  } catch {
    return { ok: false, error: "user JSON xato" };
  }
}

export async function getAdminUserFromInitData(
  env: Env,
  initData: string,
): Promise<number | null> {
  const result = await validateTelegramInitData(
    initData,
    env.TELEGRAM_ADMIN_BOT_TOKEN,
  );
  if (!result.ok) return null;
  return isAdminUser(env, result.userId) ? result.userId : null;
}

export function getInitDataFromRequest(request: Request): string | null {
  const header = request.headers.get("X-Telegram-Init-Data");
  if (header?.trim()) return header.trim();

  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("tgWebAppData");
  return fromQuery?.trim() || null;
}

export async function isAdminRequestAuthorized(
  request: Request,
  env: Env,
): Promise<boolean> {
  const panelToken = getPanelTokenFromRequest(request);
  const session = await verifyPanelSession(env, panelToken);
  if (session.ok && isAdminUser(env, session.userId)) {
    return true;
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (key && key === env.TELEGRAM_WEBHOOK_SECRET) {
    return Boolean(env.ADMIN_PANEL_PASSWORD?.trim());
  }

  return false;
}

export async function resolveLoginUserId(
  request: Request,
  env: Env,
): Promise<number | null> {
  const initData = getInitDataFromRequest(request);
  if (initData) {
    return getAdminUserFromInitData(env, initData);
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (key && key === env.TELEGRAM_WEBHOOK_SECRET) {
    const fallback = env.TELEGRAM_ADMIN_IDS?.split(",")[0]?.trim()
      || env.TELEGRAM_ADMIN_ID?.trim();
    return fallback ? Number.parseInt(fallback, 10) : null;
  }

  return null;
}
