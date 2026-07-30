/**
 * Construtores PUROS de argv e de corpo REST para os dialogos.
 *
 * Todo dialogo que executa comando mostra o argv cru antes de executar, e o
 * corpo que ele manda tem de casar campo a campo com `web/src/lib/api.ts`.
 * Manter as duas coisas aqui, puras e sem import de runtime, e o que permite
 * ao teste `dnd/__tests__/api-contract.test.mjs` provar isso sem navegador.
 *
 * O par (preview, body) anda junto de proposito: se um mudar sem o outro, a UI
 * passa a mentir sobre o que vai executar.
 */
import type {
  PendingOperationKind,
  RebaseInteractiveAction,
  RebaseInteractiveRequest,
  SquashRequest,
} from "@/types/git";

/** Duplicado de `@/lib/utils` de proposito: este modulo nao pode importar
 *  runtime nenhum (ver cabecalho). */
const shortHash = (hash: string) => hash.slice(0, 7);

/**
 * As rotas usadas pelos dialogos. Todas existem em `web/src/lib/api.ts`.
 */
export const REQUEST_ENDPOINTS = {
  /** api.cherryPick */
  cherryPick: "/ops/cherry-pick",
  /** api.merge */
  merge: "/ops/merge",
  /** api.rebase */
  rebase: "/ops/rebase",
  /** api.squash */
  squash: "/ops/squash",
  /** api.push */
  push: "/net/push",
  /** api.deleteBranchLocal */
  deleteBranchLocal: "/branch/delete-local",
  /** api.deleteBranchRemote */
  deleteBranchRemote: "/branch/delete-remote",
  /** api.addRemote */
  addRemote: "/remotes/add",
  /** api.createBranch */
  createBranch: "/branch/create",
  /** api.createTag */
  createTag: "/tag/create",
  /** api.abort */
  abort: "/ops/abort",
  /** api.continueOp */
  continueOp: "/ops/continue",
} as const;

/* ------------------------------------------------------------------ */
/* Push                                                                */
/* ------------------------------------------------------------------ */

export interface PushOptions {
  remote: string;
  branch?: string;
  setUpstream?: boolean;
  tags?: boolean;
  forceWithLease?: boolean;
}

export interface PushBody {
  remote: string;
  branch?: string;
  setUpstream?: boolean;
  tags?: boolean;
  forceWithLease?: boolean;
}

export function pushBody(o: PushOptions): PushBody {
  return {
    remote: o.remote,
    ...(o.branch ? { branch: o.branch } : {}),
    ...(o.setUpstream ? { setUpstream: true } : {}),
    ...(o.tags ? { tags: true } : {}),
    ...(o.forceWithLease ? { forceWithLease: true } : {}),
  };
}

export function pushPreview(o: PushOptions): string[] {
  const argv = ["push"];
  if (o.forceWithLease) argv.push("--force-with-lease");
  if (o.setUpstream) argv.push("--set-upstream");
  if (o.tags) argv.push("--tags");
  argv.push(o.remote);
  if (o.branch) argv.push(o.branch);
  return argv;
}

/* ------------------------------------------------------------------ */
/* Squash — GIT_SEQUENCE_EDITOR + proxy-editor                         */
/* ------------------------------------------------------------------ */

export interface SquashOptions {
  /** hashes em ordem TOPOLOGICA: o primeiro e o mais ANTIGO e continua `pick` */
  commits: string[];
  message?: string;
  fixup?: boolean;
  /** true quando o mais antigo e commit raiz — o rebase precisa de --root */
  root?: boolean;
}

export function squashRequest(o: SquashOptions): SquashRequest {
  return {
    commits: o.commits,
    ...(o.message ? { message: o.message } : {}),
    ...(o.fixup ? { fixup: true } : {}),
  };
}

/** `git rebase -i <primeiro>^`, ou `--root` quando o mais antigo e raiz. */
export function squashPreview(o: SquashOptions): string[] {
  if (o.root || o.commits.length === 0) return ["rebase", "-i", "--root"];
  return ["rebase", "-i", `${shortHash(o.commits[0])}^`];
}

