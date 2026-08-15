/**
 * Resiliencia do openApp a pico de carga da maquina.
 *
 * Sob carga paralela pesada (outras suites de Playwright no mesmo host), o
 * `page.goto` pode falhar com `net::ERR_CONNECTION_REFUSED` mesmo com o
 * servidor VIVO: o event loop do servidor congela por segundos, a fila de
 * accept enche e o kernel recusa novas conexoes. Nao e bug do app nem da
 * spec — e condicao de infraestrutura — por isso o retry e LIMITADO e so
 * reage ao erro de conexao; qualquer outro erro continua falhando na hora.
 */
import type { Page } from "@playwright/test";
import { openApp } from "../../harness/ui.ts";

const REFUSED = /ERR_CONNECTION_REFUSED|net::ERR/;

/**
 * Abre o app com ate ~6 tentativas contra recusa de conexao (30 s no total);
 * qualquer outro erro falha na hora.
 */
export async function openAppResilient(page: Page): Promise<void> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      await openApp(page);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!REFUSED.test(message) || Date.now() > deadline) throw err;
      await page.waitForTimeout(2_000);
    }
  }
}

/**
 * Retry de operacao de REDE com backoff. As specs de mouse e touch mutam o
 * MESMO remoto real (gitcraque-teste-operacoes) quando rodam em paralelo, e o
 * GitHub rejeita pushs concorrentes com "cannot lock ref" (update atomico).
 * A corrida e estrutural da campanha, nao do app — umas poucas tentativas
 * cavalgam a janela e o resto continua estrito (erro genuino falha).
 */
export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  { tries = 4, delayMs = 4_000 }: { tries?: number; delayMs?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === tries) break;
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} falhou: ${String(lastError)}`);
}

/**
 * Espera o remoto FICAR QUIETO (tip de refs/heads/main estavel por
 * `stableMs`) antes de uma sequencia de mutacoes. Quando o projeto touch roda
 * a suite em paralelo, o origin/main muda a cada operacao dele; comecar a
 * nossa sequencia no meio de uma rajada alheia garante "fetch first" no push.
 * Com teto de espera: se o vizinho nao der folga, seguimos mesmo assim (o
 * retry do fluxo cobre).
 */
export async function waitRemoteQuiet(
  sample: () => Promise<string>,
  { stableMs = 4_000, maxMs = 20_000, intervalMs = 1_000 }: {
    stableMs?: number;
    maxMs?: number;
    intervalMs?: number;
  } = {},
): Promise<void> {
  const deadline = Date.now() + maxMs;
  let lastTip = "";
  let stableSince = 0;
  for (;;) {
    let tip = "";
    try {
      tip = await sample();
    } catch {
      /* ls-remote falhou (rede?) — trata como mudanca e re-amostra */
    }
    const now = Date.now();
    if (tip === lastTip && tip !== "") {
      if (stableSince === 0) stableSince = now;
      if (now - stableSince >= stableMs) return;
    } else {
      stableSince = 0;
      lastTip = tip;
    }
    if (now > deadline) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
