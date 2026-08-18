/**
 * A ROLAGEM DA COLUNA NO DOM — o que o teto monta, e o que ele deixa de montar.
 *
 * O scroll em si (o `scrollTo` com guarda de `centerLane`, a escrita da
 * variavel `--graph-scroll-x`) vive num efeito e num callback da `GraphView` e
 * nao roda em `react-dom/server`; a aritmetica dele e de `scroll.test.ts`. O
 * que o SSR PROVA e a outra metade:
 *
 *   - `--graph-col` NUNCA passa do teto da densidade, por mais lanes que haja;
 *   - a barra da coluna (`data-graph-scroller`) so existe quando span > box, e
 *     carrega um espacador da largura do SPAN — e ele que da o que rolar;
 *   - cada linha desenha um `<svg>` do tamanho do BOX, com o desenho inteiro
 *     dentro de um `<g>` deslocado por `--graph-scroll-x`;
 *   - a linha compacta so leva `min-width` da soma real das colunas — o piso
 *     artificial de 480px morreu com o teto.
 *
 * Precisa de bundling (JSX + alias `@/`), entao roda pelo `run.mjs`, nao pelo
 * `node --test` direto.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GraphView } from "../GraphView.tsx";
import { COMPACT_METRICS, DEFAULT_METRICS, computeGraphLayout } from "../layout.ts";
import { COLUMN } from "../paint.ts";
import { compactContentWidth, graphColumnBox, graphColumnSpan } from "../shell.ts";
import { commitOf, hashOf, linearHistory } from "./fixtures.ts";
import type { RawCommit } from "@/types/git";

/** 16 branches vivas ao mesmo tempo — o grafo largo que o teto existe para servir. */
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

test("grafo estreito: coluna do tamanho do desenho e barra nenhuma", () => {
  const html = render(linearHistory(20));

  /* 128px = paddingLeft 64 dos dois lados; abaixo do teto, box == span. */
  assert.ok(html.includes("--graph-col:128px"), "coluna confortavel de uma lane = 128px");
  assert.ok(!html.includes("data-graph-scroller"), "sem barra: nao ha o que rolar");
  assert.ok(!html.includes('role="status"'), "sem aviso de rolagem");
  assert.ok(!html.includes("min-width"), "sem piso de conteudo no confortavel");
});

test("grafo largo confortavel: a coluna para no teto e a barra aparece", () => {
  const commits = wideHistory();
  const layout = computeGraphLayout(commits);
  assert.equal(layout.laneCount, 16, "o fixture precisa ser largo de verdade");

  const span = graphColumnSpan(layout.laneCount, DEFAULT_METRICS);
  const box = graphColumnBox(span, "comfortable");
  assert.equal(span, 518, "16 lanes desenham 518px");
  assert.equal(box, COLUMN.max, "e a coluna para em 256");

  const html = render(commits);

  assert.ok(html.includes(`--graph-col:${box}px`), "a coluna leva o BOX ao CSS");
  assert.ok(!html.includes(`--graph-col:${span}px`), "o span nao vira largura de coluna");
  assert.ok(html.includes("data-graph-scroller"), "a barra da coluna existe");
  assert.ok(html.includes(`width:${span}px`), "o espacador da barra tem a largura do span");
  assert.ok(html.includes('role="status"'), "o aviso de rolagem aparece");

  /* O POLEGAR e puro CSS sobre as variaveis do container: a razao
     janela/desenho e publicada uma vez e o navegador refaz largura e
     deslocamento sozinho a cada rolagem — nenhum numero de barra e calculado
     em JavaScript, e nenhuma linha re-renderiza. */
  assert.ok(html.includes(`--graph-ratio:${box / span}`), "a razao chega ao CSS");
  assert.ok(
    html.includes("width:calc(var(--graph-col) * var(--graph-ratio))"),
    "a largura do polegar sai da razao",
  );
  assert.ok(
    html.includes("translateX(calc(var(--graph-scroll-x, 0px) * -1 * var(--graph-ratio)))"),
    "o polegar anda com o deslocamento, na mesma escala",
  );
  /* a barra fica ENCOSTADA NO CABECALHO, antes da primeira linha. Nao e
     capricho: a area de IA e `fixed ... bottom-6` e flutua sobre o rodape de
     todos os paineis, e com a barra la embaixo metade dela ficava inclicavel
     (medido no navegador, `elementFromPoint` devolvia a secao da IA). */
  const bar = html.indexOf("data-graph-scroller");
  const firstRow = html.indexOf('aria-rowindex="2"'); // 1 e o cabecalho
  assert.ok(bar > 0 && firstRow > 0, "barra e primeira linha no markup");
  assert.ok(bar < firstRow, "a barra vem antes das linhas, encostada no cabecalho");
});

