import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleMessage } from "../src/handlers";
import { saveCursorApiKey, resolveCursorApiKey } from "../src/secrets";
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
  const devVarsPath = resolve(root, ".dev.vars");
  for (const line of readFileSync(devVarsPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    vars[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }

  const cursorKeyPath = resolve(root, ".cursor-key");
  if (existsSync(cursorKeyPath)) {
    const fileKey = readFileSync(cursorKeyPath, "utf8").trim();
    if (fileKey) vars.CURSOR_API_KEY = fileKey;
  }

  if (process.env.CURSOR_API_KEY?.trim()) {
    vars.CURSOR_API_KEY = process.env.CURSOR_API_KEY.trim();
  }

  return vars;
}

function persistCursorKeyFile(apiKey: string): void {
  writeFileSync(resolve(root, ".cursor-key"), `${apiKey.trim()}\n`, {
    mode: 0o600,
  });
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

  const startupKey =
    vars.CURSOR_API_KEY?.trim() || process.env.CURSOR_API_KEY?.trim();
  if (startupKey) {
    await saveCursorApiKey(env, startupKey);
    console.log("✅ CURSOR_API_KEY yuklandi.");
  } else {
    console.warn(
      "⚠️  CURSOR_API_KEY yo'q — Telegramda /setkey key_... yuboring.",
    );
  }

  await deleteWebhook(vars.TELEGRAM_BOT_TOKEN);
  console.log("✅ Telegram polling ishga tushdi. /ping yuboring.");

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

      const raw = await response.text();
      const data = JSON.parse(raw) as {
        ok: boolean;
        description?: string;
        result: Array<{
          update_id: number;
          message?: import("../src/types").TelegramUpdate["message"];
        }>;
      };

      if (!data.ok) {
        console.error("getUpdates failed:", raw);
        await sleep(3000);
        continue;
      }

      if (data.result.length === 0) {
        continue;
      }

      for (const update of data.result) {
        offset = update.update_id + 1;
        if (update.message) {
          console.log("Xabar:", update.message.text ?? "(media)");
          const text = update.message.text?.trim() ?? "";
          await handleMessage(
            env,
            update.message,
            ctx,
            vars.WORKER_PUBLIC_URL ?? "http://localhost",
          );
          if (text.toLowerCase().startsWith("/setkey") || text.toLowerCase().startsWith("/cursorkey")) {
            const saved = await resolveCursorApiKey(env);
            if (saved) persistCursorKeyFile(saved);
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
