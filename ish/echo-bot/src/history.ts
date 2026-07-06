import type { ChatTurn } from "./types";

const MAX_MESSAGES = 10;

export async function loadHistory(
  kv: KVNamespace | undefined,
  chatId: number,
): Promise<ChatTurn[]> {
  if (!kv) return [];

  const raw = await kv.get(`chat:${chatId}`);
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
  await kv.put(`chat:${chatId}`, JSON.stringify(history.slice(-MAX_MESSAGES)));
}

export function appendTurn(
  history: ChatTurn[],
  role: ChatTurn["role"],
  text: string,
): ChatTurn[] {
  return [...history, { role, text }].slice(-MAX_MESSAGES);
}
