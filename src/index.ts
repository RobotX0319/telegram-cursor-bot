import { handleMessage } from "./handlers";
import { continuePollingPendingRuns, processPendingRuns } from "./pending";
import {
  configureWebhookFromEnv,
  getWebhookInfo,
  getWebhookSecrets,
  isAcceptedWebhookSecret,
  setBotCommands,
} from "./telegram";
import type { Env, TelegramUpdate } from "./types";
import { VERSION } from "./version";

function isAdminKey(env: Env, key: string | null): boolean {
  return Boolean(key && getWebhookSecrets(env).includes(key));
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "telegram-cursor-bot",
        version: VERSION,
        environment: env.ENVIRONMENT ?? "unknown",
      });
    }

    if (request.method === "GET" && url.pathname === "/admin/setup-webhook") {
      const key = url.searchParams.get("key");
      if (!isAdminKey(env, key)) {
        return new Response("Unauthorized", { status: 401 });
      }

      const result = await configureWebhookFromEnv(env, url.origin);
      const info = await getWebhookInfo(env);

      return Response.json({
        setup: result,
        webhookInfo: info,
      });
    }

    if (request.method === "GET" && url.pathname === "/admin/setup-commands") {
      const key = url.searchParams.get("key");
      if (!isAdminKey(env, key)) {
        return new Response("Unauthorized", { status: 401 });
      }

      const ok = await setBotCommands(env);
      return Response.json({ ok });
    }

    if (request.method === "GET" && url.pathname === "/admin/poll-pending") {
      const key = url.searchParams.get("key");
      if (!isAdminKey(env, key)) {
        return new Response("Unauthorized", { status: 401 });
      }

      ctx.waitUntil(continuePollingPendingRuns(env, url.origin));
      return Response.json({ ok: true, polling: true });
    }

    if (request.method === "POST" && url.pathname === "/webhook") {
      const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (!isAcceptedWebhookSecret(env, secret)) {
        return new Response("Unauthorized", { status: 401 });
      }

      let update: TelegramUpdate;
      try {
        update = (await request.json()) as TelegramUpdate;
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      if (update.message) {
        const text = update.message.text?.trim() ?? "";
        ctx.waitUntil(handleMessage(env, update.message, ctx, url.origin));

        if (!text.toLowerCase().startsWith("/status")) {
          ctx.waitUntil(processPendingRuns(env));
        }
      }

      return new Response("ok");
    }

    return new Response("Not Found", { status: 404 });
  },
};
