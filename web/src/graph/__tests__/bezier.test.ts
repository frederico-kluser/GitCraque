/**
 * Testes da geometria: reta quando a lane nao muda, cubica com pontos de
 * controle verticais quando muda, e recorte por faixa de linhas para a
 * virtualizacao.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEdgePath,
  clipEdgePath,
  CONTROL_RATIO,
  edgeSegments,
  laneX,
  rowY,
} from "../bezier.ts";
import { computeGraphLayout, DEFAULT_METRICS } from "../layout.ts";
import { branchAndMerge, syntheticRepo } from "./fixtures.ts";
import { sampleEdge } from "./geometry.ts";
import type { GraphEdge, GraphMetrics } from "@/types/modules";

const M: GraphMetrics = DEFAULT_METRICS;
const K = M.rowHeight * CONTROL_RATIO;

function edge(partial: Partial<GraphEdge>): GraphEdge {
  return {
    id: "e",
    fromHash: "child",
    toHash: "parent",
    fromRow: 0,
    fromLane: 0,
    toRow: 1,
    toLane: 0,
    throughLane: 0,
    kind: "straight",
    color: 0,
    ...partial,
  };
}

/* Os numeros crus abaixo sao TRIPWIRE, nao duplicacao: a assercao simbolica
   acima de cada um prova a formula, e a literal denuncia uma mudanca silenciosa
   nas metricas de `paint.ts`. Mexeu no desenho de proposito? Atualize a literal
   e siga. Ela quebrando sozinha e sinal. */

test("mesma lane nos dois extremos: reta vertical", () => {
  const d = buildEdgePath(edge({ fromRow: 2, toRow: 9 }), M);
  assert.equal(d, `M ${laneX(0, M)} ${rowY(2, M)} L ${laneX(0, M)} ${rowY(9, M)}`);
  assert.equal(d, "M 18 90 L 18 342");
  assert.ok(!d.includes("C"), "sem curva");
});

test("lanes diferentes a uma linha: uma cubica com controles verticais", () => {
  const d = buildEdgePath(
    edge({ fromRow: 0, fromLane: 0, toRow: 1, toLane: 1, throughLane: 1, kind: "merge" }),
    M,
  );
  /* M x1 y1 C x1 (y1+k) x2 (y2-k) x2 y2 — a formula da arquitetura */
  assert.equal(
    d,
    `M ${laneX(0, M)} ${rowY(0, M)} C ${laneX(0, M)} ${rowY(0, M) + K}` +
      ` ${laneX(1, M)} ${rowY(1, M) - K} ${laneX(1, M)} ${rowY(1, M)}`,
  );
  assert.equal(d, "M 18 18 C 18 40.32 38 31.68 38 54");
});

test("aresta longa: reta no meio, curva de UMA linha junto do extremo que muda", () => {
  const long = edge({
    fromRow: 0,
    fromLane: 0,
    toRow: 40,
    toLane: 3,
    throughLane: 3,
    kind: "merge",
  });
  const segments = edgeSegments(long, M);

  assert.equal(segments.length, 2, "curva + reta");
  assert.equal(segments[0].kind, "curve");
  assert.equal(segments[1].kind, "line");

  const curve = segments[0];
  assert.equal(curve.kind === "curve" && curve.y2 - curve.y1, M.rowHeight, "curva de uma linha");

  const line = segments[1];
  assert.equal(line.kind === "line" && line.x, laneX(3, M), "o meio corre na lane reservada");
  assert.equal(line.kind === "line" && line.y2 - line.y1, 39 * M.rowHeight - 0);

  /* nenhuma amostra do trecho longo escapa da lane reservada: nada de diagonal
     frouxa atravessando o grafo */
  const middle = sampleEdge(long, M).filter((p) => p.y > rowY(2, M) && p.y < rowY(38, M));
  for (const p of middle) assert.equal(p.x, laneX(3, M));
});

