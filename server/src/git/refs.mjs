/**
 * Refs: branches locais, branches remotas, tags, stashes e o estado do HEAD.
 *
 * Tudo que da para ler numa passada so sai de um unico `git for-each-ref` com
 * `--format` proprio. Chamar `git branch`, `git tag` e `git branch -r` em
 * separado seria tres vezes o custo pelo mesmo dado.
 */
import fs from "node:fs/promises";
import path from "node:path";

import { execGitLines, readGit, readGitLine } from "./exec.mjs";
import { getGitDir, listWorktrees, samePath } from "./worktree.mjs";
import { getRemotes } from "./remotes.mjs";

/** US como separador de campo: nao aparece em nome de ref nem em assunto. */
const FS = "\u001f";

const REF_FORMAT = [
  "%(refname)",
  "%(refname:short)",
  "%(objectname)",
  "%(objecttype)",
  "%(upstream:short)",
  "%(upstream:track)",
  "%(HEAD)",
  "%(contents:subject)",
  "%(*objectname)",
].join("%1f");

/**
 * Parser puro da saida do for-each-ref.
 * @param {string} stdout
 * @param {Set<string>} remoteNames
 */
export function parseForEachRef(stdout, remoteNames = new Set()) {
  /** @type {import("../types.mjs").Branch[]} */ const branches = [];
  /** @type {object[]} */ const remoteBranches = [];
  /** @type {object[]} */ const tags = [];

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line) continue;
    const [
      refname = "",
      short = "",
      objectname = "",
      objecttype = "",
      upstream = "",
      track = "",
      headMark = "",
      subject = "",
      derefName = "",
    ] = line.split(FS);

    if (refname.startsWith("refs/heads/")) {
      const { ahead, behind } = parseTrack(track);
      /** @type {import("../types.mjs").Branch} */
      const branch = {
        name: short,
        fullName: refname,
        target: objectname,
        isHead: headMark === "*",
        ahead,
        behind,
      };
      if (upstream) branch.upstream = upstream;
      branches.push(branch);
      continue;
    }

    if (refname.startsWith("refs/remotes/")) {
      // "origin/main" -> remote "origin", shortName "main"
      const rest = refname.slice("refs/remotes/".length);
      const slash = rest.indexOf("/");
      let remote = slash === -1 ? rest : rest.slice(0, slash);
      let shortName = slash === -1 ? "" : rest.slice(slash + 1);
      // Remoto com barra no nome ("meu/fork") so da para desambiguar com a lista.
      if (!remoteNames.has(remote)) {
        const better = [...remoteNames]
          .filter((r) => rest.startsWith(`${r}/`))
          .sort((a, b) => b.length - a.length)[0];
        if (better) {
          remote = better;
          shortName = rest.slice(better.length + 1);
        }
      }
      remoteBranches.push({
        name: short || rest,
        fullName: refname,
        remote,
        shortName,
        target: objectname,
      });
      continue;
    }

    if (refname.startsWith("refs/tags/")) {
      const annotated = objecttype === "tag";
      /** @type {import("../types.mjs").Tag} */
      const tag = {
        name: short,
        fullName: refname,
        // Tag anotada aponta para um objeto tag; o commit e o deref (`*objectname`).
        target: derefName || objectname,
        annotated,
      };
      if (annotated && subject) tag.message = subject;
      tags.push(tag);
    }
  }

  return { branches, remoteBranches, tags };
}

/** "[ahead 3, behind 1]" / "[gone]" / "" -> numeros. */
export function parseTrack(track) {
  if (!track) return { ahead: 0, behind: 0 };
  const ahead = /ahead (\d+)/.exec(track);
  const behind = /behind (\d+)/.exec(track);
  return {
    ahead: ahead ? Number.parseInt(ahead[1], 10) : 0,
    behind: behind ? Number.parseInt(behind[1], 10) : 0,
  };
}

/* ------------------------------------------------------------------ *
 * HEAD e operacao pendente
 * ------------------------------------------------------------------ */

/**
 * Detecta a operacao em curso pelos arquivos que o git deixa no git-dir.
 * Nao existe comando de porcelain para isso: e a inspecao do diretorio mesmo.
 *
 * @param {string} gitDir
 * @returns {Promise<Omit<import("../types.mjs").PendingOperation, "conflicts"> | null>}
 */
