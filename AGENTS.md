# Cloud Agent qoidalari

## Faqat Telegram bot + Web interface

Agent **faqat** quyidagilarda ishlaydi:
- Telegram bot (Cloudflare Worker, webhook, buyruqlar)
- Web interface / admin panel (HTML, CSS, JS)

Boshqa vazifalar **asosiy admin ruxsatisiz** taqiqlangan.

## Repo izolyatsiyasi

Har bir admin o'z GitHub repoda ishlaydi (`tcursor-u<telegram_id>`).
Boshqa admin repolariga kirmang.

## Deploy

- Faqat `git push origin main` — GitHub Actions deploy qiladi
- `wrangler deploy` qilmang (VM da token yo'q)

## Worker secretlari

Secretlar repoda emas — Cloudflare Worker secrets da.
