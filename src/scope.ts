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

export const AGENT_SCOPE_PREFIX = `[SCOPE — MUHIM]
Sen faqat quyidagi loyiha doirasida ishlaysan:
- Telegram bot (Cloudflare Worker, webhook, buyruqlar, handlerlar)
- Web interface / admin panel (HTML, CSS, JS/TS frontend)
- Deploy va GitHub Actions (shu loyiha uchun)

QILMA:
- Boshqa loyihalar, umumiy savollar, repodan tashqari vazifalar
- wrangler deploy yoki Cloudflare dashboard (GitHub Actions deploy qiladi)
- Secretlar yoki tokenlarni repoga yozish

Vazifa:
`;

export function wrapPromptForAgent(userPrompt: string): string {
  return `${AGENT_SCOPE_PREFIX}${userPrompt.trim()}`;
}
