/**
 * Worktrees — o requisito central do produto.
 *
 * `git worktree list --porcelain` emite registros separados por linha em branco:
 *
 *   worktree /caminho/da/worktree
 *   HEAD 8f4c...
 *   branch refs/heads/main
 *
 *   worktree /outra
 *   HEAD 8f4c...
 *   detached
 *   locked motivo opcional
 *   prunable motivo opcional
 *
 * Trocar de worktree NAO faz `git checkout`: o servidor valida o caminho contra
 * esta lista e chama `process.chdir()`.
 */
import fs from "node:fs";
import path from "node:path";

import { execGit, readGit, readGitLine } from "./exec.mjs";

/**
 * Parser puro do porcelain — separado da execucao para poder ser testado.
 * @param {string} stdout
 * @returns {Array<Omit<import("../types.mjs").Worktree, "isActive">>}
 */
export function parseWorktreePorcelain(stdout) {
  const records = [];
  /** @type {Record<string, unknown> | null} */
  let current = null;

  const flush = () => {
    if (current) records.push(current);
    current = null;
  };

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line === "") {
      flush();
      continue;
    }
    const space = line.indexOf(" ");
    const key = space === -1 ? line : line.slice(0, space);
    const value = space === -1 ? "" : line.slice(space + 1);

    if (key === "worktree") {
      flush();
      current = {
        path: value,
        head: null,
        branch: null,
        bare: false,
        detached: false,
        locked: false,
        prunable: false,
      };
      continue;
    }
    if (!current) continue;

    switch (key) {
      case "HEAD":
        current.head = value || null;
        break;
      case "branch":
        // "refs/heads/x" -> "x"
        current.branch = value.startsWith("refs/heads/") ? value.slice(11) : value;
        break;
      case "bare":
        current.bare = true;
        break;
      case "detached":
        current.detached = true;
        break;
      case "locked":
        current.locked = true;
        if (value) current.lockReason = value;
        break;
      case "prunable":
        current.prunable = true;
        if (value) current.pruneReason = value;
        break;
      default:
        break;
    }
  }
  flush();

  return records.map((record, index) => ({
    path: record.path,
    head: record.head,
    branch: record.branch,
    bare: record.bare,
    detached: record.detached,
    locked: record.locked,
    ...(record.lockReason ? { lockReason: record.lockReason } : {}),
    prunable: record.prunable,
    ...(record.pruneReason ? { pruneReason: record.pruneReason } : {}),
    // A primeira entrada da listagem e SEMPRE a worktree principal.
    isMain: index === 0,
    label: path.basename(record.path) || record.path,
  }));
}

