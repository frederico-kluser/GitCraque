/**
 * STUB — gerador do atributo `d` dos <path> do grafo.
 * A implementacao real usa curvas de Bezier CUBICAS (comando `C`) para as
 * transicoes de lane, e uma reta vertical quando pai e filho compartilham lane.
 */
import type { GraphEdge, GraphMetrics } from "@/types/modules";

export function buildEdgePath(edge: GraphEdge, m: GraphMetrics): string {
  const x = (lane: number) => m.paddingLeft + lane * m.laneWidth;
  const y = (row: number) => row * m.rowHeight + m.rowHeight / 2;
  return `M ${x(edge.fromLane)} ${y(edge.fromRow)} L ${x(edge.toLane)} ${y(edge.toRow)}`;
}
