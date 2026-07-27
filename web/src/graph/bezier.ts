/**
 * GEOMETRIA DAS ARESTAS — o atributo `d` dos <path> do grafo.
 *
 * Uma aresta liga o filho (linha menor) ao pai (linha maior) passando por uma
 * lane intermediaria, `throughLane`, que o layout manteve RESERVADA durante todo
 * o intervalo [fromRow, toRow]. Isso da a forma:
 *
 *     filho ●                 fromLane
 *            \                curva de UMA linha de altura
 *             |               throughLane — reta vertical, o trecho longo
 *             |
 *            /                curva de UMA linha de altura
 *      pai  ●                 toLane
 *
 * Duas consequencias importantes:
 *
 * 1. A curva se acomoda junto do extremo que muda de lane e o meio segue reto —
 *    nunca uma diagonal longa e frouxa atravessando dezenas de linhas.
 * 2. Nenhuma aresta passa por cima de um <circle> alheio. As curvas so existem
 *    na linha do filho e na linha do pai, e nessas duas linhas o unico commit
 *    desenhado e o proprio extremo da aresta. O trecho reto vive em
 *    `throughLane`, que estava reservada — logo, vazia de commits.
 *
 * As curvas sao Bezier CUBICAS com pontos de controle verticais, para a linha
 * sair e chegar na vertical e nao formar bico (docs/ARCHITECTURE.md §2):
 *
 *     M x1 y1  C x1 (y1 + k)   x2 (y2 - k)   x2 y2      com k ~ rowHeight * 0.75
 *
 * Sem import de runtime: roda tal e qual sob `node --test`.
 */
import type { GraphEdge, GraphMetrics } from "@/types/modules";

/** Fator dos pontos de controle, em fracao de uma linha. */
export const CONTROL_RATIO = 0.75;

/** Centro horizontal de uma lane, em px. */
export const laneX = (lane: number, m: GraphMetrics): number =>
  m.paddingLeft + lane * m.laneWidth;

/** Centro vertical de uma linha, em px (o mesmo Y do <circle> do commit). */
export const rowY = (row: number, m: GraphMetrics): number =>
  row * m.rowHeight + m.rowHeight / 2;

/** Um trecho reto vertical, sempre de cima para baixo. */
export interface LineSegment {
  kind: "line";
  x: number;
  y1: number;
  y2: number;
}

/** Um trecho curvo entre duas lanes, de uma linha de altura. */
export interface CurveSegment {
  kind: "curve";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type EdgeSegment = LineSegment | CurveSegment;

/** Formata sem lixo de ponto flutuante e sem zeros a direita. */
const f = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};

/**
 * Decompoe a aresta nos seus trechos, em coordenadas ABSOLUTAS de px.
 * Sempre em ordem de cima para baixo e contiguos.
 */
export function edgeSegments(edge: GraphEdge, m: GraphMetrics): EdgeSegment[] {
  const fromRow = edge.fromRow;
  const toRow = edge.toRow;
  const from = edge.fromLane;
  const to = edge.toLane;
  /* aresta montada a mao (fora do layout) pode nao trazer throughLane. */
  const through = edge.throughLane ?? from;

  const xFrom = laneX(from, m);
  const xThrough = laneX(through, m);
  const xTo = laneX(to, m);
  const yFrom = rowY(fromRow, m);
  const yTo = rowY(toRow, m);

  /* mesma lane nos tres pontos: reta vertical, mais barato e mais limpo. */
  if (from === through && through === to) {
    return [{ kind: "line", x: xFrom, y1: yFrom, y2: yTo }];
  }

  /* uma linha de distancia: nao ha espaco para reta no meio, e uma curva so. */
  if (toRow - fromRow <= 1) {
    return from === to
      ? [{ kind: "line", x: xFrom, y1: yFrom, y2: yTo }]
      : [{ kind: "curve", x1: xFrom, y1: yFrom, x2: xTo, y2: yTo }];
  }

  const segments: EdgeSegment[] = [];
  let cursorY = yFrom;

  /* curva de saida, logo abaixo do filho (o caso das arestas de merge). */
  if (from !== through) {
    const y = rowY(fromRow + 1, m);
    segments.push({ kind: "curve", x1: xFrom, y1: yFrom, x2: xThrough, y2: y });
    cursorY = y;
  }

  /* curva de chegada, logo acima do pai (o caso de uma branch que converge). */
  const landingY = through !== to ? rowY(toRow - 1, m) : yTo;

  if (cursorY < landingY) {
    segments.push({ kind: "line", x: xThrough, y1: cursorY, y2: landingY });
  }
  if (through !== to) {
    segments.push({ kind: "curve", x1: xThrough, y1: landingY, x2: xTo, y2: yTo });
  }

  return segments;
}

function lineD(x: number, y1: number, y2: number): string {
  return `M ${f(x)} ${f(y1)} L ${f(x)} ${f(y2)}`;
}

function curveD(s: CurveSegment, dy: number, k: number): string {
  const y1 = s.y1 - dy;
  const y2 = s.y2 - dy;
  return `M ${f(s.x1)} ${f(y1)} C ${f(s.x1)} ${f(y1 + k)} ${f(s.x2)} ${f(y2 - k)} ${f(s.x2)} ${f(y2)}`;
}

/**
 * O `d` completo da aresta, em coordenadas absolutas do grafo.
 * Usado pelo gerador de SVG estatico e pelos testes de geometria.
 */
export function buildEdgePath(edge: GraphEdge, m: GraphMetrics): string {
  const k = m.rowHeight * CONTROL_RATIO;
  const parts: string[] = [];
  const segments = edgeSegments(edge, m);
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    parts.push(s.kind === "line" ? lineD(s.x, s.y1, s.y2) : curveD(s, 0, k));
  }
  return parts.join(" ");
}

/**
 * O `d` do PEDACO da aresta que cai na faixa de linhas [startRow, endRow] — e o
 * que a virtualizacao desenha dentro do <svg> de uma linha.
 *
 * `originRow` define a origem do sistema de coordenadas do resultado: com
 * `originRow = startRow` (o default) o Y sai relativo ao topo da faixa, que e
 * exatamente o que um <svg> de uma linha espera.
 *
 * Devolve `null` quando a aresta nao toca a faixa.
 *
 * Os trechos retos sao recortados no Y; os trechos curvos, que tem no maximo uma
 * linha de altura, saem inteiros e o proprio <svg> os corta — recortar uma
 * cubica exigiria subdividi-la (de Casteljau) para ganhar, no maximo, uma linha
 * de sobredesenho.
 */
export function clipEdgePath(
  edge: GraphEdge,
  m: GraphMetrics,
  startRow: number,
  endRow: number,
  originRow: number = startRow,
): string | null {
  const top = startRow * m.rowHeight;
  const bottom = (endRow + 1) * m.rowHeight;
  const dy = originRow * m.rowHeight;
  const k = m.rowHeight * CONTROL_RATIO;

  const parts: string[] = [];
  const segments = edgeSegments(edge, m);
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s.kind === "line") {
      const y1 = Math.max(s.y1, top);
      const y2 = Math.min(s.y2, bottom);
      if (y2 <= y1) continue;
      parts.push(lineD(s.x, y1 - dy, y2 - dy));
    } else {
      if (s.y2 <= top || s.y1 >= bottom) continue;
      parts.push(curveD(s, dy, k));
    }
  }

  return parts.length === 0 ? null : parts.join(" ");
}

/** true quando a aresta atravessa a linha (os dois extremos inclusive). */
export const edgeCrossesRow = (edge: GraphEdge, row: number): boolean =>
  edge.fromRow <= row && row <= edge.toRow;
