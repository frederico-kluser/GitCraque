/**
 * Store dos dialogos — mesmo padrao de `state/store.ts`: um objeto mutavel e
 * `useSyncExternalStore`, sem dependencia externa.
 *
 * Existe para que qualquer painel abra um dialogo sem prop drilling:
 *
 *   import { openDialog } from "@/dialogs";
 *   openDialog({ kind: "push" });
 *   openDialog({ kind: "squash", commits: selection });
 *
 * So um dialogo de spec fica aberto por vez (abrir outro substitui). Os dois
 * dialogos dirigidos por estado — credenciais e conflito — vivem fora daqui:
 * eles seguem `state/store.ts`, nao uma chamada de painel.
 */
import { useSyncExternalStore } from "react";

/** As specs que `openDialog` aceita. Esta lista e a API publica do modulo. */
export type DialogSpec =
  /** Squash dos commits selecionados no grafo (hashes em qualquer ordem). */
  | { kind: "squash"; commits: string[] }
  /** Rebase interativo visual com acao por commit. */
  | { kind: "interactive-rebase"; commits: string[] }
  /** Push com escolha de remoto, ramo, upstream, tags e force-with-lease. */
  | { kind: "push"; remote?: string; branch?: string }
  /** `git branch -d`, com escalonamento para `-D` quando o git recusar. */
  | { kind: "delete-branch-local"; name: string }
  /** `git push <remote> --delete <name>` — `name` sem o prefixo do remoto. */
  | { kind: "delete-branch-remote"; name: string; remote?: string }
  /** `git remote add` com validacao de url. */
  | { kind: "add-remote"; name?: string; url?: string }
  /** `git branch <name> [startPoint]`. */
  | { kind: "create-branch"; startPoint?: string }
  /** `git tag <name> [ref]`. */
  | { kind: "create-tag"; ref?: string }
  /** Reabre o painel de conflito da operacao pendente. */
  | { kind: "conflict" }
  /** Seletor de repositorios da maquina: recentes, varredura e navegacao. */
  | { kind: "repo-picker" }
  /** Clone de repositorio remoto: url + caminho + branch. */
  | { kind: "clone" };

export type DialogKind = DialogSpec["kind"];

let current: DialogSpec | null = null;
const listeners = new Set<() => void>();

const emit = () => {
  for (const l of listeners) l();
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const getDialog = () => current;

/** Abre um dialogo, substituindo o que estiver aberto. */
export function openDialog(spec: DialogSpec) {
  current = spec;
  emit();
}

export function closeDialog() {
  if (current === null) return;
  current = null;
  emit();
}

/** A spec aberta agora, ou null. */
export function useDialogState(): DialogSpec | null {
  return useSyncExternalStore(subscribe, getDialog, getServerSnapshot);
}

const getServerSnapshot = (): DialogSpec | null => null;
