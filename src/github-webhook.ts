import { deployUserWorkerFromRepo } from "./user-worker-deploy";
import { isAcceptedWebhookSecret } from "./telegram";
import type { Env } from "./types";

const GITHUB_API = "https://api.github.com";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "telegram-cursor-bot",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function webhookUrl(env: Env, repo: string): string {
  const base =
    env.WORKER_PUBLIC_URL?.replace(/\/$/, "") ??
    "https://telegram-cursor-bot.fxjournaluz.workers.dev";
  const key = encodeURIComponent(env.TELEGRAM_WEBHOOK_SECRET);
  return `${base}/github/user-deploy?key=${key}&repo=${encodeURIComponent(repo)}`;
}

export async function ensureUserRepoWebhook(
  env: Env,
  token: string,
  owner: string,
  repo: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const targetUrl = webhookUrl(env, repo);

  const listRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/hooks`,
    { headers: authHeaders(token) },
  );
  if (listRes.ok) {
    const hooks = (await listRes.json()) as Array<{
      config?: { url?: string };
    }>;
    if (hooks.some((h) => h.config?.url?.includes("/github/user-deploy"))) {
      return { ok: true };
    }
  }

  const createRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/hooks`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        name: "web",
        active: true,
        events: ["push"],
        config: {
          url: targetUrl,
          content_type: "json",
          insecure_ssl: "0",
        },
      }),
    },
  );

  if (!createRes.ok) {
    return {
      ok: false,
      error: `${createRes.status}: ${await createRes.text()}`,
    };
  }

  return { ok: true };
}

interface GitHubPushPayload {
  ref?: string;
  repository?: {
    owner?: { login?: string };
    name?: string;
  };
}

export async function handleUserRepoPush(
  env: Env,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!isAcceptedWebhookSecret(env, key)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: GitHubPushPayload;
  try {
    payload = (await request.json()) as GitHubPushPayload;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (payload.ref && payload.ref !== "refs/heads/main") {
    return Response.json({ ok: true, skipped: "not main branch" });
  }

  const owner =
    payload.repository?.owner?.login ??
    env.GITHUB_OWNER?.trim() ??
    "RobotX0319";
  const repo =
    payload.repository?.name ??
    url.searchParams.get("repo") ??
    "";

  if (!repo) {
    return new Response("Bad Request", { status: 400 });
  }

  try {
    const { workerName } = await deployUserWorkerFromRepo(env, owner, repo);
    return Response.json({ ok: true, deployed: workerName });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`User repo deploy failed (${repo}):`, message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
