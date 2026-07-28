/**
 * REVEAL — clicar numa branch leva a View Tree ate o commit e marca a linha.
 *
 * O que estes testes protegem e exatamente o que quebra na pratica:
 *
 *   - quem manda e o NONCE, nao o hash: clicar duas vezes na mesma branch tem de
 *     rolar DUAS vezes;
 *   - atender o mesmo nonce duas vezes e o laco
 *     `reveal -> rola -> onRevealed limpa -> re-render -> rola`;
 *   - hash que nao esta no log carregado nao rola para lugar nenhum e nao
 *     estoura, mas ainda assim LIBERA o pedido;
 *   - linha ja confortavelmente visivel nao rola (rolar a toa desorienta).
 *
 * A decisao inteira e pura (`reveal.ts` nao tem import de runtime), entao nada
 * aqui precisa de DOM: a `RevealSurface` falsa registra o que a `GraphView`
 * teria feito na lista virtualizada.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { computeGraphLayout, DEFAULT_METRICS } from "../layout.ts";
import { applyRevealPlan, isRowComfortable, planReveal } from "../reveal.ts";
import type { RevealSurface, RevealTarget, RevealViewport } from "../reveal.ts";
import { branchAndMerge, hashOf, linearHistory, rowOf } from "./fixtures.ts";

const ROW = DEFAULT_METRICS.rowHeight;
/** uma janela de 20 linhas, como um painel de ~560px */
const WINDOW_ROWS = 20;

const viewAt = (scrollOffset: number): RevealViewport => ({
  scrollOffset,
  height: WINDOW_ROWS * ROW,
  rowHeight: ROW,
});

/** A janela rolada de forma que `row` fique no centro. */
const centeredOn = (row: number): RevealViewport =>
  viewAt(Math.max(0, (row - Math.floor(WINDOW_ROWS / 2)) * ROW));

/** Registra o que a GraphView teria feito, sem DOM nenhum. */
function fakeSurface() {
  const scrolled: number[] = [];
  const marked: RevealTarget[] = [];
  const focused: string[] = [];
  let released = 0;
  const surface: RevealSurface = {
    scrollToRow: (row) => void scrolled.push(row),
    mark: (target) => void marked.push(target),
    focusRow: (hash) => void focused.push(hash),
    release: () => void released++,
  };
  return {
    surface,
    scrolled,
    marked,
    focused,
    get released() {
      return released;
    },
  };
}

/* ------------------------------------------------------------------ */

test("o mesmo hash com nonce diferente pede rolagem DUAS vezes", () => {
  const commits = linearHistory(400);
  const layout = computeGraphLayout(commits);
  /* o commit mais antigo — a ultima linha, bem longe do topo da lista. */
  const row = rowOf(commits, "c1");
  const hash = commits[row].hash;

  const view = viewAt(0);
  const surface = fakeSurface();
  let served: number | null = null;

  /* dois cliques na MESMA branch, com a lista de volta ao topo entre eles. */
  for (const nonce of [1, 2]) {
    const plan = planReveal({ hash, nonce }, { layout, viewport: view, servedNonce: served });
    if (plan !== null) served = plan.nonce;
    applyRevealPlan(plan, surface.surface);
  }

  assert.deepEqual(surface.scrolled, [row, row], "so o hash nao mudaria nada no segundo clique");
  assert.deepEqual(
    surface.marked.map((m) => m.nonce),
    [1, 2],
    "o realce reanima no segundo pedido",
  );
  assert.deepEqual(surface.focused, [hash, hash], "o teclado acompanha as duas vezes");
  assert.equal(surface.released, 2);
});

test("o mesmo NONCE nao se atende duas vezes — e o laco", () => {
  const commits = linearHistory(400);
  const layout = computeGraphLayout(commits);
  const hash = commits[rowOf(commits, "c1")].hash;
  const context = { layout, viewport: viewAt(0), servedNonce: null as number | null };

  const first = planReveal({ hash, nonce: 9 }, context);
  assert.ok(first, "o primeiro pedido e atendido");

  /* e o que acontece de verdade: `onRevealed` limpa o store, o shell
     re-renderiza e o efeito roda de novo com o MESMO pedido na mao. */
  const again = planReveal({ hash, nonce: 9 }, { ...context, servedNonce: first.nonce });
  assert.equal(again, null);

  const surface = fakeSurface();
  applyRevealPlan(again, surface.surface);
  assert.deepEqual(surface.scrolled, []);
  assert.equal(surface.released, 0, "nada a liberar quando nada foi atendido");
});

test("hash ausente do log nao estoura e ainda assim libera o pedido", () => {
  const commits = linearHistory(50);
  const layout = computeGraphLayout(commits);
  /* uma ref para objeto que o log carregado nao alcanca: paginado fora, ou
     fora do que o `--all` traz. */
  const foraDoLog = hashOf(999);
  assert.equal(layout.index.has(foraDoLog), false, "o fixture precisa mesmo nao ter esse hash");

  const surface = fakeSurface();
  const plan = planReveal(
    { hash: foraDoLog, nonce: 3 },
    { layout, viewport: viewAt(0), servedNonce: null },
  );

  assert.ok(plan, "o pedido tem de ser consumido, senao fica preso no store");
  assert.equal(plan.row, null);
  assert.equal(plan.scroll, false);

  applyRevealPlan(plan, surface.surface);
  assert.deepEqual(surface.scrolled, [], "nao rola para lugar nenhum");
  assert.deepEqual(surface.marked, [], "nao ha linha para marcar");
  assert.equal(surface.released, 1, "mesmo assim libera");
});

