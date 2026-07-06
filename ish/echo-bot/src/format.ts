function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function markdownToTelegramHtml(text: string): string {
  const placeholders: string[] = [];

  const protect = (value: string): string => {
    const key = `\x00${placeholders.length}\x00`;
    placeholders.push(value);
    return key;
  };

  let source = text;

  source = source.replace(/```([\s\S]*?)```/g, (_, code: string) =>
    protect(`<pre>${escapeHtml(code.trim())}</pre>`),
  );

  source = source.replace(/`([^`\n]+)`/g, (_, code: string) =>
    protect(`<code>${escapeHtml(code)}</code>`),
  );

  source = escapeHtml(source);

  source = source.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  source = source.replace(/__([^_]+)__/g, "<b>$1</b>");
  source = source.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<i>$1</i>");
  source = source.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<i>$1</i>");
  source = source.replace(/^### (.+)$/gm, "<b>$1</b>");
  source = source.replace(/^## (.+)$/gm, "<b>$1</b>");
  source = source.replace(/^# (.+)$/gm, "<b>$1</b>");

  for (let i = 0; i < placeholders.length; i++) {
    source = source.replace(`\x00${i}\x00`, placeholders[i]!);
  }

  return source;
}
