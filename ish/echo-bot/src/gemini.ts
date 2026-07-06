import type { ChatTurn, Env } from "./types";

const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

function resolveApiKey(env: Env): string {
  if (env.GEMINI_API_KEY?.trim()) return env.GEMINI_API_KEY.trim();
  if (env.GEMINI_API_KEY_B64?.trim()) {
    return atob(env.GEMINI_API_KEY_B64.trim());
  }
  throw new Error("GEMINI_API_KEY sozlanmagan");
}

function toGeminiContents(history: ChatTurn[], prompt: string) {
  const contents = history.map((turn) => ({
    role: turn.role,
    parts: [{ text: turn.text }],
  }));

  contents.push({ role: "user" as const, parts: [{ text: prompt }] });
  return contents;
}

export async function askGemini(
  env: Env,
  prompt: string,
  history: ChatTurn[] = [],
): Promise<string> {
  const apiKey = resolveApiKey(env);

  const response = await fetch(`${GEMINI_API}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: toGeminiContents(history, prompt),
    }),
  });

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(data.error?.message ?? `Gemini xato: ${response.status}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) {
    throw new Error("Gemini bo'sh javob qaytardi");
  }

  return text;
}
