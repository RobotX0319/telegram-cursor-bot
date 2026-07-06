import type { Env, StoredPaymentCard } from "./types";

const CARDS_KEY = "config:payment_cards";
const CARD_COUNTER = "meta:card_next_id";

async function loadCards(env: Env): Promise<StoredPaymentCard[]> {
  const raw = await env.VIDEOS.get(CARDS_KEY);
  if (!raw) return [];
  try {
    const cards = JSON.parse(raw) as StoredPaymentCard[];
    return Array.isArray(cards) ? cards : [];
  } catch {
    return [];
  }
}

async function saveCards(env: Env, cards: StoredPaymentCard[]): Promise<void> {
  await env.VIDEOS.put(CARDS_KEY, JSON.stringify(cards));
}

async function nextCardId(env: Env): Promise<number> {
  const current = await env.VIDEOS.get(CARD_COUNTER);
  const next = current ? Number.parseInt(current, 10) + 1 : 1;
  await env.VIDEOS.put(CARD_COUNTER, String(next));
  return next;
}

export async function listPaymentCards(env: Env): Promise<StoredPaymentCard[]> {
  const cards = await loadCards(env);
  return cards.sort((a, b) => a.id - b.id);
}

export async function addPaymentCard(
  env: Env,
  title: string,
  value: string,
  addedBy: number,
): Promise<{ ok: true; card: StoredPaymentCard } | { ok: false; error: string }> {
  const name = title.trim();
  const val = value.trim();
  if (!name || !val) {
    return { ok: false, error: "Nomi va karta/havola kerak" };
  }

  const id = await nextCardId(env);
  const card: StoredPaymentCard = {
    id,
    title: name,
    value: val,
    addedBy,
    addedAt: new Date().toISOString(),
  };

  const cards = await loadCards(env);
  cards.push(card);
  await saveCards(env, cards);
  return { ok: true, card };
}

export async function removePaymentCard(
  env: Env,
  id: number,
): Promise<boolean> {
  const cards = await loadCards(env);
  const next = cards.filter((c) => c.id !== id);
  if (next.length === cards.length) return false;
  await saveCards(env, next);
  return true;
}

export function parseCardInput(
  text: string,
): { title: string; value: string } | null {
  const trimmed = text.trim();
  const sep = trimmed.match(/^(.+?)\s*[|:：\-—]\s*(.+)$/);
  if (sep) {
    return { title: sep[1]!.trim(), value: sep[2]!.trim() };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return {
      title: parts[0]!,
      value: parts.slice(1).join(" "),
    };
  }
  return null;
}
