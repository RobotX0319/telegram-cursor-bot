import { isBootstrapAdmin } from "./admins";
import { updateSession } from "./session";
import type { Env } from "./types";

const WORKSPACE_PREFIX = "workspace:";
const LEGACY_MAP_KEY = "config:admin_workspaces";

/** Boshqa adminlar loyihalari — tizim agenti tegmaydi */
export const PROTECTED_PROJECT_FOLDERS = ["ish", "telegram-video-bot"] as const;

export type WorkspaceScope =
  | { kind: "system" }
  | { kind: "folder"; folder: string }
  | { kind: "none" };

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
  const raw = await env.SESSIONS.get(LEGACY_MAP_KEY);
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

  const fromKv = await env.SESSIONS.get(workspaceKey(userId));
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

export async function setAdminWorkspaceFolder(
  env: Env,
  userId: number,
  folder: string,
): Promise<string> {
  const normalized = normalizeFolderName(folder);
  if (!normalized) {
    throw new Error(
      "Papka nomi noto'g'ri. Faqat harf, raqam, _ va - (masalan: my-bot)",
    );
  }

  await env.SESSIONS.put(workspaceKey(userId), normalized);
  await updateSession(env, userId, { workspaceFolder: normalized });
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
  await env.SESSIONS.put(LEGACY_MAP_KEY, JSON.stringify(map));
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

export const NO_WORKSPACE_MESSAGE = [
  "⚠️ Ish papkasi belgilanmagan.",
  "",
  "Avval quyidagilardan birini qiling:",
  "1. /new — yangi agent oching",
  "2. Agentga papka yaratish buyrug'i bering, masalan:",
  '   "my-loyiha papkasini yarat"',
  "3. Yoki to'g'ridan-to'g'ri: /papka my-loyiha",
  "",
  "Papka ochilmaguncha kod yozish buyruqlari qabul qilinmaydi.",
].join("\n");

export function wrapPromptForAgent(
  userPrompt: string,
  scope: WorkspaceScope,
  options: { isNewAgent: boolean; awaitingFolder?: boolean },
): string {
  if (scope.kind === "system") {
    const protectedList = PROTECTED_PROJECT_FOLDERS.map((f) => `${f}/`).join(", ");
    return [
      "[TIZIM AGENTI — platforma kodi]",
      "Siz asosiy tizim (telegram-cursor-bot platformasi) agentisiz.",
      "Ruxsat: src/, scripts/, wrangler.jsonc, .github/workflows/ (cursor bot), AGENTS.md",
      `Taqiq: boshqa adminlar papkalari — ${protectedList}`,
      "Faqat platforma kodini o'zgartiring. Boshqa admin papkalariga tegmang.",
      "",
      `Foydalanuvchi so'rovi: ${userPrompt}`,
    ].join("\n");
  }

  if (scope.kind === "none" || options.awaitingFolder) {
    return [
      "[YANGI AGENT — avval papka kerak]",
      "Foydalanuvchida hali ish papkasi yo'q.",
      "BIRINCHI vazifa: papka nomini so'rang yoki foydalanuvchi bergan nom bilan papka yarating.",
      "Papka yaratilgunga qadar HEch qanday kod yozmang va fayllarni o'zgartirmang.",
      "src/, scripts/, wrangler.jsonc (ildiz) ga tegmang.",
      "Papka yaratilgandan keyin faqat o'sha papka ichida ishlang.",
      "",
      `Foydalanuvchi xabari: ${userPrompt}`,
    ].join("\n");
  }

  const folder = scope.folder;
  return [
    `[LOYIHA AGENTI — faqat ${folder}/ papkasi]`,
    `MUHIM: Faqat \`${folder}/\` papkasi ichida ishlang.`,
    "Repodagi boshqa papkalarga, src/, scripts/, wrangler.jsonc (ildiz) ga tegmang.",
    options.isNewAgent
      ? "Bu yangi agent — barcha kelajak vazifalar shu papkada davom etadi."
      : "Davom eting — faqat shu papka doirasida.",
    "",
    `Foydalanuvchi so'rovi: ${userPrompt}`,
  ].join("\n");
}

export function formatWorkspaceStatus(
  scope: WorkspaceScope,
): string {
  if (scope.kind === "system") {
    return "🔧 Tizim agenti — platforma kodi (src/, scripts/)";
  }
  if (scope.kind === "folder") {
    return `📁 Ish papkasi: ${scope.folder}/`;
  }
  return "⚠️ Ish papkasi belgilanmagan";
}
