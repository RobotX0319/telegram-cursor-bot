import {
  getAdminProfile,
  isBootstrapAdmin,
  listAllAdminIds,
  setAdminRepo,
  updateBootstrapRepo,
} from "./admins";
import { createUserGitHubRepo, userRepoUrl } from "./github";
import { updateSession } from "./session";
import type { Env } from "./types";

export async function getRepoForUser(
  env: Env,
  userId: number,
): Promise<string | null> {
  const profile = await getAdminProfile(env, userId);
  if (profile?.repoUrl) return profile.repoUrl;

  if (isBootstrapAdmin(env, userId)) {
    return env.DEFAULT_GITHUB_REPO?.trim() ?? null;
  }

  return null;
}

export async function provisionUserRepo(
  env: Env,
  userId: number,
  addedBy?: number,
): Promise<{ url: string; created: boolean }> {
  const { url, created } = await createUserGitHubRepo(env, userId);

  if (isBootstrapAdmin(env, userId)) {
    await updateBootstrapRepo(env, url);
  } else {
    await setAdminRepo(env, String(userId), url, addedBy ?? userId);
  }

  await updateSession(env, userId, { repoUrl: url });

  return { url, created };
}

export async function provisionAllUsersWithoutRepo(
  env: Env,
  requestedBy: number,
): Promise<Array<{ userId: string; url: string; created: boolean; error?: string }>> {
  if (!isBootstrapAdmin(env, requestedBy)) {
    throw new Error("Faqat asosiy admin provision qila oladi.");
  }

  const results: Array<{
    userId: string;
    url: string;
    created: boolean;
    error?: string;
  }> = [];

  for (const idStr of await listAllAdminIds(env)) {
    const userId = Number.parseInt(idStr, 10);
    if (Number.isNaN(userId)) continue;

    const expected = userRepoUrl(env, userId);
    const existing = await getRepoForUser(env, userId);
    if (existing === expected) {
      results.push({ userId: idStr, url: existing, created: false });
      continue;
    }

    try {
      const { url, created } = await provisionUserRepo(env, userId, requestedBy);
      results.push({ userId: idStr, url, created });
    } catch (error) {
      results.push({
        userId: idStr,
        url: userRepoUrl(env, userId),
        created: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
