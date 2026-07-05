import { getAdminBotToken, getUserBotToken } from "./bots";
import type { Env } from "./types";

export async function mirrorFileToUserBot(
  env: Env,
  adminFileId: string,
  kind: "video" | "document",
  mirrorChatId: number,
): Promise<string | null> {
  const adminToken = getAdminBotToken(env);
  const userToken = getUserBotToken(env);
  if (!adminToken || !userToken) return null;

  const fileInfoRes = await fetch(
    `${TELEGRAM_API}/bot${adminToken}/getFile?file_id=${encodeURIComponent(adminFileId)}`,
  );
  const fileInfo = (await fileInfoRes.json()) as {
    ok?: boolean;
    result?: { file_path?: string };
  };
  const filePath = fileInfo.result?.file_path;
  if (!filePath) return null;

  const fileRes = await fetch(`${TELEGRAM_API}/file/bot${adminToken}/${filePath}`);
  if (!fileRes.ok) return null;

  const formData = new FormData();
  formData.append("chat_id", String(mirrorChatId));
  formData.append("disable_notification", "true");
  if (kind === "video") {
    formData.append("video", await fileRes.blob(), "video.mp4");
  } else {
    formData.append("document", await fileRes.blob(), "video.mp4");
  }

  const method = kind === "video" ? "sendVideo" : "sendDocument";
  const sendRes = await fetch(`${TELEGRAM_API}/bot${userToken}/${method}`, {
    method: "POST",
    body: formData,
  });
  const sendJson = (await sendRes.json()) as {
    ok?: boolean;
    result?: {
      message_id?: number;
      video?: { file_id: string };
      document?: { file_id: string };
    };
  };
  if (!sendJson.ok || !sendJson.result) return null;

  const userFileId =
    sendJson.result.video?.file_id ?? sendJson.result.document?.file_id ?? null;

  if (userFileId && sendJson.result.message_id) {
    await fetch(`${TELEGRAM_API}/bot${userToken}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: mirrorChatId,
        message_id: sendJson.result.message_id,
      }),
    });
  }

  return userFileId;
}