test("a linha desenha no tamanho do BOX e desloca pelo <g> do pan", () => {
  const html = render(wideHistory());

  assert.ok(
    html.includes(`viewBox="0 0 ${COLUMN.max} ${DEFAULT_METRICS.rowHeight}`),
    "o <svg> da linha recorta no teto da coluna",
  );
  assert.ok(
    html.includes("transform:translateX(var(--graph-scroll-x, 0px))"),
    "o desenho inteiro pende da variavel CSS do deslocamento",
  );
  /* a variavel NAO e declarada em lugar nenhum: o fallback 0px e o repouso, e
     quem a escreve e o `onScroll`, no navegador. */
  assert.ok(!html.includes("--graph-scroll-x:"), "nada declara o deslocamento no SSR");
});

test("compacto estreito: soma exata das colunas, sem piso artificial", () => {
  const html = render(linearHistory(20), { density: "compact" });

  /* 80px = paddingLeft 40 dos dois lados */
  assert.ok(html.includes("--graph-col:80px"), "coluna de uma lane compacta = 80px");
  /* 288 = 80 + 160 (assunto) + 48 (detalhes). Antes o piso mentia 480. */
  assert.ok(html.includes(`min-width:${compactContentWidth(80)}px`), "min-width = soma real");
  assert.ok(html.includes("min-width:288px"), "e a soma real sao 288px");
  assert.ok(!html.includes("data-graph-scroller"), "uma lane nao rola");

  /* a ordem montada: rolador da linha > conteudo (min-width) > cabecalho — o
     cabecalho rola junto com as linhas, senao as colunas desalinhariam. */
  assert.ok(
    html.indexOf("overflow-x-auto") < html.indexOf("min-width"),
    "o rolador e o pai do conteudo",
  );
  assert.ok(
    html.indexOf("min-width") < html.indexOf('role="row"'),
    "o cabecalho mora dentro do conteudo que rola",
  );
});

test("compacto largo: teto de 160px e a linha inteira cabendo em 375px", () => {
  const commits = wideHistory();
  const span = graphColumnSpan(computeGraphLayout(commits).laneCount, COMPACT_METRICS);
  const box = graphColumnBox(span, "compact");
  assert.equal(span, 500, "16 lanes compactas desenham 500px");
  assert.equal(box, COLUMN.maxCompact, "e a coluna compacta para em 160");

  const html = render(commits, { density: "compact" });

  assert.ok(html.includes("--graph-col:160px"), "a coluna compacta para no teto");
  assert.ok(html.includes("data-graph-scroller"), "a barra da coluna existe");
  assert.ok(html.includes("width:500px"), "o espacador carrega o span compacto");
  /* 368 = 160 + 160 + 48: cabe nos 375px do celular mais estreito comum, entao
     na pratica sobra UM rolador na tela — o do grafo. */
  assert.ok(html.includes("min-width:368px"), "a grade compacta mede 368px");
  assert.ok(compactContentWidth(box) <= 375, "e 368 cabe em 375");
});

test("o reveal num grafo largo renderiza sem quebrar", () => {
  /* o cenario exato do auto-scroll horizontal: grafo largo, revelar um commit
     de lane distante. O efeito nao roda em SSR — o que se prova e que a
     renderizacao aguenta o pedido (nada de crash) e nada marca no servidor. */
  const commits = wideHistory();
  const html = render(commits, {
    density: "compact",
    reveal: { hash: commits[0].hash, nonce: 1, origin: "ref" },
  });

  assert.ok(html.includes("data-graph-scroller"), "a barra continua no DOM");
  assert.doesNotMatch(html, /data-revealed/, "efeito nao roda no servidor");
});
