/**
 * BUNDLER DOS TESTES DE RENDER DO VIEWER — igualzinho ao padrao do grafo,
 * adaptado ao glob do runner do viewer (`*.test.mjs`).
 *
 * `npm run test:viewer` roda `node --test "web/src/viewer/__tests__/*.test.mjs"`.
 * Os fontes que renderizam JSX (`DiffView.tsx`, `FileViewer.tsx`) nao podem
 * ser importados a runtime pelo Node (type stripping nao erase JSX), entao o
 * teste de render passa antes pelo esbuild — que ja vem com o Vite, nenhuma
 * dependencia nova — com os `paths` do tsconfig, e importa o bundle. Os testes
 * do entry registram no MESMO processo do `node --test` que carregou o
 * `.test.mjs`: o glob continua sendo a unica porta de entrada da suite.
 *
 * NAO e um teste (o glob da suite e `*.test.mjs`), por isso o nome termina em
 * `.mjs` e nao `.test.mjs`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..", "..", "..");
const repoRoot = resolve(webRoot, "..");
const esbuildBin = join(repoRoot, "node_modules", ".bin", "esbuild");

/* O `node --test` roda os arquivos *.test.mjs em PARALELO (um processo por
   arquivo). Se dois arquivos apontassem o esbuild para o MESMO outdir, um
   apagaria o bundle do outro no meio do import — por isso o outdir e um
   subdiretorio por entrada. */
const buildDirFor = (entry) => join(here, ".build", entry.input.replace(/\.tsx?$/, ""));

/**
 * Empacota cada entrada com o esbuild do projeto e importa o resultado no
 * processo corrente, registrando os testes do entry no runner do `.test.mjs`.
 *
 * `entries`: [{ input: "diff-render.domtest.tsx", alias: { "@/hooks": "..." } }]
 * `alias` redireciona um caminho no MOMENTO do bundle — usado para injetar um
 * stub de hook que o teste nao alcancaria (cache de modulo privado).
 */
export async function bundleAndImport(entries) {
  const tasks = [];
  const buildDirs = new Set();
  try {
    for (const entry of entries) {
      const buildDir = buildDirFor(entry);
      buildDirs.add(buildDir);
      mkdirSync(buildDir, { recursive: true });
      const args = [
        join(here, entry.input),
        "--bundle",
        "--platform=node",
        "--format=esm",
        "--packages=external",
        "--log-level=warning",
        `--tsconfig=${join(webRoot, "tsconfig.json")}`,
        `--outdir=${buildDir}`,
      ];
      for (const [key, value] of Object.entries(entry.alias ?? {})) {
        args.push(`--alias:${key}=${value}`);
      }
      const result = spawnSync(esbuildBin, args, { stdio: "inherit", cwd: webRoot });
      if (result.status !== 0) {
        throw new Error(`esbuild falhou ao empacotar ${entry.input} (status ${result.status})`);
      }
    }
    for (const entry of entries) {
      const output = join(buildDirFor(entry), entry.input.replace(/\.tsx?$/, ".js"));
      if (!existsSync(output)) throw new Error(`bundle nao gerado: ${output}`);
      tasks.push(import(pathToFileURL(output).href));
    }
    await Promise.all(tasks);
  } finally {
    for (const buildDir of buildDirs) rmSync(buildDir, { recursive: true, force: true });
  }
}
