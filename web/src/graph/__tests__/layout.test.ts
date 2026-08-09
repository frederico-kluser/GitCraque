/**
 * Testes do algoritmo de lanes. Rodam em `node --test` sem bundler: `layout.ts`
 * e `bezier.ts` nao tem um unico import de runtime.
 *
 *   node --test web/src/graph/__tests__/
 */
import assert from "node:assert/strict";
import test from "node:test";
import { COMPACT_METRICS, computeGraphLayout, DEFAULT_METRICS } from "../layout.ts";
import {
  branchAndMerge,
  isMainLine,
  linearHistory,
  mergeOfAncestor,
  multiRootHistory,
  octopusHistory,
  rowOf,
  syntheticRepo,
  twoParallelBranches,
} from "./fixtures.ts";
import { findCollisions, findLaneOverlaps } from "./geometry.ts";
import type { GraphEdge, GraphLayout } from "@/types/modules";

const laneOf = (layout: GraphLayout, row: number) => layout.nodes[row].lane;

const edgeBetween = (layout: GraphLayout, from: string, to: string): GraphEdge | undefined =>
  layout.edges.find((e) => e.fromHash === from && e.toHash === to);

/** Todas as arestas que atravessam a linha, por forca bruta — a referencia. */
const bruteForceRow = (layout: GraphLayout, row: number) =>
  layout.edges.filter((e) => e.fromRow <= row && row <= e.toRow);

/* ------------------------------------------------------------------ */

test("historico vazio nao quebra", () => {
  const layout = computeGraphLayout([]);
  assert.equal(layout.nodes.length, 0);
  assert.equal(layout.edges.length, 0);
  assert.equal(layout.laneCount, 0);
  assert.deepEqual(layout.rowEdges.forRow(0), []);
});

test("historico linear: todos na lane 0", () => {
  const commits = linearHistory(200);
  const layout = computeGraphLayout(commits);

  assert.equal(layout.nodes.length, 200);
  assert.equal(layout.laneCount, 1, "uma unica lane para historico linear");
  for (const node of layout.nodes) {
    assert.equal(node.lane, 0, `${node.commit.subject} deveria estar na lane 0`);
    assert.equal(node.color, 0);
  }
  assert.equal(layout.edges.length, 199);
  for (const edge of layout.edges) {
    assert.equal(edge.kind, "straight");
    assert.equal(edge.fromLane, 0);
    assert.equal(edge.throughLane, 0);
    assert.equal(edge.toLane, 0);
    assert.equal(edge.toRow - edge.fromRow, 1);
  }
  assert.equal(layout.nodes[0].isTip, true, "o mais novo e ponta");
  assert.equal(layout.nodes[199].isRoot, true, "o mais antigo e raiz");
});

test("branch que sai e volta: main nao muda de lane e o merge tem 2 pais em lanes diferentes", () => {
  const commits = branchAndMerge();
  const layout = computeGraphLayout(commits);

  const mainNames = ["D", "M", "C", "B", "A"];
  for (const name of mainNames) {
    const row = rowOf(commits, name);
    assert.equal(laneOf(layout, row), 0, `${name} deveria continuar na lane 0`);
  }

  const f1 = rowOf(commits, "F1");
  const f2 = rowOf(commits, "F2");
  assert.equal(laneOf(layout, f1), 1, "F1 na lane da feature");
  assert.equal(laneOf(layout, f2), 1, "F2 na lane da feature");

  const merge = layout.nodes[rowOf(commits, "M")];
  assert.equal(merge.isMerge, true);

  const toC = edgeBetween(layout, merge.commit.hash, commits[rowOf(commits, "C")].hash);
  const toF2 = edgeBetween(layout, merge.commit.hash, commits[f2].hash);
  assert.ok(toC && toF2, "o merge tem duas arestas");
  assert.equal(toC.kind, "straight");
  assert.equal(toF2.kind, "merge");
  assert.notEqual(toC.toLane, toF2.toLane, "os dois pais ficam em lanes diferentes");
  assert.equal(toF2.throughLane, 1, "a aresta de merge desce pela lane reservada");

  /* a volta da feature para a main e uma aresta de ramificacao, colorida pela
     lane do filho */
  const f1ToB = edgeBetween(layout, commits[f1].hash, commits[rowOf(commits, "B")].hash);
  assert.ok(f1ToB);
  assert.equal(f1ToB.kind, "branch");
  assert.equal(f1ToB.fromLane, 1);
  assert.equal(f1ToB.toLane, 0);
  assert.equal(f1ToB.color, 1);

  assert.deepEqual(findCollisions(layout, DEFAULT_METRICS), []);
});

