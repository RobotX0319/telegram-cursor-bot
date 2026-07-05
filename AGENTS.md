# Cloud Agent qoidalari

Bu loyiha **Cloudflare Workers** da ishlaydi.

## Papka tizimi

| Kim | Qayerda ishlaydi |
|-----|------------------|
| **Asosiy admin (tizim agenti)** | `src/`, `scripts/`, `wrangler.jsonc` — platforma kodi |
| **Boshqa adminlar** | Faqat o'z papkalarida (`ish/`, `telegram-video-bot/`, ...) |

### Qoidalar

- Tizim agenti boshqa adminlar papkalariga **tegmaydi**
- Loyiha agentlari `src/` va platforma kodiga **tegmaydi**
- Papka belgilanmagan holda kod buyruqlari **qabul qilinmaydi**
- Yangi admin: `/new` → papka yarat → keyin ish

## Muhim

- **Cloudflare akkauntiga to'g'ridan-to'g'ri kirmang** — Cloud Agent VM da `wrangler login` yoki CF token yo'q.
- **Faqat GitHub repoga o'zgartirish kiriting** va `main` branch ga push qiling.
- Deploy **avtomatik**: `main` ga push bo'lganda GitHub Actions `wrangler deploy` qiladi.

## Oqim

```
Telegram /ask → Cloud Agent kod yozadi → git push main → GitHub Actions → Cloudflare Worker yangilanadi
```

## Agent qilishi kerak

1. Kod o'zgartirish (`src/`, `wrangler.jsonc`, va hokazo)
2. `git commit` + `git push origin main`
3. Foydalanuvchiga: "Push qilindi, GitHub Actions deploy qiladi (1-2 daqiqa)"

## Agent qilmasligi kerak

- `wrangler deploy` (Cloud VM da token yo'q)
- `wrangler secret put` (faqat foydalanuvchi mahalliy mashinada)
- Cloudflare dashboard ga kirishga urinish

## Worker secretlari

Telegram token, Cursor API key va boshqalar **Cloudflare Worker secrets** da saqlanadi — repoda emas. Agent ularni o'zgartirmasin.

## Tekshirish

Deploy dan keyin: `GET https://telegram-cursor-bot.fxjournaluz.workers.dev/health`
