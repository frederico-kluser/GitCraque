/**
 * Operacoes que mutam o repositorio: cherry-pick, merge, rebase, reset, revert,
 * abort/continue, branches, stash e tags.
 *
 * Duas regras valem para o arquivo inteiro:
 *
 *  1. Conflito NAO e erro de servidor. Um `git merge` que para em conflito fez
 *     exatamente o que devia; a rota responde 200 com `ok: false` e `pending`
 *     preenchido para a UI oferecer continuar/abortar.
 *  2. Nada que veio do usuario pode comecar com `-`. Como tudo vai por argv em
 *     array, injecao de shell e impossivel — mas um ref chamado
 *     `--upload-pack=curl` ainda seria lido como flag pelo git.
 */
import { execGit, readGit, readGitLine, withMutationLock } from "./exec.mjs";
import { getHeadState } from "./refs.mjs";
import { gitPush } from "./remotes.mjs";

/* ------------------------------------------------------------------ *
 * Guardas de entrada
 * ------------------------------------------------------------------ */

/** Recusa valor vazio ou que o git leria como flag. */
export function assertRef(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error(`${field} e obrigatorio`);
    error.status = 400;
    throw error;
  }
  if (value.startsWith("-")) {
    const error = new Error(`${field} nao pode comecar com "-"`);
    error.status = 400;
    error.detail = "o git leria o valor como opcao de linha de comando";
    throw error;
  }
  return value;
}

function assertRefList(values, field) {
  if (!Array.isArray(values) || values.length === 0) {
    const error = new Error(`${field} e obrigatorio e nao pode ser vazio`);
    error.status = 400;
    throw error;
  }
  values.forEach((v, i) => assertRef(v, `${field}[${i}]`));
  return values;
}

/* ------------------------------------------------------------------ *
 * Conflito -> pending
 * ------------------------------------------------------------------ */

/**
 * Enriquece um GitCommandResult com `pending` quando o repo ficou em estado de
 * operacao interrompida. Quem chama decide o status HTTP com `isConflict()`.
 *
 * @param {import("../types.mjs").GitCommandResult} result
 */
export async function withPendingState(result) {
  const head = await getHeadState();
  const pending = head.pending;
  if (!pending) return { ...result, pending: null };
  return { ...result, pending };
}

/**
 * true quando o comando falhou POR CONFLITO (e nao por erro de verdade).
 *
 * A decisao vem do que o proprio comando disse, nao do estado do repositorio:
 * se olhassemos so o `pending`, qualquer comando que falhasse durante um merge
 * ja pendente viraria "conflito" — e um `checkout branch-inexistente` no meio
 * de um merge responderia 200 fingindo que deu certo.
 */
export function isConflict(result) {
  if (result.ok) return false;
  return /conflict|could not apply|automatic merge failed|fix conflicts|unmerged files/i.test(
    `${result.stderr}\n${result.stdout}`,
  );
}

/**
 * Um passo DENTRO de uma transacao: nao pega o lock (a transacao ja o tem).
 * Pegar o lock aqui dentro daria deadlock — a fila e serial, nao reentrante.
 */
const step = (args, opts = {}) => execGit(args, opts);

/**
 * Agrupa varios comandos git sob UM unico lock de mutacao, para que nada se
 * intercale entre o `checkout` e o `merge` de uma mesma operacao.
 */
const tx = (fn) => withMutationLock(fn);

/** Um comando so, com lock, ja devolvendo o resultado com `pending` resolvido. */
async function run(args, opts = {}) {
  const result = await tx(() => step(args, opts));
  return withPendingState(result);
}

/* ------------------------------------------------------------------ *
 * Ordem topologica
 * ------------------------------------------------------------------ */

/** Resolve abreviacoes para o hash completo. `null` quando nao existe. */
export async function resolveCommit(ref, cwd = process.cwd()) {
  assertRef(ref, "commit");
  return readGitLine(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd });
}

/**
 * Ordena hashes pela ordem topologica REAL do repositorio, do MAIS ANTIGO para
 * o mais novo. Nunca confie na ordem que a UI mandou: o usuario seleciona no
 * grafo em qualquer ordem, e cherry-pick fora de ordem gera conflito bobo.
 *
 * @param {string[]} hashes hashes ja resolvidos (completos)
 * @param {string} [revRange] o que enumerar; default `--all`
 */
