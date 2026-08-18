/**
 * A CARCACA DA LINHA — o SPAN, o BOX e o piso do conteudo compacto.
 *
 * Sao duas larguras e a diferenca entre elas e o assunto deste arquivo:
 *
 *   SPAN  a largura NATURAL do desenho — cresce com as lanes, sem limite
 *   BOX   a largura VISIVEL da coluna — o span, limitado pelo teto de `COLUMN`
 *
 * Enquanto o grafo e estreito os dois sao o mesmo numero. Passando do teto o
 * box para, a coluna para junto, e a diferenca (`span - box`) e exatamente o
 * quanto ha para rolar dentro da coluna. Toda a decisao de "existe barra?" e
 * essa comparacao, entao ela e testada aqui, pura, sem DOM.
 *
 * O piso artificial de 480px do conteudo compacto MORREU com o teto: ele
 * existia para forcar a rolagem lateral da LINHA num grafo largo, e agora e o
 * grafo que rola sozinho. O que `compactContentWidth` ainda garante e a soma
 * exata das colunas — a protecao contra cortar conteudo numa tela de 320px.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { computeGraphLayout } from "../layout.ts";
import { COLUMN, METRICS, METRICS_COMPACT } from "../paint.ts";
import {
  COMPACT_META_COL,
  COMPACT_SUBJECT_MIN,
  columnMax,
  compactContentWidth,
  graphColumnBox,
  graphColumnSpan,
} from "../shell.ts";
import { syntheticRepo } from "./fixtures.ts";

const COLUMNS = COMPACT_SUBJECT_MIN + COMPACT_META_COL;

test("graphColumnSpan com as metricas atuais", () => {
  /* confortavel: paddingLeft 64 dos dois lados, lanes de 26px. */
  assert.equal(graphColumnSpan(1, METRICS), 128);
  assert.equal(graphColumnSpan(2, METRICS), 154);
  assert.equal(graphColumnSpan(16, METRICS), 518);
  /* compacta: paddingLeft 40 dos dois lados, lanes de 28px — a lane 1 (80px)
     ja passa do piso de 56px de MIN_GRAPH_WIDTH. */
  assert.equal(graphColumnSpan(1, METRICS_COMPACT), 80);
  assert.equal(graphColumnSpan(16, METRICS_COMPACT), 500);
});

test("o span nao tem teto: e ele que cobre a bola da ultima lane", () => {
  /* o centro da ultima lane + raio nao pode estourar o desenho — senao a bola
     do commit mais a direita cortaria mesmo com a coluna rolada ate o fim. */
  for (const [lanes, m] of [
    [1, METRICS],
    [16, METRICS],
    [64, METRICS],
    [1, METRICS_COMPACT],
    [16, METRICS_COMPACT],
    [64, METRICS_COMPACT],
  ] as const) {
    const span = graphColumnSpan(lanes, m);
    const lastCenter = m.paddingLeft + (lanes - 1) * m.laneWidth;
    assert.ok(
      lastCenter + m.nodeRadius <= span,
      `${lanes} lanes: bola cortada na borda (centro ${lastCenter}, span ${span})`,
    );
  }
});

test("o box nunca passa do teto, por mais merges que existam", () => {
  for (const lanes of [1, 2, 6, 16, 64, 256]) {
    const comfortable = graphColumnBox(graphColumnSpan(lanes, METRICS), "comfortable");
    const compact = graphColumnBox(graphColumnSpan(lanes, METRICS_COMPACT), "compact");
    assert.ok(comfortable <= COLUMN.max, `${lanes} lanes: coluna de ${comfortable}px`);
    assert.ok(compact <= COLUMN.maxCompact, `${lanes} lanes compactas: ${compact}px`);
  }
  /* e o teto e o que a densidade diz que e */
  assert.equal(columnMax("comfortable"), COLUMN.max);
  assert.equal(columnMax("compact"), COLUMN.maxCompact);
});

