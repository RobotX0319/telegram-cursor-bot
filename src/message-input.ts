import type { CursorPromptImage, Env, TelegramMessage } from "./types";

const TELEGRAM_API = "https://api.telegram.org";
const MAX_IMAGES = 5;
const MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export interface ParsedUserMessage {
  text: string;
  images: CursorPromptImage[];
}

function mimeFromPath(filePath: string): string | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

function normalizeMime(
  mime?: string,
  filePath?: string,
): CursorPromptImage["mimeType"] | null {
  const raw = mime?.split(";")[0]?.trim().toLowerCase();
  if (raw === "image/jpg") return "image/jpeg";
  if (raw && ALLOWED_MIME.has(raw)) return raw as CursorPromptImage["mimeType"];
  if (filePath) return mimeFromPath(filePath) as CursorPromptImage["mimeType"] | null;
  return null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function resolveTelegramFilePath(
  env: Env,
  fileId: string,
): Promise<string | null> {
  const response = await fetch(
    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  if (!response.ok) return null;
  const data = (await response.json()) as {
    ok: boolean;
    result?: { file_path?: string };
  };
  return data.ok ? (data.result?.file_path ?? null) : null;
}

async function downloadTelegramFile(
  env: Env,
  fileId: string,
  mimeHint?: string,
): Promise<CursorPromptImage | null> {
  const filePath = await resolveTelegramFilePath(env, fileId);
  if (!filePath) return null;

  const mimeType = normalizeMime(mimeHint, filePath);
  if (!mimeType) return null;

  const response = await fetch(
    `${TELEGRAM_API}/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`,
  );
  if (!response.ok) return null;

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null;

  return {
    data: arrayBufferToBase64(buffer),
    mimeType,
  };
}

function pickImageFileId(message: TelegramMessage): {
  fileId: string;
  mimeHint?: string;
} | null {
  if (message.photo?.length) {
    const largest = message.photo[message.photo.length - 1];
    return { fileId: largest.file_id, mimeHint: "image/jpeg" };
  }

  const doc = message.document;
  if (doc?.mime_type?.startsWith("image/")) {
    return { fileId: doc.file_id, mimeHint: doc.mime_type };
  }

  return null;
}

/** Telegram xabaridan matn va rasm(lar)ni ajratib oladi */
export async function parseTelegramUserMessage(
  env: Env,
  message: TelegramMessage,
): Promise<ParsedUserMessage | null> {
  const caption = message.caption?.trim();
  const textBody = message.text?.trim();
  const text = textBody || caption || "";

  const picked = pickImageFileId(message);
  const images: CursorPromptImage[] = [];

  if (picked) {
    const image = await downloadTelegramFile(
      env,
      picked.fileId,
      picked.mimeHint,
    );
    if (image) images.push(image);
  }

  if (!text && images.length === 0) return null;

  const promptText =
    text ||
    (images.length > 0
      ? "Foydalanuvchi rasm yubordi. Rasmni ko'ring va vazifani bajaring."
      : "");

  return {
    text: promptText,
    images: images.slice(0, MAX_IMAGES),
  };
}

export function hasTelegramImage(message: TelegramMessage): boolean {
  return Boolean(
    message.photo?.length ||
      message.document?.mime_type?.startsWith("image/"),
  );
}
