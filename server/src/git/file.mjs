/**
 * GET /api/file — o conteudo de UM arquivo, num commit ou na working tree.
 *
 * Serve o visualizador do rodape: markdown renderizado, codigo cru e o lado
 * "depois" do diff. Com `hash`, sai de `git show <hash>:<caminho>`; sem `hash`,
 * sai do disco, resolvido contra a raiz da worktree.
 *
 * POSTURA DE SEGURANCA. Esta e a UNICA rota do backend que le arquivo do disco
 * por caminho vindo do cliente. Sem guarda ela nao seria "o visualizador": seria
 * leitura arbitraria da maquina inteira por HTTP — `../../../../etc/shadow`,
 * `~/.ssh/id_rsa`, `/proc/self/environ` (que carrega os segredos do processo).
 * Entao a regra e uma so e vale para as duas origens:
 *
 *   1. o caminho tem de ser RELATIVO — absoluto e `~` sao recusados de saida;
 *   2. depois de normalizado (`a/../b`), ele nao pode comecar com `..`;
 *   3. resolvido contra a raiz, tem de continuar DENTRO dela;
 *   4. na leitura de disco, o caminho passa por `realpath` e a checagem 3 e
 *      refeita — senao um symlink dentro do repo (ou uma PASTA que e symlink,
 *      que o `lstat` da folha nao pega) apontando para fora seria a fuga.
 *
 * Fora da raiz e 400, nunca 403 com o conteudo do erro do sistema de arquivos:
 * a resposta nao confirma se o alvo existe la fora.
 */
import fsp from "node:fs/promises";
import path from "node:path";

import { readGit } from "./exec.mjs";
import { getWorktreeRoot } from "./worktree.mjs";

/** Teto de bytes devolvidos. Passou disso, volta o inicio com `truncated`. */
export const FILE_MAX_BYTES = 1024 * 1024;

/** Quantos bytes do comeco decidem se o arquivo e binario. */
export const BINARY_SNIFF_BYTES = 8 * 1024;

/** Extensoes que a UI oferece renderizar como markdown. */
export const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdown", "mkd"]);

/* ------------------------------------------------------------------ *
 * Guarda de caminho
 * ------------------------------------------------------------------ */

const badPath = (message, detail) => {
  const error = new Error(message);
  error.status = 400;
  if (detail) error.detail = detail;
  return error;
};

/** `target` esta dentro de `root` (ou e o proprio root)? */
export function isInside(root, target) {
  const rel = path.relative(root, target);
  if (rel === "") return true;
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/**
 * Caminho do cliente -> caminho dentro do repositorio, ou 400.
 *
 * So checagem lexica: nao toca no disco. Quem le do disco tem de refazer a
 * checagem depois do `realpath` (ver `readFromWorktree`).
 *
 * @param {string} root raiz da worktree, ja absoluta
 * @param {unknown} target caminho relativo vindo da query
 * @returns {{relative: string, absolute: string}}
 */
export function resolveInsideRoot(root, target) {
  if (typeof target !== "string" || !target.trim()) {
    throw badPath("path e obrigatorio");
  }
  const raw = target.trim();

  // NUL em caminho e tentativa de truncar a string em alguma camada abaixo.
  if (raw.includes("\0")) throw badPath("path invalido", "caminho com byte NUL");

  const escapou = "path tem de ser um caminho relativo dentro do repositorio";
  if (path.isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw)) throw badPath(escapou, raw);
  if (raw.startsWith("~")) throw badPath(escapou, raw);

  const relative = path.normalize(raw);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || relative.startsWith("../")) {
    throw badPath(escapou, raw);
  }

  const absolute = path.resolve(root, relative);
  if (!isInside(root, absolute)) throw badPath(escapou, raw);

  return { relative, absolute };
}

/* ------------------------------------------------------------------ *
 * Heuristicas de conteudo
 * ------------------------------------------------------------------ */

/** Extensao normalizada, minuscula e sem o ponto. "" quando nao ha. */
export function languageOf(target) {
  const ext = path.extname(target);
  if (!ext || ext === ".") return "";
  return ext.slice(1).toLowerCase();
}

/** Byte NUL nos primeiros KB — a mesma heuristica que o proprio git usa. */
export function looksBinary(buffer) {
  return buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0);
}

/**
 * Corta em `max` BYTES sem partir um caractere multibyte no meio: cortar no
 * meio de um UTF-8 poe um losango de erro no fim do trecho exibido.
 */
export function sliceUtf8(buffer, max) {
  if (buffer.length <= max) return buffer.toString("utf8");
  let end = max;
  // bytes de continuacao sao 10xxxxxx: recua ate o inicio do caractere
  while (end > 0 && (buffer[end] & 0b1100_0000) === 0b1000_0000) end -= 1;
  return buffer.subarray(0, end).toString("utf8");
}

/**
 * @param {Buffer} buffer conteudo lido (ja limitado a FILE_MAX_BYTES)
 * @param {{relative: string, hash: string|null, size: number}} meta
 * @returns {import("../types.mjs").FileContentPayload}
 */
function payloadFrom(buffer, { relative, hash, size }) {
  const binary = looksBinary(buffer);
  const language = languageOf(relative);
  return {
    path: relative,
    hash,
    // binario nao vira texto: a UI mostra "arquivo binario" e o tamanho
    content: binary ? "" : sliceUtf8(buffer, FILE_MAX_BYTES),
    size,
    binary,
    truncated: size > FILE_MAX_BYTES,
    language,
    markdown: MARKDOWN_EXTENSIONS.has(language),
  };
}

