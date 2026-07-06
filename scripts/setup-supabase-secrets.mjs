#!/usr/bin/env node
/**
 * Supabase service_role ni Worker secret sifatida o'rnatish.
 *
 *   set SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   node scripts/setup-supabase-secrets.mjs
 */
import { execSync } from "node:child_process";

const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!key) {
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY kerak (Supabase → Settings → API → service_role).",
  );
  process.exit(1);
}

console.log("Setting SUPABASE_SERVICE_ROLE_KEY on telegram-cursor-bot...");
execSync("npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY", {
  input: key,
  stdio: ["pipe", "inherit", "inherit"],
});
console.log("Done. SUPABASE_URL wrangler.jsonc vars da.");
