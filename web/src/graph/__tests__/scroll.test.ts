/**
 * A ARITMETICA DO SCROLL HORIZONTAL — a geometria que a `GraphView` avalia
 * no reveal e no clique em densidade compacta (Onda 1).
 *
 * O scroll em si vive num EFEITO e num callback da `GraphView`
 * (`GraphView.tsx`) e nao roda em SSR; quem prova que o rolador e o
 * `min-width` chegam ao DOM e `scroll.domtest.ts`. Aqui se prende a parte
 * PURA, com os numeros de verdade: com as metricas atuais, em que lane a bola
 * esta dentro ou fora da janela — o valor que a guarda avalia — e a conta de
 * centralizar a bola no rolador.
 *
 * A guarda, como escrita no componente:
 *
 *   const targetX = laneX(node.lane, metrics);
 *   foraDaJanela = targetX < scrollLeft || targetX > scrollLeft + scrollerWidth
 *
 * e o alvo do scrollTo:
 *
 *   left: targetX - scrollerWidth / 2
 *
 * `laneX` e o CENTRO da bola (convencao presa por `paint.test.ts`): somar
 * `nodeRadius` ao alvo — a formula antiga — move a fronteira da guarda em
 * 14px e faz o scroll disparar para uma bola ja visivel. Os dois ultimos
 * testes existem para denunciar exatamente essa regressao.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { laneX } from "../bezier.ts";
import { METRICS, METRICS_COMPACT } from "../paint.ts";

/** A guarda do componente, reproduzida aqui para avaliar os numeros. */
const ballOutside = (targetX: number, scrollLeft: number, width: number): boolean =>
  targetX < scrollLeft || targetX > scrollLeft + width;

/** O alvo do scrollTo do componente — centralizar a bola na janela. */
const centerOn = (targetX: number, width: number): number => targetX - width / 2;

/** Janelas de referencia: desktop 300px e um celular de 375px.
 *  Com paddingLeft 64/40 os centros mudam (64+26k / 40+28k): no compacto a
 *  lane 12 (376) ja nao cabe numa janela de 375 — a fronteira caiu para 11/12.
 */
const cases = [
  { m: METRICS, width: 300, lastInside: 9, firstOutside: 10 },
  { m: METRICS_COMPACT, width: 375, lastInside: 11, firstOutside: 12 },
] as const;

test("a fronteira da janela: a bola dentro nao rola, a da lane seguinte rola", () => {
  for (const c of cases) {
    const inside = laneX(c.lastInside, c.m);
    const outside = laneX(c.firstOutside, c.m);
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
  /* numeros crus (paddingLeft 64/40): confortavel lane 11 em janela 300
     -> 200; compacta lane 13 em janela 375 -> 216.5. */
  assert.equal(centerOn(laneX(11, METRICS), 300), 200);
  assert.equal(centerOn(laneX(13, METRICS_COMPACT), 375), 216.5);
});

test("bola ja rolada para tras: a guarda volta a rolar para a frente", () => {
  const targetX = laneX(2, METRICS);
  /* literal: com paddingLeft 64, o centro da lane 2 e 64 + 2*26 = 116 */
  assert.equal(targetX, 116, "o centro da lane 2");
  assert.equal(ballOutside(targetX, 120, 200), true, "bola atras da janela");
  /* literal: com o centro em 116, o alvo 116 - 100 = 16 (era 0 com centro 100) */
  assert.equal(centerOn(targetX, 200), 16, "o alvo volta sem negativar");
});

test("bola visivel nao rola nem quando o conteudo e mais largo que a janela", () => {
  /* a guarda existe para isto: clicar numa branch do rail nao pode deslocar a
     tela inteira se o commit ja aparece — mesmo com os 480px de conteudo. */
  const width = 375;
  /* lane 11 (centro 348) ainda cabe na janela de 375; a 12 (376) ja nao. */
  const targetX = laneX(11, METRICS_COMPACT);
  assert.equal(ballOutside(targetX, 0, width), false, "bola dentro da janela");
  assert.equal(centerOn(targetX, width), 160.5);
});

test("a formula antiga (com o raio somado) deslocaria a fronteira da guarda", () => {
  /* regressao da Onda 1: somar `nodeRadius` ao alvo faz a bola da lane 9
     parecer fora da janela — e o scroll dispararia para uma bola que ja esta
     visivel. (Com paddingLeft 64 os centros caem em 64 + 26k; a lane 9 fica a
     2px da borda da janela de 300px: 298 dentro, 312 fora com o raio somado.) */
  const width = 300;
  const center = laneX(9, METRICS);
  assert.equal(center, 298);
  assert.equal(ballOutside(center, 0, width), false, "bola visivel");
  assert.equal(
    ballOutside(center + METRICS.nodeRadius, 0, width),
    true,
    "com o raio somado a mesma bola pareceria fora — rolaria a toa",
  );
});
