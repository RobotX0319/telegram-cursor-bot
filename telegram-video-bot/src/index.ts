import { handleAdminRequest } from "./admin";
import { getWebhookSecret } from "./config";
import { handleCallbackQuery, handleMessage } from "./handlers";
import { configureWebhookFromEnv, getWebhookInfo, setBotCommands } from "./telegram";
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
        service: "telegram-video-bot",
        environment: env.ENVIRONMENT ?? "unknown",
      });
    }

    if (request.method === "GET" && url.pathname === "/admin/setup-webhook") {
      const key = url.searchParams.get("key");
      if (!key || key !== getWebhookSecret(env)) {
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
      if (!key || key !== getWebhookSecret(env)) {
        return new Response("Unauthorized", { status: 401 });
      }

      const ok = await setBotCommands(env);
      return Response.json({ ok });
    }

    if (url.pathname.startsWith("/admin")) {
      return handleAdminRequest(request, env);
    }

    if (request.method === "POST" && url.pathname === "/webhook") {
      const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (!secret || secret !== getWebhookSecret(env)) {
        return new Response("Unauthorized", { status: 401 });
      }

      let update: TelegramUpdate;
      try {
        update = (await request.json()) as TelegramUpdate;
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      if (update.message) {
        ctx.waitUntil(handleMessage(env, update.message, url.origin));
      }

      if (update.callback_query) {
        ctx.waitUntil(handleCallbackQuery(env, update.callback_query));
      }

      return new Response("ok");
    }

    return new Response("Not Found", { status: 404 });
  },
};
