/**
 * Store central do GitCraque — a costura entre os quatro modulos do app.
 *
 * Sem dependencia externa: um objeto mutavel + `useSyncExternalStore`.
 * Todo modulo (grafo, dnd, paineis, dialogos) LE daqui e ESCREVE pelas acoes;
 * ninguem guarda copia propria do estado do repositorio.
 *
 * O ciclo de vida que importa:
 *   1. `bootstrap()` conecta o WebSocket e carrega tudo.
 *   2. `cwd:changed` (o servidor deu process.chdir numa worktree) descarta o
 *      estado inteiro e recarrega — e isso e o unico caminho de "troca de
 *      worktree" do produto; nunca ha `git checkout` envolvido.
 *   3. `repo:changed` do watcher faz refresh direcionado por motivo.
 */
import { useCallback, useSyncExternalStore } from "react";
import { api, ApiRequestError } from "@/lib/api";
import { socket, type ConnectionState } from "@/lib/ws";
import type {
  ConsoleLine,
  CredentialPrompt,
  DragIntent,
  GitCommandResult,
  LogPayload,
  RefsPayload,
  RepoChangeReason,
  RepoPayload,
  StatusPayload,
  Worktree,
  WorktreesPayload,
} from "@/types/git";

/* ------------------------------------------------------------------ */
/* Forma do estado                                                     */
/* ------------------------------------------------------------------ */

export type ToastTone = "info" | "success" | "error" | "warning";

export interface AppToast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  /** argv do comando git que gerou o toast, para o botao "ver comando" */
  argv?: string[];
  createdAt: number;
}

export interface Selection {
  /** hashes selecionados, em ordem de clique. Multi-selecao alimenta o squash. */
  commits: string[];
  /** o commit "focado" — o que abre o painel de detalhe */
  primary: string | null;
  /** ref selecionada no rail (branch/tag/remote) */
  ref: string | null;
}

/**
 * Pedido de "leve a View Tree ate este commit e marque a linha".
 *
 * O `nonce` existe porque clicar DUAS vezes na mesma branch tem de rolar de
 * novo: so o hash mudaria nada na segunda vez. O grafo observa o nonce, nao o
 * hash.
 */
export interface RevealRequest {
  hash: string;
  nonce: number;
  /** de onde veio o pedido, para o grafo escolher a enfase */
  origin: "ref" | "command" | "detail";
}

/** Arquivo aberto no visualizador (diff, markdown renderizado ou cru). */
export interface OpenFile {
  path: string;
  /** commit de onde o conteudo sai; null = working tree */
  hash: string | null;
  /** true quando o arquivo veio do painel de alteracoes, nao de um commit */
  fromWorkingTree: boolean;
}

export interface AppState {
  repo: RepoPayload | null;
  log: LogPayload | null;
  refs: RefsPayload | null;
  status: StatusPayload | null;
  worktrees: WorktreesPayload | null;

  loading: {
    repo: boolean;
    log: boolean;
    refs: boolean;
    status: boolean;
    /** true durante qualquer operacao que muta o repo (merge, rebase, push...) */
    operation: boolean;
  };
  /** rotulo da operacao em curso, para a barra de progresso */
  operationLabel: string | null;

  fatal: string | null;
  connection: ConnectionState;

  selection: Selection;

  /** console de comandos crus — o que a UI mostra no painel inferior */
  console: ConsoleLine[];
  toasts: AppToast[];

  /** pedido de rolar a View Tree ate um commit e marcar a linha */
  reveal: RevealRequest | null;
  /** arquivo aberto no visualizador do rodape (diff / markdown / cru) */
  openFile: OpenFile | null;

  /** intencao vinda do motor de DND, aguardando confirmacao no dialogo */
  pendingIntent: DragIntent | null;
  /** pedido vivo do trampolim de askpass */
  credentialPrompt: CredentialPrompt | null;

  /** paginacao do log */
  limit: number;
}

const INITIAL: AppState = {
  repo: null,
  log: null,
  refs: null,
  status: null,
  worktrees: null,
  loading: { repo: false, log: false, refs: false, status: false, operation: false },
  operationLabel: null,
  fatal: null,
  connection: "closed",
  selection: { commits: [], primary: null, ref: null },
  console: [],
  toasts: [],
  reveal: null,
  openFile: null,
  pendingIntent: null,
  credentialPrompt: null,
  limit: 2000,
};

