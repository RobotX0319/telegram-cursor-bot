import { ensureUserRepoDeploySetup } from "./github-deploy";
import type { Env } from "./types";

const GITHUB_API = "https://api.github.com";

export function userRepoName(userId: number | string): string {
  return `tcursor-u${userId}`;
}

export function userRepoUrl(env: Env, userId: number | string): string {
  const owner = env.GITHUB_OWNER?.trim() || "RobotX0319";
  return `https://github.com/${owner}/${userRepoName(userId)}`;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "telegram-cursor-bot",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function getAuthenticatedUser(
  token: string,
): Promise<{ login: string }> {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error(
      `GitHub token noto'g'ri ${res.status}: ${await res.text()}`,
    );
  }
  return res.json() as Promise<{ login: string }>;
}

async function isGitHubOrganization(
  token: string,
  name: string,
): Promise<boolean> {
  const res = await fetch(`${GITHUB_API}/orgs/${name}`, {
    headers: authHeaders(token),
  });
  return res.ok;
}

export async function resolveGitHubOwner(
  env: Env,
  token: string,
): Promise<string> {
  const { owner } = await resolveRepoOwner(token, env.GITHUB_OWNER);
  return owner;
}

async function resolveRepoOwner(
  token: string,
  configuredOwner: string | undefined,
): Promise<{ owner: string; useOrgApi: boolean }> {
  const authUser = await getAuthenticatedUser(token);
  const configured = configuredOwner?.trim();

  if (!configured || configured === authUser.login) {
    return { owner: authUser.login, useOrgApi: false };
  }

  if (await isGitHubOrganization(token, configured)) {
    return { owner: configured, useOrgApi: true };
  }

  // GITHUB_OWNER org emas (masalan shaxsiy username) — token egasi ostida yaratamiz
  return { owner: authUser.login, useOrgApi: false };
}

export async function createUserGitHubRepo(
  env: Env,
  userId: number | string,
): Promise<{ url: string; name: string; created: boolean }> {
  const token = env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "GITHUB_TOKEN sozlanmagan. wrangler secret put GITHUB_TOKEN",
    );
  }

  const { owner, useOrgApi } = await resolveRepoOwner(
    token,
    env.GITHUB_OWNER,
  );
  const name = userRepoName(userId);

  const check = await fetch(`${GITHUB_API}/repos/${owner}/${name}`, {
    headers: authHeaders(token),
  });

  if (check.ok) {
    const url = `https://github.com/${owner}/${name}`;
    await ensureUserRepoDeploySetup(env, token, owner, name, {
      triggerDeploy: true,
      userId: Number.parseInt(String(userId), 10),
    });
    return { url, name, created: false };
  }

  if (check.status !== 404) {
    const body = await check.text();
    throw new Error(`GitHub repo tekshiruvi ${check.status}: ${body}`);
  }

  const body = {
    name,
    description: `Telegram bot + web interface workspace (user ${userId})`,
    private: true,
    auto_init: true,
    has_issues: false,
  };

  const createRes = await fetch(
    useOrgApi
      ? `${GITHUB_API}/orgs/${owner}/repos`
      : `${GITHUB_API}/user/repos`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
  );

  if (!createRes.ok) {
    const errBody = await createRes.text();
    throw new Error(
      `GitHub repo yaratilmadi ${createRes.status}: ${errBody}\n` +
        `(Owner: ${owner}, API: ${useOrgApi ? "org" : "user"}. Token ga 'repo' ruxsati kerak.)`,
    );
  }

  const created = (await createRes.json()) as {
    html_url?: string;
    owner?: { login?: string };
  };
  const finalOwner = created.owner?.login ?? owner;
  const url =
    created.html_url ?? `https://github.com/${finalOwner}/${name}`;

  // Secretlar + webhook, keyin scaffold, keyin birinchi deploy
  await ensureUserRepoDeploySetup(env, token, finalOwner, name);
  await seedUserRepoFiles(env, token, finalOwner, name, userId);
  await ensureUserRepoDeploySetup(env, token, finalOwner, name, {
    triggerDeploy: true,
    userId: Number.parseInt(String(userId), 10),
  });

  return { url, name, created: true };
}

