#!/usr/bin/env node

/**
 * Echo bot tez o'rnatish — ish/ papkasidan ishga tushiring.
 *
 * 1. BotFather dan token oling
 * 2. @userinfobot dan ID oling
 * 3. Secretlarni wrangler ga kiriting
 * 4. Deploy + webhook
 */

const steps = [
  {
    title: "1. BotFather dan yangi bot",
    cmd: "Telegram: @BotFather → /newbot → token oling",
  },
  {
    title: "2. Telegram ID",
    cmd: "Telegram: @userinfobot → ID ni ko'chiring",
  },
  {
    title: "3. Bog'liqliklar",
    cmd: "cd ish && npm run echo-bot:install",
  },
  {
    title: "4. Secretlar (har biri alohida so'raydi)",
    cmd: `cd ish/echo-bot
npx wrangler login
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ALLOWED_USER_ID`,
  },
  {
    title: "5. Deploy",
    cmd: "cd ish && npm run echo-bot:deploy",
  },
  {
    title: "6. Webhook (deploy URL ni WORKER_URL ga yozing)",
    cmd: `export TELEGRAM_BOT_TOKEN="BOT_TOKEN"
export WORKER_URL="https://telegram-echo-bot.ACCOUNT.workers.dev"
export TELEGRAM_WEBHOOK_SECRET="SIZNING_SECRET"
cd ish && npm run echo-bot:setup-webhook`,
  },
  {
    title: "7. Sinash",
    cmd: "Telegramda botga /start yuboring, keyin istalgan matn",
  },
];

console.log("═".repeat(50));
console.log("  ECHO BOT — tez o'rnatish");
console.log("  Yozgan xabaringiz sizga qaytariladi");
console.log("═".repeat(50));
console.log();

for (const step of steps) {
  console.log(step.title);
  console.log(step.cmd);
  console.log();
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const workerUrl = process.env.WORKER_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (token && workerUrl && secret) {
  console.log("─".repeat(50));
  console.log("Env topildi — webhook ulanmoqda...\n");

  const webhookUrl = `${workerUrl.replace(/\/$/, "")}/webhook`;
  const response = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ["message"],
        drop_pending_updates: true,
      }),
    },
  );

  const body = await response.text();
  console.log("Webhook:", response.status, body);

  if (response.ok) {
    const health = await fetch(`${workerUrl.replace(/\/$/, "")}/health`);
    console.log("Health:", health.status, await health.text());
  }
} else {
  console.log("─".repeat(50));
  console.log("Webhook avtomatik ulanishi uchun env o'rnating:");
  console.log("  TELEGRAM_BOT_TOKEN, WORKER_URL, TELEGRAM_WEBHOOK_SECRET");
}
