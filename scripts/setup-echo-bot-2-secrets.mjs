#!/usr/bin/env node
/**
 * Ikkinchi echo-bot (telegram-echo-bot-2) uchun GitHub Secrets qo'llanmasi.
 * Token repoga YOZILMAYDI — faqat GitHub Secrets orqali.
 *
 * Ishlatish (mahalliy mashinada, gh CLI bilan):
 *   node scripts/setup-echo-bot-2-secrets.mjs
 *   gh secret set TELEGRAM_ECHO_BOT_TOKEN_2 --body "YOUR_BOT_TOKEN"
 *   gh secret set TELEGRAM_ECHO_WEBHOOK_SECRET_2 --body "tg_8835962050_echo"
 *
 * Keyin GitHub Actions → "Deploy telegram-echo-bot (secondary)" → Run workflow
 */

const REPO = "RobotX0319/telegram-cursor-bot";
const WORKER = "telegram-echo-bot-2";
const HEALTH = `https://${WORKER}.fxjournaluz.workers.dev/health`;

console.log(`
Ikkinchi Gemini echo-bot (@Glabalashganbot bilan parallel)
=========================================================

1) GitHub Secrets qo'shing (repoga token yozmang):

   gh secret set TELEGRAM_ECHO_BOT_TOKEN_2 --repo ${REPO}
   gh secret set TELEGRAM_ECHO_WEBHOOK_SECRET_2 --repo ${REPO} --body "tg_8835962050_echo"

   GEMINI_API_KEY allaqachon birinchi echo-bot uchun bo'lsa, qayta qo'shish shart emas.

2) Deploy ishga tushiring:

   GitHub → Actions → "Deploy telegram-echo-bot (secondary)" → Run workflow

   yoki main ga push (ish/echo-bot yoki workflow o'zgarganda).

3) Tekshirish:

   curl ${HEALTH}

   BotFather dan yangi bot username ni tekshiring — u @Glabalashganbot dan boshqa bo'ladi.

Eslatma: token chatda ochiq bo'lsa, BotFather → /revoke qiling va yangi token oling.
`);
