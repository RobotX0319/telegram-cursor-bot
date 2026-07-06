import { countVideos, deleteVideo, listVideos } from "./storage";
import {
  addRequiredChannel,
  getSubscriptionConfig,
  removeRequiredChannel,
  setSubscriptionEnabled,
} from "./subscription";
import { isAdminUser } from "./admins";
import {
  createPanelSession,
  verifyPanelPassword,
} from "./panel-session";
import {
  isAdminRequestAuthorized,
  resolveLoginUserId,
} from "./webapp-auth";
import type { Env } from "./types";

export async function handleAdminRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const isPage =
    request.method === "GET" &&
    (url.pathname === "/admin" || url.pathname === "/admin/app");

  if (!isPage && url.pathname !== "/admin/api/login" && !(await isAdminRequestAuthorized(request, env))) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (request.method === "POST" && url.pathname === "/admin/api/login") {
    let body: { password?: string };
    try {
      body = (await request.json()) as { password?: string };
    } catch {
      return Response.json({ ok: false, error: "JSON kerak" }, { status: 400 });
    }

    const userId = await resolveLoginUserId(request, env);
    if (userId == null || !isAdminUser(env, userId)) {
      return Response.json({ ok: false, error: "Ruxsat yo'q" }, { status: 403 });
    }

    if (!verifyPanelPassword(env, body.password ?? "")) {
      return Response.json({ ok: false, error: "Parol noto'g'ri" }, { status: 401 });
    }

    const token = await createPanelSession(env, userId);
    return Response.json({ ok: true, token });
  }

  if (request.method === "GET" && url.pathname === "/admin/api/subscription") {
    const config = await getSubscriptionConfig(env);
    return Response.json(config);
  }

  if (request.method === "POST" && url.pathname === "/admin/api/subscription/toggle") {
    let body: { enabled?: boolean };
    try {
      body = (await request.json()) as { enabled?: boolean };
    } catch {
      return Response.json({ ok: false, error: "JSON kerak" }, { status: 400 });
    }

    if (typeof body.enabled !== "boolean") {
      return Response.json({ ok: false, error: "enabled kerak" }, { status: 400 });
    }

    const config = await setSubscriptionEnabled(env, body.enabled);
    return Response.json({ ok: true, config });
  }

  if (request.method === "POST" && url.pathname === "/admin/api/subscription/add") {
    let body: { channel?: string; url?: string; title?: string };
    try {
      body = (await request.json()) as { channel?: string; url?: string; title?: string };
    } catch {
      return Response.json({ ok: false, error: "JSON kerak" }, { status: 400 });
    }

    if (!body.channel?.trim()) {
      return Response.json({ ok: false, error: "channel kerak" }, { status: 400 });
    }

    const result = await addRequiredChannel(
      env,
      body.channel,
      body.url,
      body.title,
    );
    if (!result.ok) {
      return Response.json(result, { status: 400 });
    }

    return Response.json(result);
  }

  if (request.method === "POST" && url.pathname === "/admin/api/subscription/remove") {
    const channelId = url.searchParams.get("id");
    if (!channelId) {
      return Response.json({ ok: false, error: "id kerak" }, { status: 400 });
    }

    const config = await removeRequiredChannel(env, channelId);
    return Response.json({ ok: true, config });
  }

  if (request.method === "GET" && url.pathname === "/admin/api/videos") {
    const videos = await listVideos(env);
    const total = await countVideos(env);
    return Response.json({ total, videos });
  }

  if (request.method === "POST" && url.pathname === "/admin/api/delete") {
    const idParam = url.searchParams.get("id");
    if (!idParam || !/^\d+$/.test(idParam)) {
      return Response.json({ ok: false, error: "id kerak" }, { status: 400 });
    }

    const id = Number.parseInt(idParam, 10);
    const deleted = await deleteVideo(env, id);
    if (!deleted) {
      return Response.json({ ok: false, error: "topilmadi" }, { status: 404 });
    }

    return Response.json({ ok: true, id });
  }

  if (request.method === "GET" && url.pathname === "/admin") {
    const key = url.searchParams.get("key") ?? "";
    return new Response(renderAdminPage(key, false), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (request.method === "GET" && url.pathname === "/admin/app") {
    const key = url.searchParams.get("key") ?? "";
    return new Response(renderAdminPage(key, true), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

function renderAdminPage(key: string, miniApp: boolean): string {
  return `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Video Bot — Admin</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--tg-theme-bg-color, #0f1117);
      color: var(--tg-theme-text-color, #e4e6eb);
      min-height: 100vh;
      padding: 24px 16px;
      padding-bottom: calc(24px + env(safe-area-inset-bottom));
    }
    .wrap { max-width: 960px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; }
    .sub { color: #8b919a; font-size: 0.9rem; margin-bottom: 24px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .stat {
      background: #1a1d27;
      border: 1px solid #2a2f3d;
      border-radius: 10px;
      padding: 16px;
    }
    .stat-label { color: #8b919a; font-size: 0.8rem; }
    .stat-value { font-size: 1.75rem; font-weight: 700; margin-top: 4px; }
    .toolbar {
      display: flex;
      gap: 10px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    button {
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      font-size: 0.9rem;
      cursor: pointer;
    }
    button:hover { background: #2563eb; }
    button.danger { background: #dc2626; }
    button.danger:hover { background: #b91c1c; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #1a1d27;
      border: 1px solid #2a2f3d;
      border-radius: 10px;
      overflow: hidden;
    }
    th, td {
      text-align: left;
      padding: 12px 14px;
      border-bottom: 1px solid #2a2f3d;
      font-size: 0.9rem;
    }
    th { background: #151820; color: #8b919a; font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      background: #2a3142;
      color: #93c5fd;
    }
    .empty {
      text-align: center;
      padding: 48px 16px;
      color: #8b919a;
    }
    .error {
      background: #3f1515;
      border: 1px solid #7f1d1d;
      color: #fca5a5;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      display: none;
    }
    .id-cell { font-weight: 700; color: #60a5fa; }
    .section {
      background: #1a1d27;
      border: 1px solid #2a2f3d;
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .section h2 { font-size: 1.1rem; margin-bottom: 12px; }
    .section p { color: #8b919a; font-size: 0.85rem; margin-bottom: 16px; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    input[type="text"] {
      background: #0f1117;
      border: 1px solid #2a2f3d;
      color: #e4e6eb;
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 0.9rem;
      min-width: 200px;
      flex: 1;
    }
    .switch {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      user-select: none;
    }
    .switch input { display: none; }
    .slider {
      width: 44px;
      height: 24px;
      background: #2a2f3d;
      border-radius: 999px;
      position: relative;
      transition: background 0.2s;
    }
    .slider::after {
      content: "";
      position: absolute;
      top: 3px;
      left: 3px;
      width: 18px;
      height: 18px;
      background: #fff;
      border-radius: 50%;
      transition: transform 0.2s;
    }
    .switch input:checked + .slider { background: #3b82f6; }
    .switch input:checked + .slider::after { transform: translateX(20px); }
    .channel-list { list-style: none; }
    .channel-list li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid #2a2f3d;
    }
    .channel-list li:last-child { border-bottom: none; }
    .channel-meta { color: #8b919a; font-size: 0.8rem; margin-top: 2px; }
    .status-on { color: #4ade80; }
    .status-off { color: #8b919a; }
    #login-screen {
      max-width: 360px;
      margin: 10vh auto 0;
      background: #1a1d27;
      border: 1px solid #2a2f3d;
      border-radius: 12px;
      padding: 24px;
    }
    #login-screen h2 { margin-bottom: 8px; font-size: 1.2rem; }
    #login-screen p { color: #8b919a; font-size: 0.9rem; margin-bottom: 16px; }
    #login-screen input[type="password"] {
      width: 100%;
      margin-bottom: 12px;
    }
    #login-error {
      color: #fca5a5;
      font-size: 0.85rem;
      min-height: 1.2em;
      margin-bottom: 8px;
    }
    #app-content { display: none; }
    @media (max-width: 640px) {
      table, thead, tbody, th, td, tr { display: block; }
      thead { display: none; }
      tr { margin-bottom: 12px; border: 1px solid #2a2f3d; border-radius: 8px; padding: 8px; }
      td { border: none; padding: 6px 8px; }
      td::before {
        content: attr(data-label);
        font-weight: 600;
        color: #8b919a;
        display: inline-block;
        width: 90px;
      }
    }
  </style>
</head>
<body>
  <div id="login-screen">
    <h2>Admin panel</h2>
    <p>Parolni kiriting</p>
    <div id="login-error"></div>
    <input type="password" id="login-password" placeholder="Parol" autocomplete="current-password">
    <button id="login-btn" style="width:100%">Kirish</button>
  </div>

  <div id="app-content">
  <div class="wrap">
    <h1>Video Bot Admin</h1>
    <p class="sub">Videolar va majburiy obunani boshqarish</p>

    <div id="error" class="error"></div>

    <div class="stats">
      <div class="stat">
        <div class="stat-label">Jami videolar</div>
        <div class="stat-value" id="total">—</div>
      </div>
      <div class="stat">
        <div class="stat-label">Majburiy obuna</div>
        <div class="stat-value" id="sub-status">—</div>
      </div>
      <div class="stat">
        <div class="stat-label">Obuna kanallari</div>
        <div class="stat-value" id="sub-count">—</div>
      </div>
    </div>

    <div class="section">
      <h2>Majburiy obuna</h2>
      <p>Bot kanal(lar)ga obuna bo'lmagan foydalanuvchilarga video bermaydi. Bot kanalda admin bo'lishi kerak.</p>

      <div class="row">
        <label class="switch">
          <input type="checkbox" id="sub-enabled">
          <span class="slider"></span>
        </label>
        <span id="sub-enabled-label">O'chirilgan</span>
      </div>

      <div class="row">
        <input type="text" id="channel-input" placeholder="@kanal yoki https://t.me/kanal">
        <input type="text" id="channel-url" placeholder="Havola (ixtiyoriy)">
        <button id="add-channel">Qo'shish</button>
      </div>

      <ul class="channel-list" id="channels"></ul>
    </div>

    <div class="section">
      <h2>Videolar</h2>
      <div class="toolbar">
        <button id="refresh">Yangilash</button>
      </div>

      <div id="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nom</th>
              <th>Turi</th>
              <th>Vaqt</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="videos"></tbody>
        </table>
      </div>
    </div>
  </div>

    </div>
  </div>
  </div>

  <script>
    const KEY = ${JSON.stringify(key)};
    const MINI_APP = ${miniApp ? "true" : "false"};
    const PANEL_TOKEN_KEY = "video_bot_panel_token";
    let memoryPanelToken = "";

    function getPanelToken() {
      try {
        return sessionStorage.getItem(PANEL_TOKEN_KEY) || memoryPanelToken || "";
      } catch {
        return memoryPanelToken || "";
      }
    }

    function setPanelToken(token) {
      memoryPanelToken = token;
      try {
        sessionStorage.setItem(PANEL_TOKEN_KEY, token);
      } catch {
        // Telegram WebApp da sessionStorage cheklangan bo'lishi mumkin
      }
    }

    function clearPanelToken() {
      memoryPanelToken = "";
      try {
        sessionStorage.removeItem(PANEL_TOKEN_KEY);
      } catch {}
    }

    function showApp() {
      document.getElementById("login-screen").style.display = "none";
      document.getElementById("app-content").style.display = "block";
    }

    function showLoginError(msg) {
      document.getElementById("login-error").textContent = msg || "";
    }

    async function login() {
      showLoginError("");
      const btn = document.getElementById("login-btn");
      const password = document.getElementById("login-password").value;
      if (!password) {
        showLoginError("Parol kiriting");
        return;
      }

      btn.disabled = true;
      btn.textContent = "Kutilmoqda...";

      try {
        const res = await fetch("/admin/api/login" + (KEY ? "?key=" + encodeURIComponent(KEY) : ""), {
          method: "POST",
          headers: Object.assign(
            { "Content-Type": "application/json" },
            authHeaders(),
          ),
          body: JSON.stringify({ password: password }),
        });

        let data = {};
        try {
          data = await res.json();
        } catch {
          showLoginError("Server javobi noto'g'ri (" + res.status + ")");
          return;
        }

        if (!res.ok || !data.ok) {
          showLoginError(data.error || "Kirish muvaffaqiyatsiz");
          return;
        }

        setPanelToken(data.token);
        showApp();
        await refresh();
      } catch (e) {
        showLoginError(e.message || "Tarmoq xatosi");
      } finally {
        btn.disabled = false;
        btn.textContent = "Kirish";
      }
    }

    function initTelegramApp() {
      const tg = window.Telegram && window.Telegram.WebApp;
      if (!tg) return null;
      tg.ready();
      tg.expand();
      if (tg.themeParams && tg.themeParams.bg_color) {
        document.body.style.background = tg.themeParams.bg_color;
      }
      return tg;
    }

    function authHeaders() {
      const headers = {};
      const tg = window.Telegram && window.Telegram.WebApp;
      const initData = tg && tg.initData;
      if (initData) {
        headers["X-Telegram-Init-Data"] = initData;
      }
      const panelToken = getPanelToken();
      if (panelToken) {
        headers["X-Panel-Token"] = panelToken;
      }
      return headers;
    }

    function apiUrl(path) {
      const sep = path.includes("?") ? "&" : "?";
      if (KEY) return path + sep + "key=" + encodeURIComponent(KEY);
      return path;
    }

    async function apiFetch(path, options) {
      const headers = Object.assign(
        { "Content-Type": "application/json" },
        authHeaders(),
        (options && options.headers) || {},
      );
      const res = await fetch(apiUrl(path), Object.assign({}, options || {}, { headers }));
      if (res.status === 401) {
        clearPanelToken();
        document.getElementById("login-screen").style.display = "block";
        document.getElementById("app-content").style.display = "none";
        throw new Error("Sessiya tugadi. Qayta kiring.");
      }
      return res;
    }

    function showError(msg) {
      const el = document.getElementById("error");
      el.textContent = msg;
      el.style.display = "block";
    }

    function clearError() {
      const el = document.getElementById("error");
      el.style.display = "none";
    }

    async function loadSubscription() {
      const res = await apiFetch("/admin/api/subscription");
      if (!res.ok) throw new Error("Obuna sozlamalari yuklanmadi");
      return res.json();
    }

    function renderSubscription(config) {
      const enabled = config.enabled && config.channels.length > 0;
      document.getElementById("sub-enabled").checked = config.enabled;
      document.getElementById("sub-enabled-label").textContent = config.enabled ? "Yoqilgan" : "Ochirilgan";
      document.getElementById("sub-enabled-label").className = config.enabled ? "status-on" : "status-off";
      document.getElementById("sub-status").textContent = enabled ? "Yoniq" : "Ochiq";
      document.getElementById("sub-status").className = enabled ? "stat-value status-on" : "stat-value status-off";
      document.getElementById("sub-count").textContent = config.channels.length;

      const list = document.getElementById("channels");
      if (!config.channels.length) {
        list.innerHTML = "<li class=\\"empty\\">Kanal qoshilmagan</li>";
        return;
      }

      list.innerHTML = config.channels.map(function(c) {
        const title = c.title || c.id;
        const meta = c.url ? c.url : c.id;
        const id = escapeHtml(c.id);
        return "<li>" +
          "<div><strong>" + escapeHtml(title) + "</strong><div class=\\"channel-meta\\">" + escapeHtml(meta) + "</div></div>" +
          "<button class=\\"danger\\" data-remove-channel=\\"" + id + "\\">Ochirish</button>" +
        "</li>";
      }).join("");
    }

    async function toggleSubscription(enabled) {
      clearError();
      const res = await apiFetch("/admin/api/subscription/toggle", {
        method: "POST",
        body: JSON.stringify({ enabled: enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || "Sozlama saqlanmadi");
        return;
      }
      renderSubscription(data.config);
    }

    async function addChannel() {
      const channel = document.getElementById("channel-input").value.trim();
      const url = document.getElementById("channel-url").value.trim();
      if (!channel) {
        showError("Kanal kiriting: @username");
        return;
      }
      clearError();
      const res = await apiFetch("/admin/api/subscription/add", {
        method: "POST",
        body: JSON.stringify({ channel: channel, url: url || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || "Kanal qoshilmadi");
        return;
      }
      document.getElementById("channel-input").value = "";
      document.getElementById("channel-url").value = "";
      renderSubscription(data.config);
    }

    async function removeChannel(id) {
      if (!confirm("Kanal ochirilsinmi: " + id + "?")) return;
      clearError();
      const res = await apiFetch("/admin/api/subscription/remove?id=" + encodeURIComponent(id), {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || "Ochirilmadi");
        return;
      }
      renderSubscription(data.config);
    }

    async function loadVideos() {
      clearError();
      const res = await apiFetch("/admin/api/videos");
      if (!res.ok) throw new Error("Malumot yuklanmadi: " + res.status);
      return res.json();
    }

    function renderVideos(videos) {
      const tbody = document.getElementById("videos");
      if (!videos.length) {
        tbody.innerHTML = "<tr><td colspan=\\"5\\" class=\\"empty\\">Hozircha video yoq. @Detskebot ga video yuboring.</td></tr>";
        return;
      }

      tbody.innerHTML = videos.map(function(v) {
        const title = v.caption || v.fileName || "Video";
        const date = new Date(v.uploadedAt).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" });
        return "<tr>" +
          "<td class=\\"id-cell\\" data-label=\\"ID\\">" + v.id + "</td>" +
          "<td data-label=\\"Nom\\">" + escapeHtml(title) + "</td>" +
          "<td data-label=\\"Turi\\"><span class=\\"badge\\">" + escapeHtml(v.kind) + "</span></td>" +
          "<td data-label=\\"Vaqt\\">" + escapeHtml(date) + "</td>" +
          "<td data-label=\\"\\"><button class=\\"danger\\" data-delete-video=\\"" + v.id + "\\">Ochirish</button></td>" +
        "</tr>";
      }).join("");
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    async function refresh() {
      try {
        const [videoData, subData] = await Promise.all([loadVideos(), loadSubscription()]);
        document.getElementById("total").textContent = videoData.total;
        renderVideos(videoData.videos);
        renderSubscription(subData);
      } catch (e) {
        showError(e.message || "Xatolik");
      }
    }

    async function deleteVideo(id) {
      if (!confirm("Video #" + id + " ochirilsinmi?")) return;
      clearError();
      const res = await apiFetch("/admin/api/delete?id=" + id, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || "Ochirilmadi");
        return;
      }
      await refresh();
    }

    document.getElementById("channels").addEventListener("click", function(e) {
      const btn = e.target.closest("[data-remove-channel]");
      if (!btn) return;
      removeChannel(btn.getAttribute("data-remove-channel"));
    });

    document.getElementById("videos").addEventListener("click", function(e) {
      const btn = e.target.closest("[data-delete-video]");
      if (!btn) return;
      deleteVideo(Number(btn.getAttribute("data-delete-video")));
    });

    document.getElementById("login-btn").addEventListener("click", login);
    document.getElementById("login-password").addEventListener("keydown", function(e) {
      if (e.key === "Enter") login();
    });
    document.getElementById("refresh").addEventListener("click", refresh);
    document.getElementById("add-channel").addEventListener("click", addChannel);
    document.getElementById("sub-enabled").addEventListener("change", function(e) {
      toggleSubscription(e.target.checked);
    });
    initTelegramApp();
    if (getPanelToken()) {
      showApp();
      refresh();
    }
  </script>
</body>
</html>`;
}

export function getAdminPanelUrl(origin: string, secret: string): string {
  return `${origin.replace(/\/$/, "")}/admin/app?key=${encodeURIComponent(secret)}`;
}

export function getAdminMiniAppUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/admin/app`;
}
