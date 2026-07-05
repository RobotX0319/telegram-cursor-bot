import type { CursorRun, RunStatus } from "./types";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
  const cleaned = text.trim().replace(/\s+/g, " ");
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
    lines.push("", run.result);
  }

  return lines.join("\n");
}

export function formatRunResultHtml(run: CursorRun): string {
  const emoji = statusEmoji(run.status);
  const label = statusLabel(run.status);
  const parts: string[] = [];

  parts.push(`${emoji} <b>${label}</b>`);
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
    const result = run.result.trim();
    parts.push("");
    parts.push("📝 <b>Qisqa xulosa</b>");
    parts.push(escapeHtml(extractSummary(result)));

    parts.push("");
    parts.push("📄 <b>To'liq javob</b>");
    const maxBody = 3000;
    const body =
      result.length > maxBody
        ? `${result.slice(0, maxBody)}\n\n… (qisqartirildi, /status bilan qayta ko'ring)`
        : result;
    parts.push(`<pre>${escapeHtml(body)}</pre>`);
  }

  return parts.join("\n");
}
