/** Foydalanuvchi (obunachi) boti */
export const USER_BOT = "@Detskebot";

/** Admin bot */
export const ADMIN_BOT = "@Detiskebot";

export function adminRedirectText(): string {
  return [
    `👑 Admin panel: ${ADMIN_BOT}`,
    "",
    `${ADMIN_BOT} ga o'ting va /panel yuboring.`,
  ].join("\n");
}
