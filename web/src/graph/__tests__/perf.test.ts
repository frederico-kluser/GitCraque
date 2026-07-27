/**
 * Orcamento de performance do motor.
 *
 * O requisito duro do produto: 20 000 commits tem de sair do algoritmo em menos
 * de 300 ms. O teste MEDE e IMPRIME os numeros, nao apenas afirma.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { computeGraphLayout } from "../layout.ts";
import { syntheticRepo } from "./fixtures.ts";

const BUDGET_MS = 300;
const RUNS = 7;

const median = (values: number[]) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const ms = (v: number) => `${v.toFixed(1)} ms`;

test("20 000 commits em menos de 300 ms", () => {
  const commits = syntheticRepo(20000);
  assert.equal(commits.length, 20000);

  const samples: number[] = [];
  let last = computeGraphLayout(commits); // aquecimento, fora da medicao
  for (let i = 0; i < RUNS; i++) {
    const started = performance.now();
    last = computeGraphLayout(commits);
    samples.push(performance.now() - started);
  }

  const best = Math.min(...samples);
  const worst = Math.max(...samples);
  const mid = median(samples);

  console.log(
    `\n      20 000 commits | ${last.edges.length} arestas | ${last.laneCount} lanes\n` +
      `      layout: melhor ${ms(best)} · mediana ${ms(mid)} · pior ${ms(worst)}` +
      `  (orcamento ${BUDGET_MS} ms)\n` +
      `      elapsedMs reportado pelo proprio layout: ${ms(last.elapsedMs)}`,
  );

  assert.ok(mid < BUDGET_MS, `mediana ${ms(mid)} estourou o orcamento de ${BUDGET_MS} ms`);
  assert.ok(worst < BUDGET_MS, `pior caso ${ms(worst)} estourou o orcamento de ${BUDGET_MS} ms`);
});

test("o custo cresce linear com o numero de commits", () => {
  const sizes = [2500, 5000, 10000, 20000];
  const timings = sizes.map((size) => {
    const commits = syntheticRepo(size);
    computeGraphLayout(commits);
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const started = performance.now();
      computeGraphLayout(commits);
      runs.push(performance.now() - started);
    }
    return { size, time: median(runs) };
  });

  console.log("\n      escala:");
  for (const t of timings) {
    console.log(`      ${String(t.size).padStart(6)} commits → ${ms(t.time)}`);
  }

  /* dobrar a entrada nao pode mais que triplicar o tempo (folga larga para o
     ruido de medicao em maquina compartilhada). */
  for (let i = 1; i < timings.length; i++) {
    const ratio = timings[i].time / Math.max(timings[i - 1].time, 0.05);
    assert.ok(
      ratio < 3,
      `${timings[i - 1].size}→${timings[i].size} multiplicou o tempo por ${ratio.toFixed(2)}`,
    );
  }
});

test("consultar o indice de uma janela visivel e barato", () => {
  const commits = syntheticRepo(20000);
  const layout = computeGraphLayout(commits);
  const WINDOW = 40;

  let drawn = 0;
  let peak = 0;
  const started = performance.now();
  /* varre o repositorio inteiro janela a janela, como se o usuario rolasse tudo */
  for (let top = 0; top + WINDOW < commits.length; top += WINDOW) {
    for (let row = top; row < top + WINDOW; row++) {
      const edges = layout.rowEdges.forRow(row);
      drawn += edges.length;
      if (edges.length > peak) peak = edges.length;
    }
  }
  const elapsed = performance.now() - started;

  console.log(
    `\n      indice: ${drawn} arestas devolvidas ao rolar as 20 000 linhas em ${ms(elapsed)}\n` +
      `      media ${(drawn / commits.length).toFixed(2)} arestas por linha, pico ${peak}`,
  );

  assert.ok(elapsed < BUDGET_MS, `varredura completa levou ${ms(elapsed)}`);
  assert.ok(peak < 40, `uma linha unica devolveu ${peak} arestas`);
});
