#!/usr/bin/env node
/**
 * VERIFICACAO DE TOQUE — a casca inteira num comando so.
 *
 *   npm run test:touch
 *
 * Duas familias de checagem:
 *
 * 1. Auditoria DOM (esbuild + react-dom/server + node --test): renderiza a
 *    casca no estado INITIAL dos stores e exige que todo `<button>`,
 *    `[role="button"]` e item de popup do Base UI carregue utilitario `touch:`
 *    ou `data-tap-exempt` — ver o cabecalho de
 *    `web/src/__audit__/touch-targets.domtest.ts`, que documenta o que o teste
 *    prova e o que nao prova (pixels reais e gesto ficam fora).
 *
 * 2. Contrato CSS de toque: a variante `touch` e os tokens de safe-area no
 *    theme.css, `viewport-fit=cover` no index.html, e as utilitarias
 *    `longpress-menu` e `selectable`. Se o contrato desmanchar, nada do que o
 *    teste DOM ve tem efeito no dedo — as duas checagens andam juntas.
 *
 * Exit 0 com tudo verde; exit 1 com relatorio do que falhou. Como o
 * `test:e2e`, roda explicito e nao entra no `npm test`.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // scripts/
const repoRoot = resolve(here, "..");
const webRoot = join(repoRoot, "web");
const auditDir = join(webRoot, "src", "__audit__");
const domtest = join(auditDir, "touch-targets.domtest.ts");
const buildDir = join(auditDir, ".build");
const esbuild = join(repoRoot, "node_modules", ".bin", "esbuild");

const run = (command, args, options = {}) =>
  spawnSync(command, args, { stdio: "inherit", cwd: repoRoot, ...options }).status ?? 1;

const banner = (title) => console.log(`\n\x1b[1m── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}\x1b[0m`);

let failures = 0;

/* ------------------------------------------------------------------ */
/* 1. Auditoria DOM                                                    */
/* ------------------------------------------------------------------ */

banner("auditoria DOM de alvos de toque (esbuild + react-dom/server)");
rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

const bundled = run(esbuild, [
  domtest,
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--packages=external",
  "--loader:.webp=empty", // a casca importa o logo; o markup e o que importa
  "--log-level=warning",
  `--tsconfig=${join(webRoot, "tsconfig.json")}`,
  `--outdir=${buildDir}`,
]);

if (bundled !== 0) {
  failures += 1;
} else {
  const built = readdirSync(buildDir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => join(buildDir, f));
  const status = run("node", ["--test", ...built]);
  if (status !== 0) failures += 1;
}
rmSync(buildDir, { recursive: true, force: true });

/* ------------------------------------------------------------------ */
/* 2. Contrato CSS de toque                                            */
/* ------------------------------------------------------------------ */

banner("contrato CSS de toque (theme.css e index.html)");
const theme = readFileSync(join(webRoot, "src", "styles", "theme.css"), "utf8");
const index = readFileSync(join(webRoot, "index.html"), "utf8");

const checks = [
  ["a variante touch existe (pointer: coarse + .touch-ui)", () => /@custom-variant\s+touch\b/.test(theme)],
  [
    "tokens de safe-area (--safe-top/right/bottom/left)",
    () => ["--safe-top:", "--safe-right:", "--safe-bottom:", "--safe-left:"].every((token) => theme.includes(token)),
  ],
  ["a regua de alvo de toque (--tap-target: 44px)", () => theme.includes("--tap-target: 44px")],
  ["a ponte de utilitarios --spacing-tap existe", () => theme.includes("--spacing-tap:")],
  ["viewport-fit=cover no index.html", () => /viewport-fit=cover/.test(index)],
  ["utilitaria longpress-menu existe", () => /@utility\s+longpress-menu\b/.test(theme)],
  ["utilitaria selectable existe", () => /@utility\s+selectable\b/.test(theme)],
];

for (const [label, check] of checks) {
  const pass = check();
  console.log(pass ? "  [ok]  " : "  [falha]", label);
  if (!pass) failures += 1;
}

/* ------------------------------------------------------------------ */
/* 3. Sumario                                                          */
/* ------------------------------------------------------------------ */

console.log(
  failures === 0
    ? "\n\x1b[32m✔ toque verde — casca auditada e contrato CSS intacto\x1b[0m\n"
    : `\n\x1b[31m✖ ${failures} bloco(s) falharam — ver o relatorio acima\x1b[0m\n`,
);
process.exit(failures === 0 ? 0 : 1);
