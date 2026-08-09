/**
 * AS METRICAS DO DESENHO — o retrato exato da coluna do grafo.
 *
 * `bezier.test.ts` e `layout.test.ts` ja conferem as metricas de FORMA
 * indireta (tripwires literais de path e a folga de colisao). Aqui elas tem
 * endereco proprio: se o desenho desktop mudar de novo, e este arquivo que
 * diz o que era e o que virou, numero por numero.
 *
 * Alem dos cinco numeros, este arquivo prende a CONVENCAO que a Onda 1
 * corrigiu: `laneX` (bezier.ts) JA e o CENTRO da bola do commit. O scroll
 * horizontal do compacto (GraphView.tsx) mira esse centro direto — sem somar
 * `nodeRadius`, sem meia lane. `scroll.test.ts` usa essa convencao como base
 * da aritmetica da guarda.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { laneX } from "../bezier.ts";
import { METRICS, METRICS_COMPACT } from "../paint.ts";

/* Os numeros crus abaixo sao TRIPWIRE, nao duplicacao (mesma convencao de
   `bezier.test.ts`): a assercao simbolica denuncia a mudanca e a literal diz
   o que era. Mexeu no desenho de proposito? Atualize e siga. */

test("confortavel: os cinco numeros do desenho desktop", () => {
  assert.deepEqual(METRICS, {
    rowHeight: 64,
    laneWidth: 26,
    nodeRadius: 14,
    paddingLeft: 36,
    strokeWidth: 2.5,
  });
});

test("compacta: os cinco numeros do desenho de celular", () => {
  assert.deepEqual(METRICS_COMPACT, {
    rowHeight: 56,
    laneWidth: 28,
    nodeRadius: 14,
    paddingLeft: 16,
    strokeWidth: 3,
  });
});

test("a bola cabe na linha e nao corta a borda esquerda", () => {
  for (const m of [METRICS, METRICS_COMPACT]) {
    /* 28px de diametro dentro de uma linha de 64/56px: a bola respira. */
    assert.ok(m.nodeRadius * 2 < m.rowHeight, "diametro menor que a linha");
    /* o traco nao domina a bola: o desenho nao vira arame. */
    assert.ok(m.strokeWidth < m.nodeRadius, "traco mais fino que o raio");
    /* o centro da lane 0 fica no paddingLeft; o raio nao estoura a borda. */
    assert.ok(m.paddingLeft >= m.nodeRadius, "a bola da lane 0 inteira dentro da coluna");
  }
});

test("o centro da bola da lane 0 e o proprio paddingLeft", () => {
  /* A formula corrigida da Onda 1: `laneX` ja e o centro da bola, e o scroll
     horizontal mira o CENTRO. A formula antiga somava um deslocamento (raio
     ou meia lane) e mirava um ponto que nao era a bola. */
  for (const m of [METRICS, METRICS_COMPACT]) {
    assert.equal(laneX(0, m), m.paddingLeft, "centro da bola na lane 0");
    assert.notEqual(laneX(0, m), m.paddingLeft + m.nodeRadius, "nunca a borda direita");
    assert.notEqual(laneX(0, m), m.paddingLeft - m.nodeRadius, "nunca a borda esquerda");
  }
});

test("o espaco entre centros de lane vizinhas e exatamente laneWidth", () => {
  for (const m of [METRICS, METRICS_COMPACT]) {
    assert.equal(laneX(3, m) - laneX(2, m), m.laneWidth, "passo de uma lane");
    assert.equal(laneX(7, m), m.paddingLeft + 7 * m.laneWidth, "a formula completa");
  }
});
