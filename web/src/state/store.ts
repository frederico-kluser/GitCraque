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
import {
  clearViewSnapshot,
  readViewSnapshot,
  saveViewSnapshot,
  wasDiscarded,
} from "@/lib/recovery";
import { socket, type ConnectionState } from "@/lib/ws";
import { t } from "@/i18n";
import type {
  AgentSource,
  AiKeySource,
  ConsoleLine,
  CredentialPrompt,
  DragIntent,
  GitCommandResult,
  LogPayload,
  RefsPayload,
  RepoChangeReason,
  RepoPayload,
  StatusPayload,
  UndoStatePayload,
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
  /** estado dos botoes desfazer/refazer — cursor do servidor sobre o reflog */
  undo: UndoStatePayload | null;

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

  /** sessao do agente de voz/texto */
  agent: AgentSlice;
  /** ACRESCENTADO: o que se sabe da chave da OpenRouter, sem nunca ve-la */
  ai: AiSlice;

  /** paginacao do log */
  limit: number;
}

/**
 * O que a area de IA precisa saber para decidir se esta liberada.
 *
 * A chave em si NUNCA chega aqui — `masked` e a impressao digital que
 * `server/src/ai/key.mjs:111-116` produz, boa para distinguir duas chaves e
 * inutil para usar qualquer uma. `keySource` existe porque um 401 sem ela vira
 * adivinhacao sobre qual das tres camadas de resolucao o servidor usou.
 */
export interface AiSlice {
  /** false ate a primeira resposta de `/ai/status` chegar */
  checked: boolean;
  hasKey: boolean;
  keySource: AiKeySource;
  /** impressao digital exibivel; jamais a chave */
  masked: string;
}

/**
 * O que a bolha do microfone mostra.
 *
 * `commands` guarda os comandos git que o agente disparou de fato — e a
 * promessa central do produto aplicada ao caminho da voz: nada acontece sem
 * que se possa ver o argv que rodou.
 */
export interface AgentSlice {
  phase: AgentPhase;
  /** o que a pessoa falou ou digitou, ja transcrito */
  utterance: string;
  source: AgentSource;
  /** comandos git disparados nesta sessao, na ordem */
  commands: string[];
  /** o veredito de uma linha, quando termina */
  verdict: string;
  /** mensagem de falha, quando falha */
  error: string;
  /** soma do que a sessao custou em USD (transcricao + agente) */
  cost: number;
}

export type AgentPhase =
  | "idle"
  | "recording"
  | "transcribing"
  | "running"
  | "done"
  | "failed";

/**
 * Constante de modulo, nao literal inline: o comparador do `useAppState` e
 * `Object.is`, entao um objeto novo a cada leitura re-renderizaria para sempre.
 */
const AGENT_IDLE: AgentSlice = {
  phase: "idle",
  utterance: "",
  source: "voice",
  commands: [],
  verdict: "",
  error: "",
  cost: 0,
};

/** Antes da primeira resposta do servidor, "nao sei" — nao "nao tem". */
const AI_UNKNOWN: AiSlice = { checked: false, hasKey: false, keySource: "none", masked: "" };

