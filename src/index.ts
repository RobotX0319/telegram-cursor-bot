import { handleMessage } from "./handlers";
import { handleUserRepoPush } from "./github-webhook";
import { pollAndDeployUserRepos } from "./user-deploy";
import {
  continuePollingPendingRuns,
  listPendingRuns,
} from "./pending";
import { pollTelegramUpdates } from "./poll";
import {
  configureWebhookFromEnv,
  ensureWebhookHealthy,
  getWebhookInfo,
  getWebhookSecrets,
  isAcceptedWebhookSecret,
  setBotCommands,
} from "./telegram";
import type { Env, TelegramUpdate } from "./types";
import { PendingPoller } from "./pending-poller";
import { usesSupabaseStorage } from "./kv-store";
import { VERSION } from "./version";

export { PendingPoller };

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
        storage: usesSupabaseStorage(env) ? "supabase" : "kv",
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

      const pending = await listPendingRuns(env);
      ctx.waitUntil(continuePollingPendingRuns(env, url.origin));
      return Response.json({
        ok: true,
        polling: true,
        pending: pending.length,
      });
    }

    if (request.method === "GET" && url.pathname === "/admin/poll-telegram") {
      const key = url.searchParams.get("key");
      if (!isAdminKey(env, key)) {
        return new Response("Unauthorized", { status: 401 });
      }

      const result = await pollTelegramUpdates(env, ctx, url.origin);
      return Response.json(result);
    }

    if (request.method === "GET" && url.pathname === "/admin/ensure-webhook") {
      const key = url.searchParams.get("key");
      if (!isAdminKey(env, key)) {
        return new Response("Unauthorized", { status: 401 });
      }

      const result = await ensureWebhookHealthy(env, url.origin);
      return Response.json(result);
    }

    if (request.method === "POST" && url.pathname === "/github/user-deploy") {
      return handleUserRepoPush(env, request);
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
        ctx.waitUntil(handleMessage(env, update.message, ctx, url.origin));
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
    const origin =
      env.WORKER_PUBLIC_URL?.replace(/\/$/, "") ??
      "https://telegram-cursor-bot.fxjournaluz.workers.dev";

    ctx.waitUntil(ensureWebhookHealthy(env, origin));
    ctx.waitUntil(pollAndDeployUserRepos(env));
  },
};
