/**
 * Os ativadores do `PointerSensor` do @dnd-kit, escolhidos pelo tipo de
 * ponteiro.
 *
 * Puro de proposito — zero imports de runtime, nem `import type` — porque a
 * suite `__tests__/sensors.test.mjs` o carrega direto sob `node --test` (type
 * stripping), como `intents.ts` e `ids.ts`.
 *
 * ## Por que existe — e o que o @dnd-kit NAO diz em voz alta
 *
 * `activationConstraint` e uma UNION: ou `{ distance }` ou
 * `{ delay, tolerance }` (o tipo dele ainda admite os dois juntos, que e
 * exatamente a armadilha). Passar os dois faz o `distance` ser IGNORADO — o
 * arraste passaria a acordar so com atraso, ate no mouse. Este modulo, por
 * construcao, devolve SEMPRE uma das duas formas, nunca as duas — a UNIAO esta
 * no tipo, nao so na intencao.
 *
 * Sem a troca por ativador, o `distance: 6` do mouse mata a rolagem por toque:
 * qualquer dedo que ande 6px sobre o grafo vira arrasto, e a lista
 * virtualizada do historico deixa de rolar.
 */
export type PointerActivationConstraint =
  | { distance: number }
  | { delay: number; tolerance: number };

/**
 * Quanto o dedo fica parado antes de o ARRASTE acordar (o `delay` do
 * `PointerSensor`).
 *
 * ESPELHA `DND_DELAY_MS` de `web/src/hooks/useShellStore.ts` (onda 2a) — a
 * fonte canonica tem o contrato completo. O dnd nao pode importar de la em
 * runtime: aquele arquivo importa React com specifier sem extensao e nao e
 * carregavel pelo `node --test`, que e o que prova este modulo.
 *
 * A invariante que liga os dois — este numero tem de ser MENOR que
 * `LONG_PRESS_MS` (500), senao o menu de toque longo abre antes do arraste —
 * esta provada na suite `sensors.test.mjs`. A outra metade da regra e o
 * `cancelLongPress()` no `onDragStart` do `GitDndProvider`.
 *
 * O QUE O DELAY FAZ COM O DEDO PARADO — e os tres edge cases que a onda 2a
 * decidiu aceitar, nao contornar:
 *
 *  1. Segurar o dedo SEM mover acorda o arraste aos 250ms, mesmo sem nenhum
 *     movimento: o `delay` ativa por tempo de repouso, nao por deslocamento.
 *     O menu de toque longo (500ms) morre no `cancelLongPress()` do
 *     `onDragStart` — o arraste vence sempre, e o menu daquele no tem outra
 *     porta (o "..." do `ActionMenu` nas linhas compactas).
 *  2. Mover o dedo DENTRO da folga (`DND_TOLERANCE_PX`, 5px) antes dos 250ms
 *     nao cancela o atraso: o gesto ainda acorda como arraste quando o timer
 *     dispara. Uma micro-deriva da ponta do dedo nao mata o arraste.
 *  3. Mover o dedo ALEM da folga antes dos 250ms cancela o atraso e o gesto
 *     vira rolagem — e o que faz a lista virtualizada do historico continuar
 *     rolando. A conta e do @dnd-kit: a cada `pointermove` ele compara a
 *     distancia acumulada com a folga; passou, o timer morre.
 */
export const DND_DELAY_MS = 250;

/** O dedo pode derivar ate 5px do ponto de partida sem cancelar o atraso. */
export const DND_TOLERANCE_PX = 5;

/**
 * 6px de folga do mouse: um clique simples num commit continua sendo selecao
 * (o grafo depende disso). Inalterado da configuracao original do provider.
 */
export const DND_DISTANCE_PX = 6;

/**
 * O ativador certo para o ponteiro do usuario.
 *
 * @param coarse `(pointer: coarse)` — ponteiro PRIMARIO e um dedo (leia com
 *   `getViewport().coarsePointer`; para dispositivos de toque e o media query
 *   que decide, nao a largura da tela).
 */
export function activationConstraintFor(coarse: boolean): PointerActivationConstraint {
  return coarse
    ? { delay: DND_DELAY_MS, tolerance: DND_TOLERANCE_PX }
    : { distance: DND_DISTANCE_PX };
}