test("aresta que troca de lane nos DOIS extremos vira curva-reta-curva", () => {
  const segments = edgeSegments(
    edge({ fromRow: 0, fromLane: 0, toRow: 10, toLane: 2, throughLane: 5, kind: "merge" }),
    M,
  );
  assert.deepEqual(
    segments.map((s) => s.kind),
    ["curve", "line", "curve"],
  );
  assert.equal(segments[1].kind === "line" && segments[1].x, laneX(5, M));
});

test("recorte: uma linha do meio recebe so o pedaco vertical daquela faixa", () => {
  const long = edge({ fromRow: 0, fromLane: 0, toRow: 40, toLane: 3, throughLane: 3, kind: "merge" });

  const middle = clipEdgePath(long, M, 20, 20);
  assert.equal(middle, `M ${laneX(3, M)} 0 L ${laneX(3, M)} ${M.rowHeight}`);

  /* a faixa do topo recebe a curva inteira (o <svg> da linha corta o excedente) */
  const top = clipEdgePath(long, M, 0, 0);
  assert.ok(top !== null && top.includes("C"), "a linha do filho desenha a curva");

  /* fora do intervalo da aresta nao ha o que desenhar */
  assert.equal(clipEdgePath(long, M, 60, 60), null);
  assert.equal(clipEdgePath(long, M, 41, 45), null);
});

test("recorte em originRow: o Y sai relativo ao topo da faixa", () => {
  const straight = edge({ fromRow: 5, toRow: 30 });
  for (const row of [10, 20, 29]) {
    assert.equal(
      clipEdgePath(straight, M, row, row),
      `M ${laneX(0, M)} 0 L ${laneX(0, M)} ${M.rowHeight}`,
      `linha ${row}`,
    );
  }
  /* mesma faixa, mas com origem absoluta */
  assert.equal(
    clipEdgePath(straight, M, 10, 10, 0),
    `M ${laneX(0, M)} ${10 * M.rowHeight} L ${laneX(0, M)} ${11 * M.rowHeight}`,
  );
});

test("os pedacos recortados de uma aresta cobrem a aresta inteira, sem buraco", () => {
  const layout = computeGraphLayout(branchAndMerge());
  for (const e of layout.edges) {
    for (let row = e.fromRow; row <= e.toRow; row++) {
      const d = clipEdgePath(e, M, row, row);
      assert.ok(
        d !== null,
        `aresta ${e.id} sem desenho na linha ${row}, que ela atravessa`,
      );
    }
    assert.equal(clipEdgePath(e, M, e.fromRow - 1, e.fromRow - 1), null);
    assert.equal(clipEdgePath(e, M, e.toRow + 1, e.toRow + 1), null);
  }
});

test("todo `d` gerado e um path SVG bem formado", () => {
  const layout = computeGraphLayout(syntheticRepo(2000));
  const valid = /^M -?[\d.]+ -?[\d.]+(?: (?:L -?[\d.]+ -?[\d.]+|C(?: -?[\d.]+ -?[\d.]+){3})| M -?[\d.]+ -?[\d.]+)*$/;
  for (const e of layout.edges) {
    const full = buildEdgePath(e, M);
    assert.match(full, valid, `path invalido em ${e.id}: ${full}`);
    assert.ok(!full.includes("NaN"), `NaN em ${e.id}`);
  }
});

test("a curva desce sempre — nunca volta para cima", () => {
  const cases: GraphEdge[] = [
    edge({ fromRow: 0, fromLane: 0, toRow: 1, toLane: 1, throughLane: 1, kind: "merge" }),
    edge({ fromRow: 0, fromLane: 3, toRow: 1, toLane: 0, throughLane: 3, kind: "branch" }),
    edge({ fromRow: 0, fromLane: 0, toRow: 6, toLane: 7, throughLane: 7, kind: "merge" }),
  ];
  for (const e of cases) {
    let previous = -Infinity;
    for (const point of sampleEdge(e, M, 24)) {
      assert.ok(point.y >= previous - 1e-9, `a curva de ${e.id} subiu em y=${point.y}`);
      previous = point.y;
    }
  }
});
