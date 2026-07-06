import { isBootstrapAdmin } from "./admins";
import { getBotStorage, putJsonIfChanged, putTextIfChanged } from "./kv-store";
import {
  AWAITING_FOLDER_SCOPE_PREFIX,
  SYSTEM_AGENT_SCOPE_PREFIX,
  buildProjectAgentScopePrefix,
} from "./scope";
import { getSession, updateSession } from "./session";
import type { StoredAgentEntry } from "./types";
import type { Env } from "./types";

const WORKSPACE_PREFIX = "workspace:";
const LEGACY_MAP_KEY = "config:admin_workspaces";

export const PROTECTED_PROJECT_FOLDERS = ["ish", "telegram-video-bot"] as const;

export type WorkspaceScope =
  | { kind: "system" }
  | { kind: "folder"; folder: string }
  | { kind: "none" };

export interface PromptContext {
  mode: "system" | "project" | "awaiting_folder";
  ownerId: number;
  folder?: string;
  /** Asosiy admin boshqasining agentida — egasiga o'xshash javob */
  stealth: boolean;
}

function workspaceKey(userId: number): string {
  return `${WORKSPACE_PREFIX}${userId}`;
}

export function normalizeFolderName(raw: string): string | null {
  const name = raw
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")[0]
    ?.trim();

  if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) return null;
  if (name === "src" || name === "scripts" || name === "node_modules") return null;
  return name;
}

export function isSystemAdmin(env: Env, userId: number): boolean {
  return isBootstrapAdmin(env, userId);
}

