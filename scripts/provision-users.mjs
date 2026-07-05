#!/usr/bin/env node
/**
 * Barcha adminlar uchun GitHub repo yaratish (lokal).
 *
 * Kerak:
 *   GITHUB_TOKEN, GITHUB_OWNER (ixtiyoriy, default RobotX0319)
 *   ALLOWED_USER_ID — asosiy admin
 *   Ixtiyoriy: EXTRA_USER_IDS=123,456 — qo'shimcha adminlar
 *
 * Ishlatish:
 *   node scripts/provision-users.mjs
 */

const owner = process.env.GITHUB_OWNER || "RobotX0319";
const token = process.env.GITHUB_TOKEN;
const bootstrap = process.env.ALLOWED_USER_ID;
const extra = (process.env.EXTRA_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!token) {
  console.error("GITHUB_TOKEN kerak");
  process.exit(1);
}

const userIds = new Set([bootstrap, ...extra].filter(Boolean));

async function createRepo(userId) {
  const name = `tcursor-u${userId}`;
  const url = `https://github.com/${owner}/${name}`;

  const check = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "provision-users",
    },
  });

  if (check.ok) {
    console.log(`Mavjud: ${url}`);
    return url;
  }

  const res = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "provision-users",
    },
    body: JSON.stringify({
      name,
      private: true,
      auto_init: true,
      description: `Workspace user ${userId}`,
    }),
  });

  if (!res.ok) {
    console.error(`Xato ${userId}:`, await res.text());
    return null;
  }

  console.log(`Yaratildi: ${url}`);
  return url;
}

for (const userId of userIds) {
  await createRepo(userId);
}

console.log("\nKeyin Telegramda: /admin provision-repos (yoki deploy dan keyin)");
