#!/usr/bin/env node

const url = process.env.WORKER_URL ?? process.env.ECHO_BOT_URL;

if (!url) {
  console.error("Kerak: WORKER_URL yoki ECHO_BOT_URL");
  console.error('Masalan: export WORKER_URL="https://telegram-echo-bot.account.workers.dev"');
  process.exit(1);
}

const healthUrl = `${url.replace(/\/$/, "")}/health`;

try {
  const response = await fetch(healthUrl);
  const body = await response.json();

  console.log(`URL: ${healthUrl}`);
  console.log(`Status: ${response.status}`);
  console.log(JSON.stringify(body, null, 2));

  if (!response.ok || !body.ok) {
    process.exit(1);
  }
} catch (error) {
  console.error("Health check failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
