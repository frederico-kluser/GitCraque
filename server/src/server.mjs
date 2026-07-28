/**
 * O servidor: `node:http` NATIVO. Sem Express, sem Fastify, sem Koa.
 * A unica dependencia de producao do backend e o `ws`.
 *
 * Responsabilidades:
 *  - guarda de origem (o servidor executa git na maquina do usuario: um site
 *    qualquer nao pode falar com ele por DNS rebinding);
 *  - roteamento de /api com envelope de erro `ApiError`;
 *  - estaticos de `web/dist` com fallback de SPA;
 *  - upgrade do WebSocket em /ws;
 *  - fiacao do watcher, do hub e do cofre no `runtime`.
 */
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  API_PREFIX,
  DEFAULT_HOST,
  DEFAULT_PORT,
  PORT_FALLBACK_TRIES,
  WS_PATH,
} from "./contract.mjs";
import { detectGitVersion } from "./git/exec.mjs";
import { getGitDir, getWorktreesPayload } from "./git/worktree.mjs";
import { HttpError, readJsonBody } from "./router.mjs";
import { buildRouter } from "./routes/index.mjs";
import { runtime } from "./runtime.mjs";
import { StaticServer } from "./static.mjs";
import { Vault } from "./trampoline/vault.mjs";
import { Watcher } from "./watcher.mjs";
import { Hub } from "./ws/hub.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** `web/dist` a partir de `server/src`. */
export const WEB_DIST = path.resolve(HERE, "..", "..", "web", "dist");

/**
 * @param {{port?: number, host?: string, dev?: boolean, version?: string, distDir?: string}} options
 */
export async function createServer(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const dev = options.dev === true;
  runtime.dev = dev;
  runtime.version = options.version || runtime.version;
  runtime.gitVersion = await detectGitVersion();

  /* -- cofre + trampolim: precisa existir ANTES do primeiro comando git -- */
  const vault = new Vault();
  runtime.vault = vault;
  runtime.trampolineEnv = await vault.start();

  /* -- hub do WebSocket -- */
  const hub = new Hub({
    describe: async () => {
      const payload = await getWorktreesPayload(process.cwd());
      return { cwd: payload.cwd, mainRoot: payload.mainRoot };
    },
  });
  runtime.hub = hub;

  /* -- watcher do git-dir da worktree ativa -- */
  let watcher = null;
  const startWatcher = async () => {
    watcher?.close();
    const gitDir = await getGitDir(process.cwd());
    watcher = new Watcher({
      gitDir,
      onChange: (reason, paths) => hub.broadcast({ type: "repo:changed", reason, paths }),
    }).start();
    runtime.watcher = watcher;
    return watcher;
  };
  await startWatcher();

  /* -- rotas -- */
  const router = buildRouter({
    onCwdChanged: async (worktree, payload) => {
      // Trocar de worktree troca o git-dir: o watcher velho vira ruido.
      await startWatcher();
      hub.broadcast({
        type: "cwd:changed",
        cwd: payload.cwd,
        worktree: worktree ?? null,
        mainRoot: payload.mainRoot,
      });
    },
  });

  const statics = new StaticServer(options.distDir || WEB_DIST);

  const server = http.createServer((req, res) => {
    handle(req, res, { router, statics, dev }).catch((err) => {
      if (!res.headersSent) {
        sendError(res, err);
        return;
      }
      // Estourou depois de comecar a resposta: a requisicao ja era, mas a UI
      // ainda merece saber que algo quebrou no servidor.
      hub.broadcast({
        type: "error",
        message: err?.message || "erro interno no servidor",
        detail: `${req.method} ${req.url}`,
      });
      res.destroy();
    });
  });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    const denial = originDenial(req);
    if (denial) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    hub.handleUpgrade(req, socket, head);
  });

  const port = await listen(server, options.port ?? DEFAULT_PORT, host);

  return {
    server,
    hub,
    vault,
    port,
    host,
    get watcher() {
      return watcher;
    },
    url: `http://${host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host}:${port}`,
    async close() {
      watcher?.close();
      await hub.close();
      await vault.close();
      server.closeIdleConnections?.();
      const encerrado = new Promise((resolve) => server.close(resolve));
      // Conexao keep-alive segura o `close` para sempre: depois de um respiro,
      // derruba o que sobrou. Sem isso o await nunca termina.
      const carrasco = setTimeout(() => server.closeAllConnections?.(), 500);
      carrasco.unref?.();
      await encerrado;
      clearTimeout(carrasco);
    },
  };
}

/** Tenta a porta pedida e, se ocupada, as PORT_FALLBACK_TRIES seguintes. */
async function listen(server, desired, host) {
  for (let offset = 0; offset <= PORT_FALLBACK_TRIES; offset += 1) {
    const port = desired + offset;
    try {
      await new Promise((resolve, reject) => {
        const onError = (err) => {
          server.off("listening", onListening);
          reject(err);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, host);
      });
      return port;
    } catch (err) {
      if (err.code !== "EADDRINUSE") throw err;
    }
  }
  throw new Error(
    `portas ${desired}..${desired + PORT_FALLBACK_TRIES} ocupadas; use --port para escolher outra`,
  );
}

