# telegram-video-bot

Telegram video bot — admin video yuklaydi, bot ID beradi (1, 2, 3...), foydalanuvchilar ID yuborib videoni oladi.

## Ishlash tartibi

```
Admin video yuklaydi → Bot ID beradi (masalan: 3)
Foydalanuvchi "3" yuboradi → Bot videoni yuboradi
```

Videolar Telegram `file_id` sifatida saqlanadi — alohida server/file storage kerak emas.

## Tuzilma

```
telegram-video-bot/
├── src/
│   ├── index.ts       ← HTTP route'lar (/webhook, /health)
│   ├── handlers.ts    ← Xabar va buyruqlarni qayta ishlash
│   ├── storage.ts     ← KV da video ID saqlash
│   ├── telegram.ts    ← Telegram API
│   └── types.ts       ← TypeScript turlar
├── scripts/
│   └── setup-webhook.mjs
├── wrangler.jsonc
└── package.json
```

## Buyruqlar

| Kim | Harakat |
|-----|---------|
| **Admin** | Video yuklash → avtomatik ID |
| **Admin** | `/panel` — web admin panel |
| **Admin** | `/list` — barcha videolar |
| **Admin** | `/delete 5` — videoni o'chirish |
| **Admin** | `/stats` — statistika |
| **Hamma** | `1`, `2`, `3` ... — video olish |
| **Hamma** | `/info 3` — video haqida ma'lumot |
| **Hamma** | `/check` — obunani tekshirish |
| **Hamma** | `/start`, `/help` |

## O'rnatish

### 1. Bog'liqliklar

```bash
cd telegram-video-bot
npm install
```

### 2. KV namespace

```bash
npx wrangler kv namespace create VIDEOS
```

Chiqgan `id` ni `wrangler.jsonc` → `kv_namespaces[0].id` ga yozing.

### 3. Cloudflare login

```bash
npx wrangler login
```

### 4. Secretlar

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put TELEGRAM_ADMIN_ID
```

| Secret | Tavsif |
|--------|--------|
| `TELEGRAM_BOT_TOKEN` | [@BotFather](https://t.me/BotFather) dan yangi bot tokeni |
| `TELEGRAM_WEBHOOK_SECRET` | Tasodifiy maxfiy satr (A-Z, a-z, 0-9, _, -) |
| `TELEGRAM_ADMIN_ID` | Admin Telegram user ID ([@userinfobot](https://t.me/userinfobot)) |

### 5. Deploy

```bash
npm run deploy
```

### 6. Webhook

```bash
export TELEGRAM_BOT_TOKEN="..."
export WORKER_URL="https://telegram-video-bot.<account>.workers.dev"
export TELEGRAM_WEBHOOK_SECRET="..."
npm run setup-webhook
```

Yoki brauzerda:

```
https://telegram-video-bot.<account>.workers.dev/admin/setup-webhook?key=SIZNING_SECRET
```

Buyruqlar menyusini alohida yangilash:

```
https://telegram-video-bot.<account>.workers.dev/admin/setup-commands?key=SIZNING_SECRET
```

### Avtomatik deploy (GitHub Actions)

`main` branchga push qilganda `telegram-video-bot/` o'zgarsa avtomatik deploy qilinadi.

GitHub repo **Settings → Secrets** ga qo'shing:

| Secret | Tavsif |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token (Workers Edit) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook secret (deploydan keyin webhook yangilanadi) |

## Admin panel

Brauzerda videolarni ko'rish va o'chirish:

```
https://telegram-video-bot.<account>.workers.dev/admin?key=SIZNING_SECRET
```

Yoki Telegramda admin sifatida: `/panel` — havola yuboriladi.

## Lokal dev

```bash
cp .dev.vars.example .dev.vars
npm run dev
```

Telegram webhook lokal URL ga ulanmaydi — production deploy kerak.
