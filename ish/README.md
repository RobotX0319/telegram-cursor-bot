# Ish papkasi

Barcha ishlar **shu papka ichida** bajariladi.

```
ish/
├── package.json       ← buyruqlar shu yerdan
├── echo-bot/          ← echo Telegram bot
└── README.md
```

## Echo bot

Yozgan xabaringizni sizga qaytaradi.

```
Siz: Salom!
Bot: Salom!
```

### O'rnatish

```bash
cd ish
npm run echo-bot:install
```

### Secretlar

```bash
cd ish/echo-bot
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ALLOWED_USER_ID
```

| Secret | Tavsif |
|--------|--------|
| `TELEGRAM_BOT_TOKEN` | [@BotFather](https://t.me/BotFather) tokeni |
| `TELEGRAM_WEBHOOK_SECRET` | Maxfiy satr (A-Z, a-z, 0-9, `_`, `-`) |
| `ALLOWED_USER_ID` | Sizning Telegram ID ([@userinfobot](https://t.me/userinfobot)) |

### Deploy va webhook

```bash
cd ish
npm run echo-bot:deploy

export TELEGRAM_BOT_TOKEN="..."
export WORKER_URL="https://telegram-echo-bot.<account>.workers.dev"
export TELEGRAM_WEBHOOK_SECRET="..."
npm run echo-bot:setup-webhook
```

### Tekshirish

```bash
export WORKER_URL="https://telegram-echo-bot.<account>.workers.dev"
npm run echo-bot:health
```

Telegramda `/start` yuboring, keyin istalgan matn — bot qaytaradi.

## Buyruqlar (ish/ dan)

| Buyruq | Vazifasi |
|--------|----------|
| `npm run echo-bot:install` | Bog'liqliklarni o'rnatish |
| `npm run echo-bot:dev` | Lokal dev server |
| `npm run echo-bot:deploy` | Cloudflare ga deploy |
| `npm run echo-bot:setup-webhook` | Telegram webhook ulash |
| `npm run echo-bot:health` | Bot ishlayaptimi tekshirish |
| `npm run echo-bot:setup` | O'rnatish qo'llanmasi (+ avtomatik webhook) |

Batafsil: [`echo-bot/README.md`](echo-bot/README.md)
