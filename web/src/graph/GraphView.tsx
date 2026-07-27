/**
 * STUB — a View Tree virtualizada. Sera substituida pela implementacao real
 * (react-window + SVG customizado com <circle> e <path> de Bezier cubica).
 */
import type { GraphViewProps } from "@/types/modules";

export function GraphView({ commits, className }: GraphViewProps) {
  return (
    <div className={className} data-stub="graph-view">
      <p className="p-6 text-sm text-muted-foreground">
        Motor do grafo ainda nao implementado — {commits.length} commits carregados.
      </p>
    </div>
  );
}
