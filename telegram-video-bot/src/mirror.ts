import { getAdminBotToken, getUserBotToken } from "./bots";
import type { Env } from "./types";

const TELEGRAM_API = "https://api.telegram.org";

type MirrorResult = {
  fileId: string;
  mirrorChatId: number;
  mirrorMessageId: number;
} | null;

export type AdminMediaDelivery = {
  ok: true;
  fileId: string;
} | {
  ok: false;
  error: string;
};

/** Admin bot photo file_id → foydalanuvchi bot file_id. */
export async function mirrorPhotoToUserBot(
  env: Env,
  adminFileId: string,
  mirrorChatId: number,
): Promise<string | null> {
  const result = await mirrorFileToUserBotDetailed(
    env,
    adminFileId,
    "photo",
    mirrorChatId,
  );
  if (result) {
    deleteMirrorMessage(env, result.mirrorChatId, result.mirrorMessageId);
  }
  return result?.fileId ?? null;
}

/** Admin bot file_id → foydalanuvchi bot file_id (Telegram URL orqali, Worker yuklamasdan). */
export async function mirrorFileToUserBot(
  env: Env,
  adminFileId: string,
  kind: "video" | "document",
  mirrorChatId: number,
): Promise<string | null> {
  const result = await mirrorFileToUserBotDetailed(
    env,
    adminFileId,
    kind,
    mirrorChatId,
  );
  if (result) {
    deleteMirrorMessage(env, result.mirrorChatId, result.mirrorMessageId);
  }
  return result?.fileId ?? null;
}

/** Admin bot faylini foydalanuvchiga to'g'ridan-to'g'ri yuborish (ko'rinadigan xabar). */
export async function deliverMediaFromAdminFile(
  env: Env,
  adminFileId: string,
  kind: "video" | "document",
  targetChatId: number,
  caption?: string,
): Promise<AdminMediaDelivery> {
  const adminToken = getAdminBotToken(env);
  const userToken = getUserBotToken(env);
  if (!adminToken || !userToken) {
    return { ok: false, error: "Bot token sozlanmagan" };
  }

  const filePath = await getAdminFilePath(adminToken, adminFileId);
  if (!filePath) {
    return { ok: false, error: "Admin fayl topilmadi" };
  }

  const viaUrl = await sendMediaViaUrl(
    userToken,
    adminToken,
    filePath,
    kind,
    targetChatId,
    caption,
    false,
  );
  if (viaUrl?.fileId) {
    return { ok: true, fileId: viaUrl.fileId };
  }

  const viaDownload = await sendMediaViaDownload(
    userToken,
    adminToken,
    filePath,
    kind,
    targetChatId,
    caption,
    false,
  );
  if (viaDownload?.fileId) {
    return { ok: true, fileId: viaDownload.fileId };
  }

  return { ok: false, error: "Video yuborilmadi" };
}

async function mirrorFileToUserBotDetailed(
  env: Env,
  adminFileId: string,
  kind: "video" | "document" | "photo",
  mirrorChatId: number,
): Promise<MirrorResult> {
  const adminToken = getAdminBotToken(env);
  const userToken = getUserBotToken(env);
  if (!adminToken || !userToken) return null;

  const filePath = await getAdminFilePath(adminToken, adminFileId);
  if (!filePath) return null;

  const viaDownload = await sendMediaViaDownload(
    userToken,
    adminToken,
    filePath,
    kind,
    mirrorChatId,
    undefined,
    true,
  );
  if (viaDownload) return viaDownload;

  return sendMediaViaUrl(
    userToken,
    adminToken,
    filePath,
    kind,
    mirrorChatId,
    undefined,
    true,
  );
}

async function getAdminFilePath(
  adminToken: string,
  adminFileId: string,
): Promise<string | null> {
  const fileInfoRes = await fetch(
    `${TELEGRAM_API}/bot${adminToken}/getFile?file_id=${encodeURIComponent(adminFileId)}`,
  );
  const fileInfo = (await fileInfoRes.json()) as {
    ok?: boolean;
    result?: { file_path?: string };
  };
  return fileInfo.result?.file_path ?? null;
}

async function sendMediaViaUrl(
  userToken: string,
  adminToken: string,
  filePath: string,
  kind: "video" | "document" | "photo",
  targetChatId: number,
  caption: string | undefined,
  silent: boolean,
): Promise<MirrorResult> {
  const fileUrl = `${TELEGRAM_API}/file/bot${adminToken}/${filePath}`;
  const method =
    kind === "video"
      ? "sendVideo"
      : kind === "photo"
        ? "sendPhoto"
        : "sendDocument";
  const field =
    kind === "video" ? "video" : kind === "photo" ? "photo" : "document";

  const sendRes = await fetch(`${TELEGRAM_API}/bot${userToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: targetChatId,
      [field]: fileUrl,
      disable_notification: silent,
      ...(caption ? { caption } : {}),
      ...(kind === "video" ? { supports_streaming: true } : {}),
    }),
  });

  return parseMirrorResponse(sendRes, `${method} via URL`);
}

async function sendMediaViaDownload(
  userToken: string,
  adminToken: string,
  filePath: string,
  kind: "video" | "document" | "photo",
  targetChatId: number,
  caption: string | undefined,
  silent: boolean,
): Promise<MirrorResult> {
  const fileRes = await fetch(`${TELEGRAM_API}/file/bot${adminToken}/${filePath}`);
  if (!fileRes.ok) {
    console.error("Admin file download failed:", fileRes.status);
    return null;
  }

  const formData = new FormData();
  formData.append("chat_id", String(targetChatId));
  formData.append("disable_notification", String(silent));
  if (caption) formData.append("caption", caption);

  const blob = await fileRes.blob();
  if (kind === "video") {
    formData.append("video", blob, "video.mp4");
  } else if (kind === "photo") {
    formData.append("photo", blob, "photo.jpg");
  } else {
    formData.append("document", blob, "video.mp4");
  }

  const method =
    kind === "video"
      ? "sendVideo"
      : kind === "photo"
        ? "sendPhoto"
        : "sendDocument";
  const sendRes = await fetch(`${TELEGRAM_API}/bot${userToken}/${method}`, {
    method: "POST",
    body: formData,
  });

  return parseMirrorResponse(sendRes, `${method} via download`);
}

async function parseMirrorResponse(
  sendRes: Response,
  label: string,
): Promise<MirrorResult> {
  const sendJson = (await sendRes.json()) as {
    ok?: boolean;
    description?: string;
    result?: {
      message_id?: number;
      chat?: { id: number };
      video?: { file_id: string };
      document?: { file_id: string };
      photo?: Array<{ file_id: string }>;
    };
  };

  if (!sendJson.ok || !sendJson.result) {
    console.error(`Mirror ${label} failed:`, sendRes.status, sendJson.description);
    return null;
  }

  const fileId =
    sendJson.result.video?.file_id ??
    sendJson.result.document?.file_id ??
    sendJson.result.photo?.[sendJson.result.photo.length - 1]?.file_id ??
    null;
  const messageId = sendJson.result.message_id;
  const chatId = sendJson.result.chat?.id;

  if (!fileId || messageId == null || chatId == null) return null;

  return { fileId, mirrorChatId: chatId, mirrorMessageId: messageId };
}

function deleteMirrorMessage(
  env: Env,
  chatId: number,
  messageId: number,
): void {
  const userToken = getUserBotToken(env);
  fetch(`${TELEGRAM_API}/bot${userToken}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  }).catch(() => {});
}
