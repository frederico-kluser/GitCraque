/**
 * STUB — o DndContext do @dnd-kit com sensores, overlay e onDragEnd.
 */
import { DndContext } from "@dnd-kit/core";
import type { GitDndProviderProps } from "@/types/modules";

export function GitDndProvider({ children }: GitDndProviderProps) {
  return <DndContext>{children}</DndContext>;
}