const INITIAL: AppState = {
  repo: null,
  log: null,
  refs: null,
  status: null,
  worktrees: null,
  undo: null,
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
  agent: AGENT_IDLE,
  ai: AI_UNKNOWN,
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
    toast("error", t("store.log.failed"), describe(e));
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
    toast("error", t("store.refs.failed"), describe(e));
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

/**
 * Estado dos botoes desfazer/refazer.
 *
 * Recarrega junto de tudo que mexe no HEAD: o cursor do servidor e invalidado
 * por qualquer movimento vindo de fora, entao pedir so no boot deixaria os
 * botoes mentindo depois do primeiro commit.
 */
export async function loadUndo() {
  try {
    const undo = await api.undoState();
    set({ undo });
    return undo;
  } catch {
    return null;
  }
}

/** Recarrega TUDO. E o que roda no boot e depois de cada `cwd:changed`. */
export async function refreshAll() {
  await Promise.all([loadRepo(), loadLog(), loadRefs(), loadStatus(), loadWorktrees(), loadUndo()]);
}

/**
 * Refresh direcionado pelo motivo que o watcher do .git reportou.
 *
 * `loadWorktrees` entra em `head` e `refs` de proposito: criar ou remover uma
 * worktree mexe em `refs/` (a branch nasce ou morre) e no HEAD dela. Sem isso a
 * lista de worktrees so era recarregada pelo `default`, e uma worktree criada
 * por fora do app ficava invisivel ate a proxima troca de repositorio.
 */
export async function refreshFor(reason: RepoChangeReason) {
  switch (reason) {
    case "index":
    case "worktree":
      await loadStatus();
      break;
    case "head":
      await Promise.all([loadRepo(), loadRefs(), loadStatus(), loadWorktrees(), loadUndo()]);
      break;
    case "refs":
      await Promise.all([loadLog(), loadRefs(), loadWorktrees(), loadUndo()]);
      break;
    // Entrar ou sair de um merge/rebase parado liga e desliga os dois botoes.
    case "rebase-state":
      await Promise.all([loadRepo(), loadStatus(), loadLog(), loadUndo()]);
      break;
    case "config":
      await Promise.all([loadRepo(), loadRefs()]);
      break;
    default:
      await refreshAll();
  }
}

/**
 * O tick do poll: status + worktrees, as duas leituras baratas.
 *
 * Existe porque o watcher e `fs.watch` sobre o `.git` — e editar um arquivo no
 * editor NAO toca no `.git`. Nenhum evento e emitido, e o status ficaria parado
 * ate alguem rodar um comando git. Log e refs continuam fora daqui: sao as
 * leituras caras, e o watcher ja cobre as duas.
 *
 * NAO passa por `loadStatus`/`loadWorktrees`: elas mexem em `loading.status`, e
 * o StatusPanel usa essa flag para decidir se a arvore esta limpa
 * (`panels/StatusPanel.tsx:449`). Ligar e desligar isso duas vezes por segundo
 * faria o painel piscar sozinho — um poll que se anuncia e pior que nenhum.
 * Falha tambem e silenciosa: o servidor pode estar reiniciando, e um toast de
 * erro a cada meio segundo seria intoleravel.
 */
export async function pollRepo() {
  const [status, worktrees] = await Promise.all([
    api.status().catch(() => null),
    api.worktrees().catch(() => null),
  ]);
  if (status) set({ status });
  if (worktrees) set({ worktrees });
}

/**
 * O tick da rotina automatica: `git fetch --all --prune`, sem barulho nenhum.
 *
 * Irmao do `pollRepo` acima na disciplina, oposto no custo: aquele le, este
 * fala com a rede. Por isso NAO passa por `runOperation` — o envelope liga
 * `loading.operation` e emite toast em toda saida, e uma vez por minuto isso
 * seria uma barra de progresso piscando sozinha e uma chuva de avisos. O unico
 * sinal legitimo do fetch automatico e o que ele trouxe: ref nova muda o rail.
 *
 * O backend nao sabe que este fetch e discreto. `gitFetch` roda com
 * `progressOp: "fetch"` (`server/src/git/remotes.mjs:95-102`) e emite
 * `op:progress` como qualquer outro comando de rede — dai a flag abaixo, que o
 * handler daquele evento consulta antes de escrever `operationLabel`.
 *
 * O argv CONTINUA indo para o console de auditoria pelo `git:command`. Mudo
 * aqui e sobre toast e indicador; esconder o comando do painel que existe para
 * mostrar comando seria outra coisa, e contra o produto.
 *
 * Nunca puxa nada: `fetch` so move `refs/remotes/**`. O ponteiro local so anda
 * por decisao explicita de quem esta usando o app.
 */
let silentFetching = false;

/** Para o handler de `op:progress` saber que o rotulo em voo nao e da pessoa. */
export const isSilentFetching = () => silentFetching;

export async function silentFetch(): Promise<boolean> {
  // Rede lenta faz o tick anterior atravessar o proximo; a rotina ja espaca as
  // chamadas, esta guarda cobre quem chamar de outro lugar.
  if (silentFetching) return false;
  silentFetching = true;
  try {
    const result = await api.fetch({ all: true, prune: true });
    // `git fetch` fala (em stderr, com `--progress`) quando atualizou alguma
    // ref, e cala quando nao havia nada. Sem novidade, nao ha o que recarregar.
    const changed = result.ok && (result.stderr || result.stdout).trim() !== "";
    if (changed) await refreshFor("refs");
    return changed;
  } catch {
    // Rede fora, credencial recusada, servidor reiniciando: o proximo tick
    // tenta de novo. Um toast de erro por minuto seria intoleravel.
    return false;
  } finally {
    silentFetching = false;
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
      toast(
        "error",
        t("store.operation.failed", { label }),
        result.error || result.stderr || t("common.unknownError"),
        result.argv,
      );
    }
    const reason = opts.refresh ?? "all";
    if (reason === "all") await refreshAll();
    else await refreshFor(reason);
    return result;
  } catch (e) {
    const err = e instanceof ApiRequestError ? e : null;
    toast("error", t("store.operation.failed", { label }), describe(e), err?.command?.argv);
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
  set({
    loading: { ...state.loading, operation: true },
    operationLabel: t("store.worktree.switching", { path }),
  });
  try {
    const payload = await api.switchWorktree(path);
    set({ worktrees: payload });
    pushConsole({ kind: "info", text: `process.chdir("${path}")`, cwd: payload.cwd });
    return payload;
  } catch (e) {
    toast("error", t("store.worktree.failed"), describe(e));
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
    operationLabel: t("store.repo.opening", { path }),
  });
  try {
    const repo = await api.openRepo(path);
    set({ repo, fatal: null });
    pushConsole({ kind: "info", text: `process.chdir("${repo.cwd}")`, cwd: repo.cwd });
    toast("success", t("store.repo.opened"), repo.name);
    return repo;
  } catch (e) {
    toast("error", t("store.repo.openFailed"), describe(e));
    return null;
  } finally {
    set({ loading: { ...state.loading, operation: false }, operationLabel: null });
  }
}