export interface SquashPlanEntry {
  action: "pick" | "squash" | "fixup";
  hash: string;
}

/** O `git-rebase-todo` como o proxy-editor vai deixa-lo, para exibir antes. */
export function squashPlan(o: SquashOptions): SquashPlanEntry[] {
  return o.commits.map((hash, i) => ({
    action: i === 0 ? "pick" : o.fixup ? "fixup" : "squash",
    hash,
  }));
}

/* ------------------------------------------------------------------ */
/* Branches                                                            */
/* ------------------------------------------------------------------ */

export interface DeleteLocalBranchOptions {
  name: string;
  force?: boolean;
}

export function deleteBranchLocalBody(o: DeleteLocalBranchOptions): {
  name: string;
  force?: boolean;
} {
  return { name: o.name, ...(o.force ? { force: true } : {}) };
}

export function deleteBranchLocalPreview(o: DeleteLocalBranchOptions): string[] {
  return ["branch", o.force ? "-D" : "-d", o.name];
}

export interface DeleteRemoteBranchOptions {
  remote: string;
  /** nome SEM o prefixo do remoto: "main", nao "origin/main" */
  name: string;
}

export function deleteBranchRemoteBody(o: DeleteRemoteBranchOptions): {
  remote: string;
  name: string;
} {
  return { remote: o.remote, name: o.name };
}

export function deleteBranchRemotePreview(o: DeleteRemoteBranchOptions): string[] {
  return ["push", o.remote, "--delete", o.name];
}

export interface CreateBranchOptions {
  name: string;
  startPoint?: string;
  checkout?: boolean;
}

export function createBranchBody(o: CreateBranchOptions): {
  name: string;
  startPoint?: string;
  checkout?: boolean;
} {
  return {
    name: o.name,
    ...(o.startPoint ? { startPoint: o.startPoint } : {}),
    ...(o.checkout ? { checkout: true } : {}),
  };
}

export function createBranchPreview(o: CreateBranchOptions): string[] {
  const tail = o.startPoint ? [o.startPoint] : [];
  return o.checkout ? ["checkout", "-b", o.name, ...tail] : ["branch", o.name, ...tail];
}

/* ------------------------------------------------------------------ */
/* Tags                                                                */
/* ------------------------------------------------------------------ */

export interface CreateTagOptions {
  name: string;
  ref?: string;
  message?: string;
}

export function createTagBody(o: CreateTagOptions): {
  name: string;
  ref?: string;
  message?: string;
} {
  return {
    name: o.name,
    ...(o.ref ? { ref: o.ref } : {}),
    ...(o.message ? { message: o.message } : {}),
  };
}

export function createTagPreview(o: CreateTagOptions): string[] {
  const ref = o.ref ? [o.ref] : [];
  // Tag com mensagem e anotada (-a -m); sem mensagem e leve.
  return o.message
    ? ["tag", "-a", o.name, ...ref, "-m", o.message]
    : ["tag", o.name, ...ref];
}

/* ------------------------------------------------------------------ */
/* Remotos                                                             */
/* ------------------------------------------------------------------ */

export interface AddRemoteOptions {
  name: string;
  url: string;
}

export function addRemoteBody(o: AddRemoteOptions): { name: string; url: string } {
  return { name: o.name, url: o.url };
}

export function addRemotePreview(o: AddRemoteOptions): string[] {
  return ["remote", "add", o.name, o.url];
}

/** https(s)://host/caminho */
const HTTPS_URL = /^https?:\/\/[^\s/@]+(?::\d+)?\/\S+$/;
/** ssh://[user@]host[:porta]/caminho */
const SSH_URL = /^ssh:\/\/(?:[^\s/@]+@)?[^\s/:]+(?::\d+)?\/\S+$/;
/** scp-like: [user@]host:caminho */
const SCP_LIKE = /^(?:[^\s/@]+@)?[^\s/:]+:[^\s/][^\s]*$/;

export type RemoteUrlKind = "https" | "ssh" | "scp" | "invalid";

