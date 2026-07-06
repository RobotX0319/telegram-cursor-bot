import { handleAdminRequest } from "./admin";
import {
  handleAdminMessage,
  handleCallbackQuery,
  handleUserMessage,
} from "./handlers";
import {
  configureWebhookFromEnv,
  getWebhookInfo,
  setBotCommands,
} from "./telegram";
import type { Env, TelegramUpdate } from "./types";
export { VideoCoordinator } from "./video-coordinator";

function verifyWebhookSecret(request: Request, env: Env): boolean {
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  return Boolean(secret && secret === env.TELEGRAM_WEBHOOK_SECRET);
}

async function handleWebhookUpdate(
  env: Env,
  ctx: ExecutionContext,
  update: TelegramUpdate,
  kind: "user" | "admin",
  workerOrigin: string,
): Promise<void> {
  if (update.message) {
    if (kind === "admin") {
      ctx.waitUntil(handleAdminMessage(env, update.message, workerOrigin));
    } else {
      ctx.waitUntil(handleUserMessage(env, update.message));
    }
  }

  if (update.callback_query && kind === "user") {
    ctx.waitUntil(handleCallbackQuery(env, update.callback_query));
  }
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
        service: "telegram-video-bot",
        environment: env.ENVIRONMENT ?? "unknown",
        bots: ["user", "admin"],
      });
    }

    if (request.method === "GET" && url.pathname === "/admin/setup-webhook") {
      const key = url.searchParams.get("key");
      if (!key || key !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }

      const setup = await configureWebhookFromEnv(env, url.origin);
      const webhookInfo = await getWebhookInfo(env);

      return Response.json({ setup, webhookInfo });
    }

    if (request.method === "GET" && url.pathname === "/admin/setup-commands") {
      const key = url.searchParams.get("key");
      if (!key || key !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }

      const [user, admin] = await Promise.all([
        setBotCommands(env, "user"),
        setBotCommands(env, "admin"),
      ]);
      return Response.json({ ok: user && admin, user, admin });
    }

    if (url.pathname.startsWith("/admin")) {
      return handleAdminRequest(request, env);
    }

    if (request.method === "POST" && url.pathname === "/webhook") {
      if (!verifyWebhookSecret(request, env)) {
        return new Response("Unauthorized", { status: 401 });
      }

      let update: TelegramUpdate;
      try {
        update = (await request.json()) as TelegramUpdate;
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      ctx.waitUntil(handleWebhookUpdate(env, ctx, update, "user", url.origin));
      return new Response("ok");
    }

    if (request.method === "POST" && url.pathname === "/webhook/admin") {
      if (!verifyWebhookSecret(request, env)) {
        return new Response("Unauthorized", { status: 401 });
      }

      let update: TelegramUpdate;
      try {
        update = (await request.json()) as TelegramUpdate;
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      ctx.waitUntil(handleWebhookUpdate(env, ctx, update, "admin", url.origin));
      return new Response("ok");
    }

    return new Response("Not Found", { status: 404 });
  },
};