/** `git init` numa pasta e abre em seguida. */
export async function initRepository(path: string, initialBranch?: string) {
  set({
    loading: { ...state.loading, operation: true },
    operationLabel: t("store.repo.initializing", { path }),
  });
  try {
    const repo = await api.initRepo({ path, initialBranch });
    set({ repo, fatal: null });
    toast("success", t("store.repo.created"), repo.cwd);
    return repo;
  } catch (e) {
    toast("error", t("store.repo.initFailed"), describe(e));
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
/* Retomada da aba (congelamento, descarte, bfcache)                   */
/* ------------------------------------------------------------------ */

/**
 * Duas retomadas mais proximas que isto sao o MESMO retorno visto duas vezes:
 * voltar para a aba dispara `visibilitychange`, `resume` e as vezes `pageshow`
 * quase juntos, e cada um deles chamaria um `refreshAll` completo.
 */
const REVIVE_COOLDOWN_MS = 1_000;

let reviving: Promise<void> | null = null;
let revivedAt = 0;

/**
 * Traz a aba de volta a vida depois que o navegador a congelou ou a devolveu do
 * bfcache.
 *
 * Sonda o socket antes de confiar nele, reconecta na hora se a sonda falhar e
 * recarrega TUDO. Nao e o poll de meio segundo: aquele so cuida de status e
 * worktrees, e depois de minutos dormindo o log e as refs tambem estao velhos.
 *
 * Serializada e com carencia: os eventos de retomada chegam em rajada, e disparar
 * uma leva de `git log` por evento seria pior que o problema.
 */
export function reviveSession(): Promise<void> {
  if (reviving) return reviving;
  if (Date.now() - revivedAt < REVIVE_COOLDOWN_MS) return Promise.resolve();
  const run = doRevive()
    .catch(() => {})
    .finally(() => {
      reviving = null;
      revivedAt = Date.now();
    });
  reviving = run;
  return run;
}

async function doRevive() {
  const alive = state.connection === "open" && (await socket.probe());
  if (!alive) socket.reconnectNow();
  pushConsole({ kind: "info", text: t("store.lifecycle.resumed") });
  await refreshAll();
}

/**
 * Guarda onde a pessoa estava, para o caso de o navegador descartar a aba.
 *
 * Chamado quando a aba fica escondida, nunca na saida: o descarte do Memory
 * Saver nao dispara `beforeunload` nem `unload`, entao esperar pela saida seria
 * gravar exatamente nunca.
 */
export function snapshotView() {
  const cwd = state.repo?.cwd;
  if (!cwd) return;
  saveViewSnapshot({ cwd, selection: state.selection, openFile: state.openFile });
}

/**
 * Volta ao lugar depois que o navegador descartou a aba.
 *
 * O descarte apaga a pagina da memoria e recarrega tudo quando a pessoa volta: o
 * app renasce correto e no lugar errado — topo do log, painel de detalhe vazio,
 * arquivo fechado. So restaura se o servidor ainda estiver no mesmo diretorio,
 * porque o retrato e de um repositorio, nao de uma tela.
 */
function restoreDiscardedView() {
  const snapshot = readViewSnapshot();
  clearViewSnapshot();
  if (!snapshot || !wasDiscarded()) return;
  if (!state.repo || state.repo.cwd !== snapshot.cwd) return;

  // `revealCommit` primeiro, `set` depois: ele reduz a selecao a um commit so, e
  // quem tinha varios marcados para um squash quer os varios de volta.
  if (snapshot.selection.primary) revealCommit(snapshot.selection.primary, "command");
  set({ selection: snapshot.selection, openFile: snapshot.openFile });
  pushConsole({ kind: "info", text: t("store.lifecycle.restored") });
}

/* ------------------------------------------------------------------ */
/* Boot: WebSocket + carga inicial                                     */
/* ------------------------------------------------------------------ */

let booted = false;

/* ------------------------------------------------------------------ */
/* Agente de voz e texto                                               */
/* ------------------------------------------------------------------ */

const patchAgent = (patch: Partial<AgentSlice>) =>
  set((s) => ({ agent: { ...s.agent, ...patch } }));

/** O microfone abriu. Zera o que sobrou da sessao anterior. */
export function agentRecordingStarted() {
  set({ agent: { ...AGENT_IDLE, phase: "recording" } });
}

/** O audio foi para a OpenRouter. */
export function agentTranscribing() {
  patchAgent({ phase: "transcribing" });
}

/** Cancela sem mandar nada — o botao solto sem audio util cai aqui. */
export function agentCancelled(error = "") {
  set({ agent: { ...AGENT_IDLE, phase: error ? "failed" : "idle", error } });
}

/** Volta a bolha para o repouso. */
export function agentClosed() {
  set({ agent: AGENT_IDLE });
}

/**
 * Manda a intencao para o agente. O POST volta na hora com o id da sessao; o
 * andamento chega pelos eventos `ai:*` do WebSocket.
 */
export async function runAgent(utterance: string, source: AgentSource, cost = 0) {
  const text = utterance.trim();
  if (!text) {
    set({ agent: { ...AGENT_IDLE, phase: "failed", error: t("agent.empty") } });
    return;
  }
  set({
    agent: { ...AGENT_IDLE, phase: "running", utterance: text, source, cost },
  });
  try {
    await api.runAgent({ utterance: text, source });
  } catch (e) {
    patchAgent({ phase: "failed", error: describe(e) });
    // 401 e `error.aiKeyMissing` (`server/src/routes/ai.mjs:28-32`): a chave
    // sumiu entre o boot e agora. Reler o status devolve a area ao convite de
    // desbloqueio em vez de deixar um input que so sabe falhar.
    if (e instanceof ApiRequestError && e.status === 401) void loadAiStatus();
  }
}

/** Mata a sessao em voo. O repositorio fica como estiver — a UI ja sabe mostrar. */
export async function abortAgent() {
  try {
    await api.abortAgent();
  } catch (e) {
    toast("error", describe(e));
  }
}

/* ------------------------------------------------------------------ */
/* Chave da OpenRouter — o status dela, nunca ela                      */
/* ------------------------------------------------------------------ */

/**
 * Le `/ai/status`. Sem chave, a area de IA vira o convite para desbloquear.
 *
 * Falha nao vira toast: no boot o servidor pode ainda nem estar de pe, e a
 * fatia continua `checked: false` — que a interface trata como "ainda nao
 * sei", diferente de "nao tem". Mostrar o convite por causa de uma requisicao
 * que nao voltou seria acusar o usuario de nao ter chave sem ter perguntado.
 */
export async function loadAiStatus() {
  try {
    const status = await api.aiStatus();
    set({
      ai: {
        checked: true,
        hasKey: status.hasKey,
        keySource: status.keySource,
        masked: status.masked,
      },
    });
    return status;
  } catch {
    return null;
  }
}

/** Grava a chave e rele o status: a mascara so pode vir do servidor. */
export async function saveAiKey(key: string) {
  await api.aiSaveKey(key);
  await loadAiStatus();
}

/**
 * Apaga a chave gravada — o que pode NAO bloquear nada. Havendo
 * `OPENROUTER_API_KEY` no ambiente, a resolucao cai para ela
 * (`server/src/ai/key.mjs:93-104`), e so o status relido conta essa historia.
 */
export async function clearAiKey() {
  await api.aiClearKey();
  await loadAiStatus();
}

export function bootstrap() {
  if (booted) return;
  booted = true;

  socket.onState((connection) => set({ connection }));

  socket.on("hello", (e) => {
    pushConsole({
      kind: "info",
      text: t("store.ws.connected", { version: e.version, pid: e.pid, cwd: e.cwd }),
    });
  });

  // O sinal central do requisito de worktrees: o servidor mudou de diretorio.
  socket.on("cwd:changed", (e) => {
    pushConsole({
      kind: "info",
      text: `${t("store.ws.cwdChanged", { cwd: e.cwd })}${e.worktree?.branch ? ` (${e.worktree.branch})` : ""}`,
      cwd: e.cwd,
    });
    toast("info", t("store.worktree.active"), e.worktree?.label ?? e.cwd);
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
    // O fetch da rotina automatica tambem emite progresso, porque o backend
    // nao distingue quem pediu. Enquanto ele for o unico em voo, o rotulo nao
    // vai para a tela — o automatico foi combinado para ser mudo.
    if (silentFetching && !state.loading.operation) return;
    set({ operationLabel: e.message });
  });

  socket.on("credentials:needed", (e) => {
    set({ credentialPrompt: e.prompt });
  });

  socket.on("error", (e) => {
    toast("error", e.message, e.detail);
  });

  /* ---- agente ----
   * O comando git que o agente dispara NAO passa pelo `execGit` do backend, e
   * portanto nao gera `git:command`. Por isso ele e empurrado para o console
   * daqui: sem isto, o painel de auditoria ficaria mudo durante a sessao em que
   * mais coisa acontece.
   */
  socket.on("ai:event", (e) => {
    const ev = e.event;
    if (ev.kind === "tool" && ev.command) {
      patchAgent({ commands: [...getState().agent.commands, ev.command] });
      pushConsole({ kind: "command", text: ev.command });
    } else if (ev.kind === "usage") {
      patchAgent({ cost: getState().agent.cost + ev.cost });
    } else if (ev.kind === "error") {
      pushConsole({ kind: "error", text: ev.message });
    }
  });

  socket.on("ai:done", (e) => {
    patchAgent({ phase: "done", verdict: e.text, cost: getState().agent.cost + e.cost });
    // O watcher ja anunciou cada escrita do agente, mas um refresh final fecha
    // qualquer janela de debounce que tenha agrupado o ultimo lote.
    void refreshAll();
  });

  socket.on("ai:error", (e) => {
    patchAgent({ phase: "failed", error: e.error || e.text });
    void refreshAll();
  });

  socket.connect();
  // A restauracao espera a carga: sem `repo.cwd` nao da para saber se o retrato
  // guardado e deste repositorio, e sem o log carregado o reveal nao tem onde
  // rolar.
  void refreshAll().then(restoreDiscardedView);
  // Independente do repositorio: a chave e da maquina, nao do projeto aberto.
  void loadAiStatus();
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

export const selectAgent = (s: AppState) => s.agent;
export const selectAi = (s: AppState) => s.ai;
export const selectCommits = (s: AppState) => s.log?.commits ?? EMPTY_COMMITS;
export const selectBranches = (s: AppState) => s.refs?.branches ?? EMPTY_ARR;
export const selectRemoteBranches = (s: AppState) => s.refs?.remoteBranches ?? EMPTY_ARR;
export const selectTags = (s: AppState) => s.refs?.tags ?? EMPTY_ARR;
export const selectRemotes = (s: AppState) => s.repo?.remotes ?? s.refs?.remotes ?? EMPTY_ARR;
export const selectStashes = (s: AppState) => s.refs?.stashes ?? EMPTY_ARR;
export const selectWorktrees = (s: AppState) => s.worktrees?.worktrees ?? EMPTY_ARR;
export const selectHead = (s: AppState) => s.repo?.head ?? null;
export const selectUndo = (s: AppState) => s.undo;
export const selectPending = (s: AppState) => s.repo?.head.pending ?? null;

const EMPTY_ARR: never[] = [];
const EMPTY_COMMITS: LogPayload["commits"] = [];

/* re-exports de conveniencia para os modulos */
export type { RefsPayload, RepoPayload, StatusPayload, WorktreesPayload, LogPayload };
