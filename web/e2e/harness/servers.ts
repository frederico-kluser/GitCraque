/**
 * Sobe o app COMPLETO num processo: `node server/bin/gitcraque.mjs --repo
 * <fixture> --port <porta> --no-open` com cwd na raiz do repo. O servidor
 * serve web/dist + a API (sem vite) — web/dist PRECISA estar construido
 * (`npm run build`); o gate da onda constroi antes de rodar as specs.
 *
 * O CLI testa as portas seguintes quando a pedida esta ocupada
 * (`PORT_FALLBACK_TRIES`), entao o health poll varre a faixa porta..porta+10:
 * descobrir a porta REAL pelo banner seria frágil e desnecessario.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

/** Raiz do repositorio — subir o servidor exige o cwd na raiz (como `npm start`). */
export const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

export const SERVER_BIN = path.join(ROOT, "server", "bin", "gitcraque.mjs");
export const WEB_DIST = path.join(ROOT, "web", "dist");

/** Faixa que o CLI testa quando a porta pedida esta ocupada. */
const PORT_FALLBACK_TRIES = 10;
/** Teto de espera pelo /api/health (mesmo contrato do verify-e2e.mjs). */
const HEALTH_TIMEOUT_MS = 25_000;
const HEALTH_POLL_MS = 250;
/** Quanto do stdout+stderr guardamos para a mensagem de erro. */
const MAX_LOG = 8_000;

export interface RunningServer {
  /** porta em que o /api/health respondeu (pode diferir da pedida) */
  port: number;
  baseUrl: string;
  stop: () => Promise<void>;
}

/** true se a porta aceitar uma conexao TCP agora. */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => {
      probe.close(() => resolve(true));
    });
  });
}

/**
 * Sobe o servidor do app contra o fixture e espera o /api/health.
 *
 * Erro claro (com a saida capturada) se o processo morrer antes do health,
 * se web/dist faltar ou se a porta pedida estiver ocupada no momento do boot.
 */
export async function startAppServer(
  fixturePath: string,
  port: number,
  { timeoutMs = HEALTH_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<RunningServer> {
  if (!fs.existsSync(SERVER_BIN)) {
    throw new Error(`nao achei o binario do servidor: ${SERVER_BIN}`);
  }
  if (!fs.existsSync(WEB_DIST)) {
    throw new Error(
      `web/dist nao existe (${WEB_DIST}). Rode \`npm run build\` na raiz antes das specs — ` +
        `o servidor do app serve web/dist + API, sem vite.`,
    );
  }
  if (!(await isPortFree(port))) {
    throw new Error(
      `porta ${port} ocupada antes do boot do servidor. Outro processo do GitCraque esta no ar? ` +
        `Cada projeto usa a propria porta (smoke=5371, mouse=5372, touch=5373).`,
    );
  }

  const child = spawn(
    process.execPath,
    [SERVER_BIN, "--repo", fixturePath, "--port", String(port), "--no-open"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );
  let log = "";
  const sink = (chunk: Buffer) => {
    log = `${log}${chunk}`.slice(-MAX_LOG);
  };
  child.stdout?.on("data", sink);
  child.stderr?.on("data", sink);

  const baseUrl = (p: number) => `http://127.0.0.1:${p}`;
  const deadline = Date.now() + timeoutMs;
  let upPort: number | null = null;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `servidor saiu antes do health (exit ${child.exitCode}). Saida:\n${log}`,
      );
    }
    for (let p = port; p <= port + PORT_FALLBACK_TRIES; p += 1) {
      try {
        const res = await fetch(`${baseUrl(p)}/api/health`);
        if (res.ok) {
          upPort = p;
          break;
        }
      } catch {
        /* ainda subindo — tenta de novo no proximo ciclo */
      }
    }
    if (upPort !== null) break;
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }

  if (upPort === null) {
    void child.kill("SIGKILL");
    throw new Error(
      `servidor nao respondeu em /api/health apos ${timeoutMs} ms ` +
        `(portas ${port}..${port + PORT_FALLBACK_TRIES}). Saida:\n${log}`,
    );
  }

  const base = baseUrl(upPort);
  const started: RunningServer = {
    port: upPort,
    baseUrl: base,
    stop: () => stopServer(child),
  };
  return started;
}

/** Encerra o servidor: SIGTERM e, sem saida em 5 s, SIGKILL. */
function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
  });
  child.kill("SIGTERM");
  const killer = setTimeout(() => child.kill("SIGKILL"), 5_000);
  return exited.finally(() => clearTimeout(killer));
}
