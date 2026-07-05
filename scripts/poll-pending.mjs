#!/usr/bin/env node
/**
 * Tashqi cron (cron-job.org, GitHub Actions) uchun pending runlarni tekshirish.
 *
 * Muhit o'zgaruvchilari:
 *   WORKER_URL — default: https://telegram-cursor-bot.fxjournaluz.workers.dev
 *   TELEGRAM_WEBHOOK_SECRET — Cloudflare secret
 *   TELEGRAM_BOT_TOKEN — bootstrap kalit uchun (secret bo'lmasa)
 */
const base =
  process.env.WORKER_URL?.replace(/\/$/, "") ||
  "https://telegram-cursor-bot.fxjournaluz.workers.dev";

const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const botId = token?.split(":")[0];
const bootstrap = botId ? `tg_${botId}_bootstrap` : "";
const key = secret || bootstrap;

if (!key) {
  console.error(
    "TELEGRAM_WEBHOOK_SECRET yoki TELEGRAM_BOT_TOKEN kerak (.env yoki muhitda)",
  );
  process.exit(1);
}

const url = `${base}/admin/poll-pending?key=${encodeURIComponent(key)}`;
const response = await fetch(url);

if (!response.ok) {
  console.error("Poll failed:", response.status, await response.text());
  process.exit(1);
}

console.log(await response.text());
