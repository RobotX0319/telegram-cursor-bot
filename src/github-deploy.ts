import {
  deployUserWorkerFromRepoForUser,
  verifyRepoTokenAccess,
} from "./user-deploy";
import { seal } from "tweetnacl-sealedbox-js";
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

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function encryptSecret(publicKeyBase64: string, secretValue: string): string {
  const key = decodeBase64(publicKeyBase64);
  const message = new TextEncoder().encode(secretValue);
  return encodeBase64(seal(message, key));
}

async function setRepoSecret(
  token: string,
  owner: string,
  repo: string,
  secretName: string,
  secretValue: string,
): Promise<void> {
  const pkRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/secrets/public-key`,
    { headers: authHeaders(token) },
  );
  if (!pkRes.ok) return;

  const { key_id, key } = (await pkRes.json()) as {
    key_id: string;
    key: string;
  };

  await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/secrets/${secretName}`,
    {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({
        encrypted_value: encryptSecret(key, secretValue),
        key_id,
      }),
    },
  );
}

export interface DeploySetupResult {
  secretsOk: boolean;
  deployTriggered: boolean;
  warnings: string[];
}

async function triggerUserWorkerDeploy(
  env: Env,
  owner: string,
  repo: string,
  userId: number,
): Promise<void> {
  await verifyRepoTokenAccess(env, owner, repo);
  await deployUserWorkerFromRepoForUser(env, userId);
}

export async function ensureUserRepoDeploySetup(
  env: Env,
  token: string,
  owner: string,
  repo: string,
  options?: { triggerDeploy?: boolean; userId?: number },
): Promise<DeploySetupResult> {
  const cfToken = env.CLOUDFLARE_API_TOKEN?.trim();
  const cfAccount =
    env.CLOUDFLARE_ACCOUNT_ID?.trim() || "4450cffd4f25491cc797dd112824bc72";

  if (!cfToken) {
    throw new Error(
      "CLOUDFLARE_API_TOKEN sozlanmagan. wrangler secret put CLOUDFLARE_API_TOKEN",
    );
  }

  try {
    await setRepoSecret(token, owner, repo, "CLOUDFLARE_API_TOKEN", cfToken);
    await setRepoSecret(token, owner, repo, "CLOUDFLARE_ACCOUNT_ID", cfAccount);
  } catch {
    // ixtiyoriy
  }

  let deployTriggered = false;
  if (options?.triggerDeploy && options.userId != null) {
    await triggerUserWorkerDeploy(env, owner, repo, options.userId);
    deployTriggered = true;
  }

  return { secretsOk: true, deployTriggered, warnings: [] };
}