/** Classifica a url de um remoto. `https` e o unico que passa pelo trampolim
 *  GIT_ASKPASS e portanto pode pedir credencial na UI. */
export function classifyRemoteUrl(url: string): RemoteUrlKind {
  const value = url.trim();
  if (HTTPS_URL.test(value)) return "https";
  if (SSH_URL.test(value)) return "ssh";
  if (SCP_LIKE.test(value)) return "scp";
  return "invalid";
}

/** Nomes de remoto que o git aceita. */
export const isValidRemoteName = (name: string) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name.trim());

/* ------------------------------------------------------------------ */
/* Refs em geral                                                       */
/* ------------------------------------------------------------------ */

/**
 * Validacao de nome de ref no espirito do `git check-ref-format`: sem espaco,
 * sem `~^:?*[\`, sem `..`, sem `@{`, sem barra ou ponto nas pontas.
 */
export function isValidRefName(name: string): boolean {
  const value = name.trim();
  if (!value) return false;
  if (/[\s~^:?*[\\]/.test(value)) return false;
  if (value.includes("..") || value.includes("@{")) return false;
  if (value.startsWith("/") || value.endsWith("/")) return false;
  if (value.startsWith(".") || value.endsWith(".")) return false;
  if (value.endsWith(".lock")) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Operacao pendente (conflito)                                        */
/* ------------------------------------------------------------------ */

/** Os unicos valores que `/ops/abort` e `/ops/continue` aceitam. */
export type ResumableOpKind = "rebase" | "merge" | "cherry-pick" | "revert";

/** `rebase-interactive` volta a ser `rebase` na rota; `bisect` nao tem rota. */
export function resumableKind(kind: PendingOperationKind): ResumableOpKind | null {
  switch (kind) {
    case "rebase":
    case "rebase-interactive":
      return "rebase";
    case "merge":
      return "merge";
    case "cherry-pick":
      return "cherry-pick";
    case "revert":
      return "revert";
    case "bisect":
      return null;
  }
}

export function resumeBody(kind: ResumableOpKind): { kind: ResumableOpKind } {
  return { kind };
}

export function abortPreview(kind: ResumableOpKind): string[] {
  return [kind, "--abort"];
}

export function continuePreview(kind: ResumableOpKind): string[] {
  return [kind, "--continue"];
}

/* ------------------------------------------------------------------ */
/* Rebase interativo visual                                            */
/* ------------------------------------------------------------------ */

export interface RebaseInteractiveOptions {
  /** hashes em ordem TOPOLOGICA: do mais ANTIGO para o mais NOVO */
  commits: string[];
  /** acao de cada commit */
  actionMap: Record<string, RebaseInteractiveAction>;
  /** mensagens novas (so para reword) */
  messageMap: Record<string, string>;
  /** base explicitamente fornecida */
  onto?: string;
  /** true quando o mais antigo e commit raiz */
  root?: boolean;
}

export function rebaseInteractiveBody(o: RebaseInteractiveOptions): RebaseInteractiveRequest {
  return {
    actions: o.commits.map((hash) => {
      const action = o.actionMap[hash] || "pick";
      const entry: { hash: string; action: RebaseInteractiveAction; newMessage?: string } = {
        hash,
        action,
      };
      if (action === "reword" && o.messageMap[hash]) {
        entry.newMessage = o.messageMap[hash];
      }
      return entry as { hash: string; action: RebaseInteractiveAction };
    }),
    ...(o.onto ? { onto: o.onto } : {}),
  };
}

export function rebaseInteractivePreview(o: RebaseInteractiveOptions): string[] {
  if (o.root || o.commits.length === 0) return ["rebase", "-i", "--root"];
  const base = o.onto ?? `${shortHash(o.commits[0])}^`;
  return ["rebase", "-i", base];
}

export interface RebaseInteractivePlanEntry {
  action: RebaseInteractiveAction;
  hash: string;
}

export function rebaseInteractivePlan(o: RebaseInteractiveOptions): RebaseInteractivePlanEntry[] {
  return o.commits.map((hash) => ({
    action: o.actionMap[hash] || "pick",
    hash,
  }));
}
