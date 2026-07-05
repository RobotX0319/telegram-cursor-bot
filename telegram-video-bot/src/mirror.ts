import { getAdminBotToken, getUserBotToken } from "./bots";
import type { Env } from "./types";

const TELEGRAM_API = "https://api.telegram.org";

type MirrorResult = {
  fileId: string;
  mirrorChatId: number;
  mirrorMessageId: number;
} | null;

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

  const viaUrl = await sendMirrorViaUrl(
    userToken,
    adminToken,
    filePath,
    kind,
    mirrorChatId,
  );
  if (viaUrl) return viaUrl;

  return sendMirrorViaDownload(
    userToken,
    adminToken,
    filePath,
    kind,
    mirrorChatId,
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

async function sendMirrorViaUrl(
  userToken: string,
  adminToken: string,
  filePath: string,
  kind: "video" | "document" | "photo",
  mirrorChatId: number,
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
      chat_id: mirrorChatId,
      [field]: fileUrl,
      disable_notification: true,
      ...(kind === "video" ? { supports_streaming: true } : {}),
    }),
  });

  return parseMirrorResponse(sendRes);
}

async function sendMirrorViaDownload(
  userToken: string,
  adminToken: string,
  filePath: string,
  kind: "video" | "document" | "photo",
  mirrorChatId: number,
): Promise<MirrorResult> {
  const fileRes = await fetch(`${TELEGRAM_API}/file/bot${adminToken}/${filePath}`);
  if (!fileRes.ok) return null;

  const formData = new FormData();
  formData.append("chat_id", String(mirrorChatId));
  formData.append("disable_notification", "true");
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

  return parseMirrorResponse(sendRes);
}

async function parseMirrorResponse(
  sendRes: Response,
): Promise<MirrorResult> {
  const sendJson = (await sendRes.json()) as {
    ok?: boolean;
    result?: {
      message_id?: number;
      chat?: { id: number };
      video?: { file_id: string };
      document?: { file_id: string };
      photo?: Array<{ file_id: string }>;
    };
  };

  if (!sendJson.ok || !sendJson.result) return null;

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