test("duas branches paralelas independentes: lanes distintas, sem sobreposicao", () => {
  const commits = twoParallelBranches();
  const layout = computeGraphLayout(commits);

  const a = [rowOf(commits, "A1"), rowOf(commits, "A2")].map((r) => laneOf(layout, r));
  const b = [rowOf(commits, "B1"), rowOf(commits, "B2")].map((r) => laneOf(layout, r));

  assert.equal(new Set(a).size, 1, "A mantem uma lane so");
  assert.equal(new Set(b).size, 1, "B mantem uma lane so");
  assert.notEqual(a[0], b[0], "A e B ocupam lanes diferentes");
  assert.equal(layout.laneCount, 2);
  assert.deepEqual(findLaneOverlaps(layout), []);
  assert.deepEqual(findCollisions(layout, DEFAULT_METRICS), []);
});

test("raiz multipla: duas raizes costuradas por merge nao quebram", () => {
  const commits = multiRootHistory();
  const layout = computeGraphLayout(commits);

  const roots = layout.nodes.filter((n) => n.isRoot);
  assert.equal(roots.length, 2, "duas raizes");
  assert.equal(new Set(roots.map((r) => r.lane)).size, 2, "cada raiz na sua lane");

  const merge = layout.nodes[rowOf(commits, "M")];
  assert.equal(merge.isMerge, true);
  assert.equal(layout.edges.filter((e) => e.fromHash === merge.commit.hash).length, 2);
  assert.deepEqual(findLaneOverlaps(layout), []);
  assert.deepEqual(findCollisions(layout, DEFAULT_METRICS), []);
});

test("duas raizes totalmente desconexas nao quebram", () => {
  const commits = twoParallelBranches();
  const layout = computeGraphLayout(commits);
  assert.equal(layout.nodes.filter((n) => n.isRoot).length, 2);
  assert.equal(layout.edges.length, 2);
});

test("octopus merge (4 pais) nao quebra", () => {
  const commits = octopusHistory();
  const layout = computeGraphLayout(commits);

  const octo = layout.nodes[rowOf(commits, "OCTO")];
  assert.equal(octo.isMerge, true);

  const out = layout.edges.filter((e) => e.fromHash === octo.commit.hash);
  assert.equal(out.length, 4, "uma aresta por pai");
  assert.equal(out.filter((e) => e.kind === "merge").length, 3, "3 pais de mesclagem");
  assert.equal(out.filter((e) => e.kind === "straight").length, 1, "o primeiro pai continua reto");
  assert.equal(new Set(out.map((e) => e.throughLane)).size, 4, "cada pai desce por uma lane");
  assert.deepEqual(findLaneOverlaps(layout), []);
  assert.deepEqual(findCollisions(layout, DEFAULT_METRICS), []);
});

test("merge --no-ff de um ancestral: a aresta desvia e nao passa por cima do commit do meio", () => {
  const commits = mergeOfAncestor();
  const layout = computeGraphLayout(commits);

  const m = commits[rowOf(commits, "M")].hash;
  const p = commits[rowOf(commits, "P")].hash;
  const edge = edgeBetween(layout, m, p);
  assert.ok(edge, "existe a aresta do segundo pai");
  assert.equal(edge.kind, "merge");
  assert.notEqual(edge.throughLane, edge.fromLane, "sai da lane do merge para uma lane propria");
  assert.deepEqual(
    findCollisions(layout, DEFAULT_METRICS),
    [],
    "o commit A do meio nao e atravessado",
  );
});

test("determinismo: mesma entrada, mesma saida", () => {
  const commits = syntheticRepo(3000);
  const a = computeGraphLayout(commits);
  const b = computeGraphLayout(commits);

  assert.deepEqual(
    a.nodes.map((n) => [n.row, n.lane, n.color, n.isMerge, n.isTip, n.isRoot]),
    b.nodes.map((n) => [n.row, n.lane, n.color, n.isMerge, n.isTip, n.isRoot]),
  );
  assert.deepEqual(a.edges, b.edges);
  assert.equal(a.laneCount, b.laneCount);

  /* e o resultado nao depende de quem pediu antes: uma copia rasa do array
     de entrada produz exatamente o mesmo layout. */
  const c = computeGraphLayout(commits.slice());
  assert.deepEqual(c.edges, a.edges);
});

