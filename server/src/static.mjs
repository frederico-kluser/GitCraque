/**
 * Servidor de estaticos da SPA (`web/dist`), sem dependencia externa.
 *
 * ETag por mtime+size, `Content-Type` correto e fallback de SPA: qualquer rota
 * desconhecida que nao comece com `/api` devolve o `index.html`, senao um
 * refresh em `/commit/abc` daria 404.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const TYPES = new Map(
  Object.entries({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".txt": "text/plain; charset=utf-8",
    ".wasm": "application/wasm",
  }),
);

export function contentType(file) {
  return TYPES.get(path.extname(file).toLowerCase()) ?? "application/octet-stream";
}

export class StaticServer {
  /** @param {string} root diretorio de `web/dist` */
  constructor(root) {
    this.root = root;
  }

  get available() {
    return Boolean(this.root) && fs.existsSync(path.join(this.root, "index.html"));
  }

  /**
   * @returns {Promise<boolean>} true quando a resposta foi enviada aqui
   */
  async serve(req, res, pathname) {
    if (!this.available) {
      sendBuildInstructions(res);
      return true;
    }

    const resolved = this.#resolve(pathname);
    if (resolved && (await this.#sendFile(req, res, resolved))) return true;

    // Fallback de SPA: o roteador do front-end resolve o resto.
    const index = path.join(this.root, "index.html");
    return this.#sendFile(req, res, index, { noCache: true });
  }

  /** Impede que `..` escape do diretorio de build. */
  #resolve(pathname) {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return null;
    }
    if (decoded.includes("\0")) return null;
    const relative = decoded.replace(/^\/+/, "");
    if (!relative) return path.join(this.root, "index.html");
    const target = path.resolve(this.root, relative);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : `${this.root}${path.sep}`;
    if (target !== this.root && !target.startsWith(rootWithSep)) return null;
    return target;
  }

  async #sendFile(req, res, file, opts = {}) {
    let stat;
    try {
      stat = await fsp.stat(file);
    } catch {
      return false;
    }
    if (!stat.isFile()) return false;

    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = {
      "content-type": contentType(file),
      "content-length": String(stat.size),
      etag,
      "x-content-type-options": "nosniff",
      "cache-control": opts.noCache
        ? "no-cache"
        : // O Vite versiona os assets pelo nome: da para cachear forte.
          file.includes(`${path.sep}assets${path.sep}`)
          ? "public, max-age=31536000, immutable"
          : "no-cache",
    };

    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { etag, "cache-control": headers["cache-control"] });
      res.end();
      return true;
    }

    res.writeHead(200, headers);
    if (req.method === "HEAD") {
      res.end();
      return true;
    }
    await new Promise((resolve) => {
      const stream = fs.createReadStream(file);
      stream.on("error", () => {
        res.destroy();
        resolve();
      });
      stream.on("close", resolve);
      stream.pipe(res);
    });
    return true;
  }
}

/** Pagina que aparece quando `web/dist` nao existe. */
export function sendBuildInstructions(res, status = 503) {
  const html = `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GitCraque — falta build</title>
<style>
  :root { color-scheme: dark light }
  body { font: 15px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; margin: 0;
         min-height: 100vh; display: grid; place-items: center; background: #0b0d12; color: #e6e9ef }
  main { max-width: 46rem; padding: 2rem }
  h1 { font-size: 1.4rem; margin: 0 0 .5rem }
  p { color: #9aa4b2 }
  pre { background: #151a23; border: 1px solid #232a36; border-radius: 8px; padding: 1rem; overflow-x: auto }
  code { color: #7dd3fc }
</style>
</head>
<body>
<main>
  <h1>A SPA ainda nao foi compilada</h1>
  <p>O backend esta no ar e a API em <code>/api</code> responde normalmente, mas
     <code>web/dist</code> nao existe.</p>
  <pre>npm run build</pre>
  <p>Em desenvolvimento, suba o servidor com <code>--dev</code> e use o Vite em
     <a href="http://127.0.0.1:5273" style="color:#7dd3fc">http://127.0.0.1:5273</a>.</p>
</main>
</body>
</html>`;
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(html);
}
