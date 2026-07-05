import { spawn, execSync } from "node:child_process";
import { existsSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const heartbeat = resolve(root, ".heartbeat");
const lockFile = resolve(root, ".supervisor.lock");
const STALE_MS = 180_000;
const CHECK_MS = 30_000;
const RESTART_DELAY_MS = 5000;

let child = null;
let restarting = false;

function killAllBotProcesses() {
  try {
    execSync('pkill -f "scripts/run-bot.ts" 2>/dev/null || true', {
      stdio: "ignore",
    });
  } catch {
    // ignore
  }
}

function heartbeatAgeMs() {
  if (!existsSync(heartbeat)) return Number.POSITIVE_INFINITY;
  return Date.now() - statSync(heartbeat).mtimeMs;
}

function startBot() {
  killAllBotProcesses();

  console.log(`[supervisor] Bot ishga tushirilmoqda (${new Date().toISOString()})`);
  child = spawn("npx", ["tsx", "scripts/run-bot.ts"], {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });

  child.on("exit", (code, signal) => {
    const exited = child;
    child = null;
    if (restarting) return;
    console.error(
      `[supervisor] Bot to'xtadi (code=${code ?? "null"}, signal=${signal ?? "null"}, pid=${exited?.pid ?? "?"})`,
    );
    scheduleRestart("crash");
  });
}

function scheduleRestart(reason) {
  if (restarting) return;
  restarting = true;
  console.error(`[supervisor] Qayta ishga tushirish: ${reason}`);
  killAllBotProcesses();
  setTimeout(() => {
    restarting = false;
    startBot();
  }, RESTART_DELAY_MS);
}

function killBot() {
  if (child && !child.killed) {
    child.kill("SIGKILL");
  }
  killAllBotProcesses();
  child = null;
}

if (existsSync(lockFile)) {
  try {
    const age = Date.now() - statSync(lockFile).mtimeMs;
    if (age < 60_000) {
      console.error("[supervisor] Boshqa supervisor allaqachon ishlayapti. Chiqilmoqda.");
      process.exit(1);
    }
  } catch {
    // continue
  }
}

try {
  unlinkSync(lockFile);
} catch {
  // ignore
}

writeFileSync(lockFile, String(process.pid));

killAllBotProcesses();
setTimeout(() => startBot(), 1000);

setInterval(() => {
  const age = heartbeatAgeMs();
  if (age > STALE_MS) {
    console.error(
      `[supervisor] Heartbeat eskirgan (${Math.round(age / 1000)}s) — bot qayta ishga tushiriladi`,
    );
    killBot();
    scheduleRestart("heartbeat");
  }
}, CHECK_MS);

process.on("SIGINT", () => {
  killBot();
  try {
    unlinkSync(lockFile);
  } catch {
    // ignore
  }
  process.exit(0);
});

process.on("SIGTERM", () => {
  killBot();
  try {
    unlinkSync(lockFile);
  } catch {
    // ignore
  }
  process.exit(0);
});
