/**
 * MOTOR DO GRAFO — fronteira publica do modulo `src/graph`.
 * Dono: a frente "grafo". O resto do app so pode importar daqui.
 */
export { GraphView } from "./GraphView";
export { computeGraphLayout, DEFAULT_METRICS } from "./layout";
export { buildEdgePath } from "./bezier";
export type {
  GraphEdge,
  GraphLayout,
  GraphMetrics,
  GraphViewProps,
  PositionedCommit,
} from "@/types/modules";
