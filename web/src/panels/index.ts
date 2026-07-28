/**
 * PAINEIS — fronteira publica de `src/panels`.
 * Dono: a frente "shell/paineis".
 */
export { RailPanels } from "./RailPanels";
export { SidePanel } from "./SidePanel";
export { DetailPanel } from "./DetailPanel";
export type { DetailPanelProps } from "./DetailPanel";
export { FileViewPanel } from "./FileViewPanel";
export type { FileViewPanelProps } from "./FileViewPanel";
/* A gaveta e montada UMA vez pelo shell, como o `DialogHost`: ela e chamada
 * pelo botao de commit da toolbar, nao por quem a renderiza. */
export { ChangesSheet } from "./ChangesSheet";
export { StatusPanel } from "./StatusPanel";
export { Toolbar } from "./Toolbar";
export type { PanelProps } from "@/types/modules";