export async function sortTopologically(hashes, cwd = process.cwd(), revRange = "--all") {
  const listing = await readGit(["rev-list", "--topo-order", revRange], { cwd });
  if (!listing.ok) return [...hashes];
  /** @type {Map<string, number>} */
  const order = new Map();
  let index = 0;
  for (const line of listing.stdout.split("\n")) {
    const hash = line.trim();
    if (hash) order.set(hash, index++);
  }
  // rev-list sai do mais NOVO para o mais antigo: indice maior = mais antigo.
  return [...hashes].sort((a, b) => {
    const ia = order.has(a) ? order.get(a) : Number.MAX_SAFE_INTEGER;
    const ib = order.has(b) ? order.get(b) : Number.MAX_SAFE_INTEGER;
    return ib - ia;
  });
}

/* ------------------------------------------------------------------ *
 * Cherry-pick
 * ------------------------------------------------------------------ */

/**
 * POST /api/ops/cherry-pick
 * @param {{commits: string[], onto?: string, noCommit?: boolean, mainline?: number}} body
 */
export async function cherryPick({ commits, onto, noCommit, mainline } = {}) {
  assertRefList(commits, "commits");
  if (onto) assertRef(onto, "onto");

  const resolved = [];
  for (const ref of commits) {
    const hash = await resolveCommit(ref);
    if (!hash) {
      const error = new Error(`commit ${ref} nao encontrado`);
      error.status = 400;
      throw error;
    }
    resolved.push(hash);
  }
  // Do mais ANTIGO para o mais novo: fora de ordem, cherry-pick gera conflito bobo.
  const ordered = await sortTopologically(resolved);

  const result = await tx(async () => {
    if (onto) {
      const head = await getHeadState();
      if (head.branch !== onto) {
        const checkedOut = await step(["checkout", onto, "--"]);
        if (!checkedOut.ok) return checkedOut;
      }
    }
    const args = ["cherry-pick"];
    if (noCommit) args.push("-n");
    if (Number.isFinite(mainline) && mainline > 0) args.push("-m", String(Math.floor(mainline)));
    args.push(...ordered);
    return step(args);
  });
  return withPendingState(result);
}

/* ------------------------------------------------------------------ *
 * Merge / rebase / reset / revert
 * ------------------------------------------------------------------ */

/**
 * POST /api/ops/merge — `into` (o alvo do drop) e quem recebe o merge, entao
 * ele precisa estar checado antes.
 */
export async function merge({ source, into, noFf, squash, message } = {}) {
  assertRef(source, "source");
  if (into) assertRef(into, "into");

  const result = await tx(async () => {
    if (into) {
      const head = await getHeadState();
      if (head.branch !== into) {
        const checkedOut = await step(["checkout", into, "--"]);
        if (!checkedOut.ok) return checkedOut;
      }
    }
    const args = ["merge"];
    if (squash) args.push("--squash");
    else if (noFf) args.push("--no-ff");
    if (message) args.push("-m", message);
    else if (!squash) args.push("--no-edit");
    args.push(source);
    return step(args);
  });
  return withPendingState(result);
}

/**
 * POST /api/ops/rebase — replay de `source` em cima de `onto`.
 * `upstream` (opcional) ativa a forma de tres pontos `--onto <onto> <upstream> <source>`.
 */
export async function rebase({ source, onto, autostash, upstream, interactive } = {}) {
  assertRef(source, "source");
  assertRef(onto, "onto");
  const args = ["rebase"];
  if (autostash) args.push("--autostash");
  if (interactive) args.push("-i");
  if (upstream) {
    assertRef(upstream, "upstream");
    args.push("--onto", onto, upstream, source);
  } else {
    args.push(onto, source);
  }
  return run(args);
}

/** POST /api/ops/reset */
export async function reset({ ref, mode } = {}) {
  assertRef(ref, "ref");
  const allowed = new Set(["soft", "mixed", "hard"]);
  if (!allowed.has(mode)) {
    const error = new Error("mode deve ser soft, mixed ou hard");
    error.status = 400;
    throw error;
  }
  return run(["reset", `--${mode}`, ref, "--"]);
}

/** POST /api/ops/revert */
export async function revert({ hash, noCommit } = {}) {
  assertRef(hash, "hash");
  const args = ["revert", "--no-edit"];
  if (noCommit) args.push("-n");
  args.push(hash);
  return run(args);
}

/* ------------------------------------------------------------------ *
 * abort / continue
 * ------------------------------------------------------------------ */

const OP_KINDS = new Set(["rebase", "merge", "cherry-pick", "revert"]);

function assertOpKind(kind) {
  if (!OP_KINDS.has(kind)) {
    const error = new Error("kind deve ser rebase, merge, cherry-pick ou revert");
    error.status = 400;
    throw error;
  }
  return kind;
}

/** POST /api/ops/abort */
export async function abortOp({ kind } = {}) {
  assertOpKind(kind);
  return run([kind, "--abort"]);
}