export async function detectPending(gitDir) {
  if (!gitDir) return null;
  const at = (...p) => path.join(gitDir, ...p);

  if (await exists(at("rebase-merge"))) {
    const interactive = await exists(at("rebase-merge", "interactive"));
    const step = await readNumber(at("rebase-merge", "msgnum"));
    const total = await readNumber(at("rebase-merge", "end"));
    const current =
      (await readText(at("rebase-merge", "stopped-sha"))) ||
      (await readText(at("rebase-merge", "orig-head"))) ||
      undefined;
    return {
      kind: interactive ? "rebase-interactive" : "rebase",
      ...(step !== null ? { step } : {}),
      ...(total !== null ? { total } : {}),
      ...(current ? { current } : {}),
    };
  }

  if (await exists(at("rebase-apply"))) {
    const step = await readNumber(at("rebase-apply", "next"));
    const total = await readNumber(at("rebase-apply", "last"));
    const current = (await readText(at("rebase-apply", "original-commit"))) || undefined;
    return {
      kind: "rebase",
      ...(step !== null ? { step } : {}),
      ...(total !== null ? { total } : {}),
      ...(current ? { current } : {}),
    };
  }

  if (await exists(at("MERGE_HEAD"))) {
    const current = (await readText(at("MERGE_HEAD"))) || undefined;
    return { kind: "merge", ...(current ? { current } : {}) };
  }
  if (await exists(at("CHERRY_PICK_HEAD"))) {
    const current = (await readText(at("CHERRY_PICK_HEAD"))) || undefined;
    return { kind: "cherry-pick", ...(current ? { current } : {}) };
  }
  if (await exists(at("REVERT_HEAD"))) {
    const current = (await readText(at("REVERT_HEAD"))) || undefined;
    return { kind: "revert", ...(current ? { current } : {}) };
  }
  if (await exists(at("BISECT_LOG"))) {
    return { kind: "bisect" };
  }
  return null;
}

/** Arquivos em conflito — `U` no diff-filter. */
export async function getConflicts(cwd = process.cwd()) {
  return execGitLines(["diff", "--name-only", "--diff-filter=U"], { cwd });
}

/**
 * @param {string} [cwd]
 * @returns {Promise<import("../types.mjs").HeadState>}
 */
export async function getHeadState(cwd = process.cwd()) {
  const gitDir = await getGitDir(cwd);
  const [branch, hash, pendingBase, conflicts] = await Promise.all([
    readGitLine(["symbolic-ref", "--short", "-q", "HEAD"], { cwd }),
    readGitLine(["rev-parse", "--verify", "--quiet", "HEAD"], { cwd }),
    detectPending(gitDir),
    getConflicts(cwd),
  ]);

  /** @type {import("../types.mjs").PendingOperation | null} */
  let pending = null;
  if (pendingBase) pending = { ...pendingBase, conflicts };
  else if (conflicts.length) pending = { kind: "merge", conflicts };

  return {
    branch: branch || null,
    hash: hash || null,
    detached: !branch,
    pending,
  };
}

/* ------------------------------------------------------------------ *
 * Stashes
 * ------------------------------------------------------------------ */

const STASH_FORMAT = ["%gd", "%H", "%gs", "%ar"].join("%x1f");

/** `git stash list` com formato proprio. */
export async function getStashes(cwd = process.cwd()) {
  const result = await readGit(["stash", "list", `--format=${STASH_FORMAT}`], { cwd });
  if (!result.ok) return [];
  return parseStashList(result.stdout);
}

/** Parser puro de `git stash list`. */
export function parseStashList(stdout) {
  /** @type {import("../types.mjs").StashEntry[]} */
  const stashes = [];
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line) continue;
    const [ref = "", hash = "", subject = "", relativeDate = ""] = line.split(FS);
    const index = Number.parseInt(/stash@\{(\d+)\}/.exec(ref)?.[1] ?? "", 10);
    // "WIP on main: 1234abc assunto" | "On main: minha mensagem"
    const match = /^(?:WIP on|On) ([^:]+): ?(.*)$/.exec(subject);
    stashes.push({
      index: Number.isFinite(index) ? index : stashes.length,
      ref,
      message: match ? match[2] : subject,
      branch: match ? match[1] : "",
      hash,
      relativeDate,
    });
  }
  return stashes;
}

/* ------------------------------------------------------------------ *
 * Payload completo — GET /api/refs
 * ------------------------------------------------------------------ */

/**
 * @param {string} [cwd]
 * @returns {Promise<import("../types.mjs").RefsPayload>}
 */
export async function getRefsPayload(cwd = process.cwd()) {
  const remotes = await getRemotes(cwd);
  const remoteNames = new Set(remotes.map((r) => r.name));

  const [refsResult, head, stashes, worktrees] = await Promise.all([
    readGit(
      [
        "for-each-ref",
        `--format=${REF_FORMAT}`,
        "refs/heads",
        "refs/remotes",
        "refs/tags",
      ],
      { cwd },
    ),
    getHeadState(cwd),
    getStashes(cwd),
    listWorktrees(cwd),
  ]);

  const { branches, remoteBranches, tags } = refsResult.ok
    ? parseForEachRef(refsResult.stdout, remoteNames)
    : { branches: [], remoteBranches: [], tags: [] };

  // Uma branch checada em OUTRA worktree nao pode receber checkout aqui.
  const byBranch = new Map();
  for (const wt of worktrees) {
    if (wt.branch) byBranch.set(wt.branch, wt);
  }
  for (const branch of branches) {
    const wt = byBranch.get(branch.name);
    if (wt) branch.checkedOutIn = wt.path;
    // `%(HEAD)` so marca a branch da worktree corrente; confirma pelo cwd.
    if (wt && samePath(wt.path, cwd)) branch.isHead = true;
  }

  return { head, branches, remoteBranches, tags, remotes, stashes };
}

/* ------------------------------------------------------------------ *
 * Helpers de fs
 * ------------------------------------------------------------------ */

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readText(target) {
  try {
    return (await fs.readFile(target, "utf8")).trim();
  } catch {
    return "";
  }
}

async function readNumber(target) {
  const text = await readText(target);
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) ? n : null;
}
