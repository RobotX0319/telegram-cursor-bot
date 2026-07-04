import { handleMessage } from "./handlers";
import { processPendingRuns } from "./pending";
import { configureWebhookFromEnv, getWebhookInfo } from "./telegram";
import type { Env, TelegramUpdate } from "./types";

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
        environment: env.ENVIRONMENT ?? "unknown",
      });
    }

    if (request.method === "GET" && url.pathname === "/admin/setup-webhook") {
      const key = url.searchParams.get("key");
      if (!key || key !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }

      const result = await configureWebhookFromEnv(env, url.origin);
      const info = await getWebhookInfo(env);

      return Response.json({
        setup: result,
        webhookInfo: info,
      });
    }

    if (request.method === "POST" && url.pathname === "/webhook") {
      const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (!secret || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }

      let update: TelegramUpdate;
      try {
        update = (await request.json()) as TelegramUpdate;
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      if (update.message) {
        ctx.waitUntil(handleMessage(env, update.message, ctx));
      }

      return new Response("ok");
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(processPendingRuns(env));
  },
};
