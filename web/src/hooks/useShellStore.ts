/**
 * Estado SO da casca — nada do repositorio mora aqui.
 *
 * O `state/store.ts` e a fonte unica do repositorio; este e o complemento
 * estritamente visual: tema, larguras das colunas, paleta aberta, rascunho do
 * commit e qual acao aguarda confirmacao. Mesmo motor do store central (objeto
 * mutavel + useSyncExternalStore) para nao arrastar dependencia nova, e o que
 * faz sentido persistir vai para o localStorage.
 */
import { useCallback, useSyncExternalStore } from "react";
import type { ComponentType, MouseEvent as ReactMouseEvent } from "react";

/* ------------------------------------------------------------------ */
/* Itens de menu — o MESMO item serve ao "⋯" e ao botao direito        */
/* ------------------------------------------------------------------ */

/**
 * Uma linha de menu. Descrever a acao em dado (e nao em JSX) e o que permite
 * que a mesma lista alimente o menu de reticencias da linha e o menu de
 * contexto: quem escreve as acoes de uma branch escreve UMA vez.
 */
export interface MenuItemSpec {
  label: string;
  onSelect: () => void;
  icon?: ComponentType<{ className?: string }>;
  /** pinta a linha com o tom destrutivo — a confirmacao vem depois, no dialogo */
  destructive?: boolean;
  disabled?: boolean;
  /** insere um separador ANTES desta linha */
  separatorBefore?: boolean;
  /** texto discreto a direita: hash, contagem, motivo de estar desabilitado */
  hint?: string;
}

/**
 * Um menu de contexto pedido por um clique com o botao direito.
 *
 * As coordenadas sao de VIEWPORT (`clientX`/`clientY`), porque o popup e
 * ancorado num retangulo virtual de tamanho zero naquele ponto — nao ha
 * elemento gatilho para ancorar.
 */
export interface ContextMenuRequest {
  id: string;
  /** rotulo acessivel do menu ("Commit a1b2c3d") */
  label: string;
  x: number;
  y: number;
  items: MenuItemSpec[];
}

/* ------------------------------------------------------------------ */
/* Acoes que exigem confirmacao antes de tocar o repositorio            */
/* ------------------------------------------------------------------ */

/**
 * Uma acao originada nos PAINEIS (nao no drag-and-drop) que so pode executar
 * depois de confirmada. As intencoes de arrasto tem caminho proprio
 * (`setPendingIntent` → `DialogHost` de `@/dialogs`); estas nao cabem em
 * `DragIntent`, cujo `kind` e um union fechado no contrato.
 */
export interface ConfirmAction {
  id: string;
  title: string;
  /** frase unica dizendo o que vai acontecer */
  description: string;
  /** argv do git que sera executado, para o usuario ver antes */
  preview: string[];
  /** true exige HoldToConfirmButton em vez de clique */
  destructive?: boolean;
  /** rotulo do botao que confirma */
  confirmLabel: string;
  /** campos extras do formulario, quando a acao precisa de entrada */
  fields?: ConfirmField[];
  /** executa de fato; recebe os valores dos campos */
  run: (values: Record<string, string>) => Promise<unknown>;
}

export type ConfirmField =
  | { kind: "text"; name: string; label: string; value?: string; placeholder?: string; required?: boolean }
  | { kind: "textarea"; name: string; label: string; value?: string; placeholder?: string }
  | { kind: "toggle"; name: string; label: string; value?: boolean; hint?: string }
  | { kind: "select"; name: string; label: string; value?: string; options: Array<{ value: string; label: string }> };

/* ------------------------------------------------------------------ */

export type ThemeMode = "light" | "dark";

/**
 * Qual painel ocupa a tela quando o layout e de coluna unica.
 *
 * Num celular o grid de tres colunas nao cabe: rail, grafo e detalhe
 * passam a se revezar. Os tres nomes sao os das colunas do desktop, para
 * que a mesma palavra signifique a mesma coisa nos dois layouts.
 */
export type MobilePane = "rail" | "graph" | "detail";

/**
 * Rascunho do commit.
 *
 * Mora aqui, e nao no `StatusPanel`, por um motivo mecanico: o painel de
 * alteracoes virou uma gaveta que DESMONTA ao fechar. Com o rascunho local,
 * fechar a gaveta — ou clicar num arquivo para ve-lo, o que tambem a fecha —
 * apagaria a mensagem que a pessoa estava escrevendo.
 */
export interface CommitDraft {
  message: string;
  amend: boolean;
  signoff: boolean;
}

