/**
 * DIALOGOS — fronteira publica de `src/dialogs`.
 * Dono: a frente "dnd/dialogos".
 *
 * ── O que o shell monta ───────────────────────────────────────────────
 *
 *   <DialogHost intent={pendingIntent} onClose={() => setPendingIntent(null)} />
 *
 * Um so, em qualquer lugar da arvore. Ele cuida de TODOS os dialogos.
 *
 * ── Como um painel abre um dialogo ────────────────────────────────────
 *
 * Sem prop drilling: importa `openDialog` e chama com uma spec.
 *
 *   import { openDialog } from "@/dialogs";
 *
 *   openDialog({ kind: "push" })                              // remoto/ramo pelo dialogo
 *   openDialog({ kind: "push", remote: "origin", branch })    // ja preenchido
 *   openDialog({ kind: "squash", commits: selection.commits })// hashes em qualquer ordem
 *   openDialog({ kind: "delete-branch-local", name: "feature" })
 *   openDialog({ kind: "delete-branch-remote", remote: "origin", name: "feature" })
 *   openDialog({ kind: "add-remote" })
 *   openDialog({ kind: "create-branch", startPoint: hash })
 *   openDialog({ kind: "create-tag", ref: hash })
 *   openDialog({ kind: "conflict" })                          // reabre o painel de conflito
 *
 * `closeDialog()` fecha o que estiver aberto e `useDialogState()` devolve a
 * spec atual (ou null) — util para um botao refletir que ja esta aberto.
 *
 * Dois dialogos NAO se abrem por aqui, porque nao nascem de um clique:
 *
 *   - Credenciais: aparece sozinho quando `state.credentialPrompt` deixa de
 *     ser null (o trampolim GIT_ASKPASS pediu). E o que impede o push por
 *     https de travar do outro lado.
 *   - Conflito: aparece sozinho quando `repo.head.pending` existe. Pode ser
 *     fechado e reaberto com `openDialog({ kind: "conflict" })`.
 *
 * Regra de execucao: nenhum dialogo chama `fetch` direto. Tudo passa por
 * `runOperation` do store, que liga o indicador de operacao, reporta no
 * console e nos toasts e faz o refresh.
 */
export { DialogHost } from "./DialogHost";
export { openDialog, closeDialog, useDialogState, getDialog } from "./store";
export type { DialogSpec, DialogKind } from "./store";
export type { DialogHostProps } from "@/types/modules";

/* Construtores puros de argv e corpo REST — a mesma fonte que os dialogos
 * usam. Exportados para quem precisar mostrar o comando antes de abrir o
 * dialogo (um tooltip de botao, por exemplo). */
export {
  REQUEST_ENDPOINTS,
  pushBody,
  pushPreview,
  squashRequest,
  squashPreview,
  squashPlan,
  deleteBranchLocalBody,
  deleteBranchLocalPreview,
  deleteBranchRemoteBody,
  deleteBranchRemotePreview,
  createBranchBody,
  createBranchPreview,
  createTagBody,
  createTagPreview,
  addRemoteBody,
  addRemotePreview,
  classifyRemoteUrl,
  isValidRemoteName,
  isValidRefName,
  resumableKind,
  resumeBody,
  abortPreview,
  continuePreview,
} from "./requests";
export type {
  PushOptions,
  SquashOptions,
  SquashPlanEntry,
  RemoteUrlKind,
  ResumableOpKind,
} from "./requests";
