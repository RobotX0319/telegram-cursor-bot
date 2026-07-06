import { formatHistoryBlock } from "./history";
import type { ChatTurn, Env } from "./types";

const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

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

export async function askGemini(
  env: Env,
  latestUserMessage: string,
  history: ChatTurn[] = [],
): Promise<string> {
  const apiKey = resolveApiKey(env);

  const response = await fetch(`${GEMINI_API}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildUserPrompt(history, latestUserMessage) }],
        },
      ],
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
