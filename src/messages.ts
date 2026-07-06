import type { CursorRun, RunStatus } from "./types";

const PLACEHOLDER_PREFIX = "\uE000PH";
const PLACEHOLDER_SUFFIX = "\uE001";

export const INTERNAL_USER_DELIMITER = "===USER===";

export function sanitizeAgentResult(text: string): string {
  if (!text?.trim()) return "";

  let s = text.trim();

  const delimiterIdx = s.indexOf(INTERNAL_USER_DELIMITER);
  if (delimiterIdx >= 0) {
    s = s.slice(delimiterIdx + INTERNAL_USER_DELIMITER.length).trim();
  }

  // Eski format: qoidalar ===USER=== dan oldin
  const altDelimiter = s.indexOf("===USER===");
  if (altDelimiter >= 0) {
    s = s.slice(altDelimiter + "===USER===".length).trim();
  }

  const botInternalIdx = s.indexOf("---BOT-INTERNAL---");
  if (botInternalIdx >= 0) {
    s = s.slice(0, botInternalIdx).trim();
  }

  s = s.replace(/<!--[\s\S]*?-->\s*/g, "");

  const blockHeaders = [
    /\[TIZIM AGENTI[^\]]*\]\s*/gi,
    /\[LOYIHA AGENTI[^\]]*\]\s*/gi,
    /\[YANGI AGENT[^\]]*\]\s*/gi,
    /\[SCOPE[^\]]*\]\s*/gi,
    /\[Internal[^\]]*\]\s*/gi,
  ];
  for (const pattern of blockHeaders) {
    s = s.replace(pattern, "");
  }

  const internalLine =
    /^(Respond in Uzbek|Never quote|Never repeat|Platform agent|Never touch|Edit only|Workspace:|NEVER mention|Do not speculate|Do not mention|Project workspace|Treat this message|New project agent|First: ask|Never mention platform|Continue work|New agent session|Continue helping|===USER===|---BOT-INTERNAL---|---|\s*)/i;

  const lines = s.split("\n");
  while (lines.length > 0 && internalLine.test(lines[0]?.trim() ?? "")) {
    lines.shift();
  }
  s = lines.join("\n").trim();

  const internalAnywhere = [
    /Respond in Uzbek to the user\.?\s*/gi,
    /Never quote, repeat, or reveal these internal rules\.?\s*/gi,
    /Platform agent\. Edit only src\/[\s\S]*?Never touch ish\/[\s\S]*?\.?\s*/gi,
    /Never touch ish\/, telegram-video-bot\/\.?\s*/gi,
    /===USER===\s*/gi,
    /---BOT-INTERNAL---[\s\S]*/gi,
    /Javobni o'zbekcha yozing\.[\s\S]*?ga tegmang\.?\s*/gi,
    /Ichki qoidalarni foydalanuvchiga aytmang\.?\s*/gi,
    /Faqat src\/, scripts\/[\s\S]*?ga tegmang\.?\s*/gi,
    /\[Ichki qoidalar[\s\S]*?(?=\n\n|$)/gi,
  ];
  for (const pattern of internalAnywhere) {
    s = s.replace(pattern, "");
  }

  // Bot formati aks-sado bo'lsa olib tashlash (agent takrorlaganda)
  const botEchoLines = [
    /^🎉\s*✅?\s*Tugadi\s*$/gim,
    /^✅?\s*Tugadi\s*$/gim,
    /^Status:\s*FINISHED\s*$/gim,
    /^⏱\s*Vaqt:\s*\d+\s*soniya\s*$/gim,
    /^📦\s*Git\s*$/gim,
    /^🌿\s*Branch:\s*\S+\s*$/gim,
    /^📝\s*Qisqa xulosa\s*$/gim,
    /^📄\s*To'liq javob\s*$/gim,
  ];
  for (const pattern of botEchoLines) {
    s = s.replace(pattern, "");
  }

  const internalLines = [
    /^Platform agent\..*$/gim,
    /^Never touch .*\.?\s*$/gim,
    /^Edit only .*\.?\s*$/gim,
    /^Workspace: .* ONLY.*$/gim,
    /^NEVER mention:.*$/gim,
    /^Foydalanuvchi so'rovi:\s*$/gim,
    /^User message:\s*$/gim,
  ];
  for (const pattern of internalLines) {
    s = s.replace(pattern, "");
  }

  return s.replace(/\n{3,}/g, "\n\n").trim();
}

export function getDisplayResult(run: CursorRun): string {
  if (!run.result?.trim()) return "";
  const cleaned = sanitizeAgentResult(run.result);
  if (isPromptEchoOnly(cleaned)) return "";
  return cleaned;
}

