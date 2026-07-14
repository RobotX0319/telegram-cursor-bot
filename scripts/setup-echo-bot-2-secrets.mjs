#!/usr/bin/env node
/**
 * Ikkinchi echo-bot konfiguratsiyasi repoda: scripts/echo-bot-2/vars.jsonc
 * GitHub Secrets shart emas (token repoda).
 *
 * Deploy: GitHub Actions → "Deploy telegram-echo-bot (secondary)"
 * yoki main ga push (scripts/echo-bot-2/ o'zgarganda).
 */

const WORKER = "telegram-echo-bot-2";
const HEALTH = `https://${WORKER}.fxjournaluz.workers.dev/health`;

console.log(`
Ikkinchi Gemini echo-bot (mustaqil Worker)
===========================================

Konfig: scripts/echo-bot-2/vars.jsonc
  - TELEGRAM_BOT_TOKEN
  - TELEGRAM_WEBHOOK_SECRET
  - GEMINI_API_KEY_B64

Cursor agent tokenlari ishlatilmaydi — faqat Telegram + Gemini.

Deploy: push main yoki GitHub Actions workflow_dispatch.

Tekshirish:
  curl ${HEALTH}
`);
