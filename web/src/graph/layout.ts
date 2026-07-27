/**
 * STUB — sera substituido pela implementacao real do motor de layout.
 *
 * Contrato obrigatorio (ver docs/ARCHITECTURE.md §Grafo):
 *  - Y = indice topologico, na ordem EXATA em que `git log --topo-order` devolveu.
 *  - X = lane, distribuida por heuristica de "branch children" x "merge children".
 *  - Sem biblioteca pronta de gitgraph.
 */
import type { RawCommit } from "@/types/git";
import type { GraphLayout, GraphMetrics } from "@/types/modules";

export const DEFAULT_METRICS: GraphMetrics = {
  rowHeight: 28,
  laneWidth: 16,
  nodeRadius: 4.5,
  paddingLeft: 14,
  strokeWidth: 2,
};

export function computeGraphLayout(commits: RawCommit[]): GraphLayout {
  const started = performance.now();
  const index = new Map<string, number>();
  commits.forEach((c, i) => index.set(c.hash, i));
  return {
    nodes: commits.map((commit, row) => ({
      commit,
      row,
      lane: 0,
      color: 0,
      isMerge: commit.parents.length > 1,
      isTip: false,
      isRoot: commit.parents.length === 0,
    })),
    edges: [],
    index,
    laneCount: 1,
    elapsedMs: performance.now() - started,
  };
}