test("branch de vida longa mantem a MESMA lane do inicio ao fim", () => {
  const commits = syntheticRepo(20000);
  const layout = computeGraphLayout(commits);

  const mainRows = layout.nodes.filter((n) => isMainLine(n.commit));
  assert.ok(mainRows.length > 4000, `esperava uma main longa, veio ${mainRows.length}`);

  const serpenteia = mainRows.filter((n) => n.lane !== 0);
  assert.equal(
    serpenteia.length,
    0,
    `a main mudou de lane em ${serpenteia.length} commits (ex.: linha ${serpenteia[0]?.row})`,
  );
  console.log(
    `      main: ${mainRows.length} commits, todos na lane 0 (${layout.laneCount} lanes no total)`,
  );
});

test("nenhuma aresta cruza o circulo de um commit alheio (20 000 commits)", () => {
  const commits = syntheticRepo(20000);
  const layout = computeGraphLayout(commits);

  assert.deepEqual(findLaneOverlaps(layout), [], "duas linhas nunca compartilham (row, lane)");

  const collisions = findCollisions(layout, DEFAULT_METRICS, 6);
  assert.deepEqual(
    collisions.slice(0, 3),
    [],
    `${collisions.length} colisoes encontradas`,
  );
  console.log(
    `      ${layout.edges.length} arestas amostradas contra ${layout.nodes.length} circulos: 0 colisoes`,
  );
});

test("indice row -> arestas bate com a forca bruta", () => {
  const commits = syntheticRepo(1200);
  const layout = computeGraphLayout(commits, { indexBlockSize: 16 });

  for (let row = 0; row < layout.nodes.length; row++) {
    const fromIndex = layout.rowEdges.forRow(row).map((e) => e.id).sort();
    const expected = bruteForceRow(layout, row).map((e) => e.id).sort();
    assert.deepEqual(fromIndex, expected, `linha ${row}`);
  }

  /* e a consulta por faixa e a uniao das linhas, sem repetidas */
  for (const [a, b] of [
    [0, 40],
    [500, 540],
    [1150, 1199],
  ]) {
    const range = layout.rowEdges.forRange(a, b).map((e) => e.id);
    assert.equal(new Set(range).size, range.length, "sem arestas repetidas");
    const union = new Set<string>();
    for (let r = a; r <= b; r++) for (const e of bruteForceRow(layout, r)) union.add(e.id);
    assert.deepEqual(range.slice().sort(), [...union].sort());
  }
});

test("log truncado: pais fora do conjunto nao seguram lane", () => {
  /* corta o historico no meio: os pais dos ultimos commits nao existem mais. */
  const commits = syntheticRepo(4000).slice(0, 2000);
  const layout = computeGraphLayout(commits);

  assert.equal(layout.nodes.length, 2000);
  for (const edge of layout.edges) {
    assert.ok(layout.index.has(edge.toHash), "toda aresta aponta para um commit carregado");
    assert.ok(edge.toRow > edge.fromRow, "e sempre para baixo");
  }
  /* o grafo nao cresceu sem limite so porque os pais sumiram */
  assert.ok(layout.laneCount < 24, `laneCount inesperado: ${layout.laneCount}`);
});

test("metricas compactas: o traco mais grosso cabe na lane de 28px", () => {
  /* A densidade compacta encolhe a linha (48px) e a lane (28px) mas mantem o
     traco de 3px. A tinta mais proxima de um circulo alheio fica a
     raio + traco inteiro = 17px (metade de cada lado) — dentro dos 28px de
     lane. A MESMA `findCollisions` da suite confortavel, so que com as
     metricas do celular: lista vazia = grafo limpo. E um repositorio
     SINCRETICO porque e o que mais usa lanes no aparelho que menos tem
     espaco. */
  const layout = computeGraphLayout(syntheticRepo(2000));
  assert.deepEqual(findCollisions(layout, COMPACT_METRICS), []);
});
