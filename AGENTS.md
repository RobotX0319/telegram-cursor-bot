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

---

## BOSHQA AGENTLAR: REVERT QILMANG

Boshqa Cursor/Telegram agentlar bu repoda **eski holatga qaytarish** qilmasin.
Quyidagi fayllar va xususiyatlar **ataylab qo'shilgan** — ularni "soddalashtirish" yoki "tozalash" nomi ostida o'chirmang.

### Versiya

- `src/version.ts` — hozirgi versiya **0.4.6+** (`/version` va `/health` shu yerdan o'qiydi)
- `package.json` dagi `version` ham shu bilan mos bo'lishi kerak
- **0.2.0 ga qaytarmang** — bu eski production snapshot, yangi kod emas

### Asosiy bot (`src/`) — saqlab qoling

| Fayl / modul | Nima qiladi | Revert qilmaslik |
|---|---|---|
| `kv-store.ts` | KV limit xabari, `assertKvWritable`, `formatKvLimitMessage` | Limit tugaganda "Kutilmoqda" o'rniga aniq xabar |
| `user-worker-deploy.ts` | User workerlarni CF API orqali deploy | GitHub webhooksiz deploy |
| `user-deploy.ts` | User repo deploy va SHA kuzatuvi | Poll orqali yangilanish |
| `github-deploy.ts` | GitHub secretlar, deploy setup | User repo provisioning |
| `handlers.ts` | KV limit catch, multi-admin | Xato yutib yuborilmasin |
| `agents.ts` | Barcha admin agentlar ro'yxati | Faqat o'z agenti emas |
| `user-repos.ts` | `tcursor-u{id}` repo biriktirish | Per-user izolyatsiya |

### Video bot (`telegram-video-bot/`) — alohida loyiha

Bu papka **asosiy botdan alohida**. Boshqa agentlar uni o'chirib yoki soddalashtirib qo'ymasin.

| Xususiyat | Tavsif |
|---|---|
| Ikki bot | **@Detskebot** (user), **@Detiskebot** (admin/boshqaruv) |
| Video yuklash | Faqat **@Detskebot** ga (admin user botda yuklaydi) |
| `video-coordinator.ts` | Durable Object — parallel yuklashda atomik ID |
| `webapp-auth.ts` + `panel-session.ts` | Mini app + parol himoyasi |
| `admins.ts` | `TELEGRAM_ADMIN_IDS` — ko'p admin |
| `protect_content` | Foydalanuvchi videoni yuklab ololmaydi |
| Takror video | `file_unique_id` bo'yicha "Takrorlandi ID: X" |

**Taqiqlangan:** `mirrorMediaToUserBot` ni qayta qo'shish (admin botdan yuklash — eski, noto'g'ri usul).

### User repolar (GitHub)

| Repo | Egasi | Loyiha |
|---|---|---|
| `tcursor-u7862655091` | 7862655091 | `telegram-video-bot` |
| `tcursor-u7238164034` | 7238164034 | `ish/echo-bot` |

Bu repolardagi kodni **telegram-cursor-bot** root scaffold bilan almashtirmang.

### Push qilinmagan o'zgarishlar

Agar `git status` da ko'p modified/untracked fayl bo'lsa — bu **yangi ish**.
Boshqa agent `git checkout .` yoki eski `main` dan overwrite qilmasin.
Avval `git diff` va README dagi changelog ni o'qing.

### Deploy holati tekshirish

```bash
curl https://telegram-cursor-bot.fxjournaluz.workers.dev/health
```

Agar `"version":"0.2.0"` ko'rsatsa — GitHub `main` da eski kod, yangi commitlar **push qilinmagan**.
