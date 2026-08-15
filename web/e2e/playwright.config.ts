/**
 * Config do Playwright para o GitCraque.
 *
 * O app roda SOBRE o servidor Node que serve web/dist (sem vite): cada spec
 * sobe o proprio servidor via `harness/servers.ts` apontando para um fixture
 * exclusivo. Por isso CADA projeto usa uma porta propria — se dois servidores
 * colidirem (por ex. rodar dois projetos de uma vez), o boot nao mata a spec
 * vizinha:
 *
 *   smoke = 5371  (canario: servidor sobe, pagina carrega, grafo renderiza)
 *   mouse = 5372  (roteiro de operacoes com mouse — onda 2)
 *   touch = 5373  (roteiro com emulacao touch real — onda 2)
 *
 * Regras do harness:
 *  - `workers: 1`: as specs MUTAM estado compartilhado (o repositorio do
 *    fixture e o servidor do projeto); paralelismo aqui seria corrida.
 *  - headless SEMPRE: o usuario pediu headless; o canario roda em CI/terminal.
 *  - Browser: o chromium headless shell JA INSTALADO em ~/.cache/ms-playwright
 *    (chromium_headless_shell-1228/1234...), detectado em runtime pelo build
 *    mais recente. O pacote instalado (playwright 1.62.1) espera o build 1234;
 *    se o cache tiver outro build, o Playwright falha o launch com a mensagem
 *    dele — o fallback e `npx playwright install chromium` (baixa para o cache
 *    global, sem --with-deps: as libs do sistema ja estao na maquina).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

/** Uma porta por projeto — o contrato do harness (ver cabecalho). */
export const PORTS = {
  smoke: 5371,
  mouse: 5372,
  touch: 5373,
} as const;

/** Build do chromium que o playwright@1.62.1 espera (revision do browsers.json). */
const EXPECTED_BUILD = 1234;

/** Layouts do executavel ja vistos em ~/.cache/ms-playwright, novos e antigos. */
const EXECUTABLE_PATHS = [
  // headless shell — preferido (leve, e o que o modo headless usa)
  "chrome-headless-shell-linux64/chrome-headless-shell",
  "chrome-headless-shell-linux64/headless_shell",
  "chrome-linux/headless_shell",
  "chrome-mac/headless_shell",
  "chrome-win/headless_shell.exe",
  // chromium completo — fallback se so ele estiver no cache
  "chrome-linux64/chrome",
  "chrome-linux/chrome",
  "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
  "chrome-win/chrome.exe",
];

function findBrowserExecutable(): { executablePath: string; build: number } {
  const cacheDir = path.join(os.homedir(), ".cache", "ms-playwright");
  if (!fs.existsSync(cacheDir)) {
    throw new Error(
      `Sem browser do Playwright em ${cacheDir}. Rode \`npx playwright install chromium\` ` +
        `(baixa o chromium headless shell para o cache global; sem --with-deps).`,
    );
  }
  // Builds disponiveis, do mais recente para o mais antigo.
  const builds = fs
    .readdirSync(cacheDir)
    .map((name) => /^chromium(_headless_shell)?-(\d+)$/.exec(name))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ name: m[0], build: Number(m[2]) }))
    .sort((a, b) => b.build - a.build);
  if (builds.length === 0) {
    throw new Error(
      `Nenhum chromium em ${cacheDir}. Rode \`npx playwright install chromium\` e tente de novo.`,
    );
  }
  for (const { name, build } of builds) {
    for (const rel of EXECUTABLE_PATHS) {
      const candidate = path.join(cacheDir, name, rel);
      if (fs.existsSync(candidate)) return { executablePath: candidate, build };
    }
  }
  throw new Error(
    `Nenhum executavel de chromium conhecido em ${cacheDir} (vi: ${builds.map((b) => b.name).join(", ")}). ` +
      `Reinstale com \`npx playwright install chromium\`.`,
  );
}

const browser = findBrowserExecutable();
if (browser.build < EXPECTED_BUILD) {
  // Nao derruba o boot: se o build nao casar com o esperado pelo pacote, o
  // proprio Playwright falha o launch com a mensagem de fallback.
  process.stdout.write(
    `[e2e] aviso: build ${browser.build} do chromium no cache; o playwright@1.62.1 espera ${EXPECTED_BUILD}. ` +
      `Se o launch falhar, rode \`npx playwright install chromium\`.\n`,
  );
}

export default defineConfig({
  testDir: path.join(import.meta.dirname, "specs"),
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  // Sem snapshot visual: o grafo e virtualizado e as especificas de UI desta
  // campanha asserem por roles/textos i18n, nunca por pixel.
  outputDir: path.join(import.meta.dirname, "test-results"),
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: path.join(import.meta.dirname, "playwright-report") }],
  ],
  use: {
    headless: true,
    launchOptions: { executablePath: browser.executablePath },
  },
  projects: [
    {
      name: "smoke",
      testMatch: /smoke\.spec\.ts/,
      use: {
        baseURL: `http://127.0.0.1:${PORTS.smoke}`,
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "mouse",
      testMatch: /mouse\/.*\.spec\.ts/,
      use: {
        baseURL: `http://127.0.0.1:${PORTS.mouse}`,
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      // Toque real: viewport de celular + touch ativo. Os gestos sao emitidos
      // por CDP (`Input.dispatchTouchEvent`), nunca por mouse — ver
      // `harness/touch.ts`. `isMobile` liga o meta viewport e o user-agent
      // mobile, que o app usa para escolher o layout compacto.
      name: "touch",
      testMatch: /touch\/.*\.spec\.ts/,
      use: {
        baseURL: `http://127.0.0.1:${PORTS.touch}`,
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
