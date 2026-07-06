import { formatHistoryBlock } from "./history";
import type { ChatTurn, Env } from "./types";

const MODELS = [
  "gemini-flash-lite-latest",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
] as const;

const SYSTEM_INSTRUCTION = `Siz Telegram suhbat botisiz.

Sizga quyidagi ma'lumotlar beriladi:
1) Oldingi yozishmalar (User va Gemini xabarlari)
2) Oxirgi User xabari

Vazifangiz:
- Eski yozishmalarni o'qing va kontekstni tushuning
- Suhbat tarixidan kerakli ma'lumotlarni eslab qoling
- FAQAT oxirgi User xabariga javob bering
- Javob qisqa, aniq va suhbatga mos bo'lsin
- User/Gemini yorliqlarini javobda takrorlamang`;

function resolveApiKey(env: Env): string {
  if (env.GEMINI_API_KEY?.trim()) return env.GEMINI_API_KEY.trim();
  if (env.GEMINI_API_KEY_B64?.trim()) {
    return atob(env.GEMINI_API_KEY_B64.trim());
  }
  throw new Error("GEMINI_API_KEY sozlanmagan");
}

function buildUserPrompt(history: ChatTurn[], latestUserMessage: string): string {
  return `--- Oldingi yozishmalar ---
${formatHistoryBlock(history)}

--- Oxirgi xabar ---
User: ${latestUserMessage}`;
}

function parseRetrySeconds(message: string): number {
  const match = message.match(/retry in ([\d.]+)s/i);
  if (!match) return 25;
  return Math.min(Math.ceil(Number(match[1])), 60);
}

function isQuotaError(status: number, message: string): boolean {
  return status === 429 || /quota|rate.?limit|resource_exhausted/i.test(message);
}

async function callModel(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    error?: { message?: string; status?: string };
  };

  const errorMessage = data.error?.message ?? `Gemini xato: ${response.status}`;

  if (!response.ok) {
    const err = new Error(errorMessage) as Error & {
      status?: number;
      retryAfter?: number;
    };
    err.status = response.status;
    if (isQuotaError(response.status, errorMessage)) {
      err.retryAfter = parseRetrySeconds(errorMessage);
    }
    throw err;
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) {
    throw new Error("Gemini bo'sh javob qaytardi");
  }

  return text;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function askGemini(
  env: Env,
  latestUserMessage: string,
  history: ChatTurn[] = [],
): Promise<string> {
  const apiKey = resolveApiKey(env);
  const prompt = buildUserPrompt(history, latestUserMessage);
  let lastError = "Gemini javob bermadi";

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await callModel(apiKey, model, prompt);
      } catch (error) {
        const err = error as Error & { status?: number; retryAfter?: number };
        lastError = err.message;

        if (err.retryAfter && attempt === 0) {
          await sleep(err.retryAfter * 1000);
          continue;
        }

        break;
      }
    }
  }

  if (/quota|rate.?limit/i.test(lastError)) {
    throw new Error(
      "Gemini kvota tugadi. Biroz kuting (1-2 daqiqa) va qayta urinib ko'ring.",
    );
  }

  throw new Error(lastError);
}
