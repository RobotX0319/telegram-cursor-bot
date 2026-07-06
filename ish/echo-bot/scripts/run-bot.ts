import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleMessage } from "../src/handlers";
import { setBotCommands } from "../src/telegram";
import type { Env } from "../src/types";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const heartbeatPath = resolve(root, ".heartbeat");

function touchHeartbeat(): void {
  writeFileSync(heartbeatPath, String(Date.now()));
}

function loadVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of readFileSync(resolve(root, ".dev.vars"), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    vars[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return vars;
}

async function deleteWebhook(token: string): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/deleteWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
    },
  );
  console.log("deleteWebhook", response.status, await response.text());
}

async function main(): Promise<void> {
  const vars = loadVars();
  if (!vars.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN kerak (.dev.vars)");
  }

  const env = vars as unknown as Env;

  await deleteWebhook(vars.TELEGRAM_BOT_TOKEN);
  await setBotCommands(env);
  touchHeartbeat();

  const heartbeatTimer = setInterval(() => touchHeartbeat(), 10_000);

  console.log("✅ @Glabalashganbot echo bot ishga tushdi.");

  let offset = 0;
  while (true) {
    touchHeartbeat();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 35_000);

      const response = await fetch(
        `https://api.telegram.org/bot${vars.TELEGRAM_BOT_TOKEN}/getUpdates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            offset: offset > 0 ? offset : undefined,
            timeout: 25,
            allowed_updates: ["message"],
          }),
        },
      );
      clearTimeout(timer);

      const raw = await response.text();
      let data: {
        ok: boolean;
        error_code?: number;
        description?: string;
        result: Array<{
          update_id: number;
          message?: import("../src/types").TelegramUpdate["message"];
        }>;
      };

      try {
        data = JSON.parse(raw) as typeof data;
      } catch {
        console.error("getUpdates javob xato:", response.status, raw);
        await sleep(3000);
        continue;
      }

      if (!response.ok || !data.ok) {
        if (data.error_code === 409 || response.status === 409) {
          console.error("Polling ziddiyat (409) — 10s kutamiz");
          await sleep(10_000);
          continue;
        }
        console.error("getUpdates failed:", response.status, data);
        await sleep(3000);
        continue;
      }

      for (const update of data.result) {
        offset = update.update_id + 1;
        if (update.message) {
          const preview = update.message.text ?? "(media)";
          console.log("Xabar:", preview);
          try {
            await handleMessage(env, update.message);
            console.log("Javob yuborildi:", preview);
          } catch (error) {
            console.error(
              "Javob yuborishda xato:",
              error instanceof Error ? error.message : error,
            );
          }
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes("aborted")) {
        console.error("Polling xatosi:", msg);
      }
      await sleep(2000);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
