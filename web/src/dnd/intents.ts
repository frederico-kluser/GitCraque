/**
 * STUB — as regras duras de intercepcao. Sera substituido pela implementacao real.
 *
 * Regras obrigatorias:
 *   commit → branch  ⇒ cherry-pick (confirmacao simples)
 *   branch → branch  ⇒ dialogo com as intencoes `merge` e `rebase`
 */
import type { DragIntent, DragPayload, DropPayload, RefsPayload } from "@/types/git";

export function resolveDragIntent(
  source: DragPayload,
  target: DropPayload,
  _context: { refs: RefsPayload | null; headBranch: string | null },
): DragIntent {
  return {
    kind: "invalid",
    source,
    target,
    title: "Nao implementado",
    description: "O motor de intencoes ainda nao foi escrito.",
    options: [],
    allowed: false,
    reason: "stub",
  };
}
