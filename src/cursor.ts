import { wrapPromptForAgent } from "./scope";
import type {
  CreateAgentResponse,
  CreateRunResponse,
  CursorAgent,
  CursorRun,
  Env,
  RunStatus,
} from "./types";

const CURSOR_API = "https://api.cursor.com/v1";

export async function getCursorApiKeyError(env: Env): Promise<string | null> {
  const apiKey = await resolveCursorApiKey(env);
  if (!apiKey) {
    return [
      "CURSOR_API_KEY sozlanmagan.",
      "",
      "Admin sifatida Telegramda:",
      "/setkey key_...",
      "",
      "Yoki papkada .cursor-key fayliga yozing.",
      "Key olish: https://cursor.com/dashboard/integrations",
    ].join("\n");
  }
  return null;
}

function authHeader(apiKey: string): string {
  return `Basic ${btoa(`${apiKey}:`)}`;
}

async function cursorFetch<T>(
  env: Env,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const keyError = await getCursorApiKeyError(env);
  if (keyError) throw new Error(keyError);

  const apiKey = await resolveCursorApiKey(env);
  const response = await fetch(`${CURSOR_API}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(apiKey),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Cursor API ${response.status}: ${body}`);
  }

  return JSON.parse(body) as T;
}

export async function createAgent(
  env: Env,
  prompt: string,
  repoUrl: string,
  startingRef?: string,
): Promise<CreateAgentResponse> {
  const branch = startingRef ?? env.DEFAULT_GITHUB_BRANCH ?? "main";
  const scopedPrompt = wrapPromptForAgent(prompt);
  return cursorFetch<CreateAgentResponse>(env, "/agents", {
    method: "POST",
    body: JSON.stringify({
      prompt: { text: scopedPrompt },
      model: { id: "composer-2.5" },
      repos: [{ url: repoUrl, startingRef: branch }],
      workOnCurrentBranch: true,
      autoCreatePR: false,
      skipReviewerRequest: true,
    }),
  });
}

export async function createRun(
  env: Env,
  agentId: string,
  prompt: string,
): Promise<CreateRunResponse> {
  const scopedPrompt = wrapPromptForAgent(prompt);
  return cursorFetch<CreateRunResponse>(env, `/agents/${agentId}/runs`, {
    method: "POST",
    body: JSON.stringify({
      prompt: { text: scopedPrompt },
    }),
  });
}

export async function getAgent(env: Env, agentId: string): Promise<CursorAgent> {
  return cursorFetch<CursorAgent>(env, `/agents/${agentId}`);
}

export async function getRun(
  env: Env,
  agentId: string,
  runId: string,
): Promise<CursorRun> {
  return cursorFetch<CursorRun>(env, `/agents/${agentId}/runs/${runId}`);
}

export const TERMINAL_STATUSES: RunStatus[] = [
  "FINISHED",
  "ERROR",
  "CANCELLED",
  "EXPIRED",
];

export function isTerminal(status: RunStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function formatRunResult(run: CursorRun): string {
  const lines: string[] = [];

  lines.push(`Status: ${run.status}`);

  if (run.result) {
    lines.push("", run.result);
  }

  if (run.git?.branches?.length) {
    lines.push("", "Git:");
    for (const branch of run.git.branches) {
      if (branch.prUrl) lines.push(`PR: ${branch.prUrl}`);
      else if (branch.branch) lines.push(`Branch: ${branch.branch}`);
    }
  }

  if (run.durationMs != null) {
    lines.push("", `Duration: ${Math.round(run.durationMs / 1000)}s`);
  }

  return lines.join("\n");
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollRunAndFormat(
  env: Env,
  agentId: string,
  runId: string,
  maxAttempts = 120,
  intervalMs = 5000,
): Promise<CursorRun> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const run = await getRun(env, agentId, runId);
    if (isTerminal(run.status)) return run;
    await sleep(intervalMs);
  }

  return getRun(env, agentId, runId);
}
