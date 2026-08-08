/**
 * Rebase interativo visual via `GIT_SEQUENCE_EDITOR`.
 *
 * Diferente do squash, cada commit selecionado recebe uma acao propria
 * (pick, reword, squash, fixup, drop). O usuario monta a lista de acoes
 * na interface; o backend valida, constroi o `git-rebase-todo` e executa.
 *
 * Fluxo:
 *
 *   1. Valida os hashes (resolucao, unicidade, existencia no HEAD);
 *   2. Ordena pela ordem topologica REAL;
 *   3. Recusa merge commit e selecao nao contigua na cadeia de primeiro-pai;
 *   4. Deriva a base: `<mais_antigo>^`, ou `--root` se o mais antigo for raiz,
 *      ou `onto` se fornecido;
 *   5. Constroi o `git-rebase-todo` via `GIT_SEQUENCE_EDITOR` apontando para
 *      o proxy-editor com ENV_REBASE_HASHES e ENV_REBASE_ACTIONS;
 *   6. Para commits com acao `reword`, cria uma fila de mensagens novas e
 *      configura `GIT_EDITOR` para consumi-la (proxy-editor em modo reword-queue);
 *   7. Roda `git rebase -i <base>` com `--autostash`.
 *
 * Conflito nao e erro: volta `ok: false` com `pending` para a UI decidir.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ENV_REBASE_ACTIONS,
  ENV_REBASE_AUDIT,
  ENV_REBASE_HASHES,
  ENV_REWORD_MESSAGE,
} from "../contract.mjs";
import { execGit, readGit, readGitLine, withMutationLock } from "./exec.mjs";
import { assertRef, detectAutostash, withAutostashState } from "./ops.mjs";
import { parseTodo, sequenceEditorCommand, PROXY_EDITOR_PATH } from "./squash.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Acao expandida: formas curtas ("r" -> "reword") e invalidas recusadas. */
const VALID_ACTIONS = ["pick", "reword", "squash", "fixup", "drop"];

function normalizeAction(token) {
  const lower = String(token).toLowerCase().trim();
  switch (lower) {
    case "p": return "pick";
    case "r": return "reword";
    case "s": return "squash";
    case "f": return "fixup";
    case "d": return "drop";
    default: return lower;
  }
}

/**
 * POST /api/ops/rebase-interactive
 * @param {import("../types.mjs").RebaseInteractiveRequest} body
 * @returns {Promise<import("../types.mjs").RebaseInteractiveResult>}
 */
