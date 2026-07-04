# Telegram Echo Bot

Yozgan xabaringizni sizga qaytaradigan oddiy Telegram bot. Cloudflare Workers da ishlaydi.

```
Siz: Salom!
Bot: Salom!
```

## Talablar

1. [@BotFather](https://t.me/BotFather) dan yangi bot tokeni
2. Cloudflare akkaunt (`npx wrangler login`)
3. Telegram user ID ([@userinfobot](https://t.me/userinfobot))

## O'rnatish

```bash
cd ish
npm run echo-bot:install
```

### Secretlar

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ALLOWED_USER_ID
```

| Secret | Tavsif |
|--------|--------|
| `TELEGRAM_BOT_TOKEN` | BotFather tokeni |
| `TELEGRAM_WEBHOOK_SECRET` | Tasodifiy maxfiy satr (A-Z, a-z, 0-9, `_`, `-`) |
| `ALLOWED_USER_ID` | Sizning Telegram ID (faqat siz foydalanasiz) |

### Deploy

```bash
cd ish
npm run echo-bot:deploy
```

Deploy tugagach worker URL ni oling, masalan:
`https://telegram-echo-bot.<account>.workers.dev`

### Webhook

```bash
export TELEGRAM_BOT_TOKEN="..."
export WORKER_URL="https://telegram-echo-bot.<account>.workers.dev"
export TELEGRAM_WEBHOOK_SECRET="..."
cd ish
npm run echo-bot:setup-webhook
```

Yoki brauzerda:

```
https://telegram-echo-bot.<account>.workers.dev/admin/setup-webhook?key=SIZNING_SECRET
```

## Tekshirish

1. `/health` — worker ishlayaptimi
2. Telegramda `/start` yuboring
3. Har qanday matn yuboring — bot aynan shu matnni qaytaradi

## Lokal dev

```bash
cp .dev.vars.example .dev.vars
# .dev.vars ni to'ldiring
npm run dev
```
