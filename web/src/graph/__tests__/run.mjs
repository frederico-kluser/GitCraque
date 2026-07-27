#!/usr/bin/env node
/**
 * A suite completa do motor do grafo, num comando so:
 *
 *   node web/src/graph/__tests__/run.mjs
 *
 * Sao duas familias de teste, por motivos diferentes:
 *
 * 1. `*.test.ts` — algoritmo e geometria. `layout.ts` e `bezier.ts` nao tem um
 *    unico import de RUNTIME (so `import type`), entao o `node --test` roda os
 *    arquivos TypeScript diretamente, com o type stripping do proprio Node.
 *
 * 2. `*.domtest.ts` — a prova da virtualizacao. Renderiza a `GraphView` de
 *    verdade com `react-dom/server` e conta nos de DOM, entao precisa de JSX e
 *    do alias `@/`: passa antes pelo esbuild (que ja vem com o Vite; nenhuma
 *    dependencia nova foi instalada), com os `paths` do proprio tsconfig.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "../../..");
const repoRoot = resolve(webRoot, "..");
const buildDir = join(here, ".build");
const esbuild = join(repoRoot, "node_modules", ".bin", "esbuild");

const run = (command, args, options = {}) =>
  spawnSync(command, args, { stdio: "inherit", cwd: webRoot, ...options }).status ?? 1;

const banner = (title) => console.log(`\n\x1b[1m── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}\x1b[0m`);

const files = readdirSync(here);
const pureTests = files.filter((f) => f.endsWith(".test.ts")).sort();
const domTests = files.filter((f) => f.endsWith(".domtest.ts")).sort();

let failures = 0;

banner("algoritmo e geometria (node --test, TypeScript direto)");
failures += run("node", ["--test", ...pureTests.map((f) => join(here, f))]);

if (domTests.length > 0) {
  banner("virtualizacao (react-dom/server, contagem real de nos)");
  rmSync(buildDir, { recursive: true, force: true });
  mkdirSync(buildDir, { recursive: true });

  const bundled = run(esbuild, [
    ...domTests.map((f) => join(here, f)),
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--packages=external",
    "--log-level=warning",
    `--tsconfig=${join(webRoot, "tsconfig.json")}`,
    `--outdir=${buildDir}`,
  ]);

  if (bundled !== 0) {
    failures += bundled;
  } else {
    const built = readdirSync(buildDir)
      .filter((f) => f.endsWith(".js") || f.endsWith(".mjs"))
      .map((f) => join(buildDir, f));
    failures += run("node", ["--test", ...built]);
  }
  rmSync(buildDir, { recursive: true, force: true });
}

banner("SVG de exemplo → docs/graph-sample.svg");
failures += run("node", [join(here, "..", "devtools", "make-sample-svg.ts")]);

console.log(failures === 0 ? "\n\x1b[32m✔ tudo verde\x1b[0m\n" : "\n\x1b[31m✖ falhou\x1b[0m\n");
process.exit(failures === 0 ? 0 : 1);
