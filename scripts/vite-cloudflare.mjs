/**
 * Runs Vite or Wrangler with DEPLOY_TARGET=cloudflare.
 * Workers Builds can call `npm run build:cloudflare` and `npx wrangler deploy`
 * (WORKERS_CI=1 also selects this target). Do not use this for the Vercel build.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] ?? "build";
const extra = process.argv.slice(3);
const env = { ...process.env, DEPLOY_TARGET: "cloudflare" };

const commands = {
  build: ["node_modules/vite/bin/vite.js", ["build", ...extra]],
  preview: [
    "node_modules/vite/bin/vite.js",
    ["preview", "--host", "127.0.0.1", "--port", "4173", ...extra],
  ],
  deploy: ["node_modules/wrangler/bin/wrangler.js", ["deploy", ...extra]],
};

const selected = commands[mode];
if (!selected) {
  console.error(`Unknown Cloudflare command "${mode}". Use build, preview, or deploy.`);
  process.exit(1);
}

const [bin, args] = selected;
const child = spawn(process.execPath, [path.join(root, bin), ...args], {
  cwd: root,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
