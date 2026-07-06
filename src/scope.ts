/** Agent faqat Telegram bot va web interface vazifalariga cheklangan. */

const ALLOWED_PATTERN =
  /telegram|bot|webhook|handler|cloudflare|worker|wrangler|buyruq|menyu|command|webhook|deploy|health|admin\s*panel|web\s*interface|ui|panel|html|css|tsx|jsx|frontend|interface|foydalanuvchi|xabar|chat|cursor|agent|repo|github|actions|kv|session|status|ping|version/i;

const BLOCKED_PATTERN =
  /password\s*crack|malware|phishing|ddos|exploit|bypass\s*auth|crypto\s*miner|ransomware/i;

export type ScopeResult =
  | { ok: true }
  | { ok: false; reason: "blocked" | "needs_approval"; message: string };

export function checkTaskScope(prompt: string): ScopeResult {
  const text = prompt.trim();
  if (!text) {
    return { ok: false, reason: "needs_approval", message: "Bo'sh vazifa." };
  }

  if (BLOCKED_PATTERN.test(text)) {
    return {
      ok: false,
      reason: "blocked",
      message: "Bu vazifa xavfsizlik siyosatiga zid.",
    };
  }

  if (ALLOWED_PATTERN.test(text)) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: "needs_approval",
    message:
      "Agent faqat Telegram bot va web interface vazifalarida ishlaydi.\n" +
      "Boshqa vazifa uchun ruxsat kerak: /request <vazifa>\n" +
      "Asosiy admin: /approve yoki /deny",
  };
}

export const SYSTEM_AGENT_SCOPE_PREFIX = `[SCOPE — TIZIM AGENT]
Sen TIZIM AGENTISAN — platforma kodiga kira olasan.
Ish doirasi:
- src/, scripts/, wrangler.jsonc — asosiy Telegram bot platformasi
- .github/workflows/ — deploy va CI/CD
- Web interface / admin panel (HTML, CSS, JS/TS frontend)

QILMA:
- Boshqa admin papkalariga (ish/, telegram-video-bot/, ...) tegish
- wrangler deploy yoki Cloudflare dashboard (GitHub Actions deploy qiladi)
- Secretlar yoki tokenlarni repoga yozish

Vazifa:
`;

export function buildProjectAgentScopePrefix(folder: string): string {
  return `[SCOPE — LOYIHA AGENT]
Sen LOYIHA AGENTISAN — TIZIM AGENTI EMASSAN.
Faqat quyidagi papkada ishlaysan: ${folder}/

TAQIQLANGAN (KIRMA, O'ZGARTIRMA):
- src/, scripts/ — platforma tizim kodi
- ish/, telegram-video-bot/ — boshqa adminlar loyihalari
- Repodagi boshqa papkalar

RUXSAT BERILGAN:
- ${folder}/ ichida Telegram bot, webhook, buyruqlar, admin panel (HTML/CSS/JS)

QILMA:
- wrangler deploy yoki Cloudflare dashboard
- Secretlar yoki tokenlarni repoga yozish
- "Men tizim agentiman" deb javob bermang — siz loyiha agentisiz

Vazifa:
`;
}

export const AWAITING_FOLDER_SCOPE_PREFIX = `[SCOPE — LOYIHA AGENT]
Sen LOYIHA AGENTISAN — TIZIM AGENTI EMASSAN.
Ish papkasi hali belgilanmagan.

HOZIR FAQAT:
- Yangi papka yaratish (masalan: my-loyiha)
- Papka nomini aniqlash

TAQIQLANGAN:
- src/, scripts/ — platforma kodi
- ish/, telegram-video-bot/ va boshqa admin papkalari
- Kod yozish yoki mavjud loyihalarni o'zgartirish

QILMA:
- "Men tizim agentiman" deb javob bermang

Vazifa:
`;

/** @deprecated use SYSTEM_AGENT_SCOPE_PREFIX */
export const AGENT_SCOPE_PREFIX = SYSTEM_AGENT_SCOPE_PREFIX;

export function promptHasScopeBlock(prompt: string): boolean {
  return /\[SCOPE\s*[—-]/i.test(prompt);
}

export function wrapPromptForAgent(userPrompt: string): string {
  return `${SYSTEM_AGENT_SCOPE_PREFIX}${userPrompt.trim()}`;
}

/** Cursor API ga yuborishdan oldin — scope allaqachon qo'shilgan bo'lsa takrorlamaydi */
export function finalizePromptForCursor(prompt: string): string {
  if (promptHasScopeBlock(prompt)) {
    return prompt;
  }
  return wrapPromptForAgent(prompt);
}
