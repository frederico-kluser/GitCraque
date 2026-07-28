/**
 * Hooks de ligacao com o @dnd-kit.
 *
 * A codificacao dos ids — e a razao de ela ter escopo — mora em `ids.ts`, que
 * nao importa nada em tempo de execucao e por isso e coberto por teste.
 */
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { DragPayload, DropPayload } from "@/types/git";
import { encodeId } from "./ids.ts";
import type { DndScope } from "./ids.ts";

export { encodeId, decodeId, SCOPE_SEP } from "./ids.ts";
export type { DndScope } from "./ids.ts";

/**
 * @param scope onde este no vive. Passe SEMPRE — o default existe so para nao
 *   quebrar chamadas antigas, e dois nos da mesma entidade em escopos iguais
 *   se sobrescrevem no registro do @dnd-kit.
 */
export function useDraggableEntity(payload: DragPayload, scope: DndScope = "app") {
  return useDraggable({ id: encodeId(payload.type, payload.key, scope), data: payload });
}

export function useDroppableTarget(payload: DropPayload, scope: DndScope = "app") {
  return useDroppable({ id: encodeId(payload.type, payload.key, scope), data: payload });
}
