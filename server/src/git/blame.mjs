/**
 * GET /api/blame — `git blame --porcelain` de um arquivo.
 *
 * Devolve um array de `BlameLine`, uma por linha do arquivo, com o commit,
 * autor, email, data e assunto do commit que tocou aquela linha pela ultima
 * vez. Arquivos binarios sao recusados (o blame nao faz sentido). Arquivos que
 * nao existem no commit pedido dao 404.
 *
 * Formato porcelain (o que este parser encara):
 *
 *   <hash> <originalLine> <finalLine> <numLines>
 *   author <name>
 *   author-mail <email>
 *   author-time <unix>
 *   author-tz <tz>
 *   summary <subject>
 *   \t<conteudo da linha>
 *
 * Linhas do mesmo commit repetem so o cabecalho e o conteudo; os metadados de
 * autor saem uma vez por grupo.
 */
import path from "node:path";

import { readGit } from "./exec.mjs";
import { getWorktreeRoot } from "./worktree.mjs";
import { resolveInsideRoot } from "./file.mjs";

/* ------------------------------------------------------------------ *
 * Parser do formato porcelain
 * ------------------------------------------------------------------ */

/**
 * @typedef {object} BlameLine
 * @property {number}  lineNumber   numero da linha no arquivo (1-indexado)
 * @property {string}  hash         hash do commit
 * @property {number}  originalLine numero da linha no commit original
 * @property {string}  author       nome do autor
 * @property {string}  email        email do autor
 * @property {number}  date         timestamp Unix (author-time)
 * @property {string}  tz           fuso ("+0000")
 * @property {string}  summary      assunto do commit
 * @property {string}  content      conteudo da linha
 */

/**
 * @param {string} output saida crua de `git blame --porcelain`
 * @returns {BlameLine[]}
 */
function parsePorcelain(output) {
  const lines = output.split("\n");
  const result = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Linha vazia no fim: o git termina com \n, que vira string vazia apos split.
    if (line === "" && i === lines.length - 1) continue;

    // Cabecalho de um grupo de linhas do mesmo commit:
    // <hash> <originalLine> <finalLine> <numLines>
    if (!line.startsWith("\t") && !line.startsWith("author") && !line.startsWith("author-mail") &&
        !line.startsWith("author-time") && !line.startsWith("author-tz") && !line.startsWith("summary") &&
        !line.startsWith("filename") && !line.startsWith("previous") && !line.startsWith("boundary") &&
        !line.startsWith("committer") && !line.startsWith("committer-mail") &&
        !line.startsWith("committer-time") && !line.startsWith("committer-tz")) {

      if (/^[0-9a-f]{40}\s/.test(line)) {
        const parts = line.split(" ");
        current = {
          hash: parts[0],
          originalLine: Number(parts[1]) || 0,
          finalLine: Number(parts[2]) || 0,
          numLines: Number(parts[3]) || 1,
          author: "",
          email: "",
          date: 0,
          tz: "",
          summary: "",
        };
        continue;
      }
      // Cabecalho que nao e hash: ignorar (committer-time etc. que nao capturamos acima)
      continue;
    }

    // Metadados do commit (so aparecem no primeiro bloco de cada commit)
    if (current) {
      if (line.startsWith("author ")) {
        current.author = line.slice(7);
        continue;
      }
      if (line.startsWith("author-mail ")) {
        current.email = line.slice(12).replace(/^<|>$/g, "");
        continue;
      }
      if (line.startsWith("author-time ")) {
        current.date = Number(line.slice(12)) || 0;
        continue;
      }
      if (line.startsWith("author-tz ")) {
        current.tz = line.slice(10);
        continue;
      }
      if (line.startsWith("summary ")) {
        current.summary = line.slice(8);
        continue;
      }
      if (line.startsWith("filename ")) {
        continue;
      }

      // Linha de conteudo: comeca com \t
      if (line.startsWith("\t")) {
        const content = line.slice(1);
        result.push({
          lineNumber: result.length + 1,
          hash: current.hash,
          originalLine: current.originalLine,
          author: current.author,
          email: current.email,
          date: current.date,
          tz: current.tz,
          summary: current.summary,
          content,
        });
      }
    }
  }

  return result;
}

/* ------------------------------------------------------------------ *
 * Execucao do blame
 * ------------------------------------------------------------------ */

/**
 * @param {{path?: string, hash?: string}} query
 * @param {string} [cwd]
 * @returns {Promise<{lines: BlameLine[], path: string, hash: string | null}>}
 */
export async function getBlame(query = {}, cwd = process.cwd()) {
  const root = await getWorktreeRoot(cwd);

  const { relative } = resolveInsideRoot(root, query.path);

  const hash = typeof query.hash === "string" && query.hash.trim()
    ? query.hash.trim()
    : "HEAD";

  // Rejeita hash que comeca com `-` (injeccao de opcao).
  if (hash.startsWith("-")) {
    const error = new Error("hash invalido");
    error.status = 400;
    error.detail = "revisao nao pode comecar com -";
    throw error;
  }

  // Confirma que o hash e valido.
  const resolvedHash = await readGit(["rev-parse", "--verify", "--quiet", `${hash}^{commit}`], {
    cwd: root,
  });
  const commit = resolvedHash.ok ? resolvedHash.stdout.trim() : "";
  if (!commit) {
    const error = new Error("commit nao encontrado");
    error.status = 404;
    error.params = { hash };
    throw error;
  }

  // Confirma que o caminho existe nesse commit.
  const spec = `${commit}:${relative.split(path.sep).join("/")}`;
  const kind = await readGit(["cat-file", "-t", spec], { cwd: root });
  if (!kind.ok) {
    const error = new Error(`o arquivo ${relative} nao existe no commit ${commit.slice(0, 12)}`);
    error.status = 404;
    error.detail = kind.error || kind.stderr.trim();
    throw error;
  }
  if (kind.stdout.trim() !== "blob") {
    const error = new Error(`${relative} nao e um arquivo`);
    error.status = 400;
    error.detail = kind.stdout.trim() === "tree" ? "o caminho e um diretorio" : `o caminho e um ${kind.stdout.trim()}`;
    throw error;
  }

  // Verifica se e binario (linha binaria nao faz sentido).
  const binCheck = await readGit(["diff", "--numstat", "4b825dc642cb6eb9a060e54bf899d56edede4734", commit, "--", relative], {
    cwd: root,
  });
  // diff --numstat contra a arvore vazia: o primeiro campo indica bytes.
  // `-` no primeiro campo = binario.
  if (binCheck.ok && binCheck.stdout.trim().startsWith("-")) {
    const error = new Error(`nao da para fazer blame de arquivo binario`);
    error.status = 400;
    error.detail = `${relative} e um arquivo binario`;
    throw error;
  }

  const blame = await readGit(["blame", "--porcelain", commit, "--", relative], {
    cwd: root,
  });

  if (!blame.ok) {
    const error = new Error(blame.error || "git blame falhou");
    error.status = 500;
    error.command = blame;
    throw error;
  }

  const lines = parsePorcelain(blame.stdout);

  return {
    lines,
    path: relative,
    hash: commit,
  };
}
