#!/usr/bin/env node
/**
 * Modo de desenvolvimento: sobe o backend em --dev (so API + WebSocket) e o
 * Vite ao lado, com proxy de /api e /ws. Encerra os dois juntos.
 *
 *   npm run dev [-- --repo <path>] [--port <n>]
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const passthrough = process.argv.slice(2);

const children = [];
let shuttingDown = false;

function run(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, { cwd: root, stdio: "inherit", ...opts });
  children.push({ name, child });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`\n[dev] ${name} saiu (code=${code} signal=${signal}) — derrubando o resto.`);
    shutdown(code ?? 1);
  });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => {
    for (const { child } of children) if (!child.killed) child.kill("SIGKILL");
    process.exit(code);
  }, 2_000).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("[dev] backend em 5271 (--dev) · vite em 5273 com proxy de /api e /ws\n");

run("server", process.execPath, [
  "--watch",
  path.join(root, "server", "bin", "gitcraque.mjs"),
  "--dev",
  "--no-open",
  ...passthrough,
]);

run("vite", "npx", ["vite", "--host", "127.0.0.1"], { cwd: path.join(root, "web") });
