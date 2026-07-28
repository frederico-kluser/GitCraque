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
  /** altura em px da faixa inferior (alteracoes + visualizador) */
  bottomHeight: number;
  commitDraft: CommitDraft;
  confirm: ConfirmAction | null;
}

const STORAGE_KEY = "gitcraque.shell";

const EMPTY_DRAFT: CommitDraft = { message: "", amend: false, signoff: false };

const DEFAULTS: ShellState = {
  theme: "dark",
  paletteOpen: false,
  railWidth: 264,
  detailWidth: 380,
  bottomHeight: 300,
  commitDraft: EMPTY_DRAFT,
  confirm: null,
};

/** So o que faz sentido sobreviver ao reload. */
type Persisted = Pick<ShellState, "theme" | "railWidth" | "detailWidth" | "bottomHeight">;

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
    bottomHeight: s.bottomHeight,
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
export const DETAIL_RANGE = { min: 280, max: 640 } as const;
export const BOTTOM_RANGE = { min: 120, max: 720 } as const;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const setRailWidth = (px: number) => set({ railWidth: clamp(px, RAIL_RANGE.min, RAIL_RANGE.max) });
export const setDetailWidth = (px: number) => set({ detailWidth: clamp(px, DETAIL_RANGE.min, DETAIL_RANGE.max) });
export const setBottomHeight = (px: number) =>
  set({ bottomHeight: clamp(px, BOTTOM_RANGE.min, Math.min(BOTTOM_RANGE.max, window.innerHeight - 220)) });

export const setCommitDraft = (patch: Partial<CommitDraft>) =>
  set((s) => ({ commitDraft: { ...s.commitDraft, ...patch } }));

export const askConfirm = (confirm: Omit<ConfirmAction, "id"> & { id?: string }) =>
  set({ confirm: { id: confirm.id ?? `confirm-${Date.now().toString(36)}`, ...confirm } });

export const closeConfirm = () => set({ confirm: null });

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
