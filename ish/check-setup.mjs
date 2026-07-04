#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const checks = [];

function pass(label) {
  checks.push({ label, ok: true });
}

function fail(label, hint) {
  checks.push({ label, ok: false, hint });
}

if (existsSync(resolve(root, "node_modules/wrangler"))) {
  pass("npm install bajarilgan");
} else {
  fail("npm install", "npm install");
}

const devVars = resolve(root, ".dev.vars");
if (existsSync(devVars)) {
  const content = readFileSync(devVars, "utf8");
  const required = [
    "TELEGRAM_BOT_TOKEN",
    "CURSOR_API_KEY",
    "TELEGRAM_WEBHOOK_SECRET",
    "ALLOWED_USER_ID",
    "DEFAULT_GITHUB_REPO",
  ];

  for (const key of required) {
    const match = content.match(new RegExp(`^${key}=(.+)$`, "m"));
    if (match && match[1].trim()) {
      pass(`${key} to'ldirilgan`);
    } else {
      fail(`${key} bo'sh`, `.dev.vars faylida ${key}=... qo'shing`);
    }
  }
} else {
  fail(".dev.vars yo'q", "cp .dev.vars.example .dev.vars");
}

const wranglerRaw = readFileSync(resolve(root, "wrangler.jsonc"), "utf8");

if (/\"id\"\s*:\s*\"[a-f0-9]{32}\"/i.test(wranglerRaw)) {
  pass("KV namespace ID mavjud");
} else {
  fail("KV namespace", "wrangler kv namespace create SESSIONS");
}

console.log("telegram-cursor-bot — o'rnatish tekshiruvi\n");

for (const check of checks) {
  const mark = check.ok ? "✓" : "✗";
  console.log(`${mark} ${check.label}`);
  if (check.hint) console.log(`  → ${check.hint}`);
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} muvaffaqiyatli`);

if (failed > 0) process.exit(1);
