import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleMessage } from "../src/handlers";
import type { Env } from "../src/types";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

class MemoryKV implements KVNamespace {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<KVNamespaceListResult> {
    const keys = [...this.store.keys()].filter(
      (key) => !options?.prefix || key.startsWith(options.prefix),
    );
    return {
      keys: keys.map((name) => ({ name })),
      list_complete: true,
    };
  }

  async getWithMetadata(): Promise<KVNamespaceGetWithMetadataResult> {
    throw new Error("getWithMetadata not implemented");
  }
}

function loadVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  const path = resolve(root, ".dev.vars");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    vars[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return vars;
}

const ctx: ExecutionContext = {
  waitUntil(promise) {
    promise.catch((error) => console.error("waitUntil error:", error));
  },
  passThroughOnException() {},
};

async function deleteWebhook(token: string): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/deleteWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
    },
  );
  const body = await response.text();
  console.log("deleteWebhook", response.status, body);
}

async function main(): Promise<void> {
  const vars = loadVars();
  if (!vars.TELEGRAM_BOT_TOKEN || !vars.ALLOWED_USER_ID) {
    throw new Error("TELEGRAM_BOT_TOKEN va ALLOWED_USER_ID kerak (.dev.vars)");
  }

  const env = {
    ...vars,
    SESSIONS: new MemoryKV(),
  } as unknown as Env;

  await deleteWebhook(vars.TELEGRAM_BOT_TOKEN);
  console.log("✅ Telegram polling ishga tushdi. /ping yuboring.");

  let offset = 0;
  while (true) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${vars.TELEGRAM_BOT_TOKEN}/getUpdates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offset: offset > 0 ? offset : undefined,
            timeout: 25,
            allowed_updates: ["message"],
          }),
        },
      );

      const data = (await response.json()) as {
        ok: boolean;
        result: Array<{ update_id: number; message?: Env extends never ? never : import("../src/types").TelegramUpdate["message"] }>;
      };

      if (!data.ok) {
        console.error("getUpdates failed:", data);
        await sleep(5000);
        continue;
      }

      for (const update of data.result) {
        offset = update.update_id + 1;
        if (update.message) {
          console.log("Xabar:", update.message.text ?? "(media)");
          await handleMessage(
            env,
            update.message,
            ctx,
            vars.WORKER_PUBLIC_URL ?? "http://localhost",
          );
        }
      }
    } catch (error) {
      console.error("Polling xatosi:", error);
      await sleep(5000);
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
