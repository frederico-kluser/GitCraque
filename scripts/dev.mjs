#!/usr/bin/env node
/**
 * `npm run dev` — sobe os dois processos de desenvolvimento juntos:
 *
 *   backend  node --watch server/bin/gitcraque.mjs --dev   (5271, so API + WS)
 *   frontend vite                                          (5273, proxy de /api e /ws)
 *
 * O backend sobe com `--dev` de proposito: quem serve o front-end e o Vite,
 * com hot reload — e com `--no-open`, porque a url que interessa e a do Vite,
 * nao a do backend. Ctrl+C derruba os dois.
 *
 *   npm run dev                 # repositorio = cwd
 *   npm run dev -- ~/code/proj  # repositorio explicito
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = process.argv.slice(2).find((a) => !a.startsWith("-")) ?? process.cwd();

const processos = [];
let encerrando = false;

function subir(nome, comando, args, cwd) {
  const child = spawn(comando, args, {
    cwd,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, FORCE_COLOR: "1" },
    shell: false,
  });
  child.on("exit", (code, signal) => {
    if (encerrando) return;
    process.stderr.write(`\ndev: ${nome} saiu (${signal ?? code}); derrubando o resto\n`);
    encerrar(typeof code === "number" ? code : 1);
  });
  child.on("error", (err) => {
    process.stderr.write(`dev: nao consegui subir ${nome}: ${err.message}\n`);
    encerrar(1);
  });
  processos.push({ nome, child });
  return child;
}

function encerrar(code = 0) {
  if (encerrando) return;
  encerrando = true;
  for (const { child } of processos) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  // Quem ignorar o SIGTERM leva SIGKILL: `node --watch` as vezes segura o filho.
  setTimeout(() => {
    for (const { child } of processos) {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    process.exit(code);
  }, 2_000).unref();
}

subir(
  "backend",
  process.execPath,
  [
    "--watch",
    path.join(ROOT, "server", "bin", "gitcraque.mjs"),
    "--dev",
    "--no-open",
    "--repo",
    repo,
  ],
  ROOT,
);

// Caminho direto para o binario do Vite em vez de `npx`. Nasceu como contorno
// do `.npmrc` que pedia ${MOTION_TOKEN} — esse arquivo ja nao existe —, mas
// segue valendo: chamar o arquivo pula a resolucao do npx a cada `npm run dev`.
subir(
  "vite",
  process.execPath,
  [path.join(ROOT, "node_modules", "vite", "bin", "vite.js")],
  path.join(ROOT, "web"),
);

process.on("SIGINT", () => encerrar(0));
process.on("SIGTERM", () => encerrar(0));
