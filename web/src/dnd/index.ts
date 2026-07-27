/**
 * MOTOR SEMANTICO DE DRAG-AND-DROP — fronteira publica de `src/dnd`.
 * Dono: a frente "dnd". Obrigatoriamente sobre @dnd-kit/core.
 *
 * ── Como um modulo vizinho usa isto ───────────────────────────────────
 *
 * 1. Tornar algo arrastavel (grafo, rail):
 *
 *      const { attributes, listeners, setNodeRef, isDragging } =
 *        useDraggableEntity({ type: "commit", key: hash, label: short(hash), detail: subject });
 *      <div ref={setNodeRef} {...attributes} {...listeners} />
 *
 * 2. Tornar algo um alvo, com feedback de validade em tempo real:
 *
 *      const payload: DropPayload = { type: "branch", key: branch.name, label: branch.name };
 *      const { setNodeRef } = useDroppableTarget(payload);
 *      const feedback = useDropFeedback(payload);   // ou useDropFeedback(encodeId("branch", name))
 *      <span ref={setNodeRef} data-drop={feedback.state} title={feedback.reason} />
 *
 *    `feedback.state` e um de "idle" | "dragging" | "accepts" | "rejects" —
 *    pinte a borda a partir dele. `feedback.reason` traz o motivo da recusa
 *    (mesmo texto que vai ao toast se o usuario soltar assim mesmo).
 *
 * 3. Saber o que esta sendo arrastado agora, em qualquer alvo:
 *      const active = useActiveDrag();   // DragPayload | null
 *
 * Regra que nao muda: `onDragEnd` NAO executa comando nenhum. Ele resolve a
 * intencao e chama `onIntent`; o shell joga em `setPendingIntent` e o
 * `DialogHost` confirma e executa.
 */
export { GitDndProvider, useDropFeedback, useActiveDrag } from "./GitDndProvider";
export type { DropFeedback, DropFeedbackState } from "./GitDndProvider";
export { resolveDragIntent, INTENT_ENDPOINTS } from "./intents";
export type { DragIntentContext } from "./intents";
export { useDraggableEntity, useDroppableTarget, encodeId, decodeId } from "./bindings";
export type { GitDndProviderProps, ResolveDragIntent } from "@/types/modules";
