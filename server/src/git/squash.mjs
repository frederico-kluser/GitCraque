/**
 * Squash interativo via `GIT_SEQUENCE_EDITOR`.
 *
 * NAO existe emulador de terminal aqui. O fluxo e:
 *
 *   1. resolve os hashes e os ordena pela ordem topologica REAL (a UI manda em
 *      qualquer ordem — confiar nela e como confiar em input de usuario);
 *   2. recusa selecao nao contigua na cadeia de primeiro-pai ou com merge commit;
 *   3. deriva a base: `<mais_antigo>^`, ou `--root` se o mais antigo for raiz;
 *   4. roda `git rebase -i <base>` com GIT_SEQUENCE_EDITOR apontando para o
 *      proxy-editor, que troca `pick` por `squash`/`fixup` em tudo menos no
 *      primeiro selecionado;
 *   5. se veio `message`, faz `git commit --amend -m <message>` no fim.
 *
 * Conflito nao e erro: volta `ok: false` com `pending` para a UI decidir.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ENV_SQUASH_AUDIT,
  ENV_SQUASH_HASHES,
  ENV_SQUASH_MODE,
} from "../contract.mjs";
import { execGit, readGit, readGitLine, withMutationLock } from "./exec.mjs";
import { assertRef, withPendingState } from "./ops.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Caminho absoluto do script que o GIT vai executar. */
export const PROXY_EDITOR_PATH = path.resolve(HERE, "..", "trampoline", "proxy-editor.mjs");

/**
 * Monta o valor de GIT_SEQUENCE_EDITOR.
 *
 * O git roda o sequence editor por `sh -c '<valor> "$@"'`, entao o valor e
 * texto de shell: caminho com espaco precisa de aspas. Aspas simples com o
 * escape classico `'\''` resolvem qualquer caminho, inclusive com aspas.
 */
export function sequenceEditorCommand(scriptPath = PROXY_EDITOR_PATH, nodeBin = process.execPath) {
  return `${shellQuote(nodeBin)} ${shellQuote(scriptPath)}`;
}

export function shellQuote(value) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * Parser do `git-rebase-todo` -> SquashPlanLine[].
 * @param {string} todo
 * @param {string} [originalTodo] para marcar quais linhas mudaram
 */
export function parseTodo(todo, originalTodo) {
  const originalLines = originalTodo === undefined ? null : originalTodo.split("\n");
  /** @type {import("../types.mjs").SquashPlanLine[]} */
  const plan = [];
  const lines = todo.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.startsWith("#")) continue;
    const match = /^(pick|p|squash|s|fixup|f|drop|d|reword|r|edit|e)[ \t]+([0-9a-fA-F]+)[ \t]*(.*)$/.exec(
      line,
    );
    if (!match) continue;
    plan.push({
      action: expandAction(match[1]),
      hash: match[2],
      subject: match[3] ?? "",
      rewritten: originalLines ? originalLines[i] !== line : false,
    });
  }
  return plan;
}

function expandAction(token) {
  switch (token) {
    case "p":
      return "pick";
    case "s":
      return "squash";
    case "f":
      return "fixup";
    case "d":
      return "drop";
    case "r":
      return "reword";
    case "e":
      return "edit";
    default:
      return token;
  }
}

/**
 * POST /api/ops/squash
 * @param {import("../types.mjs").SquashRequest} body
 * @returns {Promise<import("../types.mjs").SquashResult>}
 */
