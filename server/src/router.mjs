/**
 * Roteador minimo: casa metodo + padrao com `:param`.
 *
 * As rotas sao compiladas UMA vez, no boot, num mapa
 * `metodo -> tamanho -> lista de rotas`. Uma requisicao nunca monta regex nem
 * varre a tabela inteira: ela olha so as rotas com o mesmo numero de segmentos.
 */
import { MAX_BODY_BYTES } from "./contract.mjs";

export class Router {
  constructor() {
    /** @type {Map<string, Map<number, Array<{segments: string[], handler: Function, pattern: string}>>>} */
    this.table = new Map();
  }

  /**
   * @param {string} method
   * @param {string} pattern caminho sem o prefixo /api, com `:param`
   * @param {(ctx: object) => unknown} handler
   */
  add(method, pattern, handler) {
    const segments = split(pattern);
    const byMethod = this.table.get(method) ?? new Map();
    const bucket = byMethod.get(segments.length) ?? [];
    bucket.push({ segments, handler, pattern });
    byMethod.set(segments.length, bucket);
    this.table.set(method, byMethod);
    return this;
  }

  /**
   * @returns {{handler: Function, params: Record<string,string>, pattern: string} | null}
   */
  match(method, pathname) {
    const parts = split(pathname);
    const bucket = this.table.get(method)?.get(parts.length);
    if (!bucket) return null;

    for (const route of bucket) {
      /** @type {Record<string,string>} */
      const params = {};
      let ok = true;
      for (let i = 0; i < parts.length; i += 1) {
        const expected = route.segments[i];
        if (expected.startsWith(":")) {
          params[expected.slice(1)] = safeDecode(parts[i]);
          continue;
        }
        if (expected !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: route.handler, params, pattern: route.pattern };
    }
    return null;
  }

  /** Metodos registrados para um caminho — alimenta o 405 com `Allow`. */
  allowedMethods(pathname) {
    const parts = split(pathname);
    const allowed = [];
    for (const [method, byLength] of this.table) {
      const bucket = byLength.get(parts.length);
      if (!bucket) continue;
      const hit = bucket.some((route) =>
        route.segments.every((seg, i) => seg.startsWith(":") || seg === parts[i]),
      );
      if (hit) allowed.push(method);
    }
    return allowed;
  }
}

function split(p) {
  return p.split("/").filter((s) => s.length > 0);
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/* ------------------------------------------------------------------ *
 * Corpo da requisicao
 * ------------------------------------------------------------------ */

export class HttpError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.status = status;
    if (detail) this.detail = detail;
  }
}

/**
 * Le o corpo com teto de 4 MB e exige JSON quando ha corpo.
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<unknown>}
 */
export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const declared = Number.parseInt(req.headers["content-length"] ?? "", 10);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      reject(new HttpError(413, "corpo grande demais", `limite de ${MAX_BODY_BYTES} bytes`));
      req.resume();
      return;
    }

    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    let aborted = false;

    req.on("data", (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        reject(new HttpError(413, "corpo grande demais", `limite de ${MAX_BODY_BYTES} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("error", (err) => {
      if (!aborted) reject(new HttpError(400, "falha lendo o corpo", err.message));
    });

    req.on("end", () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      const contentType = String(req.headers["content-type"] ?? "");
      if (!/^application\/json\b/i.test(contentType)) {
        reject(
          new HttpError(415, "content-type nao suportado", "as rotas de /api so aceitam application/json"),
        );
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new HttpError(400, "json invalido", err.message));
      }
    });
  });
}
