import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleMessage } from "../src/handlers";
import type { Env } from "../src/types";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
  console.log("✅ @Glabalashganbot echo bot ishga tushdi.");

  let offset = 0;
  while (true) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);

      const response = await fetch(
        `https://api.telegram.org/bot${vars.TELEGRAM_BOT_TOKEN}/getUpdates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            offset: offset > 0 ? offset : undefined,
            timeout: 8,
            allowed_updates: ["message"],
          }),
        },
      );
      clearTimeout(timer);

      const data = (await response.json()) as {
        ok: boolean;
        result: Array<{
          update_id: number;
          message?: import("../src/types").TelegramUpdate["message"];
        }>;
      };

      if (!data.ok) {
        console.error("getUpdates failed:", data);
        await sleep(3000);
        continue;
      }

      for (const update of data.result) {
        offset = update.update_id + 1;
        if (update.message) {
          console.log("Xabar:", update.message.text ?? "(media)");
          await handleMessage(env, update.message);
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
