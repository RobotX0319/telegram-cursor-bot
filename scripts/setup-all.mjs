#!/usr/bin/env node
/**
 * To'liq avtomatik o'rnatish — bitta buyruq bilan hammasi.
 *
 * 1. Cloudflare secretlar
 * 2. Worker deploy (Durable Objects polling)
 * 3. Telegram webhook
 * 4. GitHub Actions secretlar (GITHUB_TOKEN bo'lsa)
 * 5. Cloudflare cron (ixtiyoriy zaxira)
 *
 * Ishlatish:
 *   cp .dev.vars.example .dev.vars   # tokenlarni to'ldiring
 *   node scripts/setup-all.mjs
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const devVarsPath = resolve(root, ".dev.vars");

function loadDevVars() {
  if (!existsSync(devVarsPath)) {
    console.error(".dev.vars topilmadi.\n  cp .dev.vars.example .dev.vars");
    process.exit(1);
  }

  const vars = {};
  for (const line of readFileSync(devVarsPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    vars[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return vars;
}

function putSecret(name, value) {
  if (!value?.trim()) {
    console.log(`⏭  ${name} — o'tkazib yuborildi`);
    return;
  }
  console.log(`🔐 Cloudflare secret: ${name}`);
  execSync(`npx wrangler secret put ${name}`, {
    cwd: root,
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
  });
}

function run(script, label) {
  console.log(`\n▶ ${label}...\n`);
  execSync(`node scripts/${script}`, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
}

const vars = loadDevVars();
const workerUrl =
  vars.WORKER_URL?.trim() ||
  process.env.WORKER_URL ||
  "https://telegram-cursor-bot.fxjournaluz.workers.dev";

const required = ["TELEGRAM_BOT_TOKEN", "ALLOWED_USER_ID"];
for (const key of required) {
  if (!vars[key]?.trim()) {
    console.error(`Kerak: ${key} (.dev.vars da)`);
    process.exit(1);
  }
}

if (!vars.TELEGRAM_WEBHOOK_SECRET?.trim() && vars.TELEGRAM_BOT_TOKEN) {
  vars.TELEGRAM_WEBHOOK_SECRET = `tg_${vars.TELEGRAM_BOT_TOKEN.split(":")[0]}_bootstrap`;
}

console.log("\n══════════════════════════════════════");
console.log("  Telegram Cursor Bot — avtomatik setup");
console.log("══════════════════════════════════════\n");

console.log("📦 1/5 Cloudflare secretlar...\n");
putSecret("TELEGRAM_BOT_TOKEN", vars.TELEGRAM_BOT_TOKEN);
putSecret("TELEGRAM_WEBHOOK_SECRET", vars.TELEGRAM_WEBHOOK_SECRET);
putSecret("ALLOWED_USER_ID", vars.ALLOWED_USER_ID);
putSecret("ALLOWED_USER_IDS", vars.ALLOWED_USER_IDS);
putSecret("CURSOR_API_KEY", vars.CURSOR_API_KEY);
putSecret("DEFAULT_GITHUB_REPO", vars.DEFAULT_GITHUB_REPO);

console.log("\n🚀 2/5 Deploy...\n");
execSync("npx wrangler deploy", { cwd: root, stdio: "inherit" });

console.log("\n🔗 3/5 Webhook...\n");
process.env.TELEGRAM_BOT_TOKEN = vars.TELEGRAM_BOT_TOKEN;
process.env.TELEGRAM_WEBHOOK_SECRET = vars.TELEGRAM_WEBHOOK_SECRET;
process.env.WORKER_URL = workerUrl;
execSync("node scripts/setup-webhook.mjs", { cwd: root, stdio: "inherit" });

run("setup-github.mjs", "4/5 GitHub Actions secretlar (ixtiyoriy)");
run("setup-cron.mjs", "5/5 Cloudflare cron (ixtiyoriy zaxira)");

console.log("\n══════════════════════════════════════");
console.log("✅ Tayyor!");
console.log("══════════════════════════════════════");
console.log("\nTelegramda botga /ping yuboring.");
console.log("Avtomatik bildirishnoma Durable Objects orqali ishlaydi.");
console.log("Qo'shimcha sozlash shart emas.\n");
