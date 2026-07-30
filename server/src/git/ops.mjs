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
import fs from "node:fs";

import { execGit, readGit, readGitLine, withMutationLock } from "./exec.mjs";
import { getHeadState } from "./refs.mjs";
import { gitPush } from "./remotes.mjs";
import { listWorktrees } from "./worktree.mjs";
import { parseUnifiedDiff } from "./status.mjs";

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
    const error = new Error("error.argsDash");
    error.status = 400;
    error.params = { field };
    error.detail = "error.argsDashDetail";
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

/* ------------------------------------------------------------------ *
 * Autostash — a arvore suja e o estado NORMAL de quem usa uma GUI
 * ------------------------------------------------------------------ *
 * Ninguem limpa a working tree antes de clicar em "squash". Sem
 * `--autostash`, todo comando que reescreve historico morre com "cannot
 * rebase: You have unstaged changes" no uso real do produto.
 *
 * O detalhe que exige cuidado: o git anuncia o autostash no STDOUT
 * ("Created autostash: <sha>") e o resultado do pop no STDERR ("Applied
 * autostash." / "Applying autostash resulted in conflicts."). E, no caso do
 * pop conflitado, o git SAI COM 0 — deixando marcador de conflito no arquivo
 * do usuario enquanto diz "Successfully rebased". Reportar isso como sucesso
 * seria o pior erro possivel deste backend.
 */

/** Marcas que o git deixa nas duas saidas quando ha autostash. */
const AUTOSTASH_CREATED = /Created autostash:/i;
const AUTOSTASH_POP_CONFLICT = /Applying autostash resulted in conflicts/i;

/**
 * @param {import("../types.mjs").GitCommandResult} result
 * @returns {{autostashed: boolean, popConflict: boolean}}
 */
export function detectAutostash(result) {
  // Os dois streams juntos: a mensagem de criacao e a do pop vao em canais
  // diferentes, e olhar so um deles perde metade da informacao.
  const saida = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return {
    autostashed: AUTOSTASH_CREATED.test(saida),
    popConflict: AUTOSTASH_POP_CONFLICT.test(saida),
  };
}

/**
 * Finaliza o resultado de um comando que reescreve historico: marca
 * `autostashed` e transforma o pop conflitado em falha explicita com `pending`.
 *
 * @param {import("../types.mjs").GitCommandResult} result
 */
