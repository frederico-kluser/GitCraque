/**
 * MOTOR DO GRAFO — fronteira publica do modulo `src/graph`.
 * Dono: a frente "grafo". O resto do app so pode importar daqui.
 */
export { GraphView } from "./GraphView.tsx";
export { computeGraphLayout, DEFAULT_METRICS } from "./layout.ts";
export type { GraphLayoutOptions } from "./layout.ts";
export { buildEdgePath, clipEdgePath, edgeSegments, laneX, rowY } from "./bezier.ts";
export type { EdgeSegment } from "./bezier.ts";
export type {
  GraphEdge,
  GraphLayout,
  GraphMetrics,
  GraphRowIndex,
  GraphViewProps,
  PositionedCommit,
} from "@/types/modules";
