/**
 * Codificacao dos ids do @dnd-kit e hooks de ligacao.
 * `id` = `${type}:${key}` — estavel entre renders, requisito de estabilidade
 * espacial do @dnd-kit (ids que mudam derrubam a medicao de colisao).
 */
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { DragPayload, DropPayload } from "@/types/git";

export const encodeId = (type: string, key: string) => `${type}:${key}`;

export function decodeId(id: string): { type: string; key: string } {
  const i = id.indexOf(":");
  return i < 0 ? { type: id, key: "" } : { type: id.slice(0, i), key: id.slice(i + 1) };
}

export function useDraggableEntity(payload: DragPayload) {
  return useDraggable({ id: encodeId(payload.type, payload.key), data: payload });
}

export function useDroppableTarget(payload: DropPayload) {
  return useDroppable({ id: encodeId(payload.type, payload.key), data: payload });
}
