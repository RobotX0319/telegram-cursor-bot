import {
  isPrimaryBootstrapAdmin,
  listAllAdminIds,
} from "./admins";
import { resolveGitHubOwner, userRepoName } from "./github";
import { getRepoForUser } from "./user-repos";
import { getBotStorage, putTextIfChanged } from "./kv-store";
import type { Env } from "./types";

const GITHUB_API = "https://api.github.com";
const DEPLOY_SHA_PREFIX = "deploy_sha:";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "telegram-cursor-bot",
  };
}

function deployShaKey(userId: number): string {
  return `${DEPLOY_SHA_PREFIX}${userId}`;
}

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/i);
  if (!match) return null;
  return { owner: match[1]!, repo: match[2]! };
}

export async function verifyRepoTokenAccess(
  env: Env,
  owner: string,
  repo: string,
): Promise<void> {
  const token = env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new Error("GITHUB_TOKEN sozlanmagan.");
  }

  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: authHeaders(token),
  });

  if (res.status === 403) {
    throw new Error(
      [
        "PAT bu repoga kira olmaydi (403).",
        "",
        "Fine-grained token sozlamalari:",
        '1. Repository access → "All repositories"',
        "2. Contents: Read and write",
        "3. Yangi token → wrangler secret put GITHUB_TOKEN",
      ].join("\n"),
    );
  }

  if (!res.ok) {
    throw new Error(`Repo tekshiruvi ${res.status}: ${await res.text()}`);
  }
}

export async function getRepoMainSha(
  token: string,
  owner: string,
  repo: string,
): Promise<string | null> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits/main`,
    { headers: authHeaders(token) },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { sha?: string };
  return data.sha ?? null;
}

async function recordDeployedSha(
  env: Env,
  userId: number,
  sha: string,
): Promise<void> {
  await putTextIfChanged(getBotStorage(env), deployShaKey(userId), sha);
}

export async function deployUserWorkerFromRepoForUser(
  env: Env,
  userId: number,
): Promise<{ workerName: string }> {
  const repoUrl = await getRepoForUser(env, userId);
  if (!repoUrl) {
    throw new Error("Repo topilmadi.");
  }

  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) {
    throw new Error(`Repo URL noto'g'ri: ${repoUrl}`);
  }

  const token = env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error("GITHUB_TOKEN sozlanmagan.");

  await verifyRepoTokenAccess(env, parsed.owner, parsed.repo);

  const { deployUserWorkerFromRepo } = await import("./user-worker-deploy");
  const result = await deployUserWorkerFromRepo(
    env,
    parsed.owner,
    parsed.repo,
  );

  const sha = await getRepoMainSha(token, parsed.owner, parsed.repo);
  if (sha) {
    await recordDeployedSha(env, userId, sha);
  }

  return result;
}

export async function deployUserRepoIfChanged(
  env: Env,
  userId: number,
): Promise<boolean> {
  if (isPrimaryBootstrapAdmin(env, userId)) return false;

  const token = env.GITHUB_TOKEN?.trim();
  if (!token) return false;

  const repoUrl = await getRepoForUser(env, userId);
  if (!repoUrl) return false;

  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) return false;

  const sha = await getRepoMainSha(token, parsed.owner, parsed.repo);
  if (!sha) return false;

  const last = await getBotStorage(env).get(deployShaKey(userId));
  if (last === sha) return false;

  try {
    await deployUserWorkerFromRepoForUser(env, userId);
    return true;
  } catch (error) {
    console.error(
      `Poll deploy failed (${userId}):`,
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

export async function pollAndDeployUserRepos(env: Env): Promise<number> {
  let count = 0;
  for (const idStr of await listAllAdminIds(env)) {
    const userId = Number.parseInt(idStr, 10);
    if (Number.isNaN(userId)) continue;
    if (await deployUserRepoIfChanged(env, userId)) count++;
  }
  return count;
}

export async function resolveOwnerForUser(
  env: Env,
  userId: number,
): Promise<{ owner: string; repo: string }> {
  const token = env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error("GITHUB_TOKEN sozlanmagan.");

  const owner = await resolveGitHubOwner(env, token);
  return { owner, repo: userRepoName(userId) };
}
