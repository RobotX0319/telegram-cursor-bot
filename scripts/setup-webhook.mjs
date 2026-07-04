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

const webhookResponse = await fetch(
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

const webhookBody = await webhookResponse.text();
console.log("setWebhook", webhookResponse.status, webhookBody);

const commandsResponse = await fetch(
  `https://api.telegram.org/bot${token}/setMyCommands`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [
        { command: "start", description: "Botni boshlash" },
        { command: "help", description: "Yordam" },
        { command: "status", description: "Agent holati" },
        { command: "repo", description: "GitHub repo belgilash" },
        { command: "new", description: "Yangi agent ochish" },
        { command: "agents", description: "Agentlar ro'yxati" },
        { command: "use", description: "Agent tanlash" },
        { command: "agent", description: "Faol agent haqida" },
        { command: "admin", description: "Adminlar boshqaruvi" },
        { command: "ping", description: "Tekshirish" },
      ],
    }),
  },
);

const commandsBody = await commandsResponse.text();
console.log("setMyCommands", commandsResponse.status, commandsBody);

if (!webhookResponse.ok || !commandsResponse.ok) process.exit(1);
