# telegram-cursor-bot

Telegram orqali **Cursor Cloud Agent** ni boshqarish — Cloudflare Workers da ishlaydi.

```
Telegram xabar → Worker webhook → Cursor Cloud Agents API → natija → Telegram
```

## Funksiyalar

- `/start`, `/help`, `/ping` — asosiy buyruqlar
- `/repo <url>` — GitHub repo belgilash
- `/new` — yangi cloud agent
- `/ask <prompt>` yoki oddiy matn — agentga vazifa
- `/status`, `/agent` — holat va agent ma'lumoti
- Agent repoda o'zgartirish kiritadi (`workOnCurrentBranch: true`)

## Talablar

1. [BotFather](https://t.me/BotFather) dan bot tokeni
2. [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations) dan `CURSOR_API_KEY`
3. Cloudflare akkaunt (`wrangler login`)
4. GitHub repo (bu loyiha uchun yangi repo yaratiladi)

## O'rnatish

```bash
cd telegram-cursor-bot
npm install

# KV namespace
npx wrangler kv namespace create SESSIONS
# chiqgan id ni wrangler.jsonc -> kv_namespaces[0].id ga qo'ying

# Cloudflare login
npx wrangler login

# Secretlar
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put CURSOR_API_KEY
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET   # faqat A-Z a-z 0-9 _ - (masalan: tg_cursor_bot_2026)
npx wrangler secret put ALLOWED_USER_ID           # sizning Telegram user ID
npx wrangler secret put DEFAULT_GITHUB_REPO       # https://github.com/user/repo

# Deploy
npm run deploy

# Webhook (deploy dan keyin worker URL ni oling)
$env:TELEGRAM_BOT_TOKEN="..."
$env:WORKER_URL="https://telegram-cursor-bot.<account>.workers.dev"
$env:TELEGRAM_WEBHOOK_SECRET="..."
npm run setup-webhook
```

## Telegram user ID

[@userinfobot](https://t.me/userinfobot) ga yozing — ID ni `ALLOWED_USER_ID` ga qo'ying.

## Keyingi qadam

1. GitHub ga repo yuklang
2. Cursor Cloud Agent ga repo kirish huquqi bering
3. Telegramdan: `/repo https://github.com/.../telegram-cursor-bot`
4. Keyin: `/ask src/index.ts ga yangi /version buyrug'i qo'sh`

Agent o'zgartirish kiritgach, `git pull` + `npm run deploy` yoki GitHub Actions orqali avtomatik deploy qo'shishingiz mumkin.

## Lokal dev

```bash
cp .dev.vars.example .dev.vars   # secretlarni to'ldiring
npm run dev
```

Telegram webhook lokal URL ga ulanmaydi — production deploy kerak yoki tunnel ishlating.