export interface ShellState {
  theme: ThemeMode;
  /** larguras em px das colunas laterais do grid principal */
  railWidth: number;
  detailWidth: number;
  /**
   * Intervalo da rotina automatica de `git fetch`, em ms. `0` desliga.
   *
   * Mora aqui, e nao no store do repositorio, porque e preferencia da pessoa e
   * nao estado do projeto: vale para qualquer repo que ela abrir.
   */
  autoFetchMs: number;
  /** modal de configuracoes aberto. Efemero, como a gaveta de alteracoes. */
  settingsOpen: boolean;
  /**
   * Gaveta de alteracoes (staging + commit) aberta por cima da tela.
   *
   * Efemera de proposito: nao volta aberta depois de um reload. Antes isto era
   * uma aba do sidebar direito; virou gaveta quando a coluna passou a mostrar
   * uma tela por vez, e o gatilho foi para o botao de commit da toolbar.
   */
  changesOpen: boolean;
  commitDraft: CommitDraft;
  confirm: ConfirmAction | null;
  /** menu de contexto aberto agora, com o ponto do clique. */
  contextMenu: ContextMenuRequest | null;
  /**
   * Painel visivel no layout de coluna unica. Ignorado quando as tres colunas
   * cabem na tela.
   *
   * Efemero como `changesOpen`: NAO vai para o localStorage. Voltar num painel
   * lateral porque foi ali que a pessoa parou tres dias atras seria pior do que
   * voltar sempre no grafo, que e a tela principal do produto.
   */
  mobilePane: MobilePane;
}

const STORAGE_KEY = "gitcraque.shell";

const EMPTY_DRAFT: CommitDraft = { message: "", amend: false, signoff: false };

/**
 * As escolhas de intervalo do fetch automatico. `0` e "Desligado", e por isso
 * nao ha um liga/desliga separado: a lista ja diz tudo.
 *
 * Constante de modulo — a lista alimenta um `<select>` e re-criar o array a
 * cada render faria o seletor remontar a toa.
 */
export const AUTO_FETCH_OPTIONS = [0, 30_000, 60_000, 300_000, 900_000] as const;

const DEFAULTS: ShellState = {
  theme: "dark",
  railWidth: 264,
  // O sidebar direito passou a abrigar TAMBEM o visualizador de arquivo, entao
  // ele nasce bem mais largo do que quando so tinha os metadados do commit.
  detailWidth: 560,
  autoFetchMs: 60_000,
  settingsOpen: false,
  changesOpen: false,
  commitDraft: EMPTY_DRAFT,
  confirm: null,
  contextMenu: null,
  mobilePane: "graph",
};

/** So o que faz sentido sobreviver ao reload. */
type Persisted = Pick<ShellState, "theme" | "railWidth" | "detailWidth" | "autoFetchMs">;

function readPersisted(): Partial<Persisted> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

function writePersisted(s: ShellState) {
  if (typeof localStorage === "undefined") return;
  const slice: Persisted = {
    theme: s.theme,
    railWidth: s.railWidth,
    detailWidth: s.detailWidth,
    autoFetchMs: s.autoFetchMs,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slice));
  } catch {
    /* modo privado / cota cheia: a UI segue, so nao lembra */
  }
}

function initialTheme(stored: Partial<Persisted>): ThemeMode {
  if (stored.theme === "light" || stored.theme === "dark") return stored.theme;
  if (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches) return "light";
  return DEFAULTS.theme;
}

/**
 * `localStorage` e editavel a mao e sobrevive a versoes antigas do app. Um
 * valor fora da lista viraria um `setTimeout` de intervalo arbitrario batendo
 * na rede — entao so o que esta no cardapio passa.
 */
function initialAutoFetch(stored: Partial<Persisted>): number {
  const value = stored.autoFetchMs;
  return AUTO_FETCH_OPTIONS.includes(value as (typeof AUTO_FETCH_OPTIONS)[number])
    ? (value as number)
    : DEFAULTS.autoFetchMs;
}

const stored = readPersisted();
const INITIAL: ShellState = {
  ...DEFAULTS,
  ...stored,
  theme: initialTheme(stored),
  autoFetchMs: initialAutoFetch(stored),
  // nunca restaura estado efemero
  settingsOpen: false,
  changesOpen: false,
  commitDraft: EMPTY_DRAFT,
  confirm: null,
  contextMenu: null,
  mobilePane: DEFAULTS.mobilePane,
};

let state: ShellState = INITIAL;
const listeners = new Set<() => void>();

// Aplica o tema antes do primeiro render: evita o flash de tema errado.
if (typeof document !== "undefined") {
  document.documentElement.classList.toggle("dark", INITIAL.theme === "dark");
  document.documentElement.style.colorScheme = INITIAL.theme;
}