test("log vazio nao guarda pedido preso", () => {
  const layout = computeGraphLayout([]);
  const plan = planReveal(
    { hash: hashOf(1), nonce: 1 },
    { layout, viewport: viewAt(0), servedNonce: null },
  );
  assert.ok(plan);
  assert.equal(plan.row, null);
});

test("o pedido ESPERA o log chegar, e e atendido quando ele chega", () => {
  const commits = branchAndMerge();
  const row = rowOf(commits, "F2");
  const hash = commits[row].hash;
  const request = { hash, nonce: 4 };

  /* o pedido chegou antes do log (troca de worktree, boot). */
  const carregando = planReveal(request, {
    layout: computeGraphLayout([]),
    viewport: viewAt(0),
    servedNonce: null,
    loading: true,
  });
  assert.equal(carregando, null, "consumir agora perderia o alvo por nada");

  /* o log chegou: o efeito roda de novo (o layout e dependencia dele). */
  const depois = planReveal(request, {
    layout: computeGraphLayout(commits),
    viewport: viewAt(0),
    servedNonce: null,
    loading: false,
  });
  assert.ok(depois);
  assert.equal(depois.row, row);
});

test("linha confortavelmente visivel NAO rola, mas continua sendo marcada", () => {
  const commits = linearHistory(400);
  const layout = computeGraphLayout(commits);
  const row = 120;
  const hash = commits[row].hash;

  const plan = planReveal(
    { hash, nonce: 1 },
    { layout, viewport: centeredOn(row), servedNonce: null },
  );
  assert.ok(plan);
  assert.equal(plan.row, row);
  assert.equal(plan.scroll, false, "rolar sem necessidade e desorientador");

  const surface = fakeSurface();
  applyRevealPlan(plan, surface.surface);
  assert.deepEqual(surface.scrolled, []);
  assert.deepEqual(
    surface.marked.map((m) => m.hash),
    [hash],
    "sem rolagem, o realce e a unica pista de onde o commit esta",
  );
  assert.equal(surface.released, 1);
});

test("linha colada na borda da janela ainda rola", () => {
  const row = 120;
  const primeiraVisivel = viewAt(row * ROW);
  const ultimaVisivel = viewAt((row - WINDOW_ROWS + 1) * ROW);

  assert.equal(isRowComfortable(row, primeiraVisivel), false, "colada no topo");
  assert.equal(isRowComfortable(row, ultimaVisivel), false, "colada na base");
  assert.equal(isRowComfortable(row, centeredOn(row)), true);

  /* a fronteira exata: com a folga de 2 linhas, a terceira linha da janela ja
     esta confortavel. */
  assert.equal(isRowComfortable(row, viewAt((row - 2) * ROW)), true);
  assert.equal(isRowComfortable(row, viewAt((row - 1) * ROW)), false);
});

test("janela ainda nao medida sempre rola", () => {
  assert.equal(isRowComfortable(0, { scrollOffset: 0, height: 0, rowHeight: ROW }), false);
});

test("janela baixa demais para a folga ainda tem posicao confortavel", () => {
  /* um painel de tres linhas: 2 linhas de folga de cada lado nao cabem, e sem o
     limite da folga o grafo rolaria a cada pedido, para sempre. */
  const baixa: RevealViewport = { scrollOffset: 0, height: 3 * ROW, rowHeight: ROW };
  assert.equal(isRowComfortable(1, baixa), true);
  assert.equal(isRowComfortable(0, baixa), false);
});

test("sem pedido, nao ha plano", () => {
  const layout = computeGraphLayout(linearHistory(10));
  const context = { layout, viewport: viewAt(0), servedNonce: null };
  assert.equal(planReveal(null, context), null);
  assert.equal(planReveal(undefined, context), null);

  const surface = fakeSurface();
  applyRevealPlan(null, surface.surface);
  assert.equal(surface.released, 0);
});

test("o alvo do reveal e a linha do commit no layout, nao a ordem do clique", () => {
  /* a garantia de O(1) do requisito: o plano sai do indice do layout, nao de uma
     varredura. Se a lista mudar de tamanho, a linha acompanha. */
  const commits = branchAndMerge();
  const layout = computeGraphLayout(commits);
  for (const name of ["A", "B", "F1", "F2", "C", "M", "D"]) {
    const row = rowOf(commits, name);
    const plan = planReveal(
      { hash: commits[row].hash, nonce: row + 1 },
      { layout, viewport: viewAt(0), servedNonce: null },
    );
    assert.ok(plan, name);
    assert.equal(plan.row, row, `linha errada para ${name}`);
    assert.equal(plan.row, layout.index.get(commits[row].hash));
  }
});
