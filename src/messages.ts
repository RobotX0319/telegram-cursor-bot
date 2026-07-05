import type { CursorRun, RunStatus } from "./types";

const PLACEHOLDER_PREFIX = "\uE000PH";
const PLACEHOLDER_SUFFIX = "\uE001";

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

function extractSummary(text: string, maxLen = 280): string {
  const cleaned = stripMarkdown(text).replace(/\s+/g, " ");
  if (cleaned.length <= maxLen) return cleaned;

  const sentenceEnd = cleaned.search(/[.!?]\s/);
  if (sentenceEnd > 40 && sentenceEnd < maxLen) {
    return cleaned.slice(0, sentenceEnd + 1);
  }

  return `${cleaned.slice(0, maxLen - 1)}…`;
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
    lines.push("", stripMarkdown(run.result));
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

  if (run.result) {
    parts.push("");
    parts.push("📝 <b>Qisqa xulosa</b>");
    parts.push(escapeHtml(extractSummary(run.result)));
  }

  return parts.join("\n");
}

export function formatRunResultBodyPre(run: CursorRun): string | null {
  if (!run.result?.trim()) return null;

  const body = stripMarkdown(run.result.trim());
  const maxBody = 3800;
  const text =
    body.length > maxBody
      ? `${body.slice(0, maxBody)}\n\n… (qisqartirildi, /status bilan qayta ko'ring)`
      : body;

  return `<pre>${escapeHtml(text)}</pre>`;
}

export function formatRunResultHtml(run: CursorRun): string {
  const parts = [formatRunResultHeaderHtml(run)];

  const bodyPre = formatRunResultBodyPre(run);
  if (bodyPre) {
    parts.push("");
    parts.push("📄 <b>To'liq javob</b> <i>(nusxalash uchun bosing)</i>");
    parts.push(bodyPre);
  }

  return parts.join("\n");
}
