/**
 * Desfazer/refazer por CURSOR sobre o reflog.
 *
 * ── Por que um cursor proprio, e nao sintaxe do git ───────────────────
 * A leitura ingenua de "desfazer" seria `git reset --hard HEAD@{1}`. Ela
 * funciona UMA vez e depois oscila: o proprio reset cria uma entrada nova no
 * reflog, entao no segundo desfazer o `HEAD@{1}` aponta justamente para o lugar
 * de onde o primeiro veio, e o HEAD fica pulando entre dois commits para
 * sempre. E `HEAD@{-1}` nao ajuda — ele significa "o branch anterior do
 * checkout", nao "avancar no reflog". Nao existe sintaxe de git para avancar.
 *
 * Por isso o cursor mora AQUI, em memoria: o reflog e a fonte das posicoes
 * possiveis, e as duas pilhas dizem onde estamos dentro dessa lista.
 *
 * ── Reversibilidade ──────────────────────────────────────────────────
 * O desfazer usa `reset --hard`, que apagaria mudanca nao commitada — e ai o
 * refazer nao teria como traze-la de volta. Entao, com a worktree suja, o passo
 * guarda um stash marcado ANTES do reset e amarra a referencia dele ao passo; o
 * refazer volta o HEAD e reaplica exatamente aquele stash. Todo desfazer e
 * reversivel por construcao, e e por isso que os botoes nao pedem confirmacao.
 *
 * O stash e amarrado pelo SHA, nunca pelo indice: um `stash push` qualquer no
 * meio do caminho empurra `stash@{0}` para `stash@{1}` e o indice guardado
 * passaria a apontar para o stash de outra pessoa.
 *
 * ── Invalidacao ──────────────────────────────────────────────────────
 * Qualquer outra coisa que mova o HEAD — outra acao do app, ou `git` rodado no
 * terminal — tem de matar o refazer, senao o botao levaria o repositorio para
 * um estado que ninguem pediu. A deteccao e por comparacao do HEAD com o que
 * deixamos aqui (`expectedHead`), e nao por gancho no `exec.mjs`: gancho criaria
 * ciclo de import e ainda assim nao veria o git do terminal.
 */
import { execGit, execGitLines, readGit, readGitLine, withMutationLock } from "./exec.mjs";
import { getHeadState } from "./refs.mjs";

/** Quantas entradas do reflog viram passos de desfazer. */
const REFLOG_DEPTH = 50;

/** Teto de repositorios com cursor vivo — o processo abre um por vez, mas troca. */
const MAX_TRACKED = 16;

/** Separador de campo dentro de uma linha do reflog. */
const FS = "\x1f";

/** Prefixo da mensagem do stash automatico, para a pessoa reconhecer na lista. */
const STASH_PREFIX = "gitcraque:undo:";

/**
 * @typedef {object} UndoStep
 * @property {string}      to     sha para onde o desfazer leva
 * @property {string}      label  acao que sera desfeita ("commit: mensagem")
 */

/**
 * @typedef {object} RedoStep
 * @property {string}      from   sha para onde o refazer volta
 * @property {string}      label
 * @property {string|null} stash  sha do stash amarrado, quando houve um
 */

/**
 * @typedef {object} UndoCursor
 * @property {UndoStep[]} undoStack
 * @property {RedoStep[]} redoStack
 * @property {string|null} expectedHead
 */

/** @type {Map<string, UndoCursor>} */
const cursors = new Map();

/** Zera o cursor de todos os repositorios. Existe para os testes. */
export function resetUndoCursors() {
  cursors.clear();
}

/* ------------------------------------------------------------------ *
 * Lock — igual ao de ops.mjs: `step` nao pega lock, `tx` agrupa tudo.
 * ------------------------------------------------------------------ */

const step = (args, opts = {}) => execGit(args, opts);
const tx = (fn) => withMutationLock(fn);

/* ------------------------------------------------------------------ *
 * Cursor
 * ------------------------------------------------------------------ */

/**
 * Chave do cursor: o git dir DA WORKTREE, nao a raiz do repositorio.
 * Cada worktree tem o proprio `logs/HEAD`, entao cada uma desfaz a propria
 * historia. Trocar de worktree e `process.chdir()`, e a chave acompanha.
 */
async function cursorKey(cwd) {
  const dir = await readGitLine(["rev-parse", "--absolute-git-dir"], { cwd });
  return dir || cwd;
}

/**
 * Le o reflog do HEAD ja partido em (sha, assunto da acao).
 * Entrada 0 e a posicao ATUAL; o assunto dela e a acao que trouxe ate aqui.
 */
async function reflogEntries(cwd) {
  const lines = await execGitLines(
    ["reflog", `-n`, String(REFLOG_DEPTH), `--format=%H${FS}%gs`],
    { cwd },
  );
  const entries = [];
  for (const line of lines) {
    const [hash = "", subject = ""] = line.split(FS);
    if (hash) entries.push({ hash, subject });
  }
  return entries;
}

/**
 * Transforma o reflog na lista ordenada de passos de desfazer.
 *
 * Passo k leva para `entries[k+1].hash` e desfaz a acao descrita por
 * `entries[k].subject`. Entradas que nao MOVERAM o HEAD (um reset para o mesmo
 * lugar, um checkout do commit em que ja se estava) sao puladas: elas existem
 * no reflog mas nao sao nada para desfazer.
 */
function stepsFromReflog(entries) {
  /** @type {UndoStep[]} */
  const steps = [];
  for (let i = 0; i + 1 < entries.length; i += 1) {
    if (entries[i + 1].hash === entries[i].hash) continue;
    steps.push({ to: entries[i + 1].hash, label: entries[i].subject });
  }
  return steps;
}