export async function rebaseInteractive({ actions, onto } = {}) {
  if (!Array.isArray(actions) || actions.length < 2) {
    const error = new Error("error.rebaseInteractiveNeedsTwo");
    error.status = 400;
    throw error;
  }

  // 1. Valida cada entrada
  const validated = [];
  for (let i = 0; i < actions.length; i += 1) {
    const entry = actions[i];
    const hash = String(entry.hash || "").trim();
    if (!hash) {
      const error = new Error("error.rebaseInteractiveMissingHash");
      error.status = 400;
      error.detail = `actions[${i}] sem hash`;
      throw error;
    }
    assertRef(hash, `actions[${i}].hash`);

    const action = normalizeAction(entry.action || "pick");
    if (!VALID_ACTIONS.includes(action)) {
      const error = new Error("error.rebaseInteractiveInvalidAction");
      error.status = 400;
      error.detail = `acao "${entry.action}" em ${hash.slice(0, 8)} — use pick, reword, squash, fixup ou drop`;
      throw error;
    }
    if (action === "reword" && !entry.newMessage) {
      const error = new Error("error.rebaseInteractiveRewordNeedsMessage");
      error.status = 400;
      error.detail = `"reword" em ${hash.slice(0, 8)} requer newMessage`;
      throw error;
    }

    validated.push({ hash, action, newMessage: entry.newMessage || "" });
  }

  const cwd = process.cwd();

  // 2. Resolve hashes (abreviados -> completos), remove duplicatas
  const resolved = [];
  const resolvedMap = new Map(); // hash completo -> entrada validada
  for (const entry of validated) {
    const hash = await readGitLine(["rev-parse", "--verify", "--quiet", `${entry.hash}^{commit}`], { cwd });
    if (!hash) {
      const error = new Error(`commit ${entry.hash.slice(0, 8)} nao encontrado`);
      error.status = 400;
      throw error;
    }
    if (resolvedMap.has(hash)) continue; // duplicata
    resolvedMap.set(hash, { ...entry, hash });
    resolved.push(hash);
  }

  if (resolved.length < 2) {
    const error = new Error("error.rebaseInteractiveNeedsTwo");
    error.status = 400;
    throw error;
  }

  // 3. Ordem topologica real do HEAD atual, do mais novo para o mais antigo
  const headList = await readGit(["rev-list", "--topo-order", "HEAD"], { cwd });
  if (!headList.ok) {
    const error = new Error("error.rebaseInteractiveNoHistory");
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
    const error = new Error("error.squashNotOnHead");
    error.status = 400;
    error.detail = `fora do HEAD: ${fora.map((h) => h.slice(0, 8)).join(", ")}`;
    throw error;
  }

  // indice maior = mais antigo; o rebase quer do mais antigo para o mais novo
  const ordered = [...resolved].sort((a, b) => topoIndex.get(b) - topoIndex.get(a));
  const oldest = ordered[0];

  // 4. Merge commit no meio do rebase nao tem semantica: recusa.
  const merges = [];
  for (const hash of ordered) {
    if ((await parentsOf(hash, cwd)).length > 1) merges.push(hash);
  }
  if (merges.length) {
    const error = new Error("error.squashMergeCommit");
    error.status = 400;
    error.detail = `merges selecionados: ${merges.map((h) => h.slice(0, 8)).join(", ")}`;
    throw error;
  }

  // 5. Contiguidade na cadeia de primeiro-pai.
  const firstParent = await readGit(["rev-list", "--topo-order", "--first-parent", "HEAD"], { cwd });
  const fpIndex = new Map();
  firstParent.stdout.split("\n").forEach((line, i) => {
    const hash = line.trim();
    if (hash) fpIndex.set(hash, i);
  });
  const positions = ordered.map((h) => fpIndex.get(h));
  if (positions.some((p) => p === undefined)) {
    const error = new Error("error.squashNotMainline");
    error.status = 400;
    error.detail = "error.squashNotMainlineDetail";
    throw error;
  }
  const sortedPositions = [...positions].sort((a, b) => a - b);
  for (let i = 1; i < sortedPositions.length; i += 1) {
    if (sortedPositions[i] !== sortedPositions[i - 1] + 1) {
      const error = new Error("error.rebaseInteractiveNotContiguous");
      error.status = 400;
      error.detail = "error.rebaseInteractiveNotContiguousDetail";
      throw error;
    }
  }

  // 6. Base do rebase: o pai do mais antigo, ou --root quando ele e raiz, ou onto.
  const isRoot = (await parentsOf(oldest, cwd)).length === 0;
  let baseArgs;
  let baseLabel;
  if (onto) {
    assertRef(onto, "onto");
    const resolvedBase = await readGitLine(["rev-parse", "--verify", "--quiet", onto], { cwd });
    if (!resolvedBase) {
      const error = new Error(`onto ${onto} nao encontrado`);
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

  // 7. Monta as acoes na ordem correta (do mais antigo para o mais novo).
  const orderedActions = ordered.map((hash) => {
    const entry = resolvedMap.get(hash);
    return entry || { hash, action: "pick", newMessage: "" };
  });

  // Mapa de hash -> newMessage para as acoes "reword".
  // O proxy-editor (modo sequence-editor) le este mapa e injeta
  // "exec git commit --amend -m ..." apos a linha "pick" correspondente.
  const rewordMessages = {};
  let rewordCount = 0;
  for (const entry of orderedActions) {
    if (entry.action === "reword" && entry.newMessage) {
      rewordMessages[entry.hash] = entry.newMessage;
      rewordCount += 1;
    }
  }

  // 8. Roda o rebase com o proxy-editor.
  const auditDir = await fs.mkdtemp(path.join(os.tmpdir(), "gitcraque-rebase-"));
  const auditPath = path.join(auditDir, "audit.json");

  try {
    const result = await withMutationLock(async () => {
      /** @type {Record<string, string>} */
      const env = {
        GIT_SEQUENCE_EDITOR: sequenceEditorCommand(),
        [ENV_REBASE_HASHES]: ordered.join(","),
        [ENV_REBASE_ACTIONS]: JSON.stringify(orderedActions.map((e) => ({
          hash: e.hash,
          action: e.action,
        }))),
        [ENV_REBASE_AUDIT]: auditPath,
        [ENV_REWORD_MESSAGE]: JSON.stringify(rewordMessages),
        // O editor de mensagem padrao fica mudo — nao usamos GIT_EDITOR para reword.
        GIT_EDITOR: "true",
      };

      const rebased = await execGit(["rebase", "-i", "--autostash", ...baseArgs], {
        cwd,
        env,
      });

      return rebased;
    });

    const auditData = await readAudit(auditPath);
    const originalTodo = auditData.originalTodo ?? "";
    const rewrittenTodo = auditData.rewrittenTodo ?? "";
    const finalizado = await withAutostashState(result);

    // Conta quantos rewords havia: se o rebase foi ok, assumimos que todos
    // foram aplicados (o proxy-editor injetou os comandos exec).
    const rewordsApplied = finalizado.ok ? rewordCount : 0;

    /** @type {import("../types.mjs").RebaseInteractiveResult} */
    const payload = {
      ...finalizado,
      plan: rewrittenTodo ? parseTodo(rewrittenTodo, originalTodo) : [],
      originalTodo,
      rewrittenTodo,
      rewordsApplied,
    };
    if (!payload.ok && auditData.error && !payload.error) payload.error = auditData.error;
    return payload;
  } finally {
    await fs.rm(auditDir, { recursive: true, force: true }).catch((e) =>
      console.error("[gitcraque] rebase-interactive audit cleanup:", e.message));
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