/** POST /api/ops/continue */
export async function continueOp({ kind } = {}) {
  assertOpKind(kind);
  // `git merge --continue` existe desde 2.12 e respeita GIT_EDITOR=true.
  return run([kind, "--continue"]);
}

/* ------------------------------------------------------------------ *
 * Branches
 * ------------------------------------------------------------------ */

/** POST /api/branch/create */
export async function createBranch({ name, startPoint, checkout } = {}) {
  assertRef(name, "name");
  if (startPoint) assertRef(startPoint, "startPoint");
  const args = checkout ? ["checkout", "-b", name] : ["branch", name];
  if (startPoint) args.push(startPoint);
  args.push("--");
  return run(args);
}

/** POST /api/branch/delete-local */
export async function deleteBranchLocal({ name, force } = {}) {
  assertRef(name, "name");
  return run(["branch", force ? "-D" : "-d", name, "--"]);
}

/** POST /api/branch/delete-remote — `git push <remote> --delete <name>`. */
export async function deleteBranchRemote({ remote, name } = {}) {
  assertRef(remote, "remote");
  assertRef(name, "name");
  const result = await gitPush({ remote, branch: name, deleteRef: true });
  return withPendingState(result);
}

/** POST /api/branch/rename */
export async function renameBranch({ from, to, force } = {}) {
  assertRef(from, "from");
  assertRef(to, "to");
  return run(["branch", force ? "-M" : "-m", from, to]);
}

/** POST /api/checkout */
export async function checkout({ ref, createBranch: newBranch, force } = {}) {
  assertRef(ref, "ref");
  const args = ["checkout"];
  if (force) args.push("--force");
  if (newBranch) {
    assertRef(newBranch, "createBranch");
    args.push("-b", newBranch);
  }
  args.push(ref, "--");
  return run(args);
}

/* ------------------------------------------------------------------ *
 * Stash
 * ------------------------------------------------------------------ */

export async function stashPush({ message, includeUntracked } = {}) {
  const args = ["stash", "push"];
  if (includeUntracked) args.push("--include-untracked");
  if (message) args.push("-m", message);
  return run(args);
}

export async function stashApply({ ref, pop } = {}) {
  assertRef(ref, "ref");
  return run(["stash", pop ? "pop" : "apply", ref]);
}

export async function stashDrop({ ref } = {}) {
  assertRef(ref, "ref");
  return run(["stash", "drop", ref]);
}

/* ------------------------------------------------------------------ *
 * Tags
 * ------------------------------------------------------------------ */

export async function createTag({ name, ref, message } = {}) {
  assertRef(name, "name");
  const args = ["tag"];
  if (message) args.push("-a", "-m", message);
  args.push(name);
  if (ref) {
    assertRef(ref, "ref");
    args.push(ref);
  }
  return run(args);
}

export async function deleteTag({ name, remote } = {}) {
  assertRef(name, "name");
  if (remote) assertRef(remote, "remote");
  const result = await tx(async () => {
    const local = await step(["tag", "-d", name]);
    if (!remote || !local.ok) return local;
    // A tag remota so morre com um push de delete — que passa pelo trampolim.
    const pushed = await step(["push", "--progress", remote, "--delete", `refs/tags/${name}`]);
    return {
      ...pushed,
      ok: local.ok && pushed.ok,
      stdout: `${local.stdout}${pushed.stdout}`,
      stderr: `${local.stderr}${pushed.stderr}`,
    };
  });
  return withPendingState(result);
}

/* ------------------------------------------------------------------ *
 * Escotilha — POST /api/raw
 * ------------------------------------------------------------------ */

/** Comandos que travariam o servidor ou abririam prompt fora do trampolim. */
const RAW_BLOCKLIST = new Set(["gui", "citool", "difftool", "mergetool", "daemon", "gitk"]);

/** POST /api/raw — qualquer comando git cru, ainda assim por argv em array. */
export async function raw({ args } = {}) {
  if (!Array.isArray(args) || args.length === 0) {
    const error = new Error("args e obrigatorio e nao pode ser vazio");
    error.status = 400;
    throw error;
  }
  if (args.some((a) => typeof a !== "string")) {
    const error = new Error("args so aceita strings");
    error.status = 400;
    throw error;
  }
  const sub = args.find((a) => !a.startsWith("-"));
  if (sub && RAW_BLOCKLIST.has(sub)) {
    const error = new Error(`o comando "${sub}" nao pode rodar pelo gitcraque`);
    error.status = 400;
    error.detail = "abre interface propria e travaria o servidor";
    throw error;
  }
  const result = await tx(() => step(args));
  return withPendingState(result);
}
