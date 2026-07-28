/**
 * Ferramentas de verificacao geometrica usadas pelos testes.
 *
 * A regra de qualidade "nenhuma aresta cruza o <circle> de um commit que nao
 * seja seu extremo" nao da para provar no olho: aqui as arestas sao AMOSTRADAS
 * de verdade (avaliando a cubica ponto a ponto) e cada amostra e conferida
 * contra o circulo da linha em que ela cai.
 */
import { CONTROL_RATIO, edgeSegments } from "../bezier.ts";
import type { GraphEdge, GraphLayout, GraphMetrics } from "@/types/modules";

export interface Point {
  x: number;
  y: number;
}

/** Avalia uma cubica de controle vertical no parametro t. */
function cubicAt(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  k: number,
  t: number,
): Point {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return {
    x: b0 * x1 + b1 * x1 + b2 * x2 + b3 * x2,
    y: b0 * y1 + b1 * (y1 + k) + b2 * (y2 - k) + b3 * y2,
  };
}

/** Amostra a aresta inteira, em coordenadas absolutas do grafo. */
export function sampleEdge(
  edge: GraphEdge,
  m: GraphMetrics,
  perRow = 8,
): Point[] {
  /* o MESMO k que `bezier.ts` usa para desenhar. Cravar 0.75 aqui fazia a
     amostragem divergir do traco real assim que a curvatura fosse ajustada em
     `paint.ts`, e o teste de colisao passaria a conferir uma curva que ninguem
     desenha. */
  const k = m.rowHeight * CONTROL_RATIO;
  const points: Point[] = [];
  for (const s of edgeSegments(edge, m)) {
    if (s.kind === "line") {
      const steps = Math.max(2, Math.ceil(((s.y2 - s.y1) / m.rowHeight) * perRow));
      for (let i = 0; i <= steps; i++) {
        points.push({ x: s.x, y: s.y1 + ((s.y2 - s.y1) * i) / steps });
      }
    } else {
      for (let i = 0; i <= perRow * 2; i++) {
        points.push(cubicAt(s.x1, s.y1, s.x2, s.y2, k, i / (perRow * 2)));
      }
    }
  }
  return points;
}

export interface Collision {
  edgeId: string;
  row: number;
  commitHash: string;
  distance: number;
  point: Point;
}

/**
 * Percorre todas as arestas e devolve as colisoes com circulos de commits que
 * NAO sao extremos daquela aresta. Lista vazia = grafo limpo.
 *
 * A folga exigida e o raio do maior circulo (merge) mais metade do traco, ou
 * seja, o momento em que a tinta da aresta encostaria na tinta do circulo.
 */
export function findCollisions(
  layout: GraphLayout,
  m: GraphMetrics,
  perRow = 8,
): Collision[] {
  const collisions: Collision[] = [];
  const clearance = m.nodeRadius + 1.5 + m.strokeWidth / 2;

  for (const edge of layout.edges) {
    for (const point of sampleEdge(edge, m, perRow)) {
      const row = Math.floor(point.y / m.rowHeight);
      const node = layout.nodes[row];
      if (node === undefined) continue;
      if (node.commit.hash === edge.fromHash || node.commit.hash === edge.toHash) continue;

      const cx = m.paddingLeft + node.lane * m.laneWidth;
      const cy = row * m.rowHeight + m.rowHeight / 2;
      const distance = Math.hypot(point.x - cx, point.y - cy);
      if (distance < clearance) {
        collisions.push({
          edgeId: edge.id,
          row,
          commitHash: node.commit.hash,
          distance,
          point,
        });
      }
    }
  }
  return collisions;
}

/**
 * Confere que duas lanes vivas nunca se sobrepoem: em cada linha, cada lane e
 * ocupada por no maximo um commit. Devolve as violacoes.
 */
export function findLaneOverlaps(layout: GraphLayout): string[] {
  const seen = new Map<string, string>();
  const bad: string[] = [];
  for (const node of layout.nodes) {
    const key = `${node.row}:${node.lane}`;
    const previous = seen.get(key);
    if (previous !== undefined) bad.push(`${key} ocupada por ${previous} e ${node.commit.hash}`);
    else seen.set(key, node.commit.hash);
  }
  return bad;
}