export function userDeployWorkflowYml(): string {
  return `name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
`;
}

export async function putRepoFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
): Promise<void> {
  const result = await putRepoFileInternal(
    token,
    owner,
    repo,
    path,
    content,
    message,
  );
  if (!result.ok) {
    throw new Error(`GitHub fayl yozilmadi: ${path} (${result.detail})`);
  }
}

type PutRepoFileResult = { ok: true } | { ok: false; detail: string };

async function putRepoFileInternal(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
): Promise<PutRepoFileResult> {
  const encoded = btoa(unescape(encodeURIComponent(content)));
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
    {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ message, content: encoded }),
    },
  );

  if (res.ok) return { ok: true };

  const firstErr = await res.text();
  const getRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
    { headers: authHeaders(token) },
  );

  if (!getRes.ok) {
    return { ok: false, detail: `${res.status}: ${firstErr}` };
  }

  const existing = (await getRes.json()) as { sha: string };
  const update = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
    {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({
        message,
        content: encoded,
        sha: existing.sha,
      }),
    },
  );

  if (update.ok) return { ok: true };

  const updateErr = await update.text();
  if (updateErr.includes("identical") || updateErr.includes("same")) {
    return { ok: true };
  }

  return { ok: false, detail: `${update.status}: ${updateErr}` };
}

function userRepoAgentsMd(userId: number | string): string {
  return `# Agent qoidalari — user ${userId}

## Faqat shu loyiha

Sen **Telegram bot** va **web interface (admin panel)** ustida ishlaysan.

### Ruxsat etilgan
- Telegram bot: handlerlar, buyruqlar, webhook
- Web UI: admin panel, HTML/CSS/JS
- Deploy: git push main (GitHub Actions deploy qiladi)

### Taqiqlangan
- Boshqa loyihalar yoki repodan tashqari vazifalar
- \`wrangler deploy\` (VM da token yo'q)
- Secret/tokenlarni repoga yozish

Har o'zgarishdan keyin: git commit + git push origin main (webhook avtomatik deploy qiladi)
`;
}

async function seedUserRepoFiles(
  env: Env,
  token: string,
  owner: string,
  repo: string,
  userId: number | string,
): Promise<void> {
  const workerName = userRepoName(userId);

  await putRepoFile(
    token,
    owner,
    repo,
    "AGENTS.md",
    userRepoAgentsMd(userId),
    "Add agent scope rules",
  );

  await putRepoFile(
    token,
    owner,
    repo,
    "README.md",
    `# ${workerName}

Shaxsiy workspace — Telegram bot va web interface.

- User ID: ${userId}
- Boshqaruv: telegram-cursor-bot orqali

## Deploy

\`git push origin main\` — telegram-cursor-bot webhook orqali Cloudflare ga deploy qiladi.
`,
    "Add README",
  );

  await putRepoFile(
    token,
    owner,
    repo,
    "wrangler.jsonc",
    JSON.stringify(
      {
        name: workerName,
        main: "src/index.ts",
        compatibility_date: "2026-04-01",
        compatibility_flags: ["nodejs_compat"],
        account_id:
          env.CLOUDFLARE_ACCOUNT_ID || "4450cffd4f25491cc797dd112824bc72",
        vars: { ENVIRONMENT: "production", USER_ID: String(userId) },
      },
      null,
      2,
    ),
    "Add wrangler config",
  );

  await putRepoFile(
    token,
    owner,
    repo,
    "src/index.ts",
    `export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, userId: "${userId}", service: "${workerName}" });
    }
    if (url.pathname === "/" || url.pathname === "/web") {
      return new Response(
        "<!DOCTYPE html><html><head><title>Admin Panel</title></head><body><h1>Web interface — user ${userId}</h1><p>Telegram bot bilan boshqariladi.</p></body></html>",
        { headers: { "Content-Type": "text/html;charset=utf-8" } },
      );
    }
    return new Response("Not Found", { status: 404 });
  },
};
`,
    "Add worker entry",
  );
}