async function loadLegacyWorkspaceMap(
  env: Env,
): Promise<Record<string, string>> {
  const raw = await getBotStorage(env).get(LEGACY_MAP_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function getAdminWorkspaceFolder(
  env: Env,
  userId: number,
): Promise<string | null> {
  if (isSystemAdmin(env, userId)) return null;

  const session = await getSession(env, userId);
  if (session?.workspaceFolder) {
    const fromSession = normalizeFolderName(session.workspaceFolder);
    if (fromSession) return fromSession;
  }

  const fromKv = await getBotStorage(env).get(workspaceKey(userId));
  if (fromKv) {
    const normalized = normalizeFolderName(fromKv);
    if (normalized) return normalized;
  }

  const legacy = await loadLegacyWorkspaceMap(env);
  const fromLegacy = legacy[String(userId)];
  if (fromLegacy) {
    const normalized = normalizeFolderName(fromLegacy);
    if (normalized) return normalized;
  }

  return null;
}

/** Papka qaysi admin (Telegram user id) ga tegishli */
export async function getFolderOwnerMap(
  env: Env,
): Promise<Map<string, number>> {
  const owners = new Map<string, number>();

  const legacy = await loadLegacyWorkspaceMap(env);
  for (const [userIdStr, folder] of Object.entries(legacy)) {
    const userId = Number.parseInt(userIdStr, 10);
    const normalized = normalizeFolderName(folder);
    if (!Number.isNaN(userId) && normalized) {
      owners.set(normalized, userId);
    }
  }

  const list = await getBotStorage(env).list({ prefix: WORKSPACE_PREFIX });
  for (const key of list.keys) {
    const raw = await getBotStorage(env).get(key.name);
    if (!raw) continue;
    const normalized = normalizeFolderName(raw);
    const userId = Number.parseInt(key.name.slice(WORKSPACE_PREFIX.length), 10);
    if (normalized && !Number.isNaN(userId)) {
      owners.set(normalized, userId);
    }
  }

  return owners;
}

export async function validateFolderForAdmin(
  env: Env,
  userId: number,
  folder: string,
): Promise<{ ok: true; folder: string } | { ok: false; message: string }> {
  const normalized = normalizeFolderName(folder);
  if (!normalized) {
    return {
      ok: false,
      message:
        "Papka nomi noto'g'ri. Faqat harf, raqam, _ va - (masalan: my-bot)",
    };
  }

  if (isSystemAdmin(env, userId)) {
    return { ok: true, folder: normalized };
  }

  const owners = await getFolderOwnerMap(env);
  const existingOwner = owners.get(normalized);
  if (existingOwner != null && existingOwner !== userId) {
    return {
      ok: false,
      message: `«${normalized}/» admin ${existingOwner} ga tegishli — siz kira olmaysiz.`,
    };
  }

  if (
    (PROTECTED_PROJECT_FOLDERS as readonly string[]).includes(normalized) &&
    existingOwner == null
  ) {
    return {
      ok: false,
      message: `«${normalized}/» boshqa admin loyihasi — o'z papkangizni yarating (/papka nom).`,
    };
  }

  return { ok: true, folder: normalized };
}

export async function setAdminWorkspaceFolder(
  env: Env,
  userId: number,
  folder: string,
): Promise<string> {
  const validation = await validateFolderForAdmin(env, userId, folder);
  if (!validation.ok) {
    throw new Error(validation.message);
  }
  const normalized = validation.folder;

  const session = await getSession(env, userId);
  if (session?.workspaceFolder === normalized) return normalized;

  await updateSession(env, userId, { workspaceFolder: normalized });
  await putTextIfChanged(getBotStorage(env), workspaceKey(userId), normalized);
  return normalized;
}

export async function setLegacyWorkspaceMapping(
  env: Env,
  userId: string,
  folder: string,
): Promise<void> {
  const normalized = normalizeFolderName(folder);
  if (!normalized) {
    throw new Error("Papka nomi noto'g'ri");
  }

  const map = await loadLegacyWorkspaceMap(env);
  map[userId] = normalized;
  await putJsonIfChanged(getBotStorage(env), LEGACY_MAP_KEY, map);
  await setAdminWorkspaceFolder(env, Number.parseInt(userId, 10), normalized);
}

export async function listLegacyWorkspaceMappings(
  env: Env,
): Promise<Array<{ userId: string; folder: string }>> {
  const map = await loadLegacyWorkspaceMap(env);
  return Object.entries(map)
    .map(([userId, folder]) => ({ userId, folder }))
    .sort((a, b) => Number(a.userId) - Number(b.userId));
}

export async function resolveWorkspaceScope(
  env: Env,
  userId: number,
): Promise<WorkspaceScope> {
  if (isSystemAdmin(env, userId)) return { kind: "system" };
  const folder = await getAdminWorkspaceFolder(env, userId);
  if (folder) return { kind: "folder", folder };
  return { kind: "none" };
}

/** Agent egasiga qarab kontekst — operator emas, agent muhim */
export async function resolvePromptContext(
  env: Env,
  operatorUserId: number,
  agentEntry?: StoredAgentEntry | null,
): Promise<PromptContext> {
  const ownerId = agentEntry?.createdBy ?? operatorUserId;
  const ownerIsBootstrap = isBootstrapAdmin(env, ownerId);
  const operatorIsBootstrap = isBootstrapAdmin(env, operatorUserId);

  if (agentEntry && ownerIsBootstrap && ownerId === operatorUserId) {
    return {
      mode: "system",
      ownerId,
      stealth: false,
    };
  }

  if (!agentEntry && operatorIsBootstrap) {
    return { mode: "system", ownerId: operatorUserId, stealth: false };
  }

  const folder =
    agentEntry?.workspaceFolder ??
    (await getAdminWorkspaceFolder(env, ownerId));

  if (folder && !ownerIsBootstrap) {
    const validation = await validateFolderForAdmin(env, ownerId, folder);
    if (!validation.ok) {
      return {
        mode: "awaiting_folder",
        ownerId,
        stealth: operatorIsBootstrap && ownerId !== operatorUserId,
      };
    }
  }

  if (!folder) {
    return {
      mode: "awaiting_folder",
      ownerId,
      stealth: operatorIsBootstrap && ownerId !== operatorUserId,
    };
  }

  return {
    mode: "project",
    folder,
    ownerId,
    stealth: operatorIsBootstrap && ownerId !== operatorUserId,
  };
}

export function detectFolderSetupIntent(prompt: string): string | null {
  const text = prompt.trim();

  const patterns = [
    /(?:^|\s)(?:\/papka|\/folder)\s+([a-zA-Z0-9_-]+)/i,
    /(?:papka|folder)\s+(?:yarat|och|create|nomini\s+(?:ayting|bering|belgilang))(?:\s+qil)?[:\s]+([a-zA-Z0-9_-]+)/i,
    /([a-zA-Z0-9_-]+)\s+(?:nomli\s+)?(?:papka|folder)(?:ni|sini)?\s+yarat/i,
    /(?:yangi\s+)?(?:loyiha\s+)?papka[:\s]+([a-zA-Z0-9_-]+)/i,
    /(?:papka|folder)\s+nomi[:\s]+([a-zA-Z0-9_-]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const folder = normalizeFolderName(match[1]);
      if (folder) return folder;
    }
  }

  return null;
}

export function isFolderSetupPrompt(prompt: string): boolean {
  return detectFolderSetupIntent(prompt) != null;
}

export function isLikelyWorkPrompt(prompt: string): boolean {
  const text = prompt.trim().toLowerCase();
  if (!text) return false;
  if (isFolderSetupPrompt(prompt)) return false;

  const greetings = [
    /^(salom|hello|hi|assalom|\/start|\/help|\/ping|\/agents?|\/status)\b/,
  ];
  if (greetings.some((p) => p.test(text))) return false;

  return true;
}

/** Loyiha admini tizim haqida so'rasa — agentga yuborilmaydi */
export function detectOutOfScopeProbe(prompt: string): boolean {
  const text = prompt.toLowerCase();

  const probes = [
    /boshqa\s+admin/,
    /boshqa\s+agent/,
    /\badmin\s+(?:list|qo'sh|ol|remove|boshqar)/,
    /(?:src|scripts)\//,
    /platforma\s+(?:kod|tizim)/,
    /tizim\s+ma'?lumot/,
    /tizim\s+haqida/,
    /tizimni\s+ko'r/,
    /ko'ryapsanmi.*tizim/,
    /telegram-cursor-bot/,
    /\bish\/|\btelegram-video-bot\//,
    /tizim\s+agent/,
    /boshqa\s+papka/,
    /repo\s+tuzil/,
    /(?:qaysi|boshqa)\s+papkal/,
    /multi.?admin/,
    /durable\s+object/,
    /cloudflare\s+worker/,
    /wrangler\.jsonc/,
    /\/admin\b/,
    /bootstrap\s+admin/,
    /asosiy\s+admin/,
    /\[scope/i,
  ];

  return probes.some((p) => p.test(text));
}

export const OUT_OF_SCOPE_PROBE_REPLY = [
  "Men faqat sizning ish papkangizni ko'raman.",
  "Boshqa papkalar, adminlar yoki tizim haqida ma'lumotim yo'q — ko'ra olmayman.",
].join("\n");

export const NO_WORKSPACE_MESSAGE = [
  "⚠️ Ish papkasi belgilanmagan.",
  "",
  "Avval quyidagilardan birini qiling:",
  "1. /papka my-loyiha — o'z papkangizni belgilang",
  "2. /new — yangi agent (nom bering)",
  "",
  "Papka ochilmaguncha agent yaratilmaydi va kod buyruqlari qabul qilinmaydi.",
  "",
  "Eslatma: ish/, telegram-video-bot/, src/, scripts/ — boshqa adminlar va tizimga tegishli.",
].join("\n");

export function buildAgentPrompt(
  userPrompt: string,
  ctx: PromptContext,
  _options: { isNewAgent: boolean },
): string {
  const userPart = userPrompt.trim();

  if (ctx.mode === "system") {
    return `${SYSTEM_AGENT_SCOPE_PREFIX}${userPart}`;
  }

  if (ctx.mode === "awaiting_folder") {
    return `${AWAITING_FOLDER_SCOPE_PREFIX}${userPart}`;
  }

  if (ctx.folder) {
    return `${buildProjectAgentScopePrefix(ctx.folder)}${userPart}`;
  }

  return `${AWAITING_FOLDER_SCOPE_PREFIX}${userPart}`;
}

export function formatWorkspaceStatus(
  scope: WorkspaceScope,
  ctx?: PromptContext,
): string {
  if (ctx?.stealth && ctx.folder) {
    return `📁 Agent papkasi: ${ctx.folder}/ (egasi: ${ctx.ownerId})`;
  }
  if (scope.kind === "system") {
    return "🔧 Tizim agenti — platforma kodi (src/, scripts/)";
  }
  if (scope.kind === "folder") {
    return `📁 Ish papkasi: ${scope.folder}/`;
  }
  return "⚠️ Ish papkasi belgilanmagan";
}

/** Eski API — preparePromptForDispatch ichida ishlatiladi */
export function wrapPromptForAgent(
  userPrompt: string,
  scope: WorkspaceScope,
  options: { isNewAgent: boolean; awaitingFolder?: boolean },
): string {
  if (scope.kind === "system") {
    return buildAgentPrompt(userPrompt, { mode: "system", ownerId: 0, stealth: false }, options);
  }
  if (scope.kind === "none" || options.awaitingFolder) {
    return buildAgentPrompt(
      userPrompt,
      { mode: "awaiting_folder", ownerId: 0, stealth: false },
      options,
    );
  }
  return buildAgentPrompt(
    userPrompt,
    { mode: "project", folder: scope.folder, ownerId: 0, stealth: false },
    options,
  );
}
