import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const heartbeat = resolve(root, ".heartbeat");
const STALE_MS = 120_000;
const CHECK_MS = 30_000;
const RESTART_DELAY_MS = 3000;

let child = null;
let restarting = false;

function heartbeatAgeMs() {
  if (!existsSync(heartbeat)) return Number.POSITIVE_INFINITY;
  return Date.now() - statSync(heartbeat).mtimeMs;
}

function startBot() {
  console.log(`[supervisor] Bot ishga tushirilmoqda (${new Date().toISOString()})`);
  child = spawn("npx", ["tsx", "scripts/run-bot.ts"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });

  child.on("exit", (code, signal) => {
    child = null;
    if (restarting) return;
    console.error(
      `[supervisor] Bot to'xtadi (code=${code ?? "null"}, signal=${signal ?? "null"})`,
    );
    scheduleRestart("crash");
  });
}

function scheduleRestart(reason) {
  if (restarting) return;
  restarting = true;
  console.error(`[supervisor] Qayta ishga tushirish: ${reason}`);
  setTimeout(() => {
    restarting = false;
    startBot();
  }, RESTART_DELAY_MS);
}

function killBot(signal = "SIGTERM") {
  if (!child || child.killed) return;
  child.kill(signal);
}

startBot();

setInterval(() => {
  const age = heartbeatAgeMs();
  if (age > STALE_MS) {
    console.error(
      `[supervisor] Heartbeat eskirgan (${Math.round(age / 1000)}s) — bot qayta ishga tushiriladi`,
    );
    killBot("SIGKILL");
    scheduleRestart("heartbeat");
  }
}, CHECK_MS);

process.on("SIGINT", () => {
  killBot();
  process.exit(0);
});

process.on("SIGTERM", () => {
  killBot();
  process.exit(0);
});
