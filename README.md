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
- `/version` — bot versiyasi
- Agent repoda o'zgartirish kiritadi (`workOnCurrentBranch: true`)

## Talablar

1. [BotFather](https://t.me/BotFather) dan bot tokeni
2. [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations) dan `CURSOR_API_KEY`
3. Cloudflare akkaunt (`wrangler login`)
4. GitHub repo (bu loyiha uchun yangi repo yaratiladi)

## O'rnatish

### 1. Reponi klonlash va bog'liqliklarni o'rnatish

Node.js 18+ va npm kerak.

```bash
git clone https://github.com/RobotX0319/telegram-cursor-bot.git
cd telegram-cursor-bot
npm install
```

### 2. Cloudflare ga kirish

```bash
npx wrangler login
```

Brauzerda Cloudflare akkauntingiz bilan tasdiqlang.

### 3. KV namespace yaratish

Worker sessiya ma'lumotlarini saqlash uchun KV namespace kerak:

```bash
npx wrangler kv namespace create SESSIONS
```

Chiqgan `id` ni `wrangler.jsonc` faylidagi `kv_namespaces[0].id` ga yozing:

```jsonc
"kv_namespaces": [
  {
    "binding": "SESSIONS",
    "id": "SIZNING_KV_ID"
  }
]
```

### 4. Secretlarni sozlash

Har bir buyruqda qiymat kiritish so'raladi:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put CURSOR_API_KEY
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ALLOWED_USER_ID
npx wrangler secret put DEFAULT_GITHUB_REPO
```

| Secret | Tavsif |
|--------|--------|
| `TELEGRAM_BOT_TOKEN` | [@BotFather](https://t.me/BotFather) dan olingan bot tokeni |
| `CURSOR_API_KEY` | [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations) dan |
| `TELEGRAM_WEBHOOK_SECRET` | Tasodifiy maxfiy satr — faqat `A-Z`, `a-z`, `0-9`, `_`, `-` (masalan: `tg_cursor_bot_2026`) |
| `ALLOWED_USER_ID` | Sizning Telegram user ID ([@userinfobot](https://t.me/userinfobot)) |
| `DEFAULT_GITHUB_REPO` | Agent ishlaydigan repo URL (masalan: `https://github.com/user/repo`) |

### 5. Deploy qilish

```bash
npm run deploy
```

Deploy tugagach, terminalda worker URL ko'rsatiladi, masalan:

```
https://telegram-cursor-bot.<account>.workers.dev
```

### 6. Telegram webhook ni ulash

**Variant A — skript orqali (tavsiya etiladi):**

Linux / macOS:

```bash
export TELEGRAM_BOT_TOKEN="123456:ABC..."
export WORKER_URL="https://telegram-cursor-bot.<account>.workers.dev"
export TELEGRAM_WEBHOOK_SECRET="tg_cursor_bot_2026"
npm run setup-webhook
```

Windows (PowerShell):

```powershell
$env:TELEGRAM_BOT_TOKEN="123456:ABC..."
$env:WORKER_URL="https://telegram-cursor-bot.<account>.workers.dev"
$env:TELEGRAM_WEBHOOK_SECRET="tg_cursor_bot_2026"
npm run setup-webhook
```

**Variant B — brauzer orqali:**

Deploy qilingan worker URL ga kiring (secret token `key` parametri sifatida):

```
https://telegram-cursor-bot.<account>.workers.dev/admin/setup-webhook?key=SIZNING_TELEGRAM_WEBHOOK_SECRET
```

### 7. Tekshirish

1. Brauzerda health endpoint: `https://telegram-cursor-bot.<account>.workers.dev/health`
2. Telegramda botga `/ping` yuboring — javob kelishi kerak
3. `/repo https://github.com/user/repo` bilan repo belgilang
4. `/ask Salom` bilan agentni sinab ko'ring

## Keyingi qadam

1. GitHub ga repo yuklang
2. Cursor Cloud Agent ga repo kirish huquqi bering
3. Telegramdan: `/repo https://github.com/.../telegram-cursor-bot`
4. Keyin: `/ask src/index.ts ga yangi /version buyrug'i qo'sh`

Agent o'zgartirish kiritgach, GitHub Actions avtomatik Cloudflare ga deploy qiladi (quyidagi bo'lim).

## Avtomatik deploy (GitHub Actions)

Cloud Agent **Cloudflare ga kira olmaydi** — faqat GitHub repoda kod yozadi. Deploy uchun GitHub Actions sozlang:

### 1. Cloudflare API token

1. [Cloudflare Dashboard → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. **Create Token** → shablon: **Edit Cloudflare Workers**
3. Account: sizning akkauntingiz
4. Token ni nusxalang

### 2. GitHub repo secretlari

GitHub → `RobotX0319/telegram-cursor-bot` → **Settings → Secrets and variables → Actions**:

| Secret | Qiymat |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | yuqoridagi token |
| `CLOUDFLARE_ACCOUNT_ID` | `4450cffd4f25491cc797dd112824bc72` |

### 3. Ishlash tartibi

```
Agent kod yozadi → git push main → GitHub Actions deploy → Worker yangilanadi
```

Telegramdan agentga shunday yozing:
> "O'zgartirishni main ga push qil — GitHub Actions deploy qiladi"

**Eslatma:** Worker secretlari (`TELEGRAM_BOT_TOKEN` va hokazo) Cloudflare da qoladi — agent ularni repoga yozmasin.

## Lokal dev

```bash
cp .dev.vars.example .dev.vars   # secretlarni to'ldiring
npm run dev
```

Telegram webhook lokal URL ga ulanmaydi — production deploy kerak yoki tunnel ishlating.
