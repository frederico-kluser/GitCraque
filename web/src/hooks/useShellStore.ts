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
 * Rascunho do commit.
 *
 * Mora aqui, e nao no `StatusPanel`, por um motivo mecanico: o rodape virou
 * `SmoothTabs`, e o componente do catalogo renderiza SO o painel ativo — trocar
 * para o Visualizador desmonta o painel de alteracoes. Com o rascunho local, um
 * clique num arquivo apagaria a mensagem que a pessoa estava escrevendo.
 */
export interface CommitDraft {
  message: string;
  amend: boolean;
  signoff: boolean;
}

export interface ShellState {
  theme: ThemeMode;
  paletteOpen: boolean;
  /** larguras em px das colunas laterais do grid principal */
  railWidth: number;
  detailWidth: number;
  /**
   * Altura em px da gaveta de CIMA do sidebar direito (o detalhe do commit).
   * A de baixo — alteracoes e visualizador — fica com o resto.
   */
  sideSplit: number;
  /**
   * Qual das duas gavetas do sidebar direito esta aberta.
   *
   *   "split"  as duas, divididas por `sideSplit`
   *   "detail" so o detalhe; a de baixo recolhida ao cabecalho
   *   "work"   so alteracoes/visualizador; a de cima recolhida ao cabecalho
   *
   * Minimizar uma e maximizar a outra sao o MESMO movimento — por isso um
   * estado so, em vez de dois booleanos que poderiam se contradizer (as duas
   * recolhidas nao mostraria nada).
   */
  sideLayout: SideLayout;
  commitDraft: CommitDraft;
  confirm: ConfirmAction | null;
  /** menu de contexto aberto agora, com o ponto do clique. */
  contextMenu: ContextMenuRequest | null;
}

export type SideLayout = "split" | "detail" | "work";

const STORAGE_KEY = "gitcraque.shell";

const EMPTY_DRAFT: CommitDraft = { message: "", amend: false, signoff: false };

const DEFAULTS: ShellState = {
  theme: "dark",
  paletteOpen: false,
  railWidth: 264,
  // O sidebar direito passou a abrigar TAMBEM o visualizador de arquivo, entao
  // ele nasce bem mais largo do que quando so tinha os metadados do commit.
  detailWidth: 560,
  sideSplit: 340,
  sideLayout: "split",
  commitDraft: EMPTY_DRAFT,
  confirm: null,
  contextMenu: null,
};

/** So o que faz sentido sobreviver ao reload. */
type Persisted = Pick<
  ShellState,
  "theme" | "railWidth" | "detailWidth" | "sideSplit" | "sideLayout"
>;

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
    sideSplit: s.sideSplit,
    sideLayout: s.sideLayout,
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

const stored = readPersisted();
const INITIAL: ShellState = {
  ...DEFAULTS,
  ...stored,
  theme: initialTheme(stored),
  // nunca restaura estado efemero
  paletteOpen: false,
  commitDraft: EMPTY_DRAFT,
  confirm: null,
  contextMenu: null,
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

export const setPaletteOpen = (paletteOpen: boolean) => set({ paletteOpen });
export const togglePalette = () => set((s) => ({ paletteOpen: !s.paletteOpen }));

/** Limites para as colunas nao sumirem nem engolirem o grafo. */
export const RAIL_RANGE = { min: 200, max: 460 } as const;
/** O sidebar direito abriga o visualizador de diff: precisa caber um patch. */
export const DETAIL_RANGE = { min: 320, max: 980 } as const;
/** Altura da gaveta de cima. O minimo deixa ver o cabecalho do commit. */
export const SIDE_RANGE = { min: 140, max: 900 } as const;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const setRailWidth = (px: number) => set({ railWidth: clamp(px, RAIL_RANGE.min, RAIL_RANGE.max) });
export const setDetailWidth = (px: number) => set({ detailWidth: clamp(px, DETAIL_RANGE.min, DETAIL_RANGE.max) });

/**
 * Altura da gaveta de cima. O teto acompanha a janela para a de baixo nunca
 * ficar sem espaco de respiro (~160 px de cabecalho + conteudo minimo).
 */
export const setSideSplit = (px: number) => {
  const teto =
    typeof window === "undefined" ? SIDE_RANGE.max : Math.max(SIDE_RANGE.min, window.innerHeight - 300);
  set({ sideSplit: clamp(px, SIDE_RANGE.min, Math.min(SIDE_RANGE.max, teto)) });
};

export const setSideLayout = (sideLayout: SideLayout) => set({ sideLayout });

/** Recolhe uma gaveta — o que e o mesmo que maximizar a outra. */
export const minimizeSide = (qual: "detail" | "work") =>
  set({ sideLayout: qual === "detail" ? "work" : "detail" });

/** Maximiza uma gaveta; clicar de novo volta para a divisao. */
export const toggleMaximizeSide = (qual: "detail" | "work") =>
  set((s) => ({ sideLayout: s.sideLayout === qual ? "split" : qual }));

export const restoreSide = () => set({ sideLayout: "split" });

export const setCommitDraft = (patch: Partial<CommitDraft>) =>
  set((s) => ({ commitDraft: { ...s.commitDraft, ...patch } }));

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

export const requestCommit = () => commitHandler?.();

/* ------------------------------------------------------------------ */
/* Seletores estaveis                                                  */
/* ------------------------------------------------------------------ */

export const selectTheme = (s: ShellState) => s.theme;
export const selectConfirm = (s: ShellState) => s.confirm;
export const selectCommitDraft = (s: ShellState) => s.commitDraft;
export const selectContextMenu = (s: ShellState) => s.contextMenu;
