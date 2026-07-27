/**
 * MOTOR SEMANTICO DE DRAG-AND-DROP — fronteira publica de `src/dnd`.
 * Dono: a frente "dnd". Obrigatoriamente sobre @dnd-kit/core.
 */
export { GitDndProvider } from "./GitDndProvider";
export { resolveDragIntent } from "./intents";
export { useDraggableEntity, useDroppableTarget, encodeId, decodeId } from "./bindings";
export type { GitDndProviderProps, ResolveDragIntent } from "@/types/modules";
