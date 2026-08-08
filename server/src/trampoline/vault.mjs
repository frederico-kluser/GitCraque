/**
 * Cofre de credenciais + ponte IPC do trampolim de askpass.
 *
 * O `askpass.mjs` roda como filho do GIT, sem acesso nenhum ao estado do
 * servidor. A ponte entre os dois e um socket unix (named pipe no Windows) com
 * um nonce de sessao:
 *
 *   git push --spawn--> askpass.mjs --socket + nonce--> vault --> segredo
 *
 * O segredo NUNCA entra no `env` do processo do git (qualquer processo do
 * usuario le `/proc/<pid>/environ`), NUNCA vai em argv (visivel no `ps`) e
 * NUNCA e escrito em disco. So trafega pelo socket, sob demanda, uma vez.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ASKPASS_TIMEOUT_MS,
  ENV_ASKPASS_NONCE,
  ENV_ASKPASS_SOCK,
} from "../contract.mjs";
import { runtime } from "../runtime.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ASKPASS_SCRIPT = path.resolve(HERE, "askpass.mjs");

/**
 * Deduz host e tipo do pedido a partir do prompt cru que o git/ssh passou.
 *
 *   "Username for 'https://github.com': "
 *   "Password for 'https://user@github.com': "
 *   "Enter passphrase for key '/home/u/.ssh/id_ed25519': "
 *   "user@host: Permission denied (publickey). Password:"
 *
 * @param {string} prompt
 * @returns {{host: string, kind: "username"|"password", username?: string}}
 */
export function parsePrompt(prompt) {
  const text = String(prompt || "");
  const kind = /username/i.test(text) ? "username" : "password";

  const quoted = /'([^']+)'/.exec(text);
  if (quoted) {
    const value = quoted[1];
    // URL completa: o host e o hostname, e o user pode vir embutido.
    try {
      const url = new URL(value);
      return {
        host: url.hostname,
        kind,
        ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      };
    } catch {
      /* nao e URL: cai nos casos abaixo */
    }
    // Chave SSH: a "identidade" e o proprio caminho da chave.
    if (/passphrase for key/i.test(text)) return { host: `ssh:${value}`, kind: "password" };
    return { host: value, kind };
  }

  const scp = /(?:^|\s)([^\s@]+)@([^\s:]+)/.exec(text);
  if (scp) return { host: scp[2], kind, username: scp[1] };

  return { host: "", kind };
}

export class Vault {
  constructor() {
    /** @type {Map<string, {host: string, username: string, token: string, createdAt: number}>} */
    this.entries = new Map();
    /** @type {Map<string, {resolve: (v: string|null) => void, timer: NodeJS.Timeout, prompt: object}>} */
    this.pending = new Map();
    this.server = null;
    this.socketPath = "";
    this.nonce = "";
    this.dir = "";
    this.timeoutMs = ASKPASS_TIMEOUT_MS;
  }

  /* -------------------- cofre -------------------- */

  /** GET /api/credentials — nunca devolve o token. */
  list() {
    return {
      entries: [...this.entries.values()].map(({ host, username, token, createdAt }) => ({
        host,
        username,
        createdAt,
        masked: token ? `${"*".repeat(Math.max(0, Math.min(token.length, 8) - 4))}${token.slice(-4)}` : "",
      })),
    };
  }

  save({ host, username, token }) {
    if (!host || typeof host !== "string") {
      const error = new Error("host e obrigatorio");
      error.status = 400;
      throw error;
    }
    if (typeof token !== "string" || !token) {
      const error = new Error("token e obrigatorio");
      error.status = 400;
      throw error;
    }
    this.entries.set(host, {
      host,
      username: typeof username === "string" ? username : "",
      token,
      createdAt: Date.now(),
    });
    return { ok: true };
  }

  remove(host) {
    this.entries.delete(host);
    return { ok: true };
  }

  /* -------------------- socket -------------------- */