export async function withAutostashState(result) {
  const { autostashed, popConflict } = detectAutostash(result);
  const enriquecido = await withPendingState({ ...result, autostashed });
  if (!popConflict) return enriquecido;

  return {
    ...enriquecido,
    ok: false,
    error:
      "o autostash voltou com conflito: o historico foi reescrito, mas as suas " +
      'alteracoes pendentes continuam guardadas em "git stash list"',
    // Sem rebase-merge/ no disco, o pending sai dos arquivos em conflito.
    pending: enriquecido.pending ?? { kind: "merge", conflicts: [] },
  };
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

/** Igual a `run`, para comandos que reescrevem historico e usam `--autostash`. */
async function runRewrite(args, opts = {}) {
  const result = await tx(() => step(args, opts));
  return withAutostashState(result);
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
 *
 * `autostash` e opcional no contrato e o DEFAULT aqui e ligado: numa GUI a
 * working tree quase nunca esta limpa, e sem isso o rebase morre com "cannot
 * rebase: You have unstaged changes". Quem quiser o comportamento cru do git
 * ainda pode mandar `autostash: false` explicitamente.
 */
export async function rebase({ source, onto, autostash, upstream, interactive } = {}) {
  assertRef(source, "source");
  assertRef(onto, "onto");
  const args = ["rebase"];
  if (autostash !== false) args.push("--autostash");
  if (interactive) args.push("-i");
  if (upstream) {
    assertRef(upstream, "upstream");
    args.push("--onto", onto, upstream, source);
  } else {
    args.push(onto, source);
  }
  return runRewrite(args);
}

/** POST /api/ops/reset */
export async function reset({ ref, mode } = {}) {
  assertRef(ref, "ref");
  const allowed = new Set(["soft", "mixed", "hard"]);
  if (!allowed.has(mode)) {
    const error = new Error("error.resetMode");
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
    const error = new Error("error.opKind");
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
export async function deleteBranchLocal({ name, force, remote } = {}) {
  assertRef(name, "name");
  const args = ["branch", force ? "-D" : "-d", name, "--"];
  if (!remote) return run(args);

  // Com `remote`, os dois lados morrem sob UM lock so — mesmo desenho de
  // `deleteTag`. Sem isso, outra mutacao poderia se meter entre o `branch -d` e
  // o `push --delete` e o repo ficaria com metade da exclusao feita.
  assertRef(remote, "remote");
  const result = await tx(async () => {
    const local = await step(args);
    if (!local.ok) return local;
    return withRemoteDelete(local, remote, name);
  });
  return withPendingState(result);
}

/**
 * A branch existe no remoto, ate onde este clone sabe?
 *
 * A pergunta e respondida pela ref de RASTREAMENTO local. Perguntar ao servidor
 * custaria uma ida a rede — com askpass, possivelmente um prompt de credencial —
 * so para descobrir que nao ha nada a apagar. O preco e conhecido: se o clone
 * nunca fez fetch, ou se a ref esta velha, a resposta pode errar. Nos dois casos
 * o `push --delete` diria a verdade, e e por isso que o erro dele passa inteiro.
 */
async function remoteBranchExists(remote, name) {
  const result = await readGit(["show-ref", "--verify", `refs/remotes/${remote}/${name}`]);
  return result.ok;
}

/**
 * Fecha uma exclusao apagando o lado remoto — quando ele existe.
 *
 * Nao existir NAO e falha: apagar a branch local ainda foi o que a pessoa pediu.
 * O passo e pulado e marcado em `skippedRemote`, para a UI poder dizer que so
 * um dos lados tinha o que apagar.
 *
 * Chamada de DENTRO de uma transacao: usa `step`, nunca `gitPush` (que pegaria o
 * lock de novo e travaria a fila).
 */
async function withRemoteDelete(local, remote, name) {
  if (!(await remoteBranchExists(remote, name))) return { ...local, skippedRemote: true };
  const pushed = await step(["push", "--progress", remote, "--delete", name]);
  return {
    ...pushed,
    ok: local.ok && pushed.ok,
    stdout: `${local.stdout}${pushed.stdout}`,
    stderr: `${local.stderr}${pushed.stderr}`,
  };
}

/** POST /api/branch/delete-remote — `git push <remote> --delete <name>`. */
export async function deleteBranchRemote({ remote, name } = {}) {
  assertRef(remote, "remote");
  assertRef(name, "name");
  const result = await gitPush({ remote, branch: name, deleteRef: true });
  return withPendingState(result);
}

/* ------------------------------------------------------------------ *
 * Exclusao em cascata
 * ------------------------------------------------------------------ */

/**
 * Solta a branch que esta checada na worktree PRINCIPAL.
 *
 * A principal nao pode ser removida — `git worktree remove` recusa, e com razao:
 * ela e o repositorio. Entao a cascata faz o unico movimento que libera a branch
 * sem destruir o diretorio: solta o HEAD e joga fora o que nao foi commitado.
 * O `reset` mata modificacao em arquivo rastreado, o `clean` mata o resto.
 */
async function detachMainWorktree(main) {
  const detached = await step(["checkout", "--detach"], { cwd: main.path });
  if (!detached.ok) return detached;
  const reset = await step(["reset", "--hard"], { cwd: main.path });
  if (!reset.ok) return reset;
  return step(["clean", "-fd"], { cwd: main.path });
}

/**
 * Remove a worktree ligada que prende a branch, com o codigo nao commitado
 * junto — e o que `--force` faz aqui: sem ele o git recusa arvore suja.
 *
 * O caso delicado e a worktree ser a ATIVA: o servidor esta com o `process.cwd()`
 * dentro do diretorio que vai deixar de existir. Sair ANTES e obrigatorio; um
 * processo cujo cwd sumiu nao consegue nem rodar o proximo comando. Quem chama
 * compara o cwd depois para avisar a interface.
 */
async function dropLinkedWorktree(holder, worktrees) {
  if (holder.isActive) {
    const main = worktrees.find((wt) => wt.isMain && wt.path !== holder.path);
    if (!main || !fs.existsSync(main.path)) {
      const error = new Error("error.noMainWorktree");
      error.status = 409;
      error.detail = "error.noMainWorktreeDetail";
      throw error;
    }
    process.chdir(main.path);
  }
  return step(["worktree", "remove", "--force", holder.path]);
}

/**
 * POST /api/branch/delete-all — a saida para a branch que se recusa a morrer.
 *
 * `git branch -d` falha quando a branch esta checada em alguma worktree, e a
 * worktree se recusa a sair quando ha codigo nao commitado. A pessoa fica
 * girando entre dois erros que apontam um para o outro. Esta rota quebra o ciclo
 * na ordem certa: libera a worktree, apaga a branch local, apaga a do remoto.
 *
 * Tudo sob UM lock. A cascata para no primeiro passo que falhar e devolve
 * aquele resultado — meia exclusao e pior que nenhuma, entao o que ficou por
 * fazer fica visivel em vez de silencioso.
 */
export async function deleteBranchAll({ name, remote } = {}) {
  assertRef(name, "name");
  if (remote) assertRef(remote, "remote");

  const cwdAntes = process.cwd();
  const result = await tx(async () => {
    // Leitura: nao pega o lock (ja o temos) e nao suja o console do usuario.
    const worktrees = await listWorktrees();
    const holder = worktrees.find((wt) => wt.branch === name && !wt.bare);

    if (holder) {
      const liberada = holder.isMain
        ? await detachMainWorktree(holder)
        : await dropLinkedWorktree(holder, worktrees);
      if (!liberada.ok) return liberada;
    }

    // `-D` e nao `-d`: a acao se chama "excluir tudo" e o hold-to-confirm da
    // interface ja e a barreira. Recusar por commit nao mesclado aqui seria
    // devolver a pessoa exatamente ao erro do qual ela veio fugindo.
    const local = await step(["branch", "-D", name, "--"]);
    if (!local.ok || !remote) return local;
    return withRemoteDelete(local, remote, name);
  });

  const enriquecido = await withPendingState(result);
  // Trocar de worktree no meio da cascata muda o diretorio do processo: a rota
  // precisa saber para reiniciar o watcher e avisar a interface.
  return process.cwd() === cwdAntes
    ? enriquecido
    : { ...enriquecido, cwdChanged: process.cwd() };
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

/** GET /api/stash/show — diff do conteudo de um stash.
 *
 * Roda `git stash show -p <ref>` e devolve o mesmo formato de /api/diff
 * (DiffPayload[]), reutilizando o parser de patch unificado.
 *
 * Stash inexistente devolve array vazio — o git so imprime header de erro no
 * stderr mas sai com 0, e como a saida e vazia o parser devolve [] sem errar.
 * Ref invalida (comeca com `-`) e barrada pelo `assertRef` antes de chegar ao git.
 */
export async function stashShow(ref) {
  assertRef(ref, "ref");
  const result = await readGit(["stash", "show", "-p", "--no-color", ref]);
  if (!result.ok) {
    // stash inexistente: git stash show sai com 0 mas sem stdout — seguro.
    return [];
  }
  return parseUnifiedDiff(result.stdout);
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
    const error = new Error("error.argsRequired");
    error.status = 400;
    throw error;
  }
  if (args.some((a) => typeof a !== "string")) {
    const error = new Error("error.argsStrings");
    error.status = 400;
    throw error;
  }
  const sub = args.find((a) => !a.startsWith("-"));
  if (sub && RAW_BLOCKLIST.has(sub)) {
    const error = new Error(`o comando "${sub}" nao pode rodar pelo gitcraque`);
    error.status = 400;
    error.detail = "error.opInteractive";
    throw error;
  }
  const result = await tx(() => step(args));
  return withPendingState(result);
}
