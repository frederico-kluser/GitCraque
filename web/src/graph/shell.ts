/**
 * Peças comuns entre o cabecalho de colunas e as linhas do grafo.
 *
 * As colunas de metadados sao de largura fixa e a do assunto e elastica; o
 * cabecalho e cada linha usam A MESMA string de grid, entao nunca saem de
 * alinhamento. A largura da coluna do grafo depende do numero de lanes, entao
 * entra por variavel CSS (`--graph-col`) declarada no container.
 */
import { NODE } from "./paint.ts";
import type { CSSProperties } from "react";
import type { MenuItemSpec } from "@/hooks";
import type { CommitRef } from "@/types/git";
import type { GraphLayout, GraphMetrics } from "@/types/modules";
import type { RevealTarget } from "./reveal.ts";

/**
 * Densidade da coluna do grafo — ver `GraphViewProps.density`. `"comfortable"`
 * e o desenho de sempre; `"compact"` e o de tela pequena.
 */
export type GraphDensity = "comfortable" | "compact";

/**
 * O TEMPLATE DE COLUNAS por densidade — nao e classe, e VALOR da variavel
 * `--graph-cols`, injetada pelo container em `graphVars()`. O cabecalho e as
 * linhas herdam o MESMO valor, entao nao podem desalinhar nem em teoria.
 *
 * Confortavel: Grafo | Descricao | Autor | Data | Hash.
 * As tres colunas de metadado sao dimensionadas pelo conteudo REAL que o git
 * emite (nome de autor, `%ar` e o hash curto de 7), com uma folga pequena — o
 * que sobra vai todo para o assunto do commit.
 *
 * Compacta: Grafo | Descricao | Detalhes. Autor, data e hash colapsam para uma
 * linha de metadado embaixo do assunto (`CommitRow`), e a terceira coluna vira
 * o botao "⋯" — a porta do menu de contexto num dedo, onde o toque longo e
 * sequestrado pelo arraste. A coluna de assunto ganha minimo proprio
 * (`COMPACT_SUBJECT_MIN`): sem ele, um grafo largo espremeria o assunto a zero
 * em vez de rolar para o lado.
 */
export const COMPACT_SUBJECT_MIN = 160;
export const COMPACT_META_COL = 48;

export const GRID_TEMPLATE: Record<GraphDensity, string> = {
  comfortable: "var(--graph-col) minmax(0,1fr) 7rem 6rem 4.5rem",
  compact: `var(--graph-col) minmax(${COMPACT_SUBJECT_MIN}px,1fr) ${COMPACT_META_COL}px`,
};

/** Grid compartilhado — o mesmo em toda linha; a largura vem de `--graph-cols`. */
export const ROW_GRID = "grid grid-cols-[var(--graph-cols)] items-center";

/** Largura de conteudo da linha compacta — o minimo que a grade inteira ocupa. */
export const compactContentWidth = (graphWidth: number): number =>
  graphWidth + COMPACT_SUBJECT_MIN + COMPACT_META_COL;

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

/**
 * Variaveis CSS que o cabecalho e as linhas leem por heranca.
 *
 * `--graph-node-hover` e declarada UMA vez aqui, no container, e nao por linha:
 * o quanto a bola cresce e a mesma coisa para as 20 000 linhas, e o valor mora
 * em `paint.ts` junto do resto do desenho.
 */
export function graphVars(
  width: number,
  m: GraphMetrics,
  density: GraphDensity,
): CSSProperties {
  return {
    "--graph-col": `${width}px`,
    "--graph-cols": GRID_TEMPLATE[density],
    "--graph-pad": `${m.paddingLeft}px`,
    "--graph-node-hover": String(NODE.hoverScale),
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
  /** Duplo clique num chip de branch. Quem decide o que isso faz e o shell. */
  onRefActivate?: (refEntry: CommitRef) => void;
  /** Botao direito num chip de referencia; o shell decide o que oferecer. */
  onRefContextMenu?: (refEntry: CommitRef, position: { x: number; y: number }) => void;
  /**
   * ACRESCENTADO pela frente do grafo (aditivo): densidade desta linha.
   *
   * Espelha `GraphViewProps.density` — a linha precisa saber se a coluna de
   * metadados colapsou para montar a estrutura certa (assunto com a linha de
   * metadado embaixo, botao "⋯" na ponta).
   */
  density?: GraphDensity;
  /**
   * ACRESCENTADO pela frente do grafo (aditivo): construtor do menu de
   * contexto de um commit, para o "⋯" da linha e para o toque longo.
   *
   * O grafo nao sabe o que se pode fazer com um commit — o shell sabe. Quem
   * monta a lista e o shell, na hora do gesto, para o menu enxergar o estado
   * atual (selecao em lote, idioma).
   */
  buildCommitMenu?: (hash: string) => MenuItemSpec[];
  /**
   * ACRESCENTADO pela frente do grafo (aditivo): construtor do menu de
   * contexto de uma referencia, para o toque longo no chip.
   *
   * Mesmo contrato do commit: o grafo so avisa qual chip foi o gesto; quem
   * traduz isso em acoes e o shell.
   */
  buildRefMenu?: (refEntry: CommitRef) => MenuItemSpec[];
}