/* ------------------------------------------------------------------ */
/* Motor do store                                                      */
/* ------------------------------------------------------------------ */

let state: AppState = INITIAL;
const listeners = new Set<() => void>();

const emit = () => {
  for (const l of listeners) l();
};

function set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  emit();
}

const setLoading = (key: keyof AppState["loading"], value: boolean) =>
  set((s) => ({ loading: { ...s.loading, [key]: value } }));

export const getState = () => state;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Hook seletor. O comparador padrao e `Object.is`, entao selecione fatias estaveis. */
export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    useCallback(() => selector(state), [selector]),
    useCallback(() => selector(INITIAL), [selector]),
  );
}

/* ------------------------------------------------------------------ */
/* Console e toasts                                                    */
/* ------------------------------------------------------------------ */

const CONSOLE_CAP = 600;
let seq = 0;
const nextId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function pushConsole(line: Omit<ConsoleLine, "id" | "ts"> & { id?: string; ts?: number }) {
  const entry: ConsoleLine = { id: line.id ?? nextId(), ts: line.ts ?? Date.now(), ...line };
  set((s) => {
    const next = s.console.length >= CONSOLE_CAP ? s.console.slice(-CONSOLE_CAP + 1) : s.console.slice();
    next.push(entry);
    return { console: next };
  });
}

export function toast(tone: ToastTone, title: string, description?: string, argv?: string[]) {
  const t: AppToast = { id: nextId(), tone, title, description, argv, createdAt: Date.now() };
  set((s) => ({ toasts: [t, ...s.toasts].slice(0, 6) }));
  if (tone !== "error") setTimeout(() => dismissToast(t.id), 5_000);
  return t.id;
}

