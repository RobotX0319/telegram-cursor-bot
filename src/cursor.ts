import { formatRunResultPlain } from "./messages";
import { resolveCursorApiKey } from "./secrets";
import { finalizePromptForCursor } from "./scope";
import type {
  CreateAgentResponse,
  CreateRunResponse,
  CursorAgent,
  CursorPromptImage,
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

function buildPromptBody(text: string, images?: CursorPromptImage[]) {
  const scopedPrompt = finalizePromptForCursor(text);
  const body: {
    text: string;
    images?: CursorPromptImage[];
  } = { text: scopedPrompt };
  if (images?.length) {
    body.images = images;
  }
  return body;
}

export async function createAgent(
  env: Env,
  prompt: string,
  repoUrl: string,
  startingRef?: string,
  images?: CursorPromptImage[],
): Promise<CreateAgentResponse> {
  const branch = startingRef ?? env.DEFAULT_GITHUB_BRANCH ?? "main";
  return cursorFetch<CreateAgentResponse>(env, "/agents", {
    method: "POST",
    body: JSON.stringify({
      prompt: buildPromptBody(prompt, images),
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
  images?: CursorPromptImage[],
): Promise<CreateRunResponse> {
  return cursorFetch<CreateRunResponse>(env, `/agents/${agentId}/runs`, {
    method: "POST",
    body: JSON.stringify({
      prompt: buildPromptBody(prompt, images),
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

function parseRunStreamText(sseBody: string): string {
  let resultText = "";
  const assistantParts: string[] = [];

  for (const block of sseBody.split(/\n\n+/)) {
    const eventMatch = block.match(/^event:\s*(\S+)/m);
    const dataMatch = block.match(/^data:\s*(.+)$/m);
    if (!eventMatch || !dataMatch) continue;

    try {
      const data = JSON.parse(dataMatch[1]) as {
        text?: string;
      };
      const event = eventMatch[1];

      if (event === "assistant" && data.text) {
        assistantParts.push(data.text);
      }
      if (event === "result" && data.text) {
        resultText = data.text;
      }
    } catch {
      // not-json SSE chunk
    }
  }

  return resultText.trim() || assistantParts.join("").trim();
}

async function fetchRunStreamAssistantText(
  env: Env,
  agentId: string,
  runId: string,
): Promise<string> {
  const apiKey = await resolveCursorApiKey(env);
  if (!apiKey) return "";

  try {
    const response = await fetch(
      `${CURSOR_API}/agents/${agentId}/runs/${runId}/stream`,
      {
        headers: {
          Authorization: authHeader(apiKey),
          Accept: "text/event-stream",
        },
      },
    );

    if (!response.ok) return "";

    const body = await response.text();
    return parseRunStreamText(body);
  } catch {
    return "";
  }
}

/** Terminal run uchun result bo'sh bo'lsa qayta urinadi va streamdan matn oladi. */
export async function getRunForDisplay(
  env: Env,
  agentId: string,
  runId: string,
): Promise<CursorRun> {
  let run = await getRun(env, agentId, runId);

  if (!isTerminal(run.status) || run.result?.trim()) {
    return run;
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(2000);
    run = await getRun(env, agentId, runId);
    if (run.result?.trim()) return run;
  }

  const streamText = await fetchRunStreamAssistantText(env, agentId, runId);
  if (streamText) {
    return { ...run, result: streamText };
  }

  return run;
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
  return formatRunResultPlain(run);
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
    if (isTerminal(run.status)) {
      return getRunForDisplay(env, agentId, runId);
    }
    await sleep(intervalMs);
  }

  return getRunForDisplay(env, agentId, runId);
}