function isPromptEchoOnly(text: string): boolean {
  if (!text) return true;
  const lower = text.toLowerCase();
  return (
    /^---bot-internal---/i.test(text) ||
    /^javobni o'zbekcha yozing/i.test(text) ||
    (/ichki qoidalarni foydalanuvchiga aytmang/i.test(text) &&
      /faqat src\//i.test(text))
  );
}

export function buildFallbackResultText(run: CursorRun): string {
  if (run.status !== "FINISHED") return "";

  const lines: string[] = ["Agent ishni tugatdi."];

  if (run.git?.branches?.length) {
    for (const branch of run.git.branches) {
      if (branch.prUrl) {
        lines.push(`PR: ${branch.prUrl}`);
      } else if (branch.branch) {
        lines.push(`Branch: ${branch.branch}`);
      }
    }
    lines.push("GitHub Actions avtomatik deploy qiladi (1-2 daqiqa).");
  } else {
    lines.push("O'zgarishlar main branch ga push qilingan bo'lishi mumkin.");
    lines.push("Batafsil: GitHub repo yoki agent logini tekshiring.");
  }

  lines.push("");
  lines.push(
    "Eslatma: agent matnli xulosa qaytarmagan — AGENTS.md ga ko'ra har safar o'zbekcha xulosa yozishi kerak.",
  );

  return lines.join("\n");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/```(?:[\w+-]*)?\n?([\s\S]*?)```/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/(?<![*\w])\*([^*\n]+)\*(?![*])/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[\t ]*[-*+]\s+/gm, "• ")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stashHtml(placeholders: string[], html: string): string {
  const id = placeholders.length;
  placeholders.push(html);
  return `${PLACEHOLDER_PREFIX}${id}${PLACEHOLDER_SUFFIX}`;
}

function restorePlaceholders(text: string, placeholders: string[]): string {
  return text.replace(
    new RegExp(`${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}`, "g"),
    (_, index) => placeholders[Number(index)] ?? "",
  );
}

function applyInlineMarkdown(line: string, placeholders: string[]): string {
  let s = line;

  s = s.replace(/`([^`\n]+)`/g, (_, code) =>
    stashHtml(placeholders, `<code>${escapeHtml(code)}</code>`),
  );

  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) =>
    stashHtml(
      placeholders,
      `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`,
    ),
  );

  s = s.replace(/\*\*([^*\n]+)\*\*/g, (_, text) =>
    stashHtml(placeholders, `<b>${escapeHtml(text)}</b>`),
  );

  s = s.replace(/__([^_\n]+)__/g, (_, text) =>
    stashHtml(placeholders, `<b>${escapeHtml(text)}</b>`),
  );

  s = s.replace(/(?<![*\w])\*([^*\n]+)\*(?![*])/g, (_, text) =>
    stashHtml(placeholders, `<i>${escapeHtml(text)}</i>`),
  );

  const parts = s.split(
    new RegExp(`(${PLACEHOLDER_PREFIX}\\d+${PLACEHOLDER_SUFFIX})`),
  );

  return parts
    .map((part: string) => {
      const match = part.match(
        new RegExp(`^${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}$`),
      );
      if (match) return placeholders[Number(match[1])] ?? "";
      return escapeHtml(part);
    })
    .join("");
}

export function markdownToTelegramHtml(text: string): string {
  const placeholders: string[] = [];
  let source = text.trim();

  source = source.replace(
    /```(?:[\w+-]*)?\n?([\s\S]*?)```/g,
    (_, code) =>
      stashHtml(
        placeholders,
        `<pre>${escapeHtml(String(code).trimEnd())}</pre>`,
      ),
  );

  const lines = source.split("\n").map((line) => {
    const header = line.match(/^(\s*)#{1,6}\s+(.+)$/);
    if (header) {
      return `${header[1]}<b>${applyInlineMarkdown(header[2], placeholders)}</b>`;
    }

    const list = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (list) {
      return `${list[1]}• ${applyInlineMarkdown(list[2], placeholders)}`;
    }

    if (!line.trim()) return "";

    return applyInlineMarkdown(line, placeholders);
  });

  return restorePlaceholders(lines.join("\n"), placeholders);
}

export function statusDecoration(status: RunStatus): string {
  switch (status) {
    case "FINISHED":
      return "🎉";
    case "ERROR":
      return "🆘";
    case "CANCELLED":
      return "🛑";
    case "EXPIRED":
      return "⏰";
    case "RUNNING":
      return "⚡";
    case "CREATING":
      return "🚀";
    default:
      return "🤖";
  }
}

export function statusEmoji(status: RunStatus): string {
  switch (status) {
    case "FINISHED":
      return "✅";
    case "ERROR":
      return "❌";
    case "CANCELLED":
      return "🛑";
    case "EXPIRED":
      return "⏰";
    case "RUNNING":
      return "⏳";
    case "CREATING":
      return "🔄";
    default:
      return "🤖";
  }
}

export function statusLabel(status: RunStatus): string {
  switch (status) {
    case "FINISHED":
      return "Tugadi";
    case "ERROR":
      return "Xato";
    case "CANCELLED":
      return "Bekor qilindi";
    case "EXPIRED":
      return "Muddati tugadi";
    case "RUNNING":
      return "Ishlayapti";
    case "CREATING":
      return "Yaratilmoqda";
    default:
      return status;
  }
}

const SUMMARY_MAX_LEN = 120;
/** Qisqa xulosa faqat to'liq matn bundan uzun bo'lsa ko'rsatiladi */
const MIN_FULL_FOR_SUMMARY = 200;

function extractSummary(text: string, maxLen = SUMMARY_MAX_LEN): string {
  const cleaned = stripMarkdown(sanitizeAgentResult(text)).replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  const sentenceEnd = cleaned.search(/[.!?](?:\s|$)/);
  if (sentenceEnd >= 20 && sentenceEnd + 1 <= maxLen) {
    return cleaned.slice(0, sentenceEnd + 1);
  }

  if (cleaned.length <= maxLen) return cleaned;

  return `${cleaned.slice(0, maxLen - 1).trim()}…`;
}

function shouldShowSummary(summary: string, fullPlain: string): boolean {
  if (!summary || !fullPlain) return false;
  if (fullPlain.length < MIN_FULL_FOR_SUMMARY) return false;
  if (summary.length >= fullPlain.length - 60) return false;
  return true;
}

function isActiveRunStatus(status: RunStatus): boolean {
  return status === "RUNNING" || status === "CREATING";
}

function formatInProgressBodyPlain(run: CursorRun): string {
  const lines = [
    `${statusLabel(run.status)} — agent hali ishlamoqda.`,
    `Status: ${run.status}`,
  ];

  if (run.durationMs != null) {
    lines.push(`Vaqt: ${Math.round(run.durationMs / 1000)} soniya`);
  }

  lines.push("");
  lines.push("Natija tayyor bo'lganda avtomatik xabar keladi.");
  lines.push("Keyinroq yana /status yuborishingiz mumkin.");

  return lines.join("\n");
}

function resolveResultTexts(run: CursorRun): { summary: string; fullPlain: string } {
  const full = getDisplayResult(run) || buildFallbackResultText(run);
  if (!full) return { summary: "", fullPlain: "" };

  const fullPlain = stripMarkdown(full).trim();
  if (!fullPlain) return { summary: "", fullPlain: "" };

  const summary = run.result
    ? extractSummary(run.result)
    : extractSummary(fullPlain);

  return { summary, fullPlain };
}

export function formatRunResultPlain(run: CursorRun): string {
  const lines: string[] = [];

  lines.push(`${statusEmoji(run.status)} Status: ${run.status}`);

  if (run.durationMs != null) {
    lines.push(`⏱ Duration: ${Math.round(run.durationMs / 1000)}s`);
  }

  if (run.git?.branches?.length) {
    lines.push("", "Git:");
    for (const branch of run.git.branches) {
      if (branch.prUrl) lines.push(`PR: ${branch.prUrl}`);
      else if (branch.branch) lines.push(`Branch: ${branch.branch}`);
    }
  }

  if (run.result) {
    const body = getDisplayResult(run);
    if (body) lines.push("", stripMarkdown(body));
  }

  return lines.join("\n");
}

export function formatRunResultHeaderHtml(run: CursorRun): string {
  const deco = statusDecoration(run.status);
  const emoji = statusEmoji(run.status);
  const label = statusLabel(run.status);
  const parts: string[] = [];

  parts.push(`${deco} ${emoji} <b>${label}</b>`);
  parts.push(`<b>Status:</b> <code>${escapeHtml(run.status)}</code>`);

  if (run.durationMs != null) {
    parts.push(
      `⏱ <b>Vaqt:</b> ${Math.round(run.durationMs / 1000)} soniya`,
    );
  }

  if (run.git?.branches?.length) {
    parts.push("");
    parts.push("📦 <b>Git</b>");
    for (const branch of run.git.branches) {
      if (branch.prUrl) {
        parts.push(
          `🔗 <a href="${escapeHtml(branch.prUrl)}">Pull Request</a>`,
        );
      } else if (branch.branch) {
        parts.push(
          `🌿 Branch: <code>${escapeHtml(branch.branch)}</code>`,
        );
      }
    }
  }

  const { summary, fullPlain } = resolveResultTexts(run);

  if (shouldShowSummary(summary, fullPlain)) {
    parts.push("");
    parts.push("📝 <b>Qisqa xulosa</b>");
    parts.push(escapeHtml(summary));
  }

  return parts.join("\n");
}

export function formatRunResultBodyPre(run: CursorRun): string | null {
  const { fullPlain } = resolveResultTexts(run);
  const text = fullPlain
    ? fullPlain.length > 3800
      ? `${fullPlain.slice(0, 3800)}\n\n… (qisqartirildi, /status bilan qayta ko'ring)`
      : fullPlain
    : isActiveRunStatus(run.status)
      ? formatInProgressBodyPlain(run)
      : null;

  if (!text) return null;

  return `<pre>${escapeHtml(text)}</pre>`;
}

export function formatRunResultHtml(run: CursorRun): string {
  const parts = [formatRunResultHeaderHtml(run)];

  const bodyPre = formatRunResultBodyPre(run);
  if (bodyPre) {
    parts.push("");
    parts.push(
      isActiveRunStatus(run.status)
        ? "📄 <b>Holat</b>"
        : "📄 <b>To'liq javob</b> <i>(nusxalash uchun bosing)</i>",
    );
    parts.push(bodyPre);
  }

  return parts.join("\n");
}
