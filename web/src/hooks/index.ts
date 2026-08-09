/**
 * HOOKS DO SHELL — fronteira interna de `src/hooks`.
 * Consumido por `src/app` e `src/panels`; nenhum outro modulo depende daqui.
 */
export { useHotkeys } from "./useHotkeys";
export type { HotkeyHandlers } from "./useHotkeys";

/* `useCommitDiff` continua exportado embora nenhum painel o use hoje: o diff
 * saiu do painel de detalhe e foi para o visualizador do rodape, que e de outra
 * frente. O recurso (carrega por hash, com cache e descarte de resposta
 * obsoleta) segue valido para quem precisar do patch inteiro de um commit. */
export { useCommitDetail, useCommitDiff } from "./useCommitDetail";
export type { AsyncResource } from "./useCommitDetail";

export { useDocumentTitle, buildDocumentTitle } from "./useDocumentTitle";

export { useRepoPoll, REPO_POLL_MS } from "./useRepoPoll";
export { useAutoFetch } from "./useAutoFetch";
export { useLifecycleRecovery, REVIVE_AFTER_HIDDEN_MS } from "./useLifecycleRecovery";
export { useTrickle } from "./useTrickle";
/* O microfone saiu da interface (a area de IA virou so texto), mas o hook
 * continua exportado e intacto — ver o cabecalho dele e a secao "Voz" de
 * `docs/ARCHITECTURE.md` para religar. */
export { useVoiceRecorder } from "./useVoiceRecorder";
export type { MicSupport, VoiceRecorder } from "./useVoiceRecorder";
export { useProjects, loadProjects, getProjects, toggleFavorite } from "./useProjects";
export type { ProjectsState } from "./useProjects";
export { useWorkingDiffStats } from "./useWorkingDiff";
export type { DiffStats, FileDelta } from "./useWorkingDiff";
export { useCommitActivity, relativeDateToDays } from "./useCommitActivity";
export type { CommitActivity } from "./useCommitActivity";

/* Fundacao de tela e ponteiro: quem decide layout le `isMobile`/`isTablet`,
 * quem decide tamanho de alvo le `isTouch`/`coarsePointer`. Sao perguntas
 * diferentes — ver o cabecalho de `useViewport.ts`. */
export {
  useViewport,
  useViewportValue,
  getViewport,
  BREAKPOINTS,
  selectIsMobile,
  selectIsTablet,
  selectIsDesktop,
  selectIsTouch,
  selectCoarsePointer,
  selectLandscape,
} from "./useViewport";
export type { Viewport } from "./useViewport";

/* O botao direito do dedo. `longPressMenu` (abaixo, do shell store) e o que a
 * interface usa; estes tres sao a mecanica por baixo — `withLongPress` para
 * encadear com os `listeners` do @dnd-kit, `chain` para um handler solto e
 * `cancelLongPress` para o motor de arraste matar o menu ao acordar. */
export {
  useLongPress,
  longPressHandlers,
  withLongPress,
  chain,
  cancelLongPress,
  MOVE_TOLERANCE_PX,
  GHOST_WINDOW_MS,
} from "./useLongPress";
export type {
  LongPressBundle,
  LongPressOptions,
  LongPressOrigin,
  LongPressPoint,
  LongPressPointerEvent,
  LongPressMouseEvent,
} from "./useLongPress";

/* Uma coluna ou tres. `useLayoutMode()` e o que `App.tsx` observa; a
 * preferencia crua e `selectLayoutMode`, do shell store. */
export { useLayoutMode, getLayoutMode, resolveLayout, selectAutoLayout } from "./useLayoutMode";
export type { ResolvedLayout } from "./useLayoutMode";

export {
  useShellState,
  getShellState,
  applyTheme,
  setTheme,
  toggleTheme,
  setAutoFetchMs,
  openSettings,
  closeSettings,
  setRailWidth,
  setDetailWidth,
  openChanges,
  closeChanges,
  toggleChanges,
  openPalette,
  closePalette,
  setPaletteOpen,
  setCommitDraft,
  setMobilePane,
  setLayoutMode,
  applyTouchTargets,
  setForceTouchTargets,
  toggleForceTouchTargets,
  setTouchSelectionMode,
  toggleTouchSelectionMode,
  askConfirm,
  closeConfirm,
  openContextMenu,
  closeContextMenu,
  contextMenuFor,
  longPressMenu,
  registerCommitHandler,
  requestCommit,
  selectTheme,
  selectConfirm,
  selectCommitDraft,
  selectContextMenu,
  selectChangesOpen,
  selectSettingsOpen,
  selectPaletteOpen,
  selectMobilePane,
  selectLayoutMode,
  selectForceTouchTargets,
  selectTouchSelectionMode,
  RAIL_RANGE,
  DETAIL_RANGE,
  AUTO_FETCH_OPTIONS,
  LONG_PRESS_MS,
  DND_DELAY_MS,
} from "./useShellStore";
export type {
  ShellState,
  ThemeMode,
  MobilePane,
  LayoutMode,
  CommitDraft,
  ConfirmAction,
  ConfirmField,
  ContextMenuRequest,
  MenuItemSpec,
} from "./useShellStore";
