import { handleAdminRequest } from "./admin";
import { ensureBotTokens, hasAdminBot, saveBotTokens } from "./bots";
import {
  connectAdminBotToken,
  ensureDetiskebotReady,
  getAdminBotStatus,
} from "./admin-bot-setup";
import { getWebhookSecret, isAdminPanelPath } from "./config";
import { handleAdminBotCallback } from "./panel";
import { handleAdminBotMessage } from "./handlers-admin";
import { handleCallbackQuery, handleUserMessage } from "./handlers-user";
import { configureWebhookFromEnv, getWebhookInfo, setBotCommands, sendMessage, answerCallbackQuery } from "./telegram";
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
    await ensureDetiskebotReady(env, url.origin);

    if (request.method === "GET" && url.pathname === "/health") {
      const adminStatus = await getAdminBotStatus(env);
      return Response.json({
        ok: true,
        service: "telegram-video-bot",
        environment: env.ENVIRONMENT ?? "unknown",
        bots: {
          user: Boolean(env.TELEGRAM_BOT_TOKEN?.trim()),
          admin: adminStatus.connected,
          adminUsername: adminStatus.username,
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/admin/connect-bot") {
      const key = url.searchParams.get("key");
      const token = url.searchParams.get("token");
      if (!key || key !== getWebhookSecret(env)) {
        return new Response("Unauthorized", { status: 401 });
      }
      if (!token?.trim()) {
        return Response.json(
          { ok: false, error: "token parametri kerak (@Detiskebot tokeni)" },
          { status: 400 },
        );
      }
      const result = await connectAdminBotToken(env, url.origin, token);
      return Response.json(result, { status: result.ok ? 200 : 500 });
    }

    if (request.method === "POST" && url.pathname === "/admin/connect-bot") {
      const key = url.searchParams.get("key");
      if (!key || key !== getWebhookSecret(env)) {
        return new Response("Unauthorized", { status: 401 });
      }
      let body: { token?: string };
      try {
        body = (await request.json()) as { token?: string };
      } catch {
        return Response.json({ ok: false, error: "JSON kerak" }, { status: 400 });
      }
      if (!body.token?.trim()) {
        return Response.json(
          { ok: false, error: "token kerak (@Detiskebot tokeni)" },
          { status: 400 },
        );
      }
      const result = await connectAdminBotToken(env, url.origin, body.token);
      return Response.json(result, { status: result.ok ? 200 : 500 });
    }

    if (request.method === "POST" && url.pathname === "/admin/set-admins") {
      const key = url.searchParams.get("key");
      if (!key || key !== getWebhookSecret(env)) {
        return new Response("Unauthorized", { status: 401 });
      }
      let body: { adminIds?: string };
      try {
        body = (await request.json()) as { adminIds?: string };
      } catch {
        return Response.json({ ok: false, error: "JSON kerak" }, { status: 400 });
      }
      if (body.adminIds === undefined) {
        return Response.json({ ok: false, error: "adminIds kerak" }, { status: 400 });
      }
      const ids = body.adminIds.trim();
      if (!ids) {
        await env.VIDEOS.delete("config:admin_ids");
      } else {
        await saveBotTokens(env, { adminIds: ids });
      }
      return Response.json({ ok: true, adminIds: ids || null });
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
            try {
              await processDueBroadcasts(env);
              await handleAdminBotMessage(env, update.message!, url.origin);
            } catch (err) {
              console.error("handleAdminBotMessage failed:", err);
              const chatId = update.message?.chat.id;
              if (chatId) {
                await sendMessage(
                  env,
                  chatId,
                  "❌ Xatolik yuz berdi. /start yuboring.",
                  { bot: "admin" },
                ).catch(() => {});
              }
            }
          })(),
        );
      }

      if (update.callback_query) {
        ctx.waitUntil(
          (async () => {
            try {
              await handleAdminBotCallback(
                env,
                update.callback_query!,
                url.origin,
              );
            } catch (err) {
              console.error("handleAdminBotCallback failed:", err);
              const q = update.callback_query!;
              await answerCallbackQuery(
                env,
                q.id,
                "Xatolik. /start yuboring.",
                "admin",
              ).catch(() => {});
            }
          })(),
        );
      }

      return new Response("ok");
    }

    return new Response("Not Found", { status: 404 });
  },
};
