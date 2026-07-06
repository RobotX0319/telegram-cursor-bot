/** Admin videoga qo'yadigan ID va ixtiyoriy sarlavha. */
export function parseManualVideoId(
  caption?: string,
): { id: number; title?: string } | null {
  if (!caption?.trim()) return null;

  const text = caption.trim();
  if (/^\d+$/.test(text)) {
    return { id: Number.parseInt(text, 10) };
  }

  const withSep = text.match(/^(\d+)\s*[|:：\-—]\s*(.+)$/);
  if (withSep) {
    return {
      id: Number.parseInt(withSep[1]!, 10),
      title: withSep[2]!.trim(),
    };
  }

  const withSpace = text.match(/^(\d+)\s+(.+)$/);
  if (withSpace) {
    return {
      id: Number.parseInt(withSpace[1]!, 10),
      title: withSpace[2]!.trim(),
    };
  }

  return null;
}

export function parseIdFromText(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const id = Number.parseInt(trimmed, 10);
  return id > 0 ? id : null;
}

export function parseIdCommand(args: string): number | null {
  const match = args.trim().match(/^(\d+)/);
  if (!match) return null;
  const id = Number.parseInt(match[1]!, 10);
  return id > 0 ? id : null;
}