/* ------------------------------------------------------------------ *
 * Leitura
 * ------------------------------------------------------------------ */

/**
 * GET /api/file
 *
 * @param {{path?: string, hash?: string}} query
 * @param {string} [cwd]
 * @returns {Promise<import("../types.mjs").FileContentPayload>}
 */
export async function getFileContent(query = {}, cwd = process.cwd()) {
  const root = await getWorktreeRoot(cwd);
  // A raiz entra ja com os symlinks resolvidos: comparar caminho real com
  // caminho logico daria falso negativo em /tmp -> /private/tmp e afins.
  const base = await realpathOr(root);
  const { relative, absolute } = resolveInsideRoot(base, query.path);

  const hash = typeof query.hash === "string" ? query.hash.trim() : "";
  if (hash) return readFromCommit(root, hash, relative);
  return readFromWorktree(base, relative, absolute);
}

/** `git show <hash>:<caminho>`, com o hash resolvido antes de virar argumento. */
async function readFromCommit(root, hash, relative) {
  if (hash.startsWith("-")) {
    throw badPath("hash invalido", "revisao nao pode comecar com -");
  }
  // Resolve primeiro: garante que `hash` e uma revisao de verdade, nao um
  // caminho nem uma opcao disfarcada.
  const resolvedHash = await readGit(["rev-parse", "--verify", "--quiet", `${hash}^{commit}`], {
    cwd: root,
  });
  const commit = resolvedHash.ok ? resolvedHash.stdout.trim() : "";
  if (!commit) {
    const error = new Error(`commit ${hash} nao encontrado`);
    error.status = 404;
    throw error;
  }

  // O git so entende barra normal no `<rev>:<caminho>`, inclusive no Windows.
  const spec = `${commit}:${relative.split(path.sep).join("/")}`;

  const kind = await readGit(["cat-file", "-t", spec], { cwd: root });
  if (!kind.ok) {
    const error = new Error(`o arquivo ${relative} nao existe no commit ${hash.slice(0, 12)}`);
    error.status = 404;
    error.detail = kind.error || kind.stderr.trim();
    throw error;
  }
  const tipo = kind.stdout.trim();
  if (tipo !== "blob") {
    // tree = diretorio; commit = submodulo. Nenhum dos dois tem conteudo aqui.
    throw badPath(
      `${relative} nao e um arquivo nesse commit`,
      tipo === "tree" ? "o caminho e um diretorio" : `o caminho e um ${tipo}`,
    );
  }

  const sizeResult = await readGit(["cat-file", "-s", spec], { cwd: root });
  const size = Number.parseInt(sizeResult.stdout.trim(), 10) || 0;

  const show = await readGit(["show", spec], { cwd: root });
  if (!show.ok) {
    // O blob existe (o cat-file confirmou) mas nao coube no buffer de captura:
    // devolver "truncado e vazio" e honesto; 500 seria mentira.
    if (size > FILE_MAX_BYTES) {
      return payloadFrom(Buffer.alloc(0), { relative, hash: commit, size });
    }
    const error = new Error(show.error || "git show falhou");
    error.status = 500;
    error.command = show;
    throw error;
  }

  // O corte fica com o `payloadFrom`: cortar aqui partiria caractere multibyte.
  return payloadFrom(Buffer.from(show.stdout, "utf8"), { relative, hash: commit, size });
}

/** Leitura do disco, com a guarda refeita depois do `realpath`. */
async function readFromWorktree(base, relative, absolute) {
  // realpath SEMPRE, nao so quando a folha e symlink: `link-para-fora/arquivo`
  // tem folha comum e mesmo assim escapa pela PASTA.
  let real;
  try {
    real = await fsp.realpath(absolute);
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "ENOTDIR") {
      const error = new Error(`o arquivo ${relative} nao existe na working tree`);
      error.status = 404;
      error.detail = err.code;
      throw error;
    }
    const error = new Error("sem permissao para ler este arquivo");
    error.status = 403;
    error.detail = `${relative}: ${err.code ?? err.message}`;
    throw error;
  }
  if (!isInside(base, real)) {
    throw badPath(
      "path tem de ser um caminho relativo dentro do repositorio",
      `${relative} e um symlink que aponta para fora do repositorio`,
    );
  }

  const stat = await fsp.stat(real);
  if (stat.isDirectory()) throw badPath(`${relative} e um diretorio`, "o visualizador abre arquivo");
  if (!stat.isFile()) throw badPath(`${relative} nao e um arquivo comum`);

  const size = stat.size;
  const quanto = Math.min(size, FILE_MAX_BYTES);
  const handle = await fsp.open(real, "r");
  try {
    const buffer = Buffer.alloc(quanto);
    const { bytesRead } = await handle.read(buffer, 0, quanto, 0);
    return payloadFrom(buffer.subarray(0, bytesRead), { relative, hash: null, size });
  } finally {
    await handle.close();
  }
}

/** realpath tolerante: caminho que nao resolve volta como veio. */
async function realpathOr(target) {
  try {
    return await fsp.realpath(target);
  } catch {
    return target;
  }
}
