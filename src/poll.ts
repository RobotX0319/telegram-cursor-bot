import { handleMessage } from "./handlers";
import type { Env, TelegramUpdate } from "./types";

const OFFSET_KEY = "telegram:poll_offset";

export async function pollTelegramUpdates(
  env: Env,
  ctx: ExecutionContext,
  workerOrigin: string,
): Promise<{ ok: boolean; processed: number }> {
  const offsetRaw = await env.SESSIONS.get(OFFSET_KEY);
  const offset = offsetRaw ? Number(offsetRaw) : 0;

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offset: offset > 0 ? offset : undefined,
        timeout: 0,
        allowed_updates: ["message"],
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    console.error("getUpdates failed:", response.status, body);
    return { ok: false, processed: 0 };
  }

  const data = (await response.json()) as {
    ok: boolean;
    result: TelegramUpdate[];
  };

  if (!data.ok || !Array.isArray(data.result)) {
    return { ok: false, processed: 0 };
  }

  let lastUpdateId = offset;
  for (const update of data.result) {
    lastUpdateId = Math.max(lastUpdateId, update.update_id + 1);
    if (update.message) {
      ctx.waitUntil(handleMessage(env, update.message, ctx, workerOrigin));
    }
  }

  if (lastUpdateId > offset) {
    await env.SESSIONS.put(OFFSET_KEY, String(lastUpdateId));
  }

  return { ok: true, processed: data.result.length };
}
