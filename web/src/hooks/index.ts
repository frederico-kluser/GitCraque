/**
 * HOOKS DO SHELL — fronteira interna de `src/hooks`.
 * Consumido por `src/app` e `src/panels`; nenhum outro modulo depende daqui.
 */
export { useHotkeys } from "./useHotkeys";
export type { HotkeyHandlers } from "./useHotkeys";

export { useCommitDetail, useCommitDiff } from "./useCommitDetail";
export type { AsyncResource } from "./useCommitDetail";

export { useStickToBottom } from "./useStickToBottom";
export { useTrickle } from "./useTrickle";
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
  setBottomHeight,
  setConsoleFilter,
  focusConsoleLine,
  askConfirm,
  closeConfirm,
  matchesConsoleFilter,
  registerCommitHandler,
  requestCommit,
  selectTheme,
  selectConfirm,
  RAIL_RANGE,
  DETAIL_RANGE,
  BOTTOM_RANGE,
} from "./useShellStore";
export type { ShellState, ThemeMode, ConsoleFilter, ConfirmAction, ConfirmField } from "./useShellStore";
