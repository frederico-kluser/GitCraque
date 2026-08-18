/**
 * A ARITMETICA DO SCROLL HORIZONTAL — a geometria que a `GraphView` avalia ao
 * revelar um commit e ao clicar numa linha.
 *
 * O scroll em si vive num efeito e num callback da `GraphView`
 * (`GraphView.tsx`, `centerLane`) e nao roda em SSR; quem prova que a barra
 * chega ao DOM e `scroll.domtest.ts`. Aqui se prende a parte PURA, com os
 * numeros de verdade: dada a janela da coluna, em que lane a bola esta dentro
 * ou fora — o valor que a guarda avalia — e a conta de centralizar a bola.
 *
 * A JANELA E O BOX. Desde o teto da coluna, o que rola e a coluna do grafo, e
 * a largura visivel dela e `graphColumnBox` — 256px no confortavel, 160px no
 * compacto. Antes a janela era o rolador da LINHA compacta, medido no
 * navegador; agora e um numero que se sabe sem medir nada, e por isso o clique
 * e o reveal centralizam nas duas densidades.
 *
 * A guarda, como escrita no componente:
 *
 *   const targetX = laneX(node.lane, metrics);
 *   foraDaJanela = targetX < scrollLeft || targetX > scrollLeft + box
 *
 * e o alvo do scrollTo:
 *
 *   left: targetX - box / 2
 *
 * `laneX` e o CENTRO da bola (convencao presa por `paint.test.ts`): somar
 * `nodeRadius` ao alvo — a formula antiga — move a fronteira da guarda em
 * 14px e faz o scroll disparar para uma bola ja visivel. Os dois ultimos
 * testes existem para denunciar exatamente essa regressao.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { laneX } from "../bezier.ts";
import { COLUMN, METRICS, METRICS_COMPACT } from "../paint.ts";

/** A guarda do componente, reproduzida aqui para avaliar os numeros. */
const ballOutside = (targetX: number, scrollLeft: number, width: number): boolean =>
  targetX < scrollLeft || targetX > scrollLeft + width;

/** O alvo do scrollTo do componente — centralizar a bola na janela. */
const centerOn = (targetX: number, width: number): number => targetX - width / 2;

/** As janelas reais: o teto da coluna em cada densidade.
 *  Confortavel (centros em 64 + 26k): a lane 7 (246) cabe nos 256, a 8 (272) nao.
 *  Compacta   (centros em 40 + 28k): a lane 4 (152) cabe nos 160, a 5 (180) nao.
 */
const cases = [
  { m: METRICS, width: COLUMN.max, lastInside: 7, firstOutside: 8 },
  { m: METRICS_COMPACT, width: COLUMN.maxCompact, lastInside: 4, firstOutside: 5 },
] as const;

test("a fronteira da janela: a bola dentro nao rola, a da lane seguinte rola", () => {
  for (const c of cases) {
    const inside = laneX(c.lastInside, c.m);
    const outside = laneX(c.firstOutside, c.m);
    assert.ok(inside <= c.width, `lane ${c.lastInside} deveria caber em ${c.width}`);
    assert.equal(
      ballOutside(inside, 0, c.width),
      false,
      `${c.m === METRICS ? "confortavel" : "compacta"} lane ${c.lastInside} dentro`,
    );
    assert.equal(
      ballOutside(outside, 0, c.width),
      true,
      `${c.m === METRICS ? "confortavel" : "compacta"} lane ${c.firstOutside} fora`,
    );
  }
});

test("o alvo do scrollTo centraliza a bola na janela", () => {
  for (const c of cases) {
    const targetX = laneX(c.firstOutside, c.m);
    const left = centerOn(targetX, c.width);
    /* depois do scrollTo, o centro da bola fica no centro da janela. */
    assert.equal(left + c.width / 2, targetX, "bola no centro apos rolar");
  }
  /* numeros crus: confortavel lane 8 (centro 272) na janela de 256 -> 144;
     compacta lane 5 (centro 180) na janela de 160 -> 100. */
  assert.equal(centerOn(laneX(8, METRICS), COLUMN.max), 144);
  assert.equal(centerOn(laneX(5, METRICS_COMPACT), COLUMN.maxCompact), 100);
});

test("bola ja rolada para tras: a guarda volta a rolar para a frente", () => {
  const targetX = laneX(2, METRICS);
  /* literal: com paddingLeft 64, o centro da lane 2 e 64 + 2*26 = 116 */
  assert.equal(targetX, 116, "o centro da lane 2");
  assert.equal(ballOutside(targetX, 120, COLUMN.max), true, "bola atras da janela");
  /* o alvo pode ser NEGATIVO quando a bola esta perto da origem e a janela e
     larga: 116 - 128 = -12. Nao ha clamp na conta de proposito — `scrollTo`
     limita a 0 sozinho, e reproduzir o clamp aqui esconderia a formula. */
  assert.equal(centerOn(targetX, COLUMN.max), -12, "alvo antes da origem, o browser limita");
});

test("bola visivel nao rola nem quando o desenho e mais largo que a janela", () => {
  /* a guarda existe para isto: clicar numa branch do rail nao pode deslocar a
     coluna se o commit ja aparece — mesmo num grafo de 16 lanes (span 518). */
  const targetX = laneX(6, METRICS);
  assert.equal(targetX, 220);
  assert.equal(ballOutside(targetX, 0, COLUMN.max), false, "bola dentro da janela");
  assert.equal(centerOn(targetX, COLUMN.max), 92);
});

test("a formula antiga (com o raio somado) deslocaria a fronteira da guarda", () => {
  /* regressao: somar `nodeRadius` ao alvo faz a bola da lane 7 parecer fora da
     janela — e o scroll dispararia para uma bola que ja esta visivel. Com a
     janela de 256 a lane 7 fica a 10px da borda: 246 dentro, 260 fora com o
     raio somado. */
  const center = laneX(7, METRICS);
  assert.equal(center, 246);
  assert.equal(ballOutside(center, 0, COLUMN.max), false, "bola visivel");
  assert.equal(
    ballOutside(center + METRICS.nodeRadius, 0, COLUMN.max),
    true,
    "com o raio somado a mesma bola pareceria fora — rolaria a toa",
  );
});
