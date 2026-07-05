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

  const owner = env.GITHUB_OWNER?.trim() || "RobotX0319";
  const name = userRepoName(userId);
  const url = `https://github.com/${owner}/${name}`;

  const check = await fetch(`${GITHUB_API}/repos/${owner}/${name}`, {
    headers: authHeaders(token),
  });

  if (check.ok) {
    return { url, name, created: false };
  }

  if (check.status !== 404) {
    const body = await check.text();
    throw new Error(`GitHub repo tekshiruvi ${check.status}: ${body}`);
  }

  const createRes = await fetch(`${GITHUB_API}/user/repos`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      name,
      description: `Telegram bot + web interface workspace (user ${userId})`,
      private: true,
      auto_init: true,
      has_issues: false,
    }),
  });

  if (!createRes.ok) {
    const orgRes = await fetch(`${GITHUB_API}/orgs/${owner}/repos`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        name,
        description: `Telegram bot + web interface workspace (user ${userId})`,
        private: true,
        auto_init: true,
      }),
    });

    if (!orgRes.ok) {
      const body = await orgRes.text();
      throw new Error(`GitHub repo yaratilmadi ${orgRes.status}: ${body}`);
    }
  }

  await seedUserRepoFiles(env, token, owner, name, userId);

  return { url, name, created: true };
}

async function putRepoFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
): Promise<void> {
  const encoded = btoa(unescape(encodeURIComponent(content)));
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
    {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ message, content: encoded }),
    },
  );

  if (!res.ok) {
    const getRes = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
      { headers: authHeaders(token) },
    );
    if (getRes.ok) {
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
      if (!update.ok) {
        console.error(`GitHub put ${path} failed:`, await update.text());
      }
      return;
    }
    console.error(`GitHub put ${path} failed:`, await res.text());
  }
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

Har o'zgarishdan keyin: git commit + git push origin main
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

GitHub Actions \`main\` branch push dan keyin Cloudflare ga deploy qiladi.
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
        account_id: env.CLOUDFLARE_ACCOUNT_ID || "4450cffd4f25491cc797dd112824bc72",
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
  async fetch(request: Request): Promise<Response> {
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

  await putRepoFile(
    token,
    owner,
    repo,
    ".github/workflows/deploy.yml",
    `name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm install -g wrangler
      - run: wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
`,
    "Add deploy workflow",
  );
}
