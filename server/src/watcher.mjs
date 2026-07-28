/**
 * Watcher do git-dir: `fs.watch` -> debounce -> `repo:changed`.
 *
 * Observa HEAD, refs/, index, MERGE_HEAD, rebase-merge/, rebase-apply/, config
 * e packed-refs. Um `git commit` mexe em varios deles de uma vez, entao o
 * debounce agrupa a rajada num evento so, com o motivo mais significativo.
 *
 * DOIS diretorios, nao um. Numa worktree ligada o git-dir e
 * `<comum>/worktrees/<nome>` e guarda apenas o que e por-worktree: HEAD, index,
 * rebase-merge/. As REFS moram no git-dir comum, compartilhadas. Observar so o
 * primeiro deixa passar tudo que mexe em branch e tag vindo de fora — que e a
 * maior parte do que se quer saber. Por isso o comum entra junto quando difere.
 *
 * O preco de observar os dois e que um evento no proprio git-dir chega duas
 * vezes, por caminhos relativos diferentes. Nao ha problema: o debounce junta o
 * lote e `mostSignificant` escolhe o motivo mais forte dos dois.
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
const WATCHED_SUBDIRS = [
  "refs",
  "refs/heads",
  "refs/remotes",
  "refs/tags",
  "rebase-merge",
  "rebase-apply",
  // No git-dir comum, e aqui que nasce e morre uma worktree criada por fora.
  "worktrees",
];

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
   * @param {{gitDir: string, commonDir?: string, onChange: (reason: string, paths: string[]) => void}} options
   */
  constructor({ gitDir, commonDir, onChange }) {
    this.gitDir = gitDir;
    this.commonDir = commonDir && commonDir !== gitDir ? commonDir : null;
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
    for (const root of [this.gitDir, this.commonDir]) {
      if (root && fs.existsSync(root)) this.#watchRoot(root);
    }
    return this;
  }

  /**
   * Guarda o FSWatcher com um tratador de erro OBRIGATORIO.
   *
   * Sem ele o servidor cai. O watch recursivo do Linux caminha a arvore por
   * conta propria e emite `error` quando um diretorio some entre o evento e o
   * scandir — um ENOENT em `refs/remotes/<remote>` logo depois de um
   * `push --delete`, por exemplo. `error` sem ouvinte vira `uncaughtException`,
   * e o processo que morre e o que executa git na maquina da pessoa. Um
   * diretorio que evapora e o dia a dia de um git-dir: nao ha o que fazer alem
   * de continuar observando o resto.
   */
  #keep(watcher) {
    watcher.on("error", () => {});
    this.watchers.push(watcher);
  }

  /** Observa um git-dir inteiro, recursivo quando o sistema deixa. */
  #watchRoot(root) {
    // Watch recursivo existe no Linux desde o Node 20.13; onde nao existe,
    // caimos para um watcher por subdiretorio de interesse.
    try {
      this.#keep(
        fs.watch(root, { recursive: true, persistent: false }, (_event, filename) => {
          if (filename) this.#queue(String(filename));
        }),
      );
      return;
    } catch {
      /* sem recursivo: plano B */
    }

    this.#watchDir(root, "");
    for (const sub of WATCHED_SUBDIRS) {
      this.#watchDir(path.join(root, sub), sub);
    }
  }

  #watchDir(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    try {
      this.#keep(
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
