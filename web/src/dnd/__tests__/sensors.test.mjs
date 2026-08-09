/**
 * Os ativadores de sensor escolhidos pelo tipo de ponteiro.
 *
 *   node --test web/src/dnd/__tests__/sensors.test.mjs
 *
 * `sensors.ts` e puro — zero imports de runtime — para que este arquivo o
 * carregue direto sob Node (type stripping), como `intents.test.mjs` faz com
 * `intents.ts`.
 *
 * O que esta suite pega e o que a suite antiga do dnd (intents + ids) nunca
 * viu: `GitDndProvider.tsx` monta o `PointerSensor` com o ativador escolhido
 * por `coarsePointer`, e o @dnd-kit trata `activationConstraint` como UNION —
 * ou `{ distance }` ou `{ delay, tolerance }`. Passar os dois juntos faz o
 * `distance` ser ignorado em silencio: o arraste passaria a acordar so com
 * atraso, ate no mouse. Este teste trava a exclusao mutua em runtime, e o tipo
 * do modulo a trava em compile.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  activationConstraintFor,
  DND_DELAY_MS,
  DND_DISTANCE_PX,
  DND_TOLERANCE_PX,
} from "../sensors.ts";

test("ponteiro fino (mouse) ativa por distancia, 6px", () => {
  assert.deepEqual(activationConstraintFor(false), { distance: 6 });
});

test("ponteiro grosseiro (toque) ativa por atraso, 250ms com folga de 5px", () => {
  assert.deepEqual(activationConstraintFor(true), { delay: 250, tolerance: 5 });
});

test("as duas formas sao mutuamente exclusivas: nenhum campo da outra", () => {
  const mouse = activationConstraintFor(false);
  const touch = activationConstraintFor(true);
  assert.equal("delay" in mouse, false, "mouse nao pode ativar por atraso");
  assert.equal("tolerance" in mouse, false, "mouse nao tem folga de toque");
  assert.equal("distance" in touch, false, "toque nao pode ativar por distancia");
});

test("os numeros vem das constantes do modulo (uma fonte de verdade no dnd)", () => {
  assert.equal(DND_DELAY_MS, 250);
  assert.equal(DND_TOLERANCE_PX, 5);
  assert.equal(DND_DISTANCE_PX, 6);
});

test("invariante do toque: arraste acorda ANTES do menu de toque longo", () => {
  // LONG_PRESS_MS = 500 vive em useShellStore.ts, que nao e carregavel pelo
  // node --test (importa React com specifier sem extensao); o 500 aqui e o
  // espelho dessa constante. Sem a regra o menu abriria primeiro, e o
  // cancelLongPress() do onDragStart so roda DEPOIS de o arraste acordar — o
  // que nao chegaria a acontecer.
  assert.ok(
    DND_DELAY_MS < 500,
    `DND_DELAY_MS (${DND_DELAY_MS}) tem de ser menor que LONG_PRESS_MS (500)`,
  );
});
