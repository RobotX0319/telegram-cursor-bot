import { putJsonIfChanged } from "./kv-store";
import { sendMessage } from "./telegram";
import type { Env } from "./types";
import { getBootstrapAdminIds } from "./admins";

export interface PermissionRequest {
  id: string;
  userId: number;
  chatId: number;
  prompt: string;
  status: "pending" | "approved" | "denied";
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: number;
}

const REQUEST_PREFIX = "perm:req:";
const GRANT_PREFIX = "perm:grant:";

function requestKey(id: string): string {
  return `${REQUEST_PREFIX}${id}`;
}

function grantKey(userId: number): string {
  return `${GRANT_PREFIX}${userId}`;
}

function newRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createPermissionRequest(
  env: Env,
  userId: number,
  chatId: number,
  prompt: string,
): Promise<PermissionRequest> {
  const req: PermissionRequest = {
    id: newRequestId(),
    userId,
    chatId,
    prompt,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  await putJsonIfChanged(env.SESSIONS, requestKey(req.id), req);

  for (const adminId of getBootstrapAdminIds(env)) {
    const id = Number.parseInt(adminId, 10);
    if (Number.isNaN(id)) continue;
    await sendMessage(
      env,
      id,
      [
        "Ruxsat so'rovi",
        `User: ${userId}`,
        `ID: ${req.id}`,
        "",
        prompt.slice(0, 500),
        "",
        `/approve ${req.id}`,
        `/deny ${req.id}`,
      ].join("\n"),
    );
  }

  return req;
}

export async function getPermissionRequest(
  env: Env,
  id: string,
): Promise<PermissionRequest | null> {
  const raw = await env.SESSIONS.get(requestKey(id));
  if (!raw) return null;
  return JSON.parse(raw) as PermissionRequest;
}

export async function approveRequest(
  env: Env,
  id: string,
  resolvedBy: number,
): Promise<PermissionRequest | null> {
  const req = await getPermissionRequest(env, id);
  if (!req || req.status !== "pending") return null;

  req.status = "approved";
  req.resolvedAt = new Date().toISOString();
  req.resolvedBy = resolvedBy;
  await putJsonIfChanged(env.SESSIONS, requestKey(id), req);

  await env.SESSIONS.put(grantKey(req.userId), req.prompt, {
    expirationTtl: 60 * 60 * 24,
  });

  await sendMessage(
    env,
    req.chatId,
    [
      "Ruxsat berildi.",
      "Endi vazifani qayta yuboring (24 soat ichida):",
      "",
      req.prompt.slice(0, 400),
    ].join("\n"),
  );

  return req;
}

export async function denyRequest(
  env: Env,
  id: string,
  resolvedBy: number,
): Promise<PermissionRequest | null> {
  const req = await getPermissionRequest(env, id);
  if (!req || req.status !== "pending") return null;

  req.status = "denied";
  req.resolvedAt = new Date().toISOString();
  req.resolvedBy = resolvedBy;
  await putJsonIfChanged(env.SESSIONS, requestKey(id), req);

  await sendMessage(
    env,
    req.chatId,
    "Ruxsat rad etildi. Faqat Telegram bot va web interface vazifalari ruxsat etilgan.",
  );

  return req;
}

export async function consumeGrantedPrompt(
  env: Env,
  userId: number,
  prompt: string,
): Promise<boolean> {
  const granted = await env.SESSIONS.get(grantKey(userId));
  if (!granted) return false;
  if (granted.trim() !== prompt.trim()) return false;
  await env.SESSIONS.delete(grantKey(userId));
  return true;
}