/** Resolve links simbolicos; sem isso `/tmp` vs `/private/tmp` nunca casa. */
export function realPath(target) {
  try {
    return fs.realpathSync.native ? fs.realpathSync.native(target) : fs.realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

/** Dois caminhos apontam para o mesmo lugar no disco? */
export function samePath(a, b) {
  if (!a || !b) return false;
  const ra = realPath(a);
  const rb = realPath(b);
  if (ra === rb) return true;
  // Windows nao diferencia maiuscula de minuscula.
  if (process.platform === "win32") return ra.toLowerCase() === rb.toLowerCase();
  return false;
}

/**
 * @param {string} [cwd]
 * @returns {Promise<import("../types.mjs").Worktree[]>}
 */
export async function listWorktrees(cwd = process.cwd()) {
  const result = await readGit(["worktree", "list", "--porcelain"], { cwd });
  if (!result.ok) return [];
  const here = realPath(cwd);
  return parseWorktreePorcelain(result.stdout).map((wt) => ({
    ...wt,
    isActive: samePath(wt.path, here),
  }));
}

/** GET /api/worktrees */
export async function getWorktreesPayload(cwd = process.cwd()) {
  const [worktrees, gitCommonDir] = await Promise.all([
    listWorktrees(cwd),
    getGitCommonDir(cwd),
  ]);
  const mainEntry = worktrees.find((w) => w.isMain);
  const mainRoot = mainEntry ? mainEntry.path : path.dirname(gitCommonDir || cwd);
  return { worktrees, cwd, mainRoot };
}

/** `.git` compartilhado entre todas as worktrees. */
export async function getGitCommonDir(cwd = process.cwd()) {
  const line = await readGitLine(["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd,
  });
  if (line) return line;
  // git < 2.31 nao tem --path-format
  const fallback = await readGitLine(["rev-parse", "--git-common-dir"], { cwd });
  return fallback ? path.resolve(cwd, fallback) : "";
}

/** git-dir DESTA worktree (onde vivem MERGE_HEAD, rebase-merge/, index...). */
export async function getGitDir(cwd = process.cwd()) {
  const line = await readGitLine(["rev-parse", "--absolute-git-dir"], { cwd });
  if (line) return line;
  const fallback = await readGitLine(["rev-parse", "--git-dir"], { cwd });
  return fallback ? path.resolve(cwd, fallback) : "";
}

/** Raiz da worktree ativa. */
export async function getWorktreeRoot(cwd = process.cwd()) {
  const line = await readGitLine(["rev-parse", "--show-toplevel"], { cwd });
  return line || cwd;
}

/**
 * POST /api/worktrees/switch — o coracao do produto.
 *
 * NAO executa `git checkout`. Valida o caminho contra a lista de worktrees
 * (esta rota muda o diretorio de um processo que executa comandos git: aceitar
 * caminho arbitrario seria entregar o processo) e chama `process.chdir()`.
 *
 * @param {string} target
 * @returns {Promise<{payload: object, worktree: import("../types.mjs").Worktree}>}
 */
export async function switchWorktree(target) {
  if (typeof target !== "string" || !target.trim()) {
    const error = new Error("path e obrigatorio");
    error.status = 400;
    throw error;
  }

  const worktrees = await listWorktrees();
  const match = worktrees.find((wt) => samePath(wt.path, target));
  if (!match) {
    const error = new Error("caminho nao e uma worktree deste repositorio");
    error.status = 400;
    error.detail = `${target} nao aparece em 'git worktree list'`;
    throw error;
  }
  if (match.bare) {
    const error = new Error("nao da para entrar numa worktree bare");
    error.status = 400;
    throw error;
  }
  if (!fs.existsSync(match.path)) {
    const error = new Error("a worktree existe no git mas sumiu do disco");
    error.status = 409;
    error.detail = `${match.path} nao existe (rode worktree prune)`;
    throw error;
  }

  process.chdir(match.path);

  const payload = await getWorktreesPayload(process.cwd());
  const active = payload.worktrees.find((w) => w.isActive) ?? { ...match, isActive: true };
  return { payload, worktree: active };
}

/** POST /api/worktrees/add */
export function addWorktree({ path: target, branch, newBranch, ref, detach, force } = {}) {
  if (typeof target !== "string" || !target.trim()) {
    const error = new Error("path e obrigatorio");
    error.status = 400;
    throw error;
  }
  const args = ["worktree", "add"];
  if (force) args.push("--force");
  if (newBranch) args.push("-b", newBranch);
  if (detach) args.push("--detach");
  args.push(target);
  // `branch` e `ref` sao a mesma posicao no comando: o commit-ish inicial.
  const startPoint = ref || (newBranch ? branch : branch) || "";
  if (startPoint) args.push(startPoint);
  return execGit(args, { mutating: true });
}

/** POST /api/worktrees/remove */
export function removeWorktree({ path: target, force } = {}) {
  if (typeof target !== "string" || !target.trim()) {
    const error = new Error("path e obrigatorio");
    error.status = 400;
    throw error;
  }
  if (samePath(target, process.cwd())) {
    const error = new Error("nao da para remover a worktree em que o servidor esta");
    error.status = 409;
    error.detail = "troque de worktree antes de remover esta";
    throw error;
  }
  const args = ["worktree", "remove"];
  if (force) args.push("--force");
  args.push(target);
  return execGit(args, { mutating: true });
}

/** POST /api/worktrees/prune */
export function pruneWorktrees() {
  return execGit(["worktree", "prune", "-v"], { mutating: true });
}
