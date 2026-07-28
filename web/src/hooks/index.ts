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
export { useTrickle } from "./useTrickle";
export { useVoiceRecorder } from "./useVoiceRecorder";
export type { MicSupport, VoiceRecorder } from "./useVoiceRecorder";
export { useProjects, loadProjects, getProjects } from "./useProjects";
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
  setPaletteOpen,
  togglePalette,
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
  RAIL_RANGE,
  DETAIL_RANGE,
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
