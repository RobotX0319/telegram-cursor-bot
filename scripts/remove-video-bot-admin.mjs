#!/usr/bin/env node
/**
 * Video bot admini (7862655091) va infratuzilmasini tozalash.
 *
 * Kerak (ixtiyoriy, mavjud bo'lsa avtomatik ishlaydi):
 *   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
 *   GITHUB_TOKEN, GITHUB_OWNER (default RobotX0319)
 *
 * Ishlatish:
 *   node scripts/remove-video-bot-admin.mjs
 *   node scripts/remove-video-bot-admin.mjs --user-id 7862655091
 */

const USER_ID = process.argv.includes("--user-id")
  ? process.argv[process.argv.indexOf("--user-id") + 1]
  : "7862655091";

const OWNER = process.env.GITHUB_OWNER || "RobotX0319";
const ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID || "4450cffd4f25491cc797dd112824bc72";
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN?.trim();
const GH_TOKEN = process.env.GITHUB_TOKEN?.trim();

const WORKERS = ["telegram-video-bot", `tcursor-u${USER_ID}`];
const REPO = `tcursor-u${USER_ID}`;
const SESSIONS_KV_ID = "e4f1347ef43c457abe6e81f7b801e94b";

const KV_KEYS = [
  `admin:${USER_ID}`,
  `workspace:${USER_ID}`,
  `userrepo:${USER_ID}`,
  `user:${USER_ID}`,
];

async function cfDeleteWorker(name) {
  if (!CF_TOKEN) {
    console.log(`[skip] Worker ${name} — CLOUDFLARE_API_TOKEN yo'q`);
    return false;
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${name}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${CF_TOKEN}` },
  });
  const body = await res.text();
  if (res.ok) {
    console.log(`✓ Worker o'chirildi: ${name}`);
    return true;
  }
  if (res.status === 404) {
    console.log(`- Worker yo'q (404): ${name}`);
    return true;
  }
  console.error(`✗ Worker ${name}: ${res.status} ${body}`);
  return false;
}

async function ghDeleteRepo() {
  if (!GH_TOKEN) {
    console.log(`[skip] GitHub repo ${REPO} — GITHUB_TOKEN yo'q`);
    return false;
  }
  const url = `https://api.github.com/repos/${OWNER}/${REPO}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "remove-video-bot-admin",
    },
  });
  if (res.status === 204) {
    console.log(`✓ GitHub repo o'chirildi: ${OWNER}/${REPO}`);
    return true;
  }
  if (res.status === 404) {
    console.log(`- GitHub repo yo'q (404): ${REPO}`);
    return true;
  }
  console.error(`✗ GitHub repo: ${res.status} ${await res.text()}`);
  return false;
}

async function wranglerKvDelete(key) {
  const { execSync } = await import("node:child_process");
  try {
    execSync(
      `npx wrangler kv key delete "${key}" --namespace-id=${SESSIONS_KV_ID} --remote`,
      { stdio: "pipe", encoding: "utf8" },
    );
    console.log(`✓ KV: ${key}`);
    return true;
  } catch (error) {
    const msg = error.stderr?.toString() || error.message || "";
    if (/not found|404|10009/i.test(msg)) {
      console.log(`- KV yo'q: ${key}`);
      return true;
    }
    console.error(`✗ KV ${key}:`, msg.trim() || error.message);
    return false;
  }
}

async function purgeLegacyWorkspace() {
  const { execSync } = await import("node:child_process");
  try {
    const raw = execSync(
      `npx wrangler kv key get "config:admin_workspaces" --namespace-id=${SESSIONS_KV_ID} --remote`,
      { encoding: "utf8" },
    ).trim();
    if (!raw) return;
    const map = JSON.parse(raw);
    if (!map[USER_ID]) return;
    delete map[USER_ID];
    const { writeFileSync, unlinkSync } = await import("node:fs");
    const tmp = `/tmp/admin_workspaces_${USER_ID}.json`;
    writeFileSync(tmp, JSON.stringify(map));
    execSync(
      `npx wrangler kv key put "config:admin_workspaces" --namespace-id=${SESSIONS_KV_ID} --remote --path="${tmp}"`,
      { stdio: "pipe" },
    );
    unlinkSync(tmp);
    console.log(`✓ Legacy workspace map: ${USER_ID} olib tashlandi`);
  } catch (error) {
    console.log(`- Legacy workspace: ${error.message || "o'tkazildi"}`);
  }
}

console.log(`\nVideo bot admin tozalash: user ${USER_ID}\n`);

for (const worker of WORKERS) {
  await cfDeleteWorker(worker);
}

await ghDeleteRepo();

if (CF_TOKEN) {
  console.log("\nKV kalitlar (SESSIONS)...");
  for (const key of KV_KEYS) {
    await wranglerKvDelete(key);
  }
  await purgeLegacyWorkspace();
} else {
  console.log(
    "\nKV tozalash o'tkazildi — productionda Telegramdan: /admin remove " +
      USER_ID,
  );
}

console.log(`
Tayyor (repo ichida telegram-video-bot/ o'chirilgan bo'lishi kerak).

Qo'lda (agar yuqorida skip bo'lsa):
1. Cloudflare → Workers → telegram-video-bot, tcursor-u${USER_ID} → Delete
2. GitHub → ${OWNER}/${REPO} → Delete repository
3. BotFather → /deletebot → @Detskebot, @Detiskebot
4. Telegram → /admin remove ${USER_ID}
`);