/* ------------------------------------------------------------------ *
 * Guarda de origem — protecao contra DNS rebinding
 * ------------------------------------------------------------------ *
 * Este servidor executa comandos git na maquina do usuario. Se um site
 * qualquer conseguisse falar com ele (bastaria um dominio apontando para
 * 127.0.0.1), poderia mandar POST /api/raw. Entao: `Host` tem de ser local, e
 * `Origin`, quando presente, tambem.
 */

export function isLocalHostname(hostname) {
  if (!hostname) return false;
  const clean = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (clean === "localhost" || clean.endsWith(".localhost")) return true;
  if (clean === "::1" || clean === "0:0:0:0:0:0:0:1") return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clean)) return true;
  return false;
}

function hostnameOf(hostHeader) {
  if (!hostHeader) return "";
  // "[::1]:5271" | "127.0.0.1:5271" | "localhost"
  if (hostHeader.startsWith("[")) return hostHeader.slice(0, hostHeader.indexOf("]") + 1);
  const colon = hostHeader.lastIndexOf(":");
  return colon === -1 ? hostHeader : hostHeader.slice(0, colon);
}

/** @returns {string} motivo da recusa, ou "" quando a requisicao pode passar */
export function originDenial(req) {
  const host = req.headers.host;
  if (!host) return "requisicao sem header Host";
  if (!isLocalHostname(hostnameOf(host))) {
    return `Host "${host}" nao e local`;
  }

  const origin = req.headers.origin;
  if (origin && origin !== "null") {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      return `Origin "${origin}" invalida`;
    }
    if (!isLocalHostname(parsed.hostname)) return `Origin "${origin}" nao e local`;
  }
  return "";
}

/* ------------------------------------------------------------------ *
 * Ciclo da requisicao
 * ------------------------------------------------------------------ */

async function handle(req, res, { router, statics, dev }) {
  const denial = originDenial(req);
  if (denial) {
    sendJson(res, 403, {
      error: "origem recusada",
      detail: `${denial}. O gitcraque so aceita requisicoes de localhost.`,
    });
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;

  if (pathname === WS_PATH) {
    sendJson(res, 426, { error: "use WebSocket em /ws" });
    return;
  }

  if (pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`)) {
    await handleApi(req, res, router, url, pathname.slice(API_PREFIX.length) || "/");
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "metodo nao permitido fora de /api" });
    return;
  }

  if (dev) {
    // Em --dev quem serve o front-end e o Vite (5273).
    sendJson(res, 404, {
      error: "modo --dev: os estaticos sao servidos pelo Vite",
      detail: "abra http://127.0.0.1:5273",
    });
    return;
  }

  await statics.serve(req, res, pathname);
}

async function handleApi(req, res, router, url, apiPath) {
  const match = router.match(req.method, apiPath);
  if (!match) {
    const allowed = router.allowedMethods(apiPath);
    if (allowed.length) {
      res.setHeader("allow", allowed.join(", "));
      sendJson(res, 405, { error: `metodo ${req.method} nao existe em ${apiPath}` });
      return;
    }
    sendJson(res, 404, { error: `rota ${req.method} ${apiPath} nao existe` });
    return;
  }

  /** @type {Record<string, string>} */
  const query = {};
  for (const [key, value] of url.searchParams) query[key] = value;

  let body = {};
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    body = await readJsonBody(req);
  } else {
    req.resume();
  }

  const payload = await match.handler({ req, res, params: match.params, query, body, url });
  if (res.writableEnded) return;
  sendJson(res, 200, payload ?? { ok: true });
}

function sendJson(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(text);
}

/** Todo erro sai no envelope `ApiError` do contrato. */
function sendError(res, err) {
  const status = Number.isInteger(err?.status) ? err.status : 500;
  /** @type {{error: string, detail?: string, command?: object}} */
  const payload = { error: err?.message || "erro interno" };
  if (err?.detail) payload.detail = err.detail;
  if (err?.command) payload.command = err.command;
  // Dica de onde estourou, sem entregar o caminho absoluto do disco para a UI:
  // `at getLog (log.mjs:178:19)` ajuda; `file:///home/ana/...` e vazamento.
  if (status === 500 && !err?.detail && err?.stack) {
    const frame = String(err.stack).split("\n")[1]?.trim();
    if (frame) payload.detail = frame.replace(/\(?(?:file:\/\/)?[^\s()]*[/\\]([^/\\\s()]+:\d+:\d+)\)?/, "($1)");
  }
  sendJson(res, status, payload);
}

export { HttpError };
