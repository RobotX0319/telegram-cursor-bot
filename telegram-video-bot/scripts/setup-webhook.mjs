const userToken = process.env.TELEGRAM_BOT_TOKEN;
const adminToken = process.env.TELEGRAM_ADMIN_BOT_TOKEN;
const workerUrl = process.env.WORKER_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!userToken || !workerUrl || !secret) {
  console.error(
    "Kerak: TELEGRAM_BOT_TOKEN, WORKER_URL, TELEGRAM_WEBHOOK_SECRET",
  );
  process.exit(1);
}

const origin = workerUrl.replace(/\/$/, "");

async function setWebhook(token, path) {
  const webhookUrl = `${origin}${path}`;
  const response = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      }),
    },
  );
  const body = await response.text();
  console.log(path, response.status, body);
  return response.ok;
}

const userOk = await setWebhook(userToken, "/webhook");
let adminOk = true;
if (adminToken) {
  adminOk = await setWebhook(adminToken, "/webhook-admin");
}

if (!userOk || !adminOk) process.exit(1);
