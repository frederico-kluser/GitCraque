/**
 * Cliente REST tipado — a superficie COMPLETA do backend.
 * Toda rota que existe esta aqui; nada fora daqui deve ser chamado por fetch cru.
 */
import type {
  AgentRunPayload,
  AgentSource,
  AiStatusPayload,
  ApiError,
  Branch,
  CommitDetail,
  CredentialsPayload,
  DiffPayload,
  FavoritesPayload,
  FileContentPayload,
  FsListPayload,
  FsRootsPayload,
  GitCommandResult,
  LogPayload,
  RecentReposPayload,
  RefsPayload,
  RepoPayload,
  RepoSearchPayload,
  ScanPayload,
  SquashRequest,
  SquashResult,
  StatusPayload,
  TranscriptionPayload,
  UndoStatePayload,
  WorktreesPayload,
} from "@/types/git";
import { getLocale } from "@/i18n";

const BASE = "/api";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly payload: ApiError;
  constructor(status: number, payload: ApiError) {
    super(payload.error || `HTTP ${status}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.payload = payload;
  }
  /** resultado do comando git quando o erro veio de um child_process */
  get command(): GitCommandResult | undefined {
    return this.payload.command;
  }
}

/**
 * ACRESCENTADO (aditivo — nenhuma rota mudou): o idioma vai em TODA requisicao.
 *
 * O backend tem catalogo proprio de erro (`server/src/i18n.mjs`) e escolhe a
 * lingua por requisicao. Sem este cabecalho ele cairia no `accept-language` do
 * navegador, que nao sabe da escolha feita no seletor da interface.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      "x-gitcraque-lang": getLocale(),
      ...init?.headers,
    },
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text };
    }
  }
  if (!res.ok) throw new ApiRequestError(res.status, (body ?? { error: res.statusText }) as ApiError);
  return body as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
};

export const api = {
  /* ---- estado geral ---- */
  repo: () => get<RepoPayload>("/repo"),
  health: () => get<{ ok: boolean; version: string }>("/health"),

  /* ---- historico ----
   * O backend roda exatamente:
   *   git log --pretty=format:"%H|%P|%an|%ae|%s|%ar|%d" --all --topo-order
   */
  log: (opts: { limit?: number; skip?: number } = {}) =>
    get<LogPayload>(`/log${qs({ limit: opts.limit, skip: opts.skip })}`),
  commit: (hash: string) => get<CommitDetail>(`/commit/${encodeURIComponent(hash)}`),
  diff: (opts: { hash?: string; path?: string; staged?: boolean; against?: string }) =>
    get<DiffPayload[]>(`/diff${qs(opts as Record<string, string | boolean | undefined>)}`),

  /* ---- refs ---- */
  refs: () => get<RefsPayload>("/refs"),
  status: () => get<StatusPayload>("/status"),

  /* ---- worktrees (git worktree list --porcelain) ---- */
  worktrees: () => get<WorktreesPayload>("/worktrees"),
  /**
   * NAO faz checkout: o servidor executa process.chdir(path) e emite
   * `cwd:changed` por WebSocket para a UI recarregar a View Tree inteira.
   */
  switchWorktree: (path: string) => post<WorktreesPayload>("/worktrees/switch", { path }),
  addWorktree: (body: { path: string; branch?: string; newBranch?: string; ref?: string }) =>
    post<GitCommandResult>("/worktrees/add", body),
  removeWorktree: (body: { path: string; force?: boolean }) =>
    post<GitCommandResult>("/worktrees/remove", body),
  pruneWorktrees: () => post<GitCommandResult>("/worktrees/prune"),

  /* ---- branches ---- */
  createBranch: (body: { name: string; startPoint?: string; checkout?: boolean }) =>
    post<GitCommandResult>("/branch/create", body),
  /**
   * git branch -d / -D. Com `remote`, o `git push <remote> --delete` vai junto,
   * sob um lock so; sem branch correspondente no remoto o push e pulado e a
   * resposta traz `skippedRemote`.
   */
  deleteBranchLocal: (body: { name: string; force?: boolean; remote?: string }) =>
    post<GitCommandResult>("/branch/delete-local", body),
  /** git push <remote> --delete <name> */
  deleteBranchRemote: (body: { remote: string; name: string }) =>
    post<GitCommandResult>("/branch/delete-remote", body),
  /**
   * Exclusao em cascata: solta a worktree que prende a branch (removendo-a, ou
   * soltando o HEAD quando e a principal), descarta o codigo nao commitado,
   * apaga a branch local e, com `remote`, a do remoto.
   *
   * Pode mudar o `process.cwd()` do servidor — vem `cwdChanged` na resposta e
   * `cwd:changed` pelo WebSocket.
   */
  deleteBranchAll: (body: { name: string; remote?: string }) =>
    post<GitCommandResult>("/branch/delete-all", body),
  renameBranch: (body: { from: string; to: string; force?: boolean }) =>
    post<GitCommandResult>("/branch/rename", body),
  checkout: (body: { ref: string; createBranch?: string; force?: boolean }) =>
    post<GitCommandResult>("/checkout", body),

  /* ---- remotos (git remote -v) ---- */
  remotes: () => get<{ remotes: RepoPayload["remotes"] }>("/remotes"),
  addRemote: (body: { name: string; url: string }) => post<GitCommandResult>("/remotes/add", body),
  removeRemote: (body: { name: string }) => post<GitCommandResult>("/remotes/remove", body),
  setRemoteUrl: (body: { name: string; url: string; push?: boolean }) =>
    post<GitCommandResult>("/remotes/set-url", body),

  /* ---- rede (usam o trampolim GIT_ASKPASS) ---- */
  fetch: (body: { remote?: string; all?: boolean; prune?: boolean; tags?: boolean } = {}) =>
    post<GitCommandResult>("/net/fetch", body),
  pull: (body: { remote?: string; branch?: string; rebase?: boolean } = {}) =>
    post<GitCommandResult>("/net/pull", body),
  push: (body: {
    remote: string;
    branch?: string;
    force?: boolean;
    forceWithLease?: boolean;
    setUpstream?: boolean;
    tags?: boolean;
  }) => post<GitCommandResult>("/net/push", body),

  /* ---- operacoes semanticas do DND ---- */
  cherryPick: (body: { commits: string[]; onto?: string; noCommit?: boolean; mainline?: number }) =>
    post<GitCommandResult>("/ops/cherry-pick", body),
  merge: (body: { source: string; into?: string; noFf?: boolean; squash?: boolean; message?: string }) =>
    post<GitCommandResult>("/ops/merge", body),
  rebase: (body: { source: string; onto: string; autostash?: boolean }) =>
    post<GitCommandResult>("/ops/rebase", body),
  reset: (body: { ref: string; mode: "soft" | "mixed" | "hard" }) =>
    post<GitCommandResult>("/ops/reset", body),
  revert: (body: { hash: string; noCommit?: boolean }) => post<GitCommandResult>("/ops/revert", body),
  /** GIT_SEQUENCE_EDITOR="node proxy-editor.mjs" git rebase -i <base> */
  squash: (body: SquashRequest) => post<SquashResult>("/ops/squash", body),
  abort: (body: { kind: "rebase" | "merge" | "cherry-pick" | "revert" }) =>
    post<GitCommandResult>("/ops/abort", body),
  continueOp: (body: { kind: "rebase" | "merge" | "cherry-pick" | "revert" }) =>
    post<GitCommandResult>("/ops/continue", body),

  /* ---- desfazer / refazer ----
   * Nenhuma das tres manda sha: o passo sai do cursor do servidor sobre o
   * reflog. Deixar a UI escolher o alvo seria deixar a UI escolher para onde o
   * `reset --hard` aponta.
   */
  undoState: () => get<UndoStatePayload>("/undo/state"),
  undo: () => post<GitCommandResult>("/undo"),
  redo: () => post<GitCommandResult>("/redo"),

  /* ---- staging / commit ---- */
  stage: (body: { paths: string[] }) => post<GitCommandResult>("/stage", body),
  unstage: (body: { paths: string[] }) => post<GitCommandResult>("/unstage", body),
  discard: (body: { paths: string[] }) => post<GitCommandResult>("/discard", body),
  doCommit: (body: { message: string; amend?: boolean; signoff?: boolean }) =>
    post<GitCommandResult>("/commit", body),

  /* ---- stash ---- */
  stashPush: (body: { message?: string; includeUntracked?: boolean } = {}) =>
    post<GitCommandResult>("/stash/push", body),
  stashApply: (body: { ref: string; pop?: boolean }) => post<GitCommandResult>("/stash/apply", body),
  stashDrop: (body: { ref: string }) => post<GitCommandResult>("/stash/drop", body),

  /* ---- tags ---- */
  createTag: (body: { name: string; ref?: string; message?: string }) =>
    post<GitCommandResult>("/tag/create", body),
  deleteTag: (body: { name: string; remote?: string }) => post<GitCommandResult>("/tag/delete", body),

  /* ---- cofre de credenciais do trampolim ---- */
  credentials: () => get<CredentialsPayload>("/credentials"),
  saveCredential: (body: { host: string; username: string; token: string }) =>
    post<{ ok: true }>("/credentials", body),
  deleteCredential: (host: string) => del<{ ok: true }>(`/credentials/${encodeURIComponent(host)}`),

  /* ---- seletor de repositorios da maquina ----
   * `openRepo` e irma de `switchWorktree`: as duas fazem process.chdir() no
   * servidor e disparam `cwd:changed`; nenhuma faz `git checkout`. A diferenca
   * e a guarda — a de worktree confere contra `git worktree list`, esta exige
   * que o diretorio seja um repositorio git de verdade.
   */
  fsRoots: () => get<FsRootsPayload>("/fs/roots"),
  fsList: (path?: string) => get<FsListPayload>(`/fs/list${qs({ path })}`),
  recentRepos: () => get<RecentReposPayload>("/repos/recent"),
  forgetRepo: (path: string) => post<RecentReposPayload>("/repos/recent/remove", { path }),
  scanRepos: (body: { roots?: string[]; depth?: number; limit?: number; budgetMs?: number } = {}) =>
    post<ScanPayload>("/repos/scan", body),
  /* Irma da varredura, com custo oposto: `scanRepos` toca o disco sob
   * orcamento, esta le o indice que aquela (e a navegacao) alimentaram. Por
   * isso pode ser chamada a cada tecla. */
  searchRepos: (q: string, limit?: number) =>
    get<RepoSearchPayload>(`/repos/search${qs({ q, limit })}`),
  openRepo: (path: string) => post<RepoPayload>("/repos/open", { path }),
  initRepo: (body: { path: string; bare?: boolean; initialBranch?: string }) =>
    post<RepoPayload>("/repos/init", body),
  /** git clone com barra de progresso via op:progress. Ao terminar, ja abre o repo clonado. */
  clone: (body: { url: string; path: string; branch?: string; bare?: boolean }) =>
    post<RepoPayload>("/repos/clone", body),

  /* ---- projetos favoritos (escolha explicita, nao historico) ---- */
  favorites: () => get<FavoritesPayload>("/repos/favorites"),
  addFavorite: (body: { path: string; label?: string }) =>
    post<FavoritesPayload>("/repos/favorites/add", body),
  removeFavorite: (path: string) => post<FavoritesPayload>("/repos/favorites/remove", { path }),
  reorderFavorites: (paths: string[]) =>
    post<FavoritesPayload>("/repos/favorites/reorder", { paths }),

  /* ---- conteudo de arquivo para o visualizador ----
   * `hash` ausente = working tree. Usado pelo markdown renderizado e pela
   * exibicao crua; o diff continua vindo de `api.diff`.
   */
  file: (opts: { path: string; hash?: string }) =>
    get<FileContentPayload>(`/file${qs({ path: opts.path, hash: opts.hash })}`),

  /* ---- escotilha: qualquer comando git cru ---- */
  raw: (body: { args: string[] }) => post<GitCommandResult>("/raw", body),

  /* ---- agente: microfone -> transcricao -> pi coding agent ----
   * Uma unica chave da OpenRouter paga as duas pernas. Ela NUNCA chega ao
   * navegador: `aiKey` so a envia, e `aiStatus` devolve apenas a mascara.
   *
   * `runAgent` responde na hora com o id da sessao; o andamento chega pelo
   * WebSocket (`ai:event`, `ai:done`, `ai:error`), porque uma sessao leva
   * minutos e nenhum navegador segura um POST por tanto tempo.
   */
  aiStatus: () => get<AiStatusPayload>("/ai/status"),
  aiSaveKey: (key: string) => post<{ ok: true; masked: string }>("/ai/key", { key }),
  aiClearKey: () => del<{ ok: true; removed: boolean }>("/ai/key"),
  transcribe: (body: { audio: string; format?: string; language?: string }) =>
    post<TranscriptionPayload>("/ai/transcribe", body),
  runAgent: (body: { utterance: string; source: AgentSource }) =>
    post<AgentRunPayload>("/ai/run", body),
  /* Irma de `runAgent`, sem corpo: o que resolver sai do estado pendente que o
   * servidor ja tem. Roda com o raciocinio no maximo — o resultado vira commit. */
  resolveConflictsWithAgent: () => post<AgentRunPayload>("/ai/resolve-conflicts", {}),
  abortAgent: () => post<{ ok: true; aborted: boolean }>("/ai/abort", {}),
};

export type Api = typeof api;

/** Helper para branch por nome, usado por varios paineis. */
export const findBranch = (branches: Branch[], name: string) =>
  branches.find((b) => b.name === name || b.fullName === name);