test("abaixo do teto o box E o span: nada muda para o grafo estreito", () => {
  /* confortavel: 128 + 26*(n-1); a lane 5 (232) ainda cabe nos 256. */
  for (const lanes of [1, 2, 3, 4, 5]) {
    const span = graphColumnSpan(lanes, METRICS);
    assert.equal(graphColumnBox(span, "comfortable"), span, `${lanes} lanes`);
  }
  /* compacta: 80 + 28*(n-1); a lane 3 (136) ainda cabe nos 160. */
  for (const lanes of [1, 2, 3]) {
    const span = graphColumnSpan(lanes, METRICS_COMPACT);
    assert.equal(graphColumnBox(span, "compact"), span, `${lanes} lanes compactas`);
  }
});

test("a fronteira exata em que a rolagem passa a existir", () => {
  /* confortavel: 5 lanes = 232px (cabe), 6 lanes = 258px (nao cabe). */
  assert.equal(graphColumnSpan(5, METRICS), 232);
  assert.equal(graphColumnSpan(6, METRICS), 258);
  assert.equal(graphColumnBox(232, "comfortable"), 232, "5 lanes nao rolam");
  assert.equal(graphColumnBox(258, "comfortable"), 256, "6 lanes ja rolam");

  /* compacta: 3 lanes = 136px (cabe), 4 lanes = 164px (nao cabe). */
  assert.equal(graphColumnSpan(3, METRICS_COMPACT), 136);
  assert.equal(graphColumnSpan(4, METRICS_COMPACT), 164);
  assert.equal(graphColumnBox(136, "compact"), 136, "3 lanes compactas nao rolam");
  assert.equal(graphColumnBox(164, "compact"), 160, "4 lanes compactas ja rolam");
});

test("o teto nunca esconde a bola da lane 0", () => {
  /* o pior caso do teto: ele nao pode ser tao apertado que a PRIMEIRA bola ja
     nasca cortada — com a coluna em repouso (scroll 0) ela tem de caber
     inteira, senao a rolagem viraria obrigatoria para ver o basico. */
  for (const [m, density] of [
    [METRICS, "comfortable"],
    [METRICS_COMPACT, "compact"],
  ] as const) {
    assert.ok(
      m.paddingLeft + m.nodeRadius <= columnMax(density),
      `${density}: a lane 0 nao cabe no teto`,
    );
  }
});

test("compactContentWidth e a soma exata das colunas, sem piso", () => {
  for (const box of [0, 56, 80, 136, 160]) {
    assert.equal(compactContentWidth(box), box + COLUMNS, `box ${box}`);
  }
});

test("com o teto compacto a linha inteira cabe num celular de 375px", () => {
  /* a conta que fixou o teto compacto em 160: 160 + 160 + 48 = 368. E o maior
     teto que ainda cabe em 375px — com 180 a linha voltaria a rolar, que e o
     rolador aninhado que o teto veio eliminar. */
  const box = graphColumnBox(graphColumnSpan(64, METRICS_COMPACT), "compact");
  assert.equal(box, 160);
  assert.equal(compactContentWidth(box), 368);
  assert.ok(368 <= 375, "a grade compacta cabe na tela mais estreita comum");
});

test("um repositorio sintetico realista nao chega a rolar no confortavel", () => {
  /* o fixture mais cheio de lanes que o produto gera (maxOpen 6, ate 7 lanes
     paralelas) fica logo acima do teto: e exatamente a faixa em que a rolagem
     comeca a valer a pena em vez de espremer o assunto. */
  const layout = computeGraphLayout(syntheticRepo(2000));
  assert.ok(layout.laneCount >= 6, `o fixture veio com ${layout.laneCount} lanes`);
  const span = graphColumnSpan(layout.laneCount, METRICS);
  assert.equal(graphColumnBox(span, "comfortable"), COLUMN.max);
});
