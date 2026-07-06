import type { Env } from "./types";

const GITHUB_API = "https://api.github.com";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "telegram-cursor-bot",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function decodeGitHubContent(content: string): string {
  const binary = atob(content.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function fetchRepoFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
): Promise<string | null> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=main`,
    { headers: authHeaders(token) },
  );
  if (!res.ok) return null;

  const data = (await res.json()) as { content?: string };
  if (!data.content) return null;
  return decodeGitHubContent(data.content);
}

/** TypeScript → JS (oddiy scaffold/agent kodlari uchun) */
export function prepareWorkerScript(source: string): string {
  return source
    .replace(/^import\s+type\s+.+;\s*$/gm, "")
    .replace(/\)\s*:\s*Promise<[^>]+>/g, ")")
    .replace(/\)\s*:\s*[A-Za-z_$][\w$<>[\]|&]*(?=\s*\{)/g, ")")
    .replace(/(\w+)\s*:\s*[A-Za-z_$][\w$<>[\]|&]*(?=[,)])/g, "$1");
}

export async function deployUserWorkerFromRepo(
  env: Env,
  owner: string,
  repo: string,
): Promise<{ workerName: string }> {
  const ghToken = env.GITHUB_TOKEN?.trim();
  const cfToken = env.CLOUDFLARE_API_TOKEN?.trim();
  const accountId =
    env.CLOUDFLARE_ACCOUNT_ID?.trim() || "4450cffd4f25491cc797dd112824bc72";

  if (!ghToken) {
    throw new Error("GITHUB_TOKEN sozlanmagan.");
  }
  if (!cfToken) {
    throw new Error("CLOUDFLARE_API_TOKEN sozlanmagan.");
  }

  let workerName = repo;
  const wranglerRaw = await fetchRepoFile(ghToken, owner, repo, "wrangler.jsonc");
  if (wranglerRaw) {
    try {
      const config = JSON.parse(wranglerRaw) as {
        name?: string;
      };
      if (config.name?.trim()) workerName = config.name.trim();
    } catch {
      // default repo name
    }
  }

  const script =
    (await fetchRepoFile(ghToken, owner, repo, "src/index.ts")) ??
    (await fetchRepoFile(ghToken, owner, repo, "src/index.js"));

  if (!script) {
    throw new Error("src/index.ts topilmadi — avval agent kod yozsin.");
  }

  const js = prepareWorkerScript(script);

  const metadata = {
    main_module: "index.js",
    compatibility_date: "2026-04-01",
    compatibility_flags: ["nodejs_compat"],
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  form.append(
    "index.js",
    new Blob([js], { type: "application/javascript+module" }),
    "index.js",
  );

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${cfToken}` },
      body: form,
    },
  );

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Cloudflare deploy ${res.status}: ${body}`);
  }

  await enableWorkersDevRoute(cfToken, accountId, workerName);

  return { workerName };
}

async function enableWorkersDevRoute(
  cfToken: string,
  accountId: string,
  workerName: string,
): Promise<void> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/subdomain`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled: true }),
    },
  );
  if (!res.ok) {
    console.error(
      `workers.dev yoqilmadi (${workerName}):`,
      await res.text(),
    );
  }
}
