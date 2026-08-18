/**
 * Peças comuns entre o cabecalho de colunas e as linhas do grafo.
 *
 * As colunas de metadados sao de largura fixa e a do assunto e elastica; o
 * cabecalho e cada linha usam A MESMA string de grid, entao nunca saem de
 * alinhamento. A largura da coluna do grafo depende do numero de lanes, entao
 * entra por variavel CSS (`--graph-col`) declarada no container.
 *
 * DUAS larguras, e a diferenca entre elas e o assunto deste arquivo: o SPAN e
 * o desenho inteiro (cresce com as lanes, sem limite) e o BOX e a janela por
 * onde ele aparece (o span, limitado pelo teto de `COLUMN`). Iguais enquanto o
 * grafo e estreito; assim que o span passa do teto, o box para e o que sobra
 * vira rolagem horizontal dentro da propria coluna.
 */
import { COLUMN, NODE } from "./paint.ts";
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

/**
 * Largura de conteudo da linha compacta — o minimo que a grade inteira ocupa.
 *
 * Recebe o BOX da coluna, nao o span: o desenho que passa do teto rola dentro
 * da coluna e nao empurra mais a linha. Com o teto compacto de 160px a conta
 * fecha em 160 + 160 + 48 = 368px, abaixo dos 375px do celular mais estreito
 * comum — ou seja, na pratica sobra UM rolador na tela, o do grafo.
 *
 * O piso artificial de 480px que morava aqui foi removido junto com o teto:
 * ele existia para FORCAR a rolagem lateral da linha quando o grafo era largo,
 * e agora e o grafo que rola sozinho. O que sobrou desta funcao e a protecao
 * real: numa tela de 320px a linha ainda rola em vez de cortar o conteudo.
 */
export const compactContentWidth = (graphBox: number): number =>
  graphBox + COMPACT_SUBJECT_MIN + COMPACT_META_COL;

/** Linhas acima e abaixo da janela que ficam montadas para o scroll nao piscar. */
export const OVERSCAN = 6;

/** Altura usada enquanto o ResizeObserver ainda nao mediu o container. */
export const FALLBACK_HEIGHT = 600;

/** Largura minima da coluna do grafo, para o cabecalho nao colapsar. */
const MIN_GRAPH_WIDTH = 56;

/**
 * O SPAN — a largura NATURAL do desenho: padding + lanes + padding.
 *
 * E a largura do `<svg>` que a linha desenharia se a tela fosse infinita, e
 * continua sendo a origem das coordenadas de `laneX`. Nao tem teto de
 * proposito: quem corta e o box.
 */
export const graphColumnSpan = (laneCount: number, m: GraphMetrics): number =>
  Math.max(
    MIN_GRAPH_WIDTH,
    m.paddingLeft * 2 + Math.max(0, laneCount - 1) * m.laneWidth,
  );

/** O teto da coluna nesta densidade — os numeros moram em `paint.ts`. */
export const columnMax = (density: GraphDensity): number =>
  density === "compact" ? COLUMN.maxCompact : COLUMN.max;

/**
 * O BOX — a largura VISIVEL da coluna: o span, limitado pelo teto.
 *
 * E o valor que vira `--graph-col` (a faixa da grade) e a largura do `<svg>`
 * de cada linha. Quando `box < span` ha o que rolar, e essa comparacao e a
 * unica condicao que liga a barra de rolagem do grafo.
 */
export const graphColumnBox = (span: number, density: GraphDensity): number =>
  Math.min(span, columnMax(density));

/**
 * Variaveis CSS que o cabecalho e as linhas leem por heranca.
 *
 * `--graph-node-hover` e declarada UMA vez aqui, no container, e nao por linha:
 * o quanto a bola cresce e a mesma coisa para as 20 000 linhas, e o valor mora
 * em `paint.ts` junto do resto do desenho.
 */
export function graphVars(
  box: number,
  span: number,
  m: GraphMetrics,
  density: GraphDensity,
): CSSProperties {
  return {
    "--graph-col": `${box}px`,
    "--graph-cols": GRID_TEMPLATE[density],
    "--graph-pad": `${m.paddingLeft}px`,
    "--graph-node-hover": String(NODE.hoverScale),
    /* A fracao do desenho que cabe na janela — e ela que da o TAMANHO do
       polegar da barra (`--graph-col * --graph-ratio`) e o quanto ele anda
       para cada pixel rolado. Sem teto ela vale 1 e nao ha barra nenhuma. */
    "--graph-ratio": String(span > 0 ? box / span : 1),
  } as CSSProperties;
}

/** id estavel de uma linha, para `aria-activedescendant`. */
export const rowDomId = (hash: string) => `graph-row-${hash}`;

/** O que cada linha virtualizada recebe do `itemData` da lista. */
export interface GraphRowData {
  layout: GraphLayout;
  metrics: GraphMetrics;
  /**
   * A largura VISIVEL da coluna (o box), nao o desenho inteiro: e a largura do
   * `<svg>` da linha e o recorte do que aparece. O deslocamento horizontal nao
   * vem por aqui — ele e a variavel CSS `--graph-scroll-x`, herdada do
   * container, justamente para nao re-renderizar linha nenhuma ao rolar.
   */
  graphBox: number;
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
