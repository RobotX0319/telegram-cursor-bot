import {
  getBootstrapRepo,
  isPrimaryBootstrapAdmin,
  listAllAdminIds,
  setAdminRepo,
  updateBootstrapRepo,
} from "./admins";
import { ensureUserRepoDeploySetup } from "./github-deploy";
import {
  createUserGitHubRepo,
  resolveGitHubOwner,
  userRepoName,
  userRepoUrl,
} from "./github";
import { getBotStorage, putTextIfChanged } from "./kv-store";
import { updateSession } from "./session";
import type { Env } from "./types";

const USER_REPO_PREFIX = "userrepo:";

function userRepoKey(userId: number | string): string {
  return `${USER_REPO_PREFIX}${userId}`;
}

export async function getStoredUserRepo(
  env: Env,
  userId: number,
): Promise<string | null> {
  const raw = await getBotStorage(env).get(userRepoKey(userId));
  return raw?.trim() || null;
}

export async function setStoredUserRepo(
  env: Env,
  userId: number,
  repoUrl: string,
): Promise<void> {
  await putTextIfChanged(getBotStorage(env), userRepoKey(userId), repoUrl);
}

export async function getPrimaryBootstrapRepo(
  env: Env,
): Promise<string | null> {
  return (
    (await getBootstrapRepo(env)) ?? env.DEFAULT_GITHUB_REPO?.trim() ?? null
  );
}

async function githubRepoExists(
  env: Env,
  userId: number,
): Promise<string | null> {
  const token = env.GITHUB_TOKEN?.trim();
  if (!token) return null;

  const owner = env.GITHUB_OWNER?.trim() || "RobotX0319";
  const name = userRepoName(userId);
  const url = `https://github.com/${owner}/${name}`;

  const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "telegram-cursor-bot",
    },
  });

  return res.ok ? url : null;
}

async function ensureDeployForUser(
  env: Env,
  userId: number,
  triggerDeploy: boolean,
): Promise<{ deployed: boolean; warnings: string[] }> {
  const token = env.GITHUB_TOKEN?.trim();
  if (!token) return { deployed: false, warnings: [] };

  const owner = await resolveGitHubOwner(env, token);
  const repo = userRepoName(userId);
  const setup = await ensureUserRepoDeploySetup(env, token, owner, repo, {
    triggerDeploy,
    userId,
  });
  return { deployed: setup.deployTriggered, warnings: setup.warnings };
}

export async function getRepoForUser(
  env: Env,
  userId: number,
): Promise<string | null> {
  if (isPrimaryBootstrapAdmin(env, userId)) {
    return getPrimaryBootstrapRepo(env);
  }

  const stored = await getStoredUserRepo(env, userId);
  if (stored) return stored;

  const onGithub = await githubRepoExists(env, userId);
  if (onGithub) {
    await persistUserRepo(env, userId, onGithub);
    return onGithub;
  }

  return null;
}

async function persistUserRepo(
  env: Env,
  userId: number,
  url: string,
  addedBy?: number,
): Promise<void> {
  await setStoredUserRepo(env, userId, url);
  await setAdminRepo(env, String(userId), url, addedBy ?? userId);
  await updateSession(env, userId, { repoUrl: url });
}

async function bindPrimaryBootstrapRepo(env: Env, userId: number): Promise<string> {
  const url = await getPrimaryBootstrapRepo(env);
  if (!url) {
    throw new Error("DEFAULT_GITHUB_REPO sozlanmagan.");
  }

  await updateBootstrapRepo(env, url);
  await updateSession(env, userId, { repoUrl: url });
  await getBotStorage(env).delete(userRepoKey(userId));

  return url;
}

export async function provisionUserRepo(
  env: Env,
  userId: number,
  addedBy?: number,
): Promise<{
  url: string;
  created: boolean;
  deployed: boolean;
  warnings: string[];
}> {
  if (isPrimaryBootstrapAdmin(env, userId)) {
    const url = await bindPrimaryBootstrapRepo(env, userId);
    return { url, created: false, deployed: false, warnings: [] };
  }

  const existing = await githubRepoExists(env, userId);
  if (existing) {
    await persistUserRepo(env, userId, existing, addedBy);
    const { deployed, warnings } = await ensureDeployForUser(env, userId, true);
    return { url: existing, created: false, deployed, warnings };
  }

  const { url, created } = await createUserGitHubRepo(env, userId);
  await persistUserRepo(env, userId, url, addedBy);
  const { deployed, warnings } = await ensureDeployForUser(env, userId, true);
  return { url, created, deployed, warnings };
}

export async function syncAllUserRepos(
  env: Env,
  requestedBy: number,
): Promise<
  Array<{
    userId: string;
    url: string;
    synced: boolean;
    deployed: boolean;
    warnings?: string[];
    error?: string;
  }>
> {
  const { isBootstrapAdmin } = await import("./admins");
  if (!isBootstrapAdmin(env, requestedBy)) {
    throw new Error("Faqat asosiy admin.");
  }

  const results: Array<{
    userId: string;
    url: string;
    synced: boolean;
    deployed: boolean;
    warnings?: string[];
    error?: string;
  }> = [];

  for (const idStr of await listAllAdminIds(env)) {
    const userId = Number.parseInt(idStr, 10);
    if (Number.isNaN(userId)) continue;

    try {
      const { url, deployed, warnings } = await provisionUserRepo(
        env,
        userId,
        requestedBy,
      );
      results.push({
        userId: idStr,
        url,
        synced: true,
        deployed,
        warnings: warnings.length > 0 ? warnings : undefined,
      });
    } catch (error) {
      results.push({
        userId: idStr,
        url: userRepoUrl(env, userId),
        synced: false,
        deployed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/** @deprecated use syncAllUserRepos */
export async function provisionAllUsersWithoutRepo(
  env: Env,
  requestedBy: number,
): Promise<Array<{ userId: string; url: string; created: boolean; error?: string }>> {
  const synced = await syncAllUserRepos(env, requestedBy);
  return synced.map((r) => ({
    userId: r.userId,
    url: r.url,
    created: r.synced,
    error: r.error,
  }));
}
