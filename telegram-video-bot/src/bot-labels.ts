/** Foydalanuvchi (obunachi) boti */
export const USER_BOT = "@Detskebot";

/** Admin bot */
export const ADMIN_BOT = "@Detiskebot";

export function adminRedirectText(): string {
  return [
    "❌ Bu bot faqat kinolar uchun (obunachilar).",
    "",
    "👑 Admin panel bu yerda:",
    ADMIN_BOT,
    "",
    "1️⃣ " + ADMIN_BOT + " ni oching",
    "2️⃣ /start yuboring",
    "3️⃣ Pastdagi 🎛 yoki 🌐 tugmalarni bosing",
  ].join("\n");
}
