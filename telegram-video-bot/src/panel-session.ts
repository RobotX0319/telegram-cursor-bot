import type { Env } from "./types";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function sessionSecret(env: Env): string {
  return `${env.TELEGRAM_WEBHOOK_SECRET}:${env.ADMIN_PANEL_PASSWORD}`;
}

function encodeBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

async function signPayload(env: Env, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return encodeBase64Url(String.fromCharCode(...new Uint8Array(sig)));
}

async function verifySignature(
  env: Env,
  payload: string,
  signature: string,
): Promise<boolean> {
  const expected = await signPayload(env, payload);
  return expected === signature;
}

export async function createPanelSession(
  env: Env,
  userId: number,
): Promise<string> {
  const payload = JSON.stringify({
    uid: userId,
    exp: Date.now() + SESSION_TTL_MS,
  });
  const signature = await signPayload(env, payload);
  return `${encodeBase64Url(payload)}.${signature}`;
}

export async function verifyPanelSession(
  env: Env,
  token: string | null | undefined,
): Promise<{ ok: true; userId: number } | { ok: false }> {
  if (!token?.trim()) return { ok: false };

  const [payloadPart, signature] = token.trim().split(".");
  if (!payloadPart || !signature) return { ok: false };

  let payloadRaw: string;
  try {
    payloadRaw = decodeBase64Url(payloadPart);
  } catch {
    return { ok: false };
  }

  if (!(await verifySignature(env, payloadRaw, signature))) {
    return { ok: false };
  }

  try {
    const payload = JSON.parse(payloadRaw) as { uid?: number; exp?: number };
    if (!payload.uid || !payload.exp || Date.now() > payload.exp) {
      return { ok: false };
    }
    return { ok: true, userId: payload.uid };
  } catch {
    return { ok: false };
  }
}

export function verifyPanelPassword(env: Env, password: string): boolean {
  const expected = env.ADMIN_PANEL_PASSWORD?.trim();
  if (!expected) return false;
  return password.trim() === expected;
}

export function getPanelTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("X-Panel-Token");
  if (header?.trim()) return header.trim();

  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("panel_token");
  return fromQuery?.trim() || null;
}