function set(patch: Partial<ShellState> | ((s: ShellState) => Partial<ShellState>)) {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  writePersisted(state);
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const getShellState = () => state;

export function useShellState<T>(selector: (s: ShellState) => T): T {
  return useSyncExternalStore(
    subscribe,
    useCallback(() => selector(state), [selector]),
    useCallback(() => selector(INITIAL), [selector]),
  );
}

/* ------------------------------------------------------------------ */
/* Acoes                                                               */
/* ------------------------------------------------------------------ */

/** Escreve a classe `dark` no <html> — o tema ja traz as duas variantes. */
export function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function setTheme(theme: ThemeMode) {
  applyTheme(theme);
  set({ theme });
}

export const toggleTheme = () => setTheme(state.theme === "dark" ? "light" : "dark");

/** Intervalo do fetch automatico. `0` desliga a rotina. */
export const setAutoFetchMs = (autoFetchMs: number) => set({ autoFetchMs });

/* ---- modal de configuracoes ---- */
export const openSettings = () => set({ settingsOpen: true });
export const closeSettings = () => set({ settingsOpen: false });

/** Limites para as colunas nao sumirem nem engolirem o grafo. */
export const RAIL_RANGE = { min: 200, max: 460 } as const;
/** O sidebar direito abriga o visualizador de diff: precisa caber um patch. */
export const DETAIL_RANGE = { min: 320, max: 980 } as const;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const setRailWidth = (px: number) => set({ railWidth: clamp(px, RAIL_RANGE.min, RAIL_RANGE.max) });
export const setDetailWidth = (px: number) => set({ detailWidth: clamp(px, DETAIL_RANGE.min, DETAIL_RANGE.max) });

/* ------------------------------------------------------------------ */
/* Gaveta de alteracoes                                                */
/* ------------------------------------------------------------------ */

export const openChanges = () => set({ changesOpen: true });
export const closeChanges = () => set({ changesOpen: false });
export const toggleChanges = () => set((s) => ({ changesOpen: !s.changesOpen }));

export const setCommitDraft = (patch: Partial<CommitDraft>) =>
  set((s) => ({ commitDraft: { ...s.commitDraft, ...patch } }));

/* ------------------------------------------------------------------ */
/* Navegacao de coluna unica                                           */
/* ------------------------------------------------------------------ */

/** Troca o painel visivel quando so cabe um. Sem efeito no layout de tres colunas. */
export const setMobilePane = (mobilePane: MobilePane) => set({ mobilePane });

export const askConfirm = (confirm: Omit<ConfirmAction, "id"> & { id?: string }) =>
  set({ confirm: { id: confirm.id ?? `confirm-${Date.now().toString(36)}`, ...confirm } });

export const closeConfirm = () => set({ confirm: null });

/* ------------------------------------------------------------------ */
/* Menu de contexto                                                    */
/* ------------------------------------------------------------------ */

let menuSeq = 0;

/**
 * Abre o menu de contexto no ponto informado.
 *
 * Lista VAZIA nao abre menu nenhum — e assim de proposito: um alvo sem acao
 * util nao deve mostrar uma caixa vazia nem devolver o menu do navegador.
 */
export function openContextMenu(request: Omit<ContextMenuRequest, "id">) {
  if (request.items.length === 0) {
    if (state.contextMenu) set({ contextMenu: null });
    return;
  }
  set({ contextMenu: { id: `ctx-${++menuSeq}`, ...request } });
}

export const closeContextMenu = () => {
  if (state.contextMenu) set({ contextMenu: null });
};

/**
 * Handler pronto para `onContextMenu`. Faz as tres coisas que todo alvo precisa
 * fazer, e nas quais e facil escorregar:
 *
 *  1. `preventDefault` SEMPRE — mesmo quando nao ha item nenhum. E o que garante
 *     que "sem menu proprio" signifique menu nenhum, e nao o do navegador;
 *  2. `stopPropagation`, senao um alvo aninhado (o chip de branch dentro da
 *     linha do commit) abriria os dois menus e o de fora ganharia, por ser o
 *     ultimo a rodar;
 *  3. monta a lista SO na hora do clique, para o menu enxergar o estado atual.
 */
export function contextMenuFor(label: string, build: () => MenuItemSpec[]) {
  return (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    openContextMenu({ label, x: event.clientX, y: event.clientY, items: build() });
  };
}

/* ------------------------------------------------------------------ */
/* Ponte do ⌘Enter                                                     */
/* ------------------------------------------------------------------ */

/**
 * O rascunho do commit e do `StatusPanel` — nao vale duplicar aqui so para o
 * atalho global alcanca-lo. O painel registra o proprio disparo; o shell chama.
 */
let commitHandler: (() => void) | null = null;

export function registerCommitHandler(fn: () => void) {
  commitHandler = fn;
  return () => {
    if (commitHandler === fn) commitHandler = null;
  };
}

/**
 * ⌘Enter em dois tempos, porque o painel que sabe commitar so existe enquanto a
 * gaveta esta aberta: fechada, o atalho ABRE a gaveta; aberta, ele commita. Sem
 * isso o atalho seria letra morta na maior parte do tempo — que e exatamente o
 * estado normal da tela.
 */
export const requestCommit = () => {
  if (!state.changesOpen) {
    openChanges();
    return;
  }
  commitHandler?.();
};

/* ------------------------------------------------------------------ */
/* Seletores estaveis                                                  */
/* ------------------------------------------------------------------ */

export const selectTheme = (s: ShellState) => s.theme;
export const selectConfirm = (s: ShellState) => s.confirm;
export const selectCommitDraft = (s: ShellState) => s.commitDraft;
export const selectContextMenu = (s: ShellState) => s.contextMenu;
export const selectChangesOpen = (s: ShellState) => s.changesOpen;
export const selectSettingsOpen = (s: ShellState) => s.settingsOpen;
export const selectMobilePane = (s: ShellState) => s.mobilePane;
