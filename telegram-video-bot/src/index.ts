import { handleAdminRequest } from "./admin";
import { ensureBotTokens, hasAdminBot } from "./bots";
import { getWebhookSecret, isAdminPanelPath } from "./config";
import { handleAdminBotCallback } from "./panel";
import { handleAdminBotMessage } from "./handlers-admin";
import { handleCallbackQuery, handleUserMessage } from "./handlers-user";
import { configureWebhookFromEnv, getWebhookInfo, setBotCommands } from "./telegram";
import { resetBotData, resetBotFully } from "./reset";
import { processDueBroadcasts } from "./broadcast";
import type { Env, TelegramUpdate } from "./types";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    await ensureBotTokens(env);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "telegram-video-bot",
        environment: env.ENVIRONMENT ?? "unknown",
        bots: {
          user: Boolean(env.TELEGRAM_BOT_TOKEN),
          admin: hasAdminBot(env),
        },
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

      const userOk = await setBotCommands(env, "user");
      const adminOk = hasAdminBot(env)
        ? await setBotCommands(env, "admin")
        : null;

      return Response.json({ user: userOk, admin: adminOk });
    }

    if (request.method === "POST" && url.pathname === "/admin/reset") {
      const key = url.searchParams.get("key");
      const confirm = url.searchParams.get("confirm");
      if (!key || key !== getWebhookSecret(env)) {
        return new Response("Unauthorized", { status: 401 });
      }
      if (confirm !== "RESET" && confirm !== "FULL") {
        return Response.json(
          {
            ok: false,
            error: "confirm=RESET (ma'lumot) yoki confirm=FULL (to'liq) kerak",
          },
          { status: 400 },
        );
      }

      const result =
        confirm === "FULL"
          ? await resetBotFully(env)
          : await resetBotData(env);
      await configureWebhookFromEnv(env, url.origin);

      return Response.json({ ok: true, ...result });
    }

    if (isAdminPanelPath(env, url.pathname)) {
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
        ctx.waitUntil(
          (async () => {
            await processDueBroadcasts(env);
            await handleUserMessage(env, update.message!, url.origin);
          })(),
        );
      }

      if (update.callback_query) {
        ctx.waitUntil(handleCallbackQuery(env, update.callback_query, url.origin));
      }

      return new Response("ok");
    }

    if (request.method === "POST" && url.pathname === "/webhook-admin") {
      const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (!secret || secret !== getWebhookSecret(env)) {
        return new Response("Unauthorized", { status: 401 });
      }

      if (!hasAdminBot(env)) {
        return new Response("Admin bot not configured", { status: 503 });
      }

      let update: TelegramUpdate;
      try {
        update = (await request.json()) as TelegramUpdate;
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      if (update.message) {
        ctx.waitUntil(
          (async () => {
            await processDueBroadcasts(env);
            await handleAdminBotMessage(env, update.message!, url.origin);
          })(),
        );
      }

      if (update.callback_query) {
        ctx.waitUntil(
          handleAdminBotCallback(env, update.callback_query, url.origin),
        );
      }

      return new Response("ok");
    }

    return new Response("Not Found", { status: 404 });
  },
};
