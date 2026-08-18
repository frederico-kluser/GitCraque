/**
 * A CARCACA DA LINHA — largura da coluna do grafo e o piso do conteudo
 * compacto.
 *
 * `MIN_COMPACT_CONTENT_WIDTH` (480) e uma `const` privada de proposito — o
 * contrato publico e `compactContentWidth`, e e por ele que o piso se testa:
 * a funcao nunca devolve menos que 480, e acima do piso devolve a soma exata
 * das colunas. Um grafo de UMA lane compacta mede 80px de coluna (paddingLeft
 * 40 dos dois lados — acima do piso de 56 do MIN_GRAPH_WIDTH); sem o piso de
 * conteudo, a linha inteira teria 288px e caberia espremida em qualquer
 * celular, e o scroll horizontal (e o aviso de rolagem) nunca apareceria.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { computeGraphLayout } from "../layout.ts";
import { METRICS, METRICS_COMPACT } from "../paint.ts";
import {
  COMPACT_META_COL,
  COMPACT_SUBJECT_MIN,
  compactContentWidth,
  graphColumnWidth,
} from "../shell.ts";
import { syntheticRepo } from "./fixtures.ts";

const COLUMNS = COMPACT_SUBJECT_MIN + COMPACT_META_COL;

test("o piso de 480px: nenhum grafo espreme a linha compacta abaixo dele", () => {
  /* abaixo do piso, a soma das colunas seria menor que 480 — o piso segura. */
  for (const g of [0, 16, 56, 100, 200, 271]) {
    assert.equal(compactContentWidth(g), 480, `graphWidth ${g}`);
  }
  /* a fronteira exata: g = 272 e onde soma e piso empatam (272 + 208 = 480). */
  assert.equal(compactContentWidth(272), 480);
});

test("acima do piso, a largura e a soma exata das colunas", () => {
  for (const g of [273, 300, 500, 1000]) {
    assert.equal(compactContentWidth(g), g + COLUMNS, `graphWidth ${g}`);
  }
  /* e a fronteira sobe sem degrau: 273 ja e a soma. */
  assert.equal(compactContentWidth(273), 481);
});

test("um grafo de UMA lane compacto (80px) nao foge do piso", () => {
  /* a coluna de uma lane mede 80px (paddingLeft * 2 = 40 + 40, acima do piso
     de 56px de MIN_GRAPH_WIDTH); a linha inteira mesmo assim tem 480px — o
     scroll lateral e obrigatorio. */
  const width = graphColumnWidth(1, METRICS_COMPACT);
  assert.equal(width, 80);
  assert.equal(compactContentWidth(width), 480);
  /* e o piso e mais largo que um celular de 375px: rolar e inevitavel. */
  assert.ok(480 > 375, "o piso sobe acima da tela mais estreita de todas");
});

test("um repositorio sintetico realista nao escapa do piso", () => {
  /* o fixture mais cheio de lanes que o produto gera (maxOpen 6, ate 7 lanes
     paralelas) ainda fica abaixo da soma de colunas: no mundo real o piso e
     o que manda, nao a aritmetica do grafo. */
  const layout = computeGraphLayout(syntheticRepo(2000));
  const width = graphColumnWidth(layout.laneCount, METRICS_COMPACT);
  assert.equal(compactContentWidth(width), 480);
});

test("graphColumnWidth com as metricas atuais", () => {
  /* confortavel: paddingLeft 64 dos dois lados, lanes de 26px (era 48, subiu
     na onda de respiro a esquerda). */
  assert.equal(graphColumnWidth(1, METRICS), 128);
  assert.equal(graphColumnWidth(2, METRICS), 154);
  assert.equal(graphColumnWidth(16, METRICS), 518);
  /* compacta: paddingLeft 40 dos dois lados, lanes de 28px (era 24) — a lane 1
     (80px) ja passa do piso de 56px de MIN_GRAPH_WIDTH. */
  assert.equal(graphColumnWidth(1, METRICS_COMPACT), 80);
  assert.equal(graphColumnWidth(16, METRICS_COMPACT), 500);
});

test("a coluna sempre cobre a bola da ultima lane", () => {
  /* o centro da ultima lane + raio nao pode estourar a largura da coluna —
     senao a bola do commit mais a direita cortaria na borda do grafo. */
  for (const [lanes, m] of [
    [1, METRICS],
    [16, METRICS],
    [1, METRICS_COMPACT],
    [16, METRICS_COMPACT],
  ] as const) {
    const width = graphColumnWidth(lanes, m);
    const lastCenter = m.paddingLeft + (lanes - 1) * m.laneWidth;
    assert.ok(
      lastCenter + m.nodeRadius <= width,
      `${lanes} lanes: bola cortada na borda (centro ${lastCenter}, coluna ${width})`,
    );
  }
});