  /** Sobe o servidor IPC e devolve o env que todo comando git vai carregar. */
  async start() {
    this.nonce = crypto.randomBytes(24).toString("hex");
    this.dir = await fsp.mkdtemp(path.join(os.tmpdir(), "gitcraque-"));
    await fsp.chmod(this.dir, 0o700).catch((e) => console.error("[gitcraque] vault chmod:", e.message));

    this.socketPath =
      process.platform === "win32"
        ? `\\\\.\\pipe\\gitcraque-${crypto.randomBytes(8).toString("hex")}`
        : path.join(this.dir, "askpass.sock");

    this.server = net.createServer((socket) => this.#handle(socket));
    this.server.on("error", () => {
      /* socket morto nao pode derrubar o servidor http */
    });

    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.socketPath, () => {
        this.server.off("error", reject);
        resolve();
      });
    });
    this.server.unref();

    if (process.platform !== "win32") {
      // So o dono le e escreve: qualquer outro usuario da maquina fica de fora.
      await fsp.chmod(this.socketPath, 0o600).catch((e) => console.error("[gitcraque] vault chmod:", e.message));
    }

    const shim = await this.#writeShim();
    return {
      [ENV_ASKPASS_SOCK]: this.socketPath,
      [ENV_ASKPASS_NONCE]: this.nonce,
      GIT_ASKPASS: shim,
      SSH_ASKPASS: shim,
      SSH_ASKPASS_REQUIRE: "force",
    };
  }

  /**
   * O ssh executa o SSH_ASKPASS direto com `execlp`, sem shell: precisa ser um
   * executavel de verdade, nao "node script.mjs". Entao geramos um shim.
   */
  async #writeShim() {
    if (process.platform === "win32") {
      const shim = path.join(this.dir, "askpass.cmd");
      await fsp.writeFile(shim, `@echo off\r\n"${process.execPath}" "${ASKPASS_SCRIPT}" %*\r\n`, {
        mode: 0o700,
      });
      return shim;
    }
    const shim = path.join(this.dir, "askpass.sh");
    await fsp.writeFile(
      shim,
      `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(ASKPASS_SCRIPT)} "$@"\n`,
      { mode: 0o700 },
    );
    await fsp.chmod(shim, 0o700).catch((e) => console.error("[gitcraque] vault chmod:", e.message));
    return shim;
  }

  async #handle(socket) {
    socket.setEncoding("utf8");
    let buffer = "";
    const timer = setTimeout(() => socket.destroy(), this.timeoutMs + 10_000);
    timer.unref?.();

    socket.on("error", () => socket.destroy());
    socket.on("data", async (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline === -1) {
        if (buffer.length > 8192) socket.destroy();
        return;
      }
      const line = buffer.slice(0, newline);
      buffer = "";

      let request;
      try {
        request = JSON.parse(line);
      } catch {
        socket.end(`${JSON.stringify({ ok: false, error: "json invalido" })}\n`);
        return;
      }

      // O nonce e a unica autenticacao que existe: quem nao tem, nao passa.
      if (!request || request.nonce !== this.nonce) {
        socket.end(`${JSON.stringify({ ok: false, error: "nonce invalido" })}\n`);
        return;
      }

      let value = null;
      try {
        value = await this.resolveSecret(String(request.prompt ?? ""), request.cwd);
      } catch {
        value = null;
      }
      clearTimeout(timer);
      socket.end(
        `${JSON.stringify(value === null ? { ok: false } : { ok: true, value })}\n`,
      );
    });
  }

  /**
   * Acha a credencial ou pergunta na UI. `null` = o askpass sai com 1 e o git
   * falha limpo, em vez de travar num prompt que ninguem le.
   */
  async resolveSecret(prompt, cwd) {
    const { host, kind, username } = parsePrompt(prompt);
    const entry = host ? this.entries.get(host) : undefined;

    if (entry) {
      if (kind === "username" && entry.username) return entry.username;
      if (kind === "password" && entry.token) return entry.token;
    }
    if (kind === "username" && username) return username;

    return this.ask({ host, kind, prompt, cwd });
  }

  /** Emite `credentials:needed` e espera a UI responder. */
  ask({ host, kind, prompt, cwd }) {
    const hub = runtime.hub;
    if (!hub || hub.clientCount === 0) return Promise.resolve(null);

    const requestId = crypto.randomUUID();
    const expiresAt = Date.now() + this.timeoutMs;
    /** @type {import("../types.mjs").CredentialPrompt} */
    const promptPayload = { requestId, host, prompt, kind, expiresAt };

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        hub.broadcast({ type: "credentials:resolved", requestId, ok: false });
        resolve(null);
      }, this.timeoutMs);
      timer.unref?.();

      this.pending.set(requestId, { resolve, timer, prompt: promptPayload, cwd });
      hub.broadcast({ type: "credentials:needed", prompt: promptPayload });
    });
  }

  /** Resposta da UI: `credentials:provide`. */
  provide({ requestId, value, remember }) {
    const waiting = this.pending.get(requestId);
    if (!waiting) return false;
    clearTimeout(waiting.timer);
    this.pending.delete(requestId);

    if (remember && waiting.prompt.host) {
      const existing = this.entries.get(waiting.prompt.host);
      if (waiting.prompt.kind === "username") {
        this.entries.set(waiting.prompt.host, {
          host: waiting.prompt.host,
          username: value,
          token: existing?.token ?? "",
          createdAt: existing?.createdAt ?? Date.now(),
        });
      } else {
        this.entries.set(waiting.prompt.host, {
          host: waiting.prompt.host,
          username: existing?.username ?? "",
          token: value,
          createdAt: Date.now(),
        });
      }
    }

    waiting.resolve(typeof value === "string" ? value : null);
    runtime.hub?.broadcast({ type: "credentials:resolved", requestId, ok: true });
    return true;
  }

  /** Resposta da UI: `credentials:cancel`. */
  cancel({ requestId }) {
    const waiting = this.pending.get(requestId);
    if (!waiting) return false;
    clearTimeout(waiting.timer);
    this.pending.delete(requestId);
    waiting.resolve(null);
    runtime.hub?.broadcast({ type: "credentials:resolved", requestId, ok: false });
    return true;
  }

  async close() {
    for (const [, waiting] of this.pending) {
      clearTimeout(waiting.timer);
      waiting.resolve(null);
    }
    this.pending.clear();
    if (this.server) {
      await new Promise((resolve) => this.server.close(resolve));
      this.server = null;
    }
    if (this.dir) {
      await fsp.rm(this.dir, { recursive: true, force: true }).catch(() => {});
    } else if (this.socketPath && process.platform !== "win32") {
      fs.rmSync(this.socketPath, { force: true });
    }
  }
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
