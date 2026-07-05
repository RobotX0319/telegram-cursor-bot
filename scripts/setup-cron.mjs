#!/usr/bin/env node
/**
 * Cloudflare cron trigger qo'shish (ixtiyoriy zaxira).
 * Talab: CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL yoki CLOUDFLARE_API_TOKEN
 */

const accountId =
  process.env.CLOUDFLARE_ACCOUNT_ID ?? "4450cffd4f25491cc797dd112824bc72";
const scriptName = process.env.WORKER_NAME ?? "telegram-cursor-bot";
const cron = process.env.WORKER_CRON ?? "*/2 * * * *";

const headers = { "Content-Type": "application/json" };

if (process.env.CLOUDFLARE_API_TOKEN) {
  headers.Authorization = `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`;
} else if (process.env.CLOUDFLARE_API_KEY && process.env.CLOUDFLARE_EMAIL) {
  headers["X-Auth-Email"] = process.env.CLOUDFLARE_EMAIL;
  headers["X-Auth-Key"] = process.env.CLOUDFLARE_API_KEY;
} else {
  console.log(
    "⏭  Cloudflare cron — API kalit yo'q (Durable Objects polling yetarli).",
  );
  process.exit(0);
}

const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`;

try {
  const list = await fetch(`${base}/schedules`, { headers });
  const listBody = await list.json();

  if (list.ok && Array.isArray(listBody.result?.schedules)) {
    const existing = listBody.result.schedules.find((s) => s.cron === cron);
    if (existing) {
      console.log(`✅ Cron allaqachon mavjud: ${cron}`);
      process.exit(0);
    }

    const merged = [
      ...listBody.result.schedules.map((s) => ({ cron: s.cron })),
      { cron },
    ];

    const response = await fetch(`${base}/schedules`, {
      method: "PUT",
      headers,
      body: JSON.stringify(merged),
    });

    const body = await response.json();
    if (response.ok) {
      console.log(`✅ Cloudflare cron qo'shildi: ${cron}`);
      process.exit(0);
    }

    const message = body.errors?.[0]?.message ?? JSON.stringify(body);
    if (message.includes("limit") || message.includes("cron")) {
      console.log(`⏭  Cloudflare cron limiti: ${message}`);
      console.log("   Durable Objects polling ishlatiladi — muammo emas.");
      process.exit(0);
    }

    console.error("❌ Cron qo'shilmadi:", message);
    process.exit(1);
  }

  const response = await fetch(`${base}/schedules`, {
    method: "PUT",
    headers,
    body: JSON.stringify([{ cron }]),
  });

  const body = await response.json();

  if (response.ok) {
    console.log(`✅ Cloudflare cron qo'shildi: ${cron}`);
    process.exit(0);
  }

  const message = body.errors?.[0]?.message ?? JSON.stringify(body);
  if (message.includes("limit") || message.includes("cron")) {
    console.log(`⏭  Cloudflare cron limiti: ${message}`);
    console.log("   Durable Objects polling ishlatiladi — muammo emas.");
    process.exit(0);
  }

  console.error("❌ Cron qo'shilmadi:", message);
  process.exit(1);
} catch (error) {
  console.error(
    "❌ Cloudflare cron xato:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
