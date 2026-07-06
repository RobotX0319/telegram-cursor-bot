import type { ChatTurn } from "./types";

export const MAX_MESSAGES = 30;

const KV_PREFIX = "echo:chat:";

export function formatTurn(turn: ChatTurn): string {
  const label = turn.role === "user" ? "User" : "Gemini";
  return `${label}: ${turn.text}`;
}

export function formatHistoryBlock(history: ChatTurn[]): string {
  if (history.length === 0) return "(oldingi yozishmalar yo'q)";
  return history.map(formatTurn).join("\n");
}

export async function loadHistory(
  kv: KVNamespace | undefined,
  chatId: number,
): Promise<ChatTurn[]> {
  if (!kv) return [];

  const raw = await kv.get(`${KV_PREFIX}${chatId}`);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as ChatTurn[];
    return Array.isArray(parsed) ? parsed.slice(-MAX_MESSAGES) : [];
  } catch {
    return [];
  }
}

export async function saveHistory(
  kv: KVNamespace | undefined,
  chatId: number,
  history: ChatTurn[],
): Promise<void> {
  if (!kv) return;
  await kv.put(`${KV_PREFIX}${chatId}`, JSON.stringify(history.slice(-MAX_MESSAGES)));
}

export function appendTurn(
  history: ChatTurn[],
  role: ChatTurn["role"],
  text: string,
): ChatTurn[] {
  return [...history, { role, text }].slice(-MAX_MESSAGES);
}