export async function squash({ commits, message, fixup, base } = {}) {
  if (!Array.isArray(commits) || commits.length < 2) {
    const error = new Error("commits precisa de pelo menos 2 hashes");
    error.status = 400;
    error.detail = "squash de um commit so nao faz nada";
    throw error;
  }
  commits.forEach((c, i) => assertRef(c, `commits[${i}]`));

  const cwd = process.cwd();

  // 1. Hashes abreviados viram completos, e duplicatas somem.
  const resolved = [];
  for (const ref of commits) {
    const hash = await readGitLine(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd });
    if (!hash) {
      const error = new Error(`commit ${ref} nao encontrado`);
      error.status = 400;
      throw error;
    }
    if (!resolved.includes(hash)) resolved.push(hash);
  }
  if (resolved.length < 2) {
    const error = new Error("os hashes informados apontam para o mesmo commit");
    error.status = 400;
    throw error;
  }

  // 2. Ordem topologica real do HEAD atual, do mais novo para o mais antigo.
  const headList = await readGit(["rev-list", "--topo-order", "HEAD"], { cwd });
  if (!headList.ok) {
    const error = new Error("nao consegui listar o historico do HEAD");
    error.command = headList;
    error.status = 409;
    throw error;
  }
  const topoIndex = new Map();
  headList.stdout.split("\n").forEach((line, i) => {
    const hash = line.trim();
    if (hash) topoIndex.set(hash, i);
  });

  const fora = resolved.filter((h) => !topoIndex.has(h));
  if (fora.length) {
    const error = new Error("ha commits selecionados que nao estao no HEAD atual");
    error.status = 400;
    error.detail = `fora do HEAD: ${fora.map((h) => h.slice(0, 8)).join(", ")}`;
    throw error;
  }

  // indice maior = mais antigo; o rebase quer do mais antigo para o mais novo
  const ordered = [...resolved].sort((a, b) => topoIndex.get(b) - topoIndex.get(a));
  const oldest = ordered[0];

  // 3. Merge commit no meio do squash nao tem semantica: recusa.
  const merges = [];
  for (const hash of ordered) {
    if ((await parentsOf(hash, cwd)).length > 1) merges.push(hash);
  }
  if (merges.length) {
    const error = new Error("nao da para fazer squash de merge commit");
    error.status = 400;
    error.detail = `merges selecionados: ${merges.map((h) => h.slice(0, 8)).join(", ")}`;
    throw error;
  }

  // 4. Contiguidade na cadeia de primeiro-pai.
  const firstParent = await readGit(["rev-list", "--topo-order", "--first-parent", "HEAD"], { cwd });
  const fpIndex = new Map();
  firstParent.stdout.split("\n").forEach((line, i) => {
    const hash = line.trim();
    if (hash) fpIndex.set(hash, i);
  });
  const positions = ordered.map((h) => fpIndex.get(h));
  if (positions.some((p) => p === undefined)) {
    const error = new Error("os commits selecionados nao estao todos na linha principal");
    error.status = 400;
    error.detail = "so da para fazer squash na cadeia de primeiro-pai do HEAD";
    throw error;
  }
  const sortedPositions = [...positions].sort((a, b) => a - b);
  for (let i = 1; i < sortedPositions.length; i += 1) {
    if (sortedPositions[i] !== sortedPositions[i - 1] + 1) {
      const error = new Error("os commits selecionados nao sao contiguos");
      error.status = 400;
      error.detail = "selecione commits vizinhos na mesma linha do grafo";
      throw error;
    }
  }

  // 5. Base do rebase: o pai do mais antigo, ou --root quando ele e raiz.
  const isRoot = (await parentsOf(oldest, cwd)).length === 0;
  let baseArgs;
  let baseLabel;
  if (base) {
    assertRef(base, "base");
    const resolvedBase = await readGitLine(["rev-parse", "--verify", "--quiet", base], { cwd });
    if (!resolvedBase) {
      const error = new Error(`base ${base} nao encontrada`);
      error.status = 400;
      throw error;
    }
    baseArgs = [resolvedBase];
    baseLabel = resolvedBase;
  } else if (isRoot) {
    baseArgs = ["--root"];
    baseLabel = "--root";
  } else {
    baseArgs = [`${oldest}^`];
    baseLabel = `${oldest.slice(0, 8)}^`;
  }

  // 6. Roda o rebase com o proxy-editor. Tudo sob UM lock: o repo nao pode
  //    receber outra mutacao no meio de um rebase interativo.
  const auditDir = await fs.mkdtemp(path.join(os.tmpdir(), "gitcraque-squash-"));
  const auditPath = path.join(auditDir, "audit.json");
  const mode = fixup ? "fixup" : "squash";

  try {
    const result = await withMutationLock(async () => {
      const rebased = await execGit(["rebase", "-i", ...baseArgs], {
        cwd,
        env: {
          GIT_SEQUENCE_EDITOR: sequenceEditorCommand(),
          [ENV_SQUASH_HASHES]: ordered.join(","),
          [ENV_SQUASH_MODE]: mode,
          [ENV_SQUASH_AUDIT]: auditPath,
          // O editor de mensagem tambem fica mudo: nada pode abrir um editor.
          GIT_EDITOR: "true",
        },
      });
      if (!rebased.ok) return rebased;
      if (!message) return rebased;

      const amended = await execGit(["commit", "--amend", "-m", message], { cwd });
      return {
        ...amended,
        argv: rebased.argv,
        stdout: `${rebased.stdout}${amended.stdout}`,
        stderr: `${rebased.stderr}${amended.stderr}`,
        durationMs: rebased.durationMs + amended.durationMs,
        ok: amended.ok,
        ...(amended.ok ? {} : { error: amended.error }),
      };
    });

    const auditData = await readAudit(auditPath);
    const originalTodo = auditData.originalTodo ?? "";
    const rewrittenTodo = auditData.rewrittenTodo ?? "";
    const withPending = await withPendingState(result);

    /** @type {import("../types.mjs").SquashResult} */
    const payload = {
      ...withPending,
      plan: rewrittenTodo ? parseTodo(rewrittenTodo, originalTodo) : [],
      originalTodo,
      rewrittenTodo,
    };
    if (!payload.ok && auditData.error && !payload.error) payload.error = auditData.error;
    payload.base = baseLabel;
    payload.mode = mode;
    payload.commits = ordered;
    return payload;
  } finally {
    await fs.rm(auditDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Hashes dos pais de um commit. Vazio = commit raiz. */
async function parentsOf(hash, cwd) {
  const line = (await readGitLine(["log", "-1", "--format=%P", hash], { cwd })) ?? "";
  return line.trim().split(/\s+/).filter(Boolean);
}

async function readAudit(auditPath) {
  try {
    return JSON.parse(await fs.readFile(auditPath, "utf8"));
  } catch {
    return {};
  }
}
