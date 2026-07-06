import type { Env } from "./types";

const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export async function askGemini(env: Env, prompt: string): Promise<string> {
  if (!env.GEMINI_API_KEY?.trim()) {
    throw new Error("GEMINI_API_KEY sozlanmagan");
  }

  const response = await fetch(`${GEMINI_API}?key=${env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
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
