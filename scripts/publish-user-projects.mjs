#!/usr/bin/env node
/**
 * User loyihalarini ularning GitHub repolariga joylash va deploy qilish.
 *
 *   node scripts/publish-user-projects.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OWNER = process.env.GITHUB_OWNER || "RobotX0319";
const ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID || "4450cffd4f25491cc797dd112824bc72";
const TMP = path.resolve(ROOT, "..", "_user-publish");

const PROJECTS = [
  {
    userId: "7862655091",
    repo: "tcursor-u7862655091",
    source: path.join(ROOT, "telegram-video-bot"),
    workerUrl: "https://tcursor-u7862655091.fxjournaluz.workers.dev",
    needsKv: true,
    kvBinding: "VIDEOS",
    extraVars: { TELEGRAM_ADMIN_ID: "7862655091" },
  },
  {
    userId: "7238164034",
    repo: "tcursor-u7238164034",
    source: path.join(ROOT, "ish", "echo-bot"),
    workerUrl: "https://tcursor-u7238164034.fxjournaluz.workers.dev",
    needsKv: false,
    extraVars: { ALLOWED_USER_ID: "7238164034" },
  },
];

const SKIP = new Set(["node_modules", ".wrangler", ".git"]);

function run(cmd, cwd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", env: process.env });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function readJsonc(file) {
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "").replace(/,\s*}/g, "}"));
}

function writeJsonc(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

function workflowYml() {
  return `name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm install
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
`;
}

function createKvNamespace(title, cwd) {
  const listOut = execSync("npx wrangler kv namespace list", {
    cwd,
    encoding: "utf8",
  });
  const namespaces = JSON.parse(listOut);
  const existing = namespaces.find((n) => n.title === title);
  if (existing) return existing.id;

  const out = execSync(`npx wrangler kv namespace create "${title}"`, {
    cwd,
    encoding: "utf8",
  });
  const match =
    out.match(/id = "([^"]+)"/) ?? out.match(/"id":\s*"([^"]+)"/);
  if (!match) throw new Error(`KV id topilmadi: ${out}`);
  return match[1];
}

async function publishProject(project) {
  const repoDir = path.join(TMP, project.repo);
  const repoUrl = `https://github.com/${OWNER}/${project.repo}.git`;

  if (!fs.existsSync(repoDir)) {
    fs.mkdirSync(path.dirname(repoDir), { recursive: true });
    run(`git clone --depth 1 ${repoUrl} ${project.repo}`, path.dirname(repoDir));
  }

  for (const entry of fs.readdirSync(repoDir)) {
    if (entry === ".git") continue;
    const target = path.join(repoDir, entry);
    fs.rmSync(target, { recursive: true, force: true });
  }

  copyDir(project.source, repoDir);

  fs.mkdirSync(path.join(repoDir, ".github", "workflows"), { recursive: true });
  fs.writeFileSync(
    path.join(repoDir, ".github", "workflows", "deploy.yml"),
    workflowYml(),
  );

  const wranglerPath = path.join(repoDir, "wrangler.jsonc");
  const config = readJsonc(wranglerPath);
  config.name = project.repo;
  config.account_id = ACCOUNT_ID;
  config.vars = {
    ...(config.vars || {}),
    ENVIRONMENT: "production",
    WORKER_PUBLIC_URL: project.workerUrl,
    USER_ID: project.userId,
    ...project.extraVars,
  };

  if (project.needsKv) {
    console.log(`\nKV yaratilmoqda (${project.repo})...`);
    run("npm install", repoDir);
    const kvTitle = `VIDEOS-${project.repo}`;
    const kvId = createKvNamespace(kvTitle, repoDir);
    config.kv_namespaces = [{ binding: project.kvBinding, id: kvId }];
  }

  writeJsonc(wranglerPath, config);

  fs.writeFileSync(
    path.join(repoDir, "README.md"),
    `# ${project.repo}

User ID: ${project.userId}

## Deploy

\`git push origin main\` yoki \`npx wrangler deploy\`

Worker: ${project.workerUrl}
`,
  );

  run("git add -A", repoDir);
  try {
    execSync(
      `git -c user.name="telegram-cursor-bot" -c user.email="bot@local" commit -m "Deploy user project for ${project.userId}"`,
      { cwd: repoDir, stdio: "inherit" },
    );
  } catch {
    console.log("Commit o'tkazib yuborildi (o'zgarish yo'q yoki allaqachon commit qilingan)");
  }
  run("git push origin main", repoDir);

  console.log(`\nWrangler deploy: ${project.repo}`);
  run("npm install", repoDir);
  run("npx wrangler deploy", repoDir);

  console.log(`\n✓ ${project.repo} → ${project.workerUrl}`);
}

for (const project of PROJECTS) {
  console.log(`\n========== ${project.repo} (user ${project.userId}) ==========`);
  await publishProject(project);
}

console.log("\nTayyor. Secretlar: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET");
