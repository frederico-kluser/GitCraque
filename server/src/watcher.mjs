/**
 * Watcher do git-dir: `fs.watch` -> debounce -> `repo:changed`.
 *
 * Observa HEAD, refs/, index, MERGE_HEAD, rebase-merge/, rebase-apply/, config
 * e packed-refs. Um `git commit` mexe em varios deles de uma vez, entao o
 * debounce agrupa a rajada num evento so, com o motivo mais significativo.
 *
 * Supressao: enquanto o PROPRIO servidor esta rodando um comando mutante, os
 * eventos sao descartados. Quem disparou o comando ja vai recarregar quando a
 * resposta REST chegar; emitir aqui so faria a UI recarregar duas vezes por
 * operacao — e, em repos grandes, entrar num ciclo de refresh.
 */
import fs from "node:fs";
import path from "node:path";

import {
  CHANGE_REASON_PRIORITY,
  WATCH_DEBOUNCE_MS,
  WATCH_SUPPRESS_TAIL_MS,
} from "./contract.mjs";

/** Subdiretorios do git-dir que valem observacao quando nao ha watch recursivo. */
const WATCHED_SUBDIRS = ["refs", "refs/heads", "refs/remotes", "refs/tags", "rebase-merge", "rebase-apply"];

/**
 * Mapeia um caminho relativo dentro do git-dir para o motivo do contrato.
 * @param {string} relative
 * @returns {import("./types.mjs").RepoChangeReason}
 */
export function reasonForPath(relative) {
  const p = relative.replaceAll("\\", "/");
  if (p.startsWith("rebase-merge") || p.startsWith("rebase-apply")) return "rebase-state";
  if (
    p === "MERGE_HEAD" ||
    p === "CHERRY_PICK_HEAD" ||
    p === "REVERT_HEAD" ||
    p === "BISECT_LOG" ||
    p === "MERGE_MSG" ||
    p === "SQUASH_MSG"
  ) {
    return "rebase-state";
  }
  if (p === "HEAD" || p === "ORIG_HEAD" || p.startsWith("logs/HEAD")) return "head";
  if (p.startsWith("refs/") || p === "packed-refs" || p.startsWith("logs/")) return "refs";
  if (p === "index" || p.startsWith("index.lock")) return "index";
  if (p === "config") return "config";
  return "worktree";
}

/** O motivo mais significativo de um lote. */
export function mostSignificant(reasons) {
  let best = null;
  let bestRank = Number.MAX_SAFE_INTEGER;
  for (const reason of reasons) {
    const rank = CHANGE_REASON_PRIORITY.indexOf(reason);
    const effective = rank === -1 ? CHANGE_REASON_PRIORITY.length : rank;
    if (effective < bestRank) {
      bestRank = effective;
      best = reason;
    }
  }
  return best ?? "manual";
}

export class Watcher {
  /**
   * @param {{gitDir: string, onChange: (reason: string, paths: string[]) => void}} options
   */
  constructor({ gitDir, onChange }) {
    this.gitDir = gitDir;
    this.onChange = onChange;
    /** @type {fs.FSWatcher[]} */
    this.watchers = [];
    this.timer = null;
    /** @type {Set<string>} */
    this.batch = new Set();
    this.suppressDepth = 0;
    this.suppressUntil = 0;
    this.closed = false;
  }

  start() {
    if (!this.gitDir || !fs.existsSync(this.gitDir)) return this;

    // Watch recursivo existe no Linux desde o Node 20.13; onde nao existe,
    // caimos para um watcher por subdiretorio de interesse.
    try {
      this.watchers.push(
        fs.watch(this.gitDir, { recursive: true, persistent: false }, (_event, filename) => {
          if (filename) this.#queue(String(filename));
        }),
      );
      return this;
    } catch {
      /* sem recursivo: plano B */
    }

    this.#watchDir(this.gitDir, "");
    for (const sub of WATCHED_SUBDIRS) {
      this.#watchDir(path.join(this.gitDir, sub), sub);
    }
    return this;
  }

  #watchDir(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    try {
      this.watchers.push(
        fs.watch(dir, { persistent: false }, (_event, filename) => {
          if (!filename) return;
          this.#queue(prefix ? `${prefix}/${filename}` : String(filename));
        }),
      );
    } catch {
      /* diretorio some no meio do rebase: normal */
    }
  }

  #queue(relative) {
    // Arquivos de lock sao ruido puro: aparecem e somem em milissegundos.
    if (relative.endsWith(".lock")) return;
    this.batch.add(relative);
    if (this.timer) return;
    this.timer = setTimeout(() => this.#flush(), WATCH_DEBOUNCE_MS);
    this.timer.unref?.();
  }

  #flush() {
    this.timer = null;
    const paths = [...this.batch];
    this.batch.clear();
    if (!paths.length || this.closed) return;
    if (this.isSuppressed()) return;
    const reason = mostSignificant(paths.map(reasonForPath));
    this.onChange(reason, paths);
  }

  isSuppressed() {
    if (this.suppressDepth > 0) return true;
    return Date.now() < this.suppressUntil;
  }

  /** Chamado pelo exec antes de um comando mutante. */
  beginSuppression() {
    this.suppressDepth += 1;
  }

  /** Chamado pelo exec quando o comando termina; mantem um rabo de silencio. */
  endSuppression() {
    this.suppressDepth = Math.max(0, this.suppressDepth - 1);
    if (this.suppressDepth === 0) {
      this.suppressUntil = Date.now() + WATCH_SUPPRESS_TAIL_MS;
    }
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const watcher of this.watchers) {
      try {
        watcher.close();
      } catch {
        /* ja fechado */
      }
    }
    this.watchers = [];
  }
}