/**
 * Devolve o cursor do repositorio, ressemeando quando o HEAD mudou por fora.
 * Nao pega o lock — so faz leitura silenciosa.
 */
async function syncCursor(cwd) {
  const head = await getHeadState(cwd);
  const key = await cursorKey(cwd);
  let cursor = cursors.get(key);

  if (!cursor || cursor.expectedHead !== head.hash) {
    cursor = {
      undoStack: head.hash ? stepsFromReflog(await reflogEntries(cwd)) : [],
      redoStack: [],
      expectedHead: head.hash,
    };
    // Reinsere no fim para que o corte por idade tire o menos usado.
    cursors.delete(key);
    cursors.set(key, cursor);
    while (cursors.size > MAX_TRACKED) {
      const oldest = cursors.keys().next().value;
      cursors.delete(oldest);
    }
  }

  return { cursor, head };
}

/** O que impede desfazer agora, ou null. */
function blockedBy(head) {
  if (!head.hash) return "empty";
  if (head.pending) return "pending";
  return null;
}

/* ------------------------------------------------------------------ *
 * GET /api/undo/state
 * ------------------------------------------------------------------ */

/**
 * Estado dos dois botoes. Leitura pura: nao pega o lock nem muta nada.
 * @returns {Promise<import("../types.mjs").UndoStatePayload>}
 */
export async function undoState(cwd = process.cwd()) {
  const { cursor, head } = await syncCursor(cwd);
  const blocked = blockedBy(head);
  const next = cursor.undoStack[0] || null;
  const back = cursor.redoStack[cursor.redoStack.length - 1] || null;
  return {
    canUndo: !blocked && Boolean(next),
    canRedo: !blocked && Boolean(back),
    undoLabel: next ? next.label : null,
    redoLabel: back ? back.label : null,
    blocked,
  };
}

/* ------------------------------------------------------------------ *
 * Guardas
 * ------------------------------------------------------------------ */

function refuse(key, status = 409) {
  const error = new Error(key);
  error.status = status;
  throw error;
}

/** true quando ha qualquer coisa nao commitada — inclusive arquivo novo. */
async function isDirty(cwd) {
  const result = await readGit(["status", "--porcelain"], { cwd });
  return result.ok && result.stdout.trim().length > 0;
}

/** Lista os SHAs dos stashes, do topo para baixo. Vazia quando nao ha stash. */
async function stashHashes(cwd) {
  return execGitLines(["reflog", "show", "stash", "--format=%H"], { cwd });
}

/* ------------------------------------------------------------------ *
 * POST /api/undo
 * ------------------------------------------------------------------ */

/**
 * Volta o HEAD um passo, guardando o trabalho pendente num stash amarrado.
 * @returns {Promise<import("../types.mjs").GitCommandResult>}
 */
export async function undo({ cwd = process.cwd() } = {}) {
  return tx(async () => {
    const { cursor, head } = await syncCursor(cwd);
    const blocked = blockedBy(head);
    if (blocked === "empty") refuse("error.undoEmptyRepo", 400);
    if (blocked === "pending") refuse("error.undoPending");
    const next = cursor.undoStack[0];
    if (!next) refuse("error.undoNothing", 400);

    const from = head.hash;

    /** @type {string|null} */
    let stash = null;
    if (await isDirty(cwd)) {
      const pushed = await step(["stash", "push", "--include-untracked", "-m", `${STASH_PREFIX}${from}`], { cwd });
      // Falhou o stash: NAO resetar. Resetar aqui apagaria o trabalho que o
      // stash existia justamente para preservar.
      if (!pushed.ok) return pushed;
      stash = await readGitLine(["rev-parse", "stash@{0}"], { cwd });
    }

    const reset = await step(["reset", "--hard", next.to, "--"], { cwd });
    if (!reset.ok) {
      // Devolve o trabalho antes de desistir — o repositorio volta ao que era.
      if (stash) await step(["stash", "pop", "stash@{0}"], { cwd });
      return reset;
    }

    cursor.undoStack.shift();
    cursor.redoStack.push({ from, label: next.label, stash });
    cursor.expectedHead = next.to;
    return reset;
  });
}

/* ------------------------------------------------------------------ *
 * POST /api/redo
 * ------------------------------------------------------------------ */

/**
 * Refaz o ultimo desfazer: volta o HEAD e reaplica o stash amarrado.
 * @returns {Promise<import("../types.mjs").GitCommandResult>}
 */
export async function redo({ cwd = process.cwd() } = {}) {
  return tx(async () => {
    const { cursor, head } = await syncCursor(cwd);
    const blocked = blockedBy(head);
    if (blocked === "empty") refuse("error.undoEmptyRepo", 400);
    if (blocked === "pending") refuse("error.undoPending");
    const back = cursor.redoStack[cursor.redoStack.length - 1];
    if (!back) refuse("error.redoNothing", 400);

    const reset = await step(["reset", "--hard", back.from, "--"], { cwd });
    if (!reset.ok) return reset;

    cursor.redoStack.pop();
    cursor.undoStack.unshift({ to: head.hash, label: back.label });
    cursor.expectedHead = back.from;

    if (back.stash) {
      // O indice do stash pode ter andado desde o desfazer: reencontra pelo SHA.
      const hashes = await stashHashes(cwd);
      const index = hashes.indexOf(back.stash);
      // Sumiu porque a pessoa apagou o stash na mao. Nao e erro: o HEAD ja
      // voltou, que e o essencial, e nao ha o que reaplicar.
      if (index >= 0) {
        const popped = await step(["stash", "pop", `stash@{${index}}`], { cwd });
        if (!popped.ok) return popped;
      }
    }

    return reset;
  });
}
