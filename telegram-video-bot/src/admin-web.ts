import { getAdminLogs } from "./admin-log";
import { listAdminRecords } from "./admin-roles";
import { getAdminIds } from "./bots";
import { movieName } from "./content";
import { createBroadcast, formatBroadcastJob, listBroadcasts, runBroadcast } from "./broadcast";
import { getAdminStatsJson } from "./stats";
import { getVideo, listVideos, saveVideo, countVideos, deleteVideo } from "./storage";
import {
  addRequiredChannel,
  getSubscriptionConfig,
  removeRequiredChannel,
  setSubscriptionEnabled,
} from "./subscription";
import type { Env } from "./types";

export async function handleWebAdminApi(
  request: Request,
  url: URL,
  env: Env,
  panelPath: string,
): Promise<Response | null> {
  const base = `${panelPath}/api`;

  if (request.method === "GET" && url.pathname === `${base}/subscription`) {
    return Response.json(await getSubscriptionConfig(env));
  }

  if (request.method === "POST" && url.pathname === `${base}/subscription/toggle`) {
    const body = (await request.json()) as { enabled?: boolean };
    if (typeof body.enabled !== "boolean") {
      return Response.json({ ok: false, error: "enabled kerak" }, { status: 400 });
    }
    const config = await setSubscriptionEnabled(env, body.enabled);
    return Response.json({ ok: true, config });
  }

  if (request.method === "POST" && url.pathname === `${base}/subscription/add`) {
    const body = (await request.json()) as {
      channel?: string;
      url?: string;
      title?: string;
    };
    if (!body.channel?.trim()) {
      return Response.json({ ok: false, error: "channel kerak" }, { status: 400 });
    }
    const result = await addRequiredChannel(
      env,
      body.channel,
      body.url,
      body.title,
    );
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }

  if (request.method === "POST" && url.pathname === `${base}/subscription/remove`) {
    const channelId = url.searchParams.get("id");
    if (!channelId) {
      return Response.json({ ok: false, error: "id kerak" }, { status: 400 });
    }
    const config = await removeRequiredChannel(env, channelId);
    return Response.json({ ok: true, config });
  }

  if (request.method === "GET" && url.pathname === `${base}/stats`) {
    return Response.json(await getAdminStatsJson(env));
  }

  if (request.method === "GET" && url.pathname === `${base}/videos`) {
    const videos = await listVideos(env);
    const total = await countVideos(env);
    return Response.json({
      total,
      videos: videos.map((v) => ({
        ...v,
        displayName: movieName(v),
        views: v.views ?? 0,
      })),
    });
  }

  if (request.method === "POST" && url.pathname === `${base}/video/update`) {
    const body = (await request.json()) as { id?: number; name?: string };
    if (!body.id || !body.name?.trim()) {
      return Response.json({ ok: false, error: "id va name kerak" }, { status: 400 });
    }
    const video = await getVideo(env, body.id);
    if (!video) {
      return Response.json({ ok: false, error: "topilmadi" }, { status: 404 });
    }
    await saveVideo(env, {
      ...video,
      name: body.name.trim(),
      updatedAt: new Date().toISOString(),
    });
    return Response.json({ ok: true });
  }

  if (request.method === "POST" && url.pathname === `${base}/delete`) {
    const idParam = url.searchParams.get("id");
    if (!idParam || !/^\d+$/.test(idParam)) {
      return Response.json({ ok: false, error: "id kerak" }, { status: 400 });
    }
    const deleted = await deleteVideo(env, Number.parseInt(idParam, 10));
    if (!deleted) {
      return Response.json({ ok: false, error: "topilmadi" }, { status: 404 });
    }
    return Response.json({ ok: true, id: idParam });
  }

  if (request.method === "POST" && url.pathname === `${base}/broadcast`) {
    const body = (await request.json()) as {
      text?: string;
      target?: "all" | "vip";
    };
    if (!body.text?.trim()) {
      return Response.json({ ok: false, error: "Matn kerak" }, { status: 400 });
    }
    const target = body.target === "vip" ? "vip" : "all";
    const job = await createBroadcast(env, {
      text: body.text.trim(),
      target,
      createdBy: 0,
    });
    const done = await runBroadcast(env, job.id);
    return Response.json({
      ok: true,
      job: done ? formatBroadcastJob(done) : null,
    });
  }

  if (request.method === "GET" && url.pathname === `${base}/broadcasts`) {
    const jobs = await listBroadcasts(env);
    return Response.json({
      jobs: jobs.slice(0, 20).map((j) => ({
        id: j.id,
        text: j.text.slice(0, 80),
        target: j.target,
        status: j.status,
        stats: j.stats,
        createdAt: j.createdAt,
      })),
    });
  }

  if (request.method === "GET" && url.pathname === `${base}/logs`) {
    const logs = await getAdminLogs(env);
    return Response.json({ logs: logs.slice(0, 50) });
  }

  if (request.method === "GET" && url.pathname === `${base}/admins`) {
    const ids = await getAdminIds(env);
    const records = await listAdminRecords(env);
    return Response.json({
      envIds: [...ids],
      records,
    });
  }

  return null;
}

