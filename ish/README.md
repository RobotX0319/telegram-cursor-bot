# Ish papkasi

Bu yerda birgalikda ishlaymiz — bot kodidan alohida ish maydoni.

## Vositalar

| Buyruq | Vazifasi |
|--------|----------|
| `npm run check-health` | Worker `/health` endpointini tekshirish |
| `npm run check-setup` | Lokal o'rnatish holatini tekshirish |

## Tez boshlash

```bash
# 1. Bog'liqliklar
npm install

# 2. Secretlar (lokal dev)
cp .dev.vars.example .dev.vars
# .dev.vars ni to'ldiring

# 3. Tekshirish
npm run check-setup
npm run check-health

# 4. Deploy
npm run deploy
npm run setup-webhook
```

## Bot buyruqlari (yangi)

- `/version` — bot versiyasi va muhit

## Keyingi ishlar

Bu papkaga yangi skriptlar, hujjatlar yoki loyihalar qo'shish mumkin.
Agent avtomatik ishlaydi — vazifa yozmasdan ham davom etadi.
