import { countVideos, deleteVideo, listVideos } from "./storage";
import type { Env } from "./types";

function isAuthorized(url: URL, env: Env): boolean {
  const key = url.searchParams.get("key");
  return Boolean(key && key === env.TELEGRAM_WEBHOOK_SECRET);
}

export async function handleAdminRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);

  if (!isAuthorized(url, env)) {
    return new Response("Unauthorized", { status: 401 });
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
    return new Response(renderAdminPage(key), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

function renderAdminPage(key: string): string {
  return `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Video Bot — Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f1117;
      color: #e4e6eb;
      min-height: 100vh;
      padding: 24px 16px;
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
  <div class="wrap">
    <h1>Video Bot Admin</h1>
    <p class="sub">Videolarni ko'rish va boshqarish</p>

    <div id="error" class="error"></div>

    <div class="stats">
      <div class="stat">
        <div class="stat-label">Jami videolar</div>
        <div class="stat-value" id="total">—</div>
      </div>
    </div>

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

  <script>
    const KEY = ${JSON.stringify(key)};

    function showError(msg) {
      const el = document.getElementById("error");
      el.textContent = msg;
      el.style.display = "block";
    }

    function clearError() {
      const el = document.getElementById("error");
      el.style.display = "none";
    }

    async function loadVideos() {
      clearError();
      const res = await fetch("/admin/api/videos?key=" + encodeURIComponent(KEY));
      if (!res.ok) throw new Error("Ma'lumot yuklanmadi: " + res.status);
      return res.json();
    }

    function renderVideos(videos) {
      const tbody = document.getElementById("videos");
      if (!videos.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty">Hozircha video yo\\'q. Telegram orqali yuklang.</td></tr>';
        return;
      }

      tbody.innerHTML = videos.map(function(v) {
        const title = v.caption || v.fileName || "Video";
        const date = new Date(v.uploadedAt).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" });
        return '<tr>' +
          '<td class="id-cell" data-label="ID">' + v.id + '</td>' +
          '<td data-label="Nom">' + escapeHtml(title) + '</td>' +
          '<td data-label="Turi"><span class="badge">' + escapeHtml(v.kind) + '</span></td>' +
          '<td data-label="Vaqt">' + escapeHtml(date) + '</td>' +
          '<td data-label=""><button class="danger" onclick="deleteVideo(' + v.id + ')">O\\'chirish</button></td>' +
        '</tr>';
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
        const data = await loadVideos();
        document.getElementById("total").textContent = data.total;
        renderVideos(data.videos);
      } catch (e) {
        showError(e.message || "Xatolik");
      }
    }

    async function deleteVideo(id) {
      if (!confirm("Video #" + id + " o'chirilsinmi?")) return;
      clearError();
      const res = await fetch("/admin/api/delete?id=" + id + "&key=" + encodeURIComponent(KEY), {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || "O'chirilmadi");
        return;
      }
      await refresh();
    }

    document.getElementById("refresh").addEventListener("click", refresh);
    refresh();
  </script>
</body>
</html>`;
}

export function getAdminPanelUrl(origin: string, secret: string): string {
  return `${origin.replace(/\/$/, "")}/admin?key=${encodeURIComponent(secret)}`;
}