export function getAdminPanelUrl(
  origin: string,
  secret: string,
  panelPath = "/admin1",
): string {
  const base = panelPath.startsWith("/") ? panelPath : `/${panelPath}`;
  return `${origin.replace(/\/$/, "")}${base}?key=${encodeURIComponent(secret)}`;
}

export function renderWebAdminPage(key: string, panelPath: string): string {
  const apiBase = panelPath + "/api";
  return `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <title>Admin panel</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#0f1117;color:#e4e6eb;min-height:100vh;padding:12px 12px 24px}
    .wrap{max-width:960px;margin:0 auto}
    h1{font-size:1.35rem;margin-bottom:4px}
    .sub{color:#8b919a;font-size:.85rem;margin-bottom:16px}
    .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
    .tab{background:#1a1d27;border:1px solid #2a2f3d;color:#e4e6eb;padding:8px 12px;border-radius:8px;font-size:.8rem;cursor:pointer}
    .tab.active{background:#3b82f6;border-color:#3b82f6}
    .panel{display:none;background:#1a1d27;border:1px solid #2a2f3d;border-radius:12px;padding:16px;margin-bottom:16px}
    .panel.active{display:block}
    .panel h2{font-size:1.05rem;margin-bottom:8px}
    .panel p{color:#8b919a;font-size:.85rem;margin-bottom:12px;line-height:1.45}
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px}
    .stat{background:#151820;border:1px solid #2a2f3d;border-radius:10px;padding:12px}
    .stat-label{color:#8b919a;font-size:.75rem}
    .stat-value{font-size:1.4rem;font-weight:700;margin-top:4px}
    button{background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:.85rem;cursor:pointer}
    button.danger{background:#dc2626}
    button:disabled{opacity:.5}
    input,textarea,select{background:#0f1117;border:1px solid #2a2f3d;color:#e4e6eb;border-radius:8px;padding:8px 10px;font-size:.9rem;width:100%}
    textarea{min-height:100px;resize:vertical}
    .row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center}
    table{width:100%;border-collapse:collapse;font-size:.85rem}
    th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #2a2f3d}
    th{color:#8b919a;font-weight:600}
    .error{background:#3f1515;border:1px solid #7f1d1d;color:#fca5a5;padding:10px;border-radius:8px;margin-bottom:12px;display:none}
    .ok{background:#14532d;border:1px solid #166534;color:#86efac;padding:10px;border-radius:8px;margin-bottom:12px;display:none}
    .switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer}
    .switch input{display:none}
    .slider{width:40px;height:22px;background:#2a2f3d;border-radius:999px;position:relative}
    .slider::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;background:#fff;border-radius:50%;transition:.2s}
    .switch input:checked+.slider{background:#3b82f6}
    .switch input:checked+.slider::after{transform:translateX(18px)}
    .channel-list{list-style:none}
    .channel-list li{display:flex;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid #2a2f3d}
    .badge{background:#2a3142;color:#93c5fd;padding:2px 8px;border-radius:6px;font-size:.75rem}
    .steps{background:#151820;border-radius:8px;padding:12px;margin:12px 0}
    .steps li{margin:6px 0 6px 18px;color:#cbd5e1}
    .views{color:#4ade80;font-weight:600}
    ul.logs{list-style:none;font-size:.8rem}
    ul.logs li{padding:8px 0;border-bottom:1px solid #2a2f3d;color:#cbd5e1}
  </style>
</head>
<body>
<div class="wrap">
  <h1>🎛 Admin panel</h1>
  <p class="sub">Kino bot boshqaruvi</p>
  <div id="error" class="error"></div>
  <div id="ok" class="ok"></div>

  <div class="tabs">
    <button type="button" class="tab active" data-tab="movies">🎬 Kinolar</button>
    <button type="button" class="tab" data-tab="upload">📤 Yuklash</button>
    <button type="button" class="tab" data-tab="settings">⚙️ Sozlamalar</button>
    <button type="button" class="tab" data-tab="stats">📊 Statistika</button>
    <button type="button" class="tab" data-tab="broadcast">📣 Xabar</button>
    <button type="button" class="tab" data-tab="security">🔐 Xavfsizlik</button>
  </div>

  <div id="panel-movies" class="panel active">
    <h2>Kinolar ro'yxati</h2>
    <p>Har bir kino: nom, ko'rishlar soni. Nomni tahrirlash mumkin.</p>
    <div class="row"><button type="button" id="refresh-movies">Yangilash</button></div>
    <div style="overflow-x:auto">
      <table>
        <thead><tr><th>ID</th><th>Nom</th><th>👁 Ko'rildi</th><th></th></tr></thead>
        <tbody id="videos"></tbody>
      </table>
    </div>
  </div>

  <div id="panel-upload" class="panel">
    <h2>Kino yuklash</h2>
    <p>Video Telegram orqali yuklanadi (@Detiskebot).</p>
    <ol class="steps">
      <li><strong>@Detiskebot</strong> ni oching</li>
      <li>Kino <strong>ID</strong> yuboring (masalan: <code>5</code>)</li>
      <li>Keyin <strong>video fayl</strong> yuboring</li>
      <li>Nomni shu yerda (Kinolar bo'limi) tahrirlang</li>
    </ol>
    <p>Majburiy obuna yoqilgan bo'lsa, obunachilar kanalga obuna bo'lmaguncha kino ololmaydi.</p>
  </div>

  <div id="panel-settings" class="panel">
    <h2>Majburiy obuna</h2>
    <p>@Detskebot kanaliga obuna bo'lmaganlar kino ololmaydi. Bot kanalda <strong>admin</strong> bo'lishi kerak.</p>
    <div class="row">
      <label class="switch"><input type="checkbox" id="sub-enabled"><span class="slider"></span></label>
      <span id="sub-label">O'chirilgan</span>
    </div>
    <div class="row">
      <input type="text" id="channel-input" placeholder="@kanal yoki https://t.me/kanal">
      <button type="button" id="add-channel">Kanal qo'shish</button>
    </div>
    <ul class="channel-list" id="channels"></ul>
  </div>

  <div id="panel-stats" class="panel">
    <h2>Statistika</h2>
    <div class="stats" id="stats-cards"></div>
    <h2 style="margin-top:16px">🏆 Eng ko'p ko'rilgan kinolar</h2>
    <table><thead><tr><th>ID</th><th>Nom</th><th>👁</th></tr></thead><tbody id="top-movies"></tbody></table>
  </div>

  <div id="panel-broadcast" class="panel">
    <h2>Xabar yuborish</h2>
    <p>Barcha foydalanuvchilarga yoki VIP'larga xabar.</p>
    <div class="row">
      <select id="bc-target"><option value="all">Hammaga</option><option value="vip">Faqat VIP</option></select>
    </div>
    <textarea id="bc-text" placeholder="Xabar matni..."></textarea>
    <div class="row" style="margin-top:10px"><button type="button" id="bc-send">Yuborish</button></div>
    <h2 style="margin-top:20px">Tarix</h2>
    <ul class="logs" id="bc-history"></ul>
  </div>

  <div id="panel-security" class="panel">
    <h2>Xavfsizlik</h2>
    <h3 style="margin:12px 0 8px;font-size:.95rem">Adminlar</h3>
    <ul class="logs" id="admin-list"></ul>
    <h3 style="margin:16px 0 8px;font-size:.95rem">Admin loglar</h3>
    <ul class="logs" id="admin-logs"></ul>
  </div>
</div>
<script>
const KEY=${JSON.stringify(key)};
const API=${JSON.stringify(apiBase)};

function $(id){return document.getElementById(id)}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}

function showError(m){$("error").textContent=m;$("error").style.display="block";$("ok").style.display="none"}
function showOk(m){$("ok").textContent=m;$("ok").style.display="block";$("error").style.display="none"}
function clearMsg(){$("error").style.display="none";$("ok").style.display="none"}

async function api(path,opts){
  const u=API+path+(path.includes("?")?"&":"?")+"key="+encodeURIComponent(KEY);
  const r=await fetch(u,opts);
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||("Xato "+r.status));
  return d;
}

document.querySelectorAll(".tab").forEach(function(btn){
  btn.addEventListener("click",function(){
    document.querySelectorAll(".tab").forEach(function(b){b.classList.remove("active")});
    document.querySelectorAll(".panel").forEach(function(p){p.classList.remove("active")});
    btn.classList.add("active");
    $("panel-"+btn.dataset.tab).classList.add("active");
    if(btn.dataset.tab==="stats")loadStats();
    if(btn.dataset.tab==="security")loadSecurity();
    if(btn.dataset.tab==="broadcast")loadBroadcasts();
  });
});

async function loadMovies(){
  clearMsg();
  const d=await api("/videos");
  const tb=$("videos");
  if(!d.videos.length){tb.innerHTML='<tr><td colspan="4">Hozircha kino yo\\'q</td></tr>';return}
  tb.innerHTML=d.videos.map(function(v){
    const name=esc(v.displayName||v.name||"Kino");
    return '<tr><td><strong>'+v.id+'</strong></td><td><input data-id="'+v.id+'" class="name-inp" value="'+name.replace(/"/g,"&quot;")+'" style="min-width:120px"></td><td class="views">'+(v.views||0)+'</td><td><button class="danger" data-del="'+v.id+'">🗑</button> <button data-save="'+v.id+'">💾</button></td></tr>';
  }).join("");
  tb.querySelectorAll("[data-del]").forEach(function(b){
    b.onclick=function(){deleteVideo(Number(b.dataset.del))};
  });
  tb.querySelectorAll("[data-save]").forEach(function(b){
    b.onclick=function(){
      const inp=tb.querySelector('.name-inp[data-id="'+b.dataset.save+'"]');
      saveName(Number(b.dataset.save),inp.value);
    };
  });
}

async function saveName(id,name){
  clearMsg();
  await api("/video/update",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:id,name:name})});
  showOk("Nom saqlandi: #"+id);
  loadMovies();
}

async function deleteVideo(id){
  if(!confirm("#"+id+" o'chirilsinmi?"))return;
  await api("/delete?id="+id,{method:"POST"});
  showOk("O'chirildi");
  loadMovies();
}

async function loadSubscription(){
  const c=await api("/subscription");
  $("sub-enabled").checked=c.enabled;
  $("sub-label").textContent=c.enabled?"✅ Yoqilgan — obunasiz kino yo'q":"O'chirilgan";
  const ul=$("channels");
  if(!c.channels.length){ul.innerHTML='<li>Kanal qo\\'shilmagan</li>';return}
  ul.innerHTML=c.channels.map(function(ch){
    return '<li><div><strong>'+esc(ch.title||ch.id)+'</strong><br><small>'+esc(ch.id)+'</small></div><button class="danger" data-rm="'+esc(ch.id)+'">O\\'chirish</button></li>';
  }).join("");
  ul.querySelectorAll("[data-rm]").forEach(function(b){
    b.onclick=function(){removeChannel(b.dataset.rm)};
  });
}

async function toggleSub(on){
  await api("/subscription/toggle",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:on})});
  loadSubscription();
  showOk(on?"Majburiy obuna yoqildi":"Obuna o'chirildi");
}

async function addChannel(){
  const ch=$("channel-input").value.trim();
  if(!ch){showError("Kanal kiriting");return}
  await api("/subscription/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({channel:ch})});
  $("channel-input").value="";
  loadSubscription();
  showOk("Kanal qo'shildi");
}

async function removeChannel(id){
  if(!confirm("O'chirilsinmi?"))return;
  await api("/subscription/remove?id="+encodeURIComponent(id),{method:"POST"});
  loadSubscription();
}

async function loadStats(){
  const s=await api("/stats");
  $("stats-cards").innerHTML=[
    ["Kinolar",s.videos],["Foydalanuvchi",s.users],["Faol 7 kun",s.activeUsers7d],
    ["Yetkazildi",s.videoDelivered],["So'rovlar",s.videoRequests],["VIP",s.vipCount]
  ].map(function(x){return '<div class="stat"><div class="stat-label">'+x[0]+'</div><div class="stat-value">'+x[1]+'</div></div>'}).join("");
  const tm=$("top-movies");
  const top=s.topMovies||[];
  tm.innerHTML=top.length?top.map(function(m){
    return '<tr><td>'+m.id+'</td><td>'+esc(m.name||m.caption||("#"+m.id))+'</td><td class="views">'+(m.views||0)+'</td></tr>';
  }).join(""):'<tr><td colspan="3">Ma\\'lumot yo\\'q</td></tr>';
}

async function sendBroadcast(){
  const text=$("bc-text").value.trim();
  if(!text){showError("Matn yozing");return}
  $("bc-send").disabled=true;
  try{
    const d=await api("/broadcast",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:text,target:$("bc-target").value})});
    showOk("Yuborildi: "+(d.job||""));
    $("bc-text").value="";
    loadBroadcasts();
  }finally{$("bc-send").disabled=false}
}

async function loadBroadcasts(){
  const d=await api("/broadcasts");
  $("bc-history").innerHTML=(d.jobs||[]).map(function(j){
    return '<li>'+esc(j.createdAt.slice(0,16))+' · '+j.target+' · '+j.stats.sent+'/'+j.stats.total+' · '+esc(j.text)+'</li>';
  }).join("")||'<li>Tarix bo\\'sh</li>';
}

async function loadSecurity(){
  const [a,l]=await Promise.all([api("/admins"),api("/logs")]);
  $("admin-list").innerHTML=(a.envIds||[]).map(function(id){
    return '<li>👑 Admin ID: <strong>'+id+'</strong></li>';
  }).join("")+(a.records||[]).map(function(r){
    return '<li>'+r.role+': '+r.userId+'</li>';
  }).join("")||'<li>/adminol — @Detiskebot</li>';
  $("admin-logs").innerHTML=(l.logs||[]).map(function(x){
    return '<li>'+esc(x.at.slice(0,16))+' · '+x.adminId+' · '+esc(x.action)+'</li>';
  }).join("")||'<li>Log yo\\'q</li>';
}

$("refresh-movies").onclick=loadMovies;
$("sub-enabled").onchange=function(e){toggleSub(e.target.checked)};
$("add-channel").onclick=addChannel;
$("bc-send").onclick=sendBroadcast;

loadMovies();
loadSubscription();
if(window.Telegram&&window.Telegram.WebApp){window.Telegram.WebApp.ready();window.Telegram.WebApp.expand()}
</script>
</body>
</html>`;
}
