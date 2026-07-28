/**
 * Sobe o backend de verdade contra um repositorio de fixture e devolve um
 * cliente HTTP/WS minimo para os testes de ponta a ponta.
 */
import http from "node:http";

import { WebSocket } from "ws";

import { createServer } from "../../src/server.mjs";

/** Porta alta e fora do caminho do servidor de desenvolvimento. */
export const TEST_PORT = 5391;

export async function bootServer(repoRoot, options = {}) {
  process.chdir(repoRoot);
  const handle = await createServer({
    port: options.port ?? TEST_PORT,
    host: "127.0.0.1",
    dev: options.dev ?? false,
    version: "0.0.0-test",
    ...options,
  });

  const base = `http://127.0.0.1:${handle.port}`;

  /**
   * fetch com o header Host que a guarda de origem exige.
   *
   * Manda tambem `x-gitcraque-lang: pt` — as mensagens de erro do backend sao
   * traduzidas por requisicao (ver `server/src/i18n.mjs`) e a suite checa o
   * texto em portugues. Sem o cabecalho, o servidor responderia em ingles, que
   * e o padrao dele.
   */
  const call = async (method, apiPath, body) => {
    const init = { method, headers: { "x-gitcraque-lang": "pt" } };
    if (body !== undefined) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${base}${apiPath}`, init);
    const text = await res.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
    }
    return { status: res.status, json, text, headers: res.headers };
  };

  return {
    handle,
    base,
    port: handle.port,
    get: (p) => call("GET", p),
    post: (p, body) => call("POST", p, body ?? {}),
    del: (p) => call("DELETE", p),
    call,
    fetchRaw: (p, init) => fetch(`${base}${p}`, init),
    // O undici proibe sobrescrever o header Host; para testar a guarda de
    // origem so serve uma requisicao http crua.
    rawRequest: (p, options = {}) => rawRequest(handle.port, p, options),
    connectWs: () => connectWs(`ws://127.0.0.1:${handle.port}/ws`),
    close: () => handle.close(),
  };
}

/** Requisicao http crua, com controle total sobre os headers (inclusive Host). */
export function rawRequest(port, apiPath, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: apiPath, method, headers, setHost: false },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            /* nem toda resposta e json */
          }
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      },
    );
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** Cliente WebSocket com fila de eventos e espera por tipo. */
export function connectWs(url) {
  const socket = new WebSocket(url);
  const received = [];
  const waiters = [];

  const push = (event) => {
    received.push(event);
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      if (waiters[i].type === event.type) {
        waiters[i].resolve(event);
        waiters.splice(i, 1);
      }
    }
  };

  socket.on("message", (data) => {
    try {
      push(JSON.parse(data.toString()));
    } catch {
      /* nao e evento do contrato */
    }
  });

  return {
    socket,
    received,
    open: () =>
      new Promise((resolve, reject) => {
        if (socket.readyState === WebSocket.OPEN) return resolve();
        socket.once("open", resolve);
        socket.once("error", reject);
      }),
    send: (event) => socket.send(JSON.stringify(event)),
    /** Espera um evento do tipo pedido; considera os ja recebidos. */
    waitFor: (type, timeoutMs = 5_000) =>
      new Promise((resolve, reject) => {
        const already = received.find((e) => e.type === type);
        if (already) return resolve(already);
        const timer = setTimeout(
          () => reject(new Error(`timeout esperando o evento "${type}"`)),
          timeoutMs,
        );
        waiters.push({
          type,
          resolve: (event) => {
            clearTimeout(timer);
            resolve(event);
          },
        });
      }),
    close: () =>
      new Promise((resolve) => {
        if (socket.readyState === WebSocket.CLOSED) return resolve();
        socket.once("close", resolve);
        socket.close();
      }),
  };
}
