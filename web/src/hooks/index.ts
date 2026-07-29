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

export { useRepoPoll, REPO_POLL_MS } from "./useRepoPoll";
export { useAutoFetch } from "./useAutoFetch";
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
  setCommitDraft,
  askConfirm,
  closeConfirm,
  openContextMenu,
  closeContextMenu,
  contextMenuFor,
  registerCommitHandler,
  requestCommit,
  selectTheme,
  selectConfirm,
  selectCommitDraft,
  selectContextMenu,
  selectChangesOpen,
  selectSettingsOpen,
  RAIL_RANGE,
  DETAIL_RANGE,
  AUTO_FETCH_OPTIONS,
} from "./useShellStore";
export type {
  ShellState,
  ThemeMode,
  CommitDraft,
  ConfirmAction,
  ConfirmField,
  ContextMenuRequest,
  MenuItemSpec,
} from "./useShellStore";
