/**
 * O ROLADOR HORIZONTAL NO DOM — onde o scroll compacto se ancora.
 *
 * O scroll em si (o `scrollTo` com guarda do reveal e do clique) vive num
 * efeito e num callback da `GraphView` e nao roda em `react-dom/server`; a
 * aritmetica dele e de `scroll.test.ts`. O que o SSR PROVA e a outra metade
 * da Onda 1: o rolador (`overflow-x-auto`) existe SO no compacto, o
 * `min-width` do conteudo leva o piso de 480px ao DOM e, num grafo largo,
 * leva a largura exata calculada por `compactContentWidth` — a precondicao
 * de haver o que rolar. E que o cabecalho mora DENTRO do conteudo que rola,
 * para colunas e lista nunca desalinharem.
 *
 * Precisa de bundling (JSX + alias `@/`), entao roda pelo `run.mjs`, nao pelo
 * `node --test` direto.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GraphView } from "../GraphView.tsx";
import { COMPACT_METRICS, computeGraphLayout } from "../layout.ts";
import { compactContentWidth, graphColumnWidth } from "../shell.ts";
import { commitOf, hashOf, linearHistory } from "./fixtures.ts";
import type { RawCommit } from "@/types/git";

/** 16 branches vivas ao mesmo tempo — o grafo largo que o piso existe para servir. */
function wideHistory(): RawCommit[] {
  const commits: RawCommit[] = [];
  /* os filhos primeiro (os mais novos), depois as raizes: uma lane por branch. */
  for (let i = 1; i <= 16; i++) {
    commits.push(commitOf(hashOf(i * 2), [hashOf(i * 2 - 1)], `c${i}`));
  }
  for (let i = 16; i >= 1; i--) commits.push(commitOf(hashOf(i * 2 - 1), [], `R${i}`));
  return commits;
}

function render(
  commits: RawCommit[],
  props: {
    density?: "comfortable" | "compact";
    reveal?: { hash: string; nonce: number; origin: "ref" | "command" | "detail" };
  } = {},
): string {
  return renderToStaticMarkup(
    createElement(GraphView, {
      commits,
      refs: null,
      selected: [],
      primary: null,
      onSelect: () => {},
      ...props,
    }),
  );
}

test("compacto de uma lane: o rolador existe e o piso de 480px esta no DOM", () => {
  const html = render(linearHistory(20), { density: "compact" });

  assert.ok(html.includes("overflow-x-auto"), "o rolador lateral existe");
  assert.ok(html.includes("overscroll-x-contain"), "o gesto devolve a pagina");
  assert.ok(html.includes("min-width:480px"), "o piso de 480px chega ao CSS");
  assert.ok(html.includes("--graph-col:56px"), "coluna de uma lane compacta");

  /* a ordem montada: rolador > conteudo (min-width) > cabecalho — o cabecalho
     rola junto com as linhas, senao as colunas desalinhariam. */
  assert.ok(
    html.indexOf("overflow-x-auto") < html.indexOf("min-width"),
    "o rolador e o pai do conteudo",
  );
  assert.ok(
    html.indexOf("min-width") < html.indexOf('role="row"'),
    "o cabecalho mora dentro do conteudo que rola",
  );
});

test("grafo de 16 lanes: a largura de conteudo passa do piso e vai ao DOM", () => {
  const commits = wideHistory();
  const layout = computeGraphLayout(commits);
  assert.equal(layout.laneCount, 16, "o fixture precisa ser largo de verdade");

  const html = render(commits, { density: "compact" });

  const expected = compactContentWidth(
    graphColumnWidth(layout.laneCount, COMPACT_METRICS),
  );
  assert.ok(expected > 480, `esperava passar do piso, veio ${expected}`);
  assert.ok(html.includes(`min-width:${expected}px`), "o DOM carrega a largura exata");
  assert.ok(html.includes("--graph-col:452px"), "16 lanes compactas = 452px de coluna");
});

test("confortavel nao monta rolador horizontal nenhum", () => {
  const html = render(linearHistory(20));

  assert.ok(!html.includes("overflow-x-auto"), "sem rolador no confortavel");
  assert.ok(!html.includes("min-width"), "sem piso de conteudo no confortavel");
  assert.ok(html.includes("--graph-col:72px"), "coluna confortavel de uma lane = 72px");
});

test("o reveal num grafo largo compacto renderiza sem quebrar", () => {
  /* o cenario exato do auto-scroll horizontal: grafo largo, revelar um commit
     de lane distante. O efeito nao roda em SSR — o que se prova e que a
     renderizacao aguenta o pedido (nada de crash), nada marca no servidor e
     o aviso de rolagem (que depende da medida real do rolador) fica de fora. */
  const commits = wideHistory();
  const html = render(commits, {
    density: "compact",
    reveal: { hash: commits[0].hash, nonce: 1, origin: "ref" },
  });

  assert.ok(html.includes("overflow-x-auto"), "o rolador continua no DOM");
  assert.doesNotMatch(html, /data-revealed/, "efeito nao roda no servidor");
  assert.ok(!html.includes('role="status"'), "sem aviso de rolagem sem medida real");
});
