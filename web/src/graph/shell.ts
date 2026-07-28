/**
 * Peças comuns entre o cabecalho de colunas e as linhas do grafo.
 *
 * As colunas de metadados sao de largura fixa e a do assunto e elastica; o
 * cabecalho e cada linha usam A MESMA string de grid, entao nunca saem de
 * alinhamento. A largura da coluna do grafo depende do numero de lanes, entao
 * entra por variavel CSS (`--graph-col`) declarada no container.
 */
import type { CSSProperties } from "react";
import type { GraphLayout, GraphMetrics } from "@/types/modules";
import type { RevealTarget } from "./reveal.ts";

/** Grid compartilhado: Grafo | Descricao | Autor | Data | Hash. */
export const ROW_GRID =
  "grid grid-cols-[var(--graph-col)_minmax(0,1fr)_9rem_7rem_5.5rem] items-center";

/** Linhas acima e abaixo da janela que ficam montadas para o scroll nao piscar. */
export const OVERSCAN = 6;

/** Altura usada enquanto o ResizeObserver ainda nao mediu o container. */
export const FALLBACK_HEIGHT = 600;

/** Largura minima da coluna do grafo, para o cabecalho nao colapsar. */
const MIN_GRAPH_WIDTH = 56;

/** Largura da coluna do grafo: padding + lanes + padding. */
export const graphColumnWidth = (laneCount: number, m: GraphMetrics): number =>
  Math.max(
    MIN_GRAPH_WIDTH,
    m.paddingLeft * 2 + Math.max(0, laneCount - 1) * m.laneWidth,
  );

/** Variaveis CSS que o cabecalho e as linhas leem por heranca. */
export function graphVars(width: number, m: GraphMetrics): CSSProperties {
  return {
    "--graph-col": `${width}px`,
    "--graph-pad": `${m.paddingLeft}px`,
  } as CSSProperties;
}

/** id estavel de uma linha, para `aria-activedescendant`. */
export const rowDomId = (hash: string) => `graph-row-${hash}`;

/** O que cada linha virtualizada recebe do `itemData` da lista. */
export interface GraphRowData {
  layout: GraphLayout;
  metrics: GraphMetrics;
  graphWidth: number;
  selected: Set<string>;
  primary: string | null;
  headHash: string | null;
  /**
   * Linha marcada pelo reveal — realce TEMPORARIO, some sozinho. Carrega o
   * nonce junto para que revelar o mesmo commit de novo reanime o realce em vez
   * de deixar a marca parada na tela.
   */
  marked: RevealTarget | null;
  onSelect: (hash: string, mode: "replace" | "toggle" | "range") => void;
  onContextMenu?: (hash: string, position: { x: number; y: number }) => void;
  onFocusGrid: () => void;
}
