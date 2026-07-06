import { getAdminPanelPath, getWebhookSecret } from "./config";
import { connectAdminBotToken } from "./admin-bot-setup";
import { handleWebAdminApi, renderWebAdminPage } from "./admin-web";
import { saveBotTokens } from "./bots";
import type { Env } from "./types";

function isAuthorized(url: URL, env: Env): boolean {
  const key = url.searchParams.get("key");
  return Boolean(key && key === getWebhookSecret(env));
}

export async function handleAdminRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);

  if (!isAuthorized(url, env)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const panelPath = getAdminPanelPath(env);

  if (request.method === "POST" && url.pathname === `${panelPath}/api/bootstrap/tokens`) {
    let body: { userToken?: string; adminToken?: string; adminIds?: string };
    try {
      body = (await request.json()) as {
        userToken?: string;
        adminToken?: string;
        adminIds?: string;
      };
    } catch {
      return Response.json({ ok: false, error: "JSON kerak" }, { status: 400 });
    }

    if (!body.userToken?.trim() && !body.adminToken?.trim() && !body.adminIds?.trim()) {
      return Response.json({ ok: false, error: "Kamida bitta maydon kerak" }, { status: 400 });
    }

    await saveBotTokens(env, body);

    let adminConnect: Awaited<ReturnType<typeof connectAdminBotToken>> | null =
      null;
    if (body.adminToken?.trim()) {
      adminConnect = await connectAdminBotToken(
        env,
        url.origin,
        body.adminToken.trim(),
      );
    }

    return Response.json({
      ok: true,
      admin: adminConnect,
    });
  }

  const apiResponse = await handleWebAdminApi(request, url, env, panelPath);
  if (apiResponse) return apiResponse;

  if (request.method === "GET" && url.pathname === panelPath) {
    const key = url.searchParams.get("key") ?? "";
    return new Response(renderWebAdminPage(key, panelPath), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

export { getAdminPanelUrl } from "./admin-web";
