import { getBotStorage, putTextIfChanged } from "./kv-store";
import type { Env } from "./types";

export const CURSOR_KEY_KV = "config:cursor_api_key";

export async function resolveCursorApiKey(env: Env): Promise<string> {
  const fromKv = await getBotStorage(env).get(CURSOR_KEY_KV);
  if (fromKv?.trim()) return fromKv.trim();
  return env.CURSOR_API_KEY?.trim() ?? "";
}

export async function saveCursorApiKey(
  env: Env,
  apiKey: string,
): Promise<void> {
  await putTextIfChanged(getBotStorage(env), CURSOR_KEY_KV, apiKey.trim());
}
