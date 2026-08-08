/**
 * Hub do WebSocket: broadcast tipado de `ServerEvent`.
 *
 * Manda `hello` assim que o cliente conecta e entende os quatro eventos de
 * cliente do contrato: `ping`, `credentials:provide`, `credentials:cancel` e
 * `refresh`.
 */
import { WebSocketServer } from "ws";

import { runtime } from "../runtime.mjs";

export class Hub {
  /**
   * @param {{onRefresh?: (what?: string) => void, describe?: () => Promise<object>}} [hooks]
   */
  constructor(hooks = {}) {
    this.wss = new WebSocketServer({ noServer: true });
    this.hooks = hooks;
    this.wss.on("connection", (socket) => this.#onConnection(socket));
  }

  get clientCount() {
    return this.wss.clients.size;
  }

  /** Chamado pelo `upgrade` do servidor http, depois da guarda de origem. */
  handleUpgrade(request, socket, head) {
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit("connection", ws, request);
    });
  }

  /** @param {import("../types.mjs").ServerEvent} event */
  broadcast(event) {
    if (!this.wss.clients.size) return;
    const payload = JSON.stringify(event);
    for (const client of this.wss.clients) {
      if (client.readyState === 1) {
        try {
          client.send(payload);
        } catch (e) {
          console.error("[gitcraque] hub send:", e.message);
        }
      }
    }
  }

  async #onConnection(socket) {
    socket.on("error", () => socket.terminate());
    socket.on("message", (data) => this.#onMessage(socket, data));

    const hello = {
      type: "hello",
      cwd: process.cwd(),
      mainRoot: "",
      version: runtime.version,
      pid: process.pid,
    };
    try {
      const extra = await this.hooks.describe?.();
      if (extra) Object.assign(hello, extra, { type: "hello" });
    } catch {
      /* hello e melhor incompleto que ausente */
    }
    this.#send(socket, hello);
  }

  #onMessage(socket, data) {
    let event;
    try {
      event = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!event || typeof event.type !== "string") return;

    switch (event.type) {
      case "ping":
        this.#send(socket, { type: "pong", ts: Date.now() });
        break;
      case "credentials:provide":
        runtime.vault?.provide(event);
        break;
      case "credentials:cancel":
        runtime.vault?.cancel(event);
        break;
      case "refresh":
        this.hooks.onRefresh?.(event.what);
        this.broadcast({ type: "repo:changed", reason: event.what ?? "manual" });
        break;
      default:
        break;
    }
  }

  #send(socket, event) {
    if (socket.readyState !== 1) return;
    try {
      socket.send(JSON.stringify(event));
    } catch {
      /* idem */
    }
  }

  close() {
    for (const client of this.wss.clients) {
      try {
        client.close(1001, "servidor encerrando");
      } catch {
        client.terminate();
      }
    }
    return new Promise((resolve) => this.wss.close(resolve));
  }
}
