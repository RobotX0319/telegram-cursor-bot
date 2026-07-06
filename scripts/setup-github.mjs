#!/usr/bin/env node
/**
 * GitHub Actions secretlarini avtomatik sozlash.
 * Talab: .dev.vars da GITHUB_TOKEN (repo admin, actions:write)
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const devVarsPath = resolve(root, ".dev.vars");

function loadDevVars() {
  if (!existsSync(devVarsPath)) return {};
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

function setSecret(repo, name, value, token) {
  console.log(`🔐 GitHub secret: ${name}`);
  execSync(`gh secret set ${name} --body ${JSON.stringify(value)} -R ${repo}`, {
    stdio: "inherit",
    env: { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token },
  });
}

const vars = loadDevVars();
const token = vars.GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
const repo =
  vars.GITHUB_REPO?.trim() ||
  process.env.GITHUB_REPO?.trim() ||
  "RobotX0319/telegram-cursor-bot";

if (!token) {
  console.log(
    "⏭  GITHUB_TOKEN yo'q — GitHub Actions secretlari o'tkazib yuborildi.\n" +
      "   Polling Durable Objects orqali ishlaydi, GitHub ixtiyoriy.",
  );
  process.exit(0);
}

const secrets = {
  TELEGRAM_BOT_TOKEN: vars.TELEGRAM_BOT_TOKEN,
  TELEGRAM_WEBHOOK_SECRET: vars.TELEGRAM_WEBHOOK_SECRET,
};

for (const [name, value] of Object.entries(secrets)) {
  if (!value?.trim()) {
    console.log(`⏭  ${name} — qiymat yo'q`);
    continue;
  }
  setSecret(repo, name, value.trim(), token);
}

console.log("\n✅ GitHub Actions secretlari sozlandi.\n");
