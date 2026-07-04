const token = process.env.TELEGRAM_BOT_TOKEN;
const workerUrl = process.env.WORKER_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !workerUrl || !secret) {
  console.error(
    "Kerak: TELEGRAM_BOT_TOKEN, WORKER_URL, TELEGRAM_WEBHOOK_SECRET",
  );
  process.exit(1);
}

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
console.log(response.status, body);

if (!response.ok) process.exit(1);
