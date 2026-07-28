/**
 * O REALCE DO REVEAL NO DOM — prova que a marca sai diferente da selecao.
 *
 * `reveal.test.ts` cobre a decisao (rolar? marcar? liberar?); aqui se prova o
 * outro lado: que a linha marcada realmente RENDERIZA um realce proprio, e que
 * ele nao se confunde com o da selecao — o commit revelado tambem fica
 * selecionado, entao os dois aparecem juntos e precisam ser distinguiveis.
 *
 * `react-dom/server` nao roda efeitos, entao o pedido de reveal em si nao pode
 * ser exercitado por aqui (ele vive num `useEffect`); o que se renderiza e o
 * estado JA resolvido, via `marked` no `itemData` — a mesma coisa que a
 * `GraphView` entrega a lista depois de atender o pedido.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CommitRow } from "../CommitRow.tsx";
import { GraphView } from "../GraphView.tsx";
import { computeGraphLayout, DEFAULT_METRICS } from "../layout.ts";
import type { GraphRowData } from "../shell.ts";
import { branchAndMerge, rowOf } from "./fixtures.ts";

const commits = branchAndMerge();
const layout = computeGraphLayout(commits);

function renderRow(row: number, patch: Partial<GraphRowData> = {}): string {
  const data: GraphRowData = {
    layout,
    metrics: DEFAULT_METRICS,
    graphWidth: 96,
    selected: new Set<string>(),
    primary: null,
    headHash: null,
    marked: null,
    onSelect: () => {},
    onFocusGrid: () => {},
    ...patch,
  };
  return renderToStaticMarkup(
    createElement(CommitRow, { index: row, style: {}, data }),
  );
}

test("a linha marcada ganha um realce que a selecao nao tem", () => {
  const row = rowOf(commits, "F2");
  const hash = commits[row].hash;

  const marcada = renderRow(row, {
    marked: { hash, nonce: 1 },
    selected: new Set([hash]),
    primary: hash,
  });
  const soSelecionada = renderRow(row, { selected: new Set([hash]), primary: hash });

  assert.match(marcada, /data-revealed="true"/);
  assert.doesNotMatch(soSelecionada, /data-revealed/);

  /* o contorno e o que separa o realce temporario do banho de fundo da selecao */
  assert.match(marcada, /ring-primary/, "o realce do reveal tem contorno proprio");
  assert.doesNotMatch(soSelecionada, /ring-primary/);
  assert.ok(
    marcada.length > soSelecionada.length,
    "a linha marcada monta uma camada a mais",
  );
});

test("so a linha pedida e marcada", () => {
  const alvo = rowOf(commits, "F2");
  const vizinha = rowOf(commits, "C");
  const marked = { hash: commits[alvo].hash, nonce: 7 };

  assert.match(renderRow(alvo, { marked }), /data-revealed="true"/);
  assert.doesNotMatch(renderRow(vizinha, { marked }), /data-revealed/);
});

test("a GraphView aceita o pedido de reveal sem quebrar o render", () => {
  const calls: number[] = [];
  const html = renderToStaticMarkup(
    createElement(GraphView, {
      commits,
      refs: null,
      selected: [commits[0].hash],
      primary: commits[0].hash,
      onSelect: () => {},
      reveal: { hash: commits[rowOf(commits, "A")].hash, nonce: 1, origin: "ref" },
      onRevealed: () => void calls.push(1),
    }),
  );

  assert.match(html, /Historico de commits/);
  /* o reveal e efeito: no render de servidor ele nao roda, e nada e marcado nem
     liberado. Quem prova o comportamento e `reveal.test.ts`. */
  assert.doesNotMatch(html, /data-revealed/);
  assert.equal(calls.length, 0);
});
