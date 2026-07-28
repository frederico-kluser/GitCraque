/**
 * O portao da sessao do agente.
 *
 * Resolve um problema concreto: enquanto o pi faz um rebase, a pessoa ainda
 * pode arrastar um commit na interface e disparar um segundo git mutante no
 * mesmo repositorio. Dois processos reescrevendo refs ao mesmo tempo terminam
 * em `index.lock` ou em historia perdida.
 *
 * ── Por que NAO da para reusar o lock que ja existe ──────────────────
 * O caminho obvio seria segurar o `withMutationLock` do `git/exec.mjs` durante
 * a sessao inteira. Nao serve: `withMutationLock` chama
 * `watcher.beginSuppression()` (`git/exec.mjs:71`), e o watcher suprimido para
 * de emitir `repo:changed`. A interface congelaria justamente durante os
 * minutos em que o agente esta mudando tudo — o oposto do que se quer.
 *
 * Entao o portao e proprio e faz so metade do trabalho do lock: recusa mutacao
 * vinda da INTERFACE e deixa o watcher falar. As escritas do pi chegam como
 * `repo:changed` e o grafo repinta ao vivo.
 *
 * O agente nao passa por aqui — ele roda git no proprio processo, por fora do
 * `execGit`. E exatamente por isso que a guarda funciona: ela ve so o lado que
 * precisa ser barrado.
 */
import { randomUUID } from "node:crypto";

import { runtime } from "../runtime.mjs";

/**
 * @typedef {object} SessionState
 * @property {string} id
 * @property {number} startedAt
 * @property {string} utterance
 * @property {"voice" | "text"} source
 * @property {import("node:child_process").ChildProcess | null} child
 */

/** @type {SessionState | null} */
let current = null;

/** Ha uma sessao em voo? Lido pela guarda do `execGit`. */
export function isAgentBusy() {
  return current !== null;
}

/** O retrato publico da sessao, sem o handle do processo. */
export function sessionInfo() {
  if (!current) return null;
  return {
    id: current.id,
    startedAt: current.startedAt,
    utterance: current.utterance,
    source: current.source,
  };
}

/**
 * Recusa uma mutacao vinda da interface enquanto o agente trabalha.
 * Chamada de `git/exec.mjs`, no unico ponto por onde toda mutacao passa.
 */
export function assertNotBusy() {
  if (!current) return;
  const error = new Error("error.aiBusy");
  error.status = 409;
  throw error;
}

/**
 * Abre a sessao. Uma por vez — a segunda tentativa e recusada em vez de
 * enfileirada, porque uma fila de comandos de voz executa fora de ordem em
 * relacao ao que a pessoa via quando falou.
 *
 * @param {{utterance: string, source: "voice" | "text"}} params
 * @returns {SessionState}
 */
export function begin({ utterance, source }) {
  if (current) {
    const error = new Error("error.aiBusy");
    error.status = 409;
    throw error;
  }
  current = {
    id: randomUUID(),
    startedAt: Date.now(),
    utterance,
    source,
    child: null,
  };
  runtime.hub?.broadcast({
    type: "ai:event",
    id: current.id,
    event: { kind: "session-start", utterance, source },
  });
  return current;
}

/**
 * Guarda o processo filho para que o abort tenha o que matar.
 * @param {import("node:child_process").ChildProcess} child
 */
export function attachChild(child) {
  if (current) current.child = child;
}

/**
 * Repassa um evento do agente pelo WebSocket, carimbado com a sessao.
 * @param {object} event
 */
export function emit(event) {
  if (!current) return;
  runtime.hub?.broadcast({ type: "ai:event", id: current.id, event });
}

/**
 * Fecha a sessao e anuncia o resultado.
 * @param {{ok: boolean, text?: string, cost?: number, error?: string}} result
 */
export function finish(result) {
  if (!current) return;
  const id = current.id;
  current = null;
  runtime.hub?.broadcast({
    type: result.ok ? "ai:done" : "ai:error",
    id,
    text: result.text ?? "",
    cost: result.cost ?? 0,
    error: result.error ?? "",
  });
}

/**
 * Mata a sessao em voo. Best-effort: `SIGTERM` primeiro para o pi ter chance de
 * fechar o que abriu.
 *
 * O que fica pelo caminho e responsabilidade de quem abortou — um rebase morto
 * no meio deixa o repositorio em estado de rebase, e a interface ja sabe
 * mostrar isso e oferecer continuar ou abortar.
 *
 * @returns {boolean} true quando havia algo para matar
 */
export function abort() {
  if (!current) return false;
  current.child?.kill("SIGTERM");
  return true;
}

/** So para o teste: zera o portao entre casos. */
export function resetForTest() {
  current = null;
}