export function dismissToast(id: string) {
  set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export const clearConsole = () => set({ console: [] });

/* ------------------------------------------------------------------ */
/* Carregamento                                                        */
/* ------------------------------------------------------------------ */

export async function loadRepo() {
  setLoading("repo", true);
  try {
    const repo = await api.repo();
    set({ repo, fatal: null });
    return repo;
  } catch (e) {
    set({ fatal: describe(e) });
    return null;
  } finally {
    setLoading("repo", false);
  }
}

export async function loadLog(limit = state.limit) {
  setLoading("log", true);
  try {
    const log = await api.log({ limit });
    set({ log, limit });
    return log;
  } catch (e) {
    toast("error", "Falha ao ler o historico", describe(e));
    return null;
  } finally {
    setLoading("log", false);
  }
}

export async function loadRefs() {
  setLoading("refs", true);
  try {
    const refs = await api.refs();
    set({ refs });
    return refs;
  } catch (e) {
    toast("error", "Falha ao ler as referencias", describe(e));
    return null;
  } finally {
    setLoading("refs", false);
  }
}

export async function loadStatus() {
  setLoading("status", true);
  try {
    const status = await api.status();
    set({ status });
    return status;
  } catch (e) {
    return null;
  } finally {
    setLoading("status", false);
  }
}

export async function loadWorktrees() {
  try {
    const worktrees = await api.worktrees();
    set({ worktrees });
    return worktrees;
  } catch {
    return null;
  }
}

/** Recarrega TUDO. E o que roda no boot e depois de cada `cwd:changed`. */
export async function refreshAll() {
  await Promise.all([loadRepo(), loadLog(), loadRefs(), loadStatus(), loadWorktrees()]);
}

/** Refresh direcionado pelo motivo que o watcher do .git reportou. */
export async function refreshFor(reason: RepoChangeReason) {
  switch (reason) {
    case "index":
    case "worktree":
      await loadStatus();
      break;
    case "head":
      await Promise.all([loadRepo(), loadRefs(), loadStatus()]);
      break;
    case "refs":
      await Promise.all([loadLog(), loadRefs()]);
      break;
    case "rebase-state":
      await Promise.all([loadRepo(), loadStatus(), loadLog()]);
      break;
    case "config":
      await Promise.all([loadRepo(), loadRefs()]);
      break;
    default:
      await refreshAll();
  }
}

/* ------------------------------------------------------------------ */
/* Selecao                                                             */
/* ------------------------------------------------------------------ */

export type SelectMode = "replace" | "toggle" | "range";

export function selectCommit(hash: string, mode: SelectMode = "replace") {
  set((s) => {
    if (mode === "replace") return { selection: { ...s.selection, commits: [hash], primary: hash } };
    if (mode === "toggle") {
      const has = s.selection.commits.includes(hash);
      const commits = has
        ? s.selection.commits.filter((h) => h !== hash)
        : [...s.selection.commits, hash];
      return { selection: { ...s.selection, commits, primary: has ? (commits.at(-1) ?? null) : hash } };
    }
    // range: do primary ate hash, na ordem topologica do log carregado
    const all = s.log?.commits.map((c) => c.hash) ?? [];
    const from = all.indexOf(s.selection.primary ?? hash);
    const to = all.indexOf(hash);
    if (from < 0 || to < 0) return { selection: { ...s.selection, commits: [hash], primary: hash } };
    const [a, b] = from <= to ? [from, to] : [to, from];
    return { selection: { ...s.selection, commits: all.slice(a, b + 1), primary: hash } };
  });
}

export const clearSelection = () =>
  set((s) => ({ selection: { ...s.selection, commits: [], primary: null } }));

/**
 * Seleciona uma referencia no rail E leva a View Tree ate ela.
 *
 * Clicar numa branch ou tag sem sair do lugar nao serve para nada: o que a
 * pessoa quer e ver ONDE aquilo esta. Resolve o alvo pelas refs carregadas e
 * emite o pedido de reveal; o grafo rola e marca a linha.
 */
export function selectRef(ref: string | null) {
  set((s) => ({ selection: { ...s.selection, ref } }));
  if (!ref) return;
  const target = resolveRefTarget(ref);
  if (target) revealCommit(target, "ref");
}

/** fullName ou nome curto -> hash apontado, olhando branches, remotas e tags. */
export function resolveRefTarget(ref: string): string | null {
  const refs = state.refs;
  if (!refs) return null;
  const bate = (a: string, b: string) => a === b;
  for (const b of refs.branches) if (bate(b.fullName, ref) || bate(b.name, ref)) return b.target;
  for (const r of refs.remoteBranches) if (bate(r.fullName, ref) || bate(r.name, ref)) return r.target;
  for (const t of refs.tags) if (bate(t.fullName, ref) || bate(t.name, ref)) return t.target;
  return null;
}

let revealSeq = 0;

/**
 * Pede a View Tree para rolar ate `hash` e marcar a linha.
 *
 * Tambem foca o commit, para o painel de detalhe acompanhar. O `nonce` garante
 * que clicar de novo na MESMA branch role de novo.
 */
export function revealCommit(hash: string, origin: RevealRequest["origin"] = "command") {
  set((s) => ({
    reveal: { hash, nonce: ++revealSeq, origin },
    selection: { ...s.selection, commits: [hash], primary: hash },
  }));
}

/** O grafo chama depois de atender o pedido, para nao rolar de novo a toa. */
export const clearReveal = () => set({ reveal: null });

/* ------------------------------------------------------------------ */
/* Visualizador de arquivo (diff, markdown renderizado, cru)           */
/* ------------------------------------------------------------------ */

/** Abre um arquivo no visualizador do rodape. */
export function openFile(path: string, hash: string | null, fromWorkingTree = false) {
  set({ openFile: { path, hash, fromWorkingTree } });
}

export const closeFile = () => set({ openFile: null });

/** `README.md` -> true. O visualizador oferece "Formatado" so nesses. */
export const isMarkdownPath = (path: string) => /\.(md|markdown|mdown|mkd)$/i.test(path);

/* ------------------------------------------------------------------ */
/* Intencoes de drag-and-drop e dialogos                               */
/* ------------------------------------------------------------------ */

export const setPendingIntent = (intent: DragIntent | null) => set({ pendingIntent: intent });

/* ------------------------------------------------------------------ */
/* Execucao de operacoes                                               */
/* ------------------------------------------------------------------ */

/**
 * Envelope unico para toda mutacao do repositorio: liga o indicador de
 * operacao, executa, reporta no console e nos toasts, e faz o refresh.
 */
export async function runOperation<T extends GitCommandResult>(
  label: string,
  fn: () => Promise<T>,
  opts: { refresh?: RepoChangeReason | "all"; successMessage?: string } = {},
): Promise<T | null> {
  set({ loading: { ...state.loading, operation: true }, operationLabel: label });
  try {
    const result = await fn();
    if (result.ok) {
      toast("success", opts.successMessage ?? label, summarize(result), result.argv);
    } else {
      toast("error", `${label} falhou`, result.error || result.stderr || "erro desconhecido", result.argv);
    }
    const reason = opts.refresh ?? "all";
    if (reason === "all") await refreshAll();
    else await refreshFor(reason);
    return result;
  } catch (e) {
    const err = e instanceof ApiRequestError ? e : null;
    toast("error", `${label} falhou`, describe(e), err?.command?.argv);
    if (err?.command) {
      pushConsole({
        kind: "error",
        text: err.command.stderr || err.payload.error,
        argv: err.command.argv,
        exitCode: err.command.exitCode,
      });
    }
    await refreshAll();
    return null;
  } finally {
    set({ loading: { ...state.loading, operation: false }, operationLabel: null });
  }
}

const summarize = (r: GitCommandResult) => {
  const line = (r.stdout || r.stderr).trim().split("\n").filter(Boolean).at(-1);
  return line ? line.slice(0, 160) : undefined;
};

/**
 * Troca de worktree — NAO faz checkout.
 * Chama a rota que executa `process.chdir()` no backend; o refresh completo vem
 * do evento `cwd:changed` no WebSocket, nao daqui.
 */
export async function switchWorktree(wt: Worktree | string) {
  const path = typeof wt === "string" ? wt : wt.path;
  set({ loading: { ...state.loading, operation: true }, operationLabel: `Trocando para ${path}` });
  try {
    const payload = await api.switchWorktree(path);
    set({ worktrees: payload });
    pushConsole({ kind: "info", text: `process.chdir("${path}")`, cwd: payload.cwd });
    return payload;
  } catch (e) {
    toast("error", "Nao foi possivel trocar de worktree", describe(e));
    return null;
  } finally {
    set({ loading: { ...state.loading, operation: false }, operationLabel: null });
  }
}

/**
 * Abre OUTRO repositorio da maquina — irma de `switchWorktree`.
 *
 * Tambem e `process.chdir()` no servidor, nunca `git checkout`. O refresh
 * completo vem do evento `cwd:changed`, nao daqui: e o mesmo caminho que a
 * troca de worktree percorre, entao a View Tree e descartada e recarregada.
 */
export async function openRepository(path: string) {
  set({
    loading: { ...state.loading, operation: true },
    operationLabel: `Abrindo ${path}`,
  });
  try {
    const repo = await api.openRepo(path);
    set({ repo, fatal: null });
    pushConsole({ kind: "info", text: `process.chdir("${repo.cwd}")`, cwd: repo.cwd });
    toast("success", "Repositorio aberto", repo.name);
    return repo;
  } catch (e) {
    toast("error", "Nao foi possivel abrir o repositorio", describe(e));
    return null;
  } finally {
    set({ loading: { ...state.loading, operation: false }, operationLabel: null });
  }
}

/** `git init` numa pasta e abre em seguida. */
export async function initRepository(path: string, initialBranch?: string) {
  set({
    loading: { ...state.loading, operation: true },
    operationLabel: `git init em ${path}`,
  });
  try {
    const repo = await api.initRepo({ path, initialBranch });
    set({ repo, fatal: null });
    toast("success", "Repositorio criado", repo.cwd);
    return repo;
  } catch (e) {
    toast("error", "git init falhou", describe(e));
    return null;
  } finally {
    set({ loading: { ...state.loading, operation: false }, operationLabel: null });
  }
}

/* ------------------------------------------------------------------ */
/* Credenciais (trampolim de askpass)                                  */
/* ------------------------------------------------------------------ */

export function answerCredentialPrompt(value: string, remember = true) {
  const prompt = state.credentialPrompt;
  if (!prompt) return;
  socket.send({ type: "credentials:provide", requestId: prompt.requestId, value, remember });
  set({ credentialPrompt: null });
}

export function cancelCredentialPrompt() {
  const prompt = state.credentialPrompt;
  if (!prompt) return;
  socket.send({ type: "credentials:cancel", requestId: prompt.requestId });
  set({ credentialPrompt: null });
}

/* ------------------------------------------------------------------ */
/* Boot: WebSocket + carga inicial                                     */
/* ------------------------------------------------------------------ */

let booted = false;

export function bootstrap() {
  if (booted) return;
  booted = true;

  socket.onState((connection) => set({ connection }));

  socket.on("hello", (e) => {
    pushConsole({ kind: "info", text: `conectado — gitcraque ${e.version} (pid ${e.pid}) em ${e.cwd}` });
  });

  // O sinal central do requisito de worktrees: o servidor mudou de diretorio.
  socket.on("cwd:changed", (e) => {
    pushConsole({
      kind: "info",
      text: `diretorio do servidor agora e ${e.cwd}${e.worktree?.branch ? ` (${e.worktree.branch})` : ""}`,
      cwd: e.cwd,
    });
    toast("info", "Worktree ativa", e.worktree?.label ?? e.cwd);
    // descarta a View Tree inteira antes de recarregar
    set({
      log: null,
      refs: null,
      status: null,
      selection: { commits: [], primary: null, ref: null },
      reveal: null,
      openFile: null,
    });
    void refreshAll();
  });

  socket.on("repo:changed", (e) => {
    void refreshFor(e.reason);
  });

  socket.on("git:command", (e) => {
    if (e.phase === "start" && e.argv) {
      pushConsole({ id: e.id, kind: "command", text: `git ${e.argv.join(" ")}`, argv: e.argv, cwd: e.cwd });
    } else if (e.phase === "stdout" && e.chunk) {
      pushConsole({ kind: "stdout", text: e.chunk });
    } else if (e.phase === "stderr" && e.chunk) {
      pushConsole({ kind: "stderr", text: e.chunk });
    } else if (e.phase === "exit" && e.result) {
      pushConsole({
        kind: "exit",
        text: `exit ${e.result.exitCode} — ${e.result.durationMs}ms`,
        exitCode: e.result.exitCode,
        durationMs: e.result.durationMs,
      });
    }
  });

  socket.on("op:progress", (e) => {
    set({ operationLabel: e.message });
  });

  socket.on("credentials:needed", (e) => {
    set({ credentialPrompt: e.prompt });
  });

  socket.on("error", (e) => {
    toast("error", e.message, e.detail);
  });

  socket.connect();
  void refreshAll();
}

/* ------------------------------------------------------------------ */

function describe(e: unknown): string {
  if (e instanceof ApiRequestError) return e.payload.detail || e.payload.error || e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

/* ------------------------------------------------------------------ */
/* Seletores prontos (estaveis — nao criam objeto novo a cada render)   */
/* ------------------------------------------------------------------ */

export const selectCommits = (s: AppState) => s.log?.commits ?? EMPTY_COMMITS;
export const selectBranches = (s: AppState) => s.refs?.branches ?? EMPTY_ARR;
export const selectRemoteBranches = (s: AppState) => s.refs?.remoteBranches ?? EMPTY_ARR;
export const selectTags = (s: AppState) => s.refs?.tags ?? EMPTY_ARR;
export const selectRemotes = (s: AppState) => s.repo?.remotes ?? s.refs?.remotes ?? EMPTY_ARR;
export const selectStashes = (s: AppState) => s.refs?.stashes ?? EMPTY_ARR;
export const selectWorktrees = (s: AppState) => s.worktrees?.worktrees ?? EMPTY_ARR;
export const selectHead = (s: AppState) => s.repo?.head ?? null;
export const selectPending = (s: AppState) => s.repo?.head.pending ?? null;

const EMPTY_ARR: never[] = [];
const EMPTY_COMMITS: LogPayload["commits"] = [];

/* re-exports de conveniencia para os modulos */
export type { RefsPayload, RepoPayload, StatusPayload, WorktreesPayload, LogPayload };
