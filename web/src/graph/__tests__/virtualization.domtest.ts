/**
 * PROVA DA VIRTUALIZACAO — conta nos de DOM de verdade.
 *
 * Renderiza a `GraphView` REAL com `react-dom/server` (que executa o mesmo
 * caminho de render do navegador, so que sem layout) e conta as tags emitidas.
 * O que se prova: o numero de nos NAO depende do tamanho do repositorio — 200 ou
 * 20 000 commits produzem a mesma janela.
 *
 * Precisa de bundling (JSX + alias `@/`), entao roda pelo `run.mjs`, nao pelo
 * `node --test` direto. Por isso o nome nao termina em `.test.ts`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GraphView } from "../GraphView.tsx";
import { computeGraphLayout } from "../layout.ts";
import { syntheticRepo } from "./fixtures.ts";
import { t } from "@/i18n";
import type { RawCommit } from "@/types/git";

const countTags = (html: string, tag: string) =>
  html.split(`<${tag}`).length - 1;

/** Todo elemento aberto no markup — a contagem de nos do DOM. */
const countElements = (html: string) => (html.match(/<[a-zA-Z][^>]*>/g) ?? []).length;

function render(commits: RawCommit[]): string {
  return renderToStaticMarkup(
    createElement(GraphView, {
      commits,
      refs: null,
      selected: commits.length > 0 ? [commits[0].hash] : [],
      primary: commits.length > 0 ? commits[0].hash : null,
      onSelect: () => {},
    }),
  );
}

test("o DOM montado nao cresce com o repositorio", () => {
  const sizes = [200, 2000, 20000];
  const measured = sizes.map((size) => {
    const commits = syntheticRepo(size);
    const html = render(commits);
    return {
      size,
      elements: countElements(html),
      rows: countTags(html, 'div role="row"'),
      svgs: countTags(html, "svg"),
      paths: countTags(html, "path"),
      circles: countTags(html, "circle"),
    };
  });

  console.log("\n      commits | nos de DOM | linhas | <svg> | <path> | <circle>");
  for (const m of measured) {
    console.log(
      `      ${String(m.size).padStart(7)} | ${String(m.elements).padStart(10)} |` +
        ` ${String(m.rows).padStart(6)} | ${String(m.svgs).padStart(5)} |` +
        ` ${String(m.paths).padStart(6)} | ${String(m.circles).padStart(7)}`,
    );
  }

  const big = measured[measured.length - 1];
  const small = measured[0];

  assert.ok(big.rows < 60, `montou ${big.rows} linhas para 20 000 commits`);
  assert.ok(big.elements < 1200, `montou ${big.elements} nos de DOM`);
  assert.equal(
    big.rows,
    small.rows,
    "a janela montada e a mesma para 200 e para 20 000 commits",
  );
  assert.ok(
    Math.abs(big.elements - small.elements) / small.elements < 0.15,
    `contagem de nos variou demais: ${small.elements} -> ${big.elements}`,
  );

  /* o contrafactual: um <svg> unico gigante precisaria de um no por aresta e um
     por commit — tres ordens de grandeza a mais. */
  const layout = computeGraphLayout(syntheticRepo(20000));
  const monolito = layout.edges.length + layout.nodes.length;
  console.log(
    `\n      um <svg> unico precisaria de ${monolito} nos` +
      ` (${(monolito / big.elements).toFixed(0)}x o que a virtualizacao monta)`,
  );
  assert.ok(monolito > big.elements * 30);
});

test("cada linha montada desenha so as arestas que a cruzam", () => {
  const commits = syntheticRepo(20000);
  const layout = computeGraphLayout(commits);
  const html = render(commits);

  const rows = countTags(html, 'div role="row"') - 1; // -1: o cabecalho
  /* So os `<path>` DO GRAFO contam. A pagina tem outros: o aviso de rolagem
     lateral, que aparece quando o desenho passa do teto da coluna, traz um
     icone do lucide com 4 paths proprios. Contar `<path>` na marcacao inteira
     misturava desenho com iconografia e fazia este teste falhar por um icone. */
  const graphCells = html.match(/<svg role="gridcell"[\s\S]*?<\/svg>/g) ?? [];
  const paths = graphCells.reduce((total, cell) => total + countTags(cell, "path"), 0);

  let expected = 0;
  for (let row = 0; row < rows; row++) expected += layout.rowEdges.forRow(row).length;

  assert.equal(paths, expected, "um <path> por aresta que cruza a janela");
  assert.ok(
    paths < layout.edges.length / 100,
    `${paths} paths para ${layout.edges.length} arestas no repositorio`,
  );
  console.log(
    `\n      ${paths} <path> montados para ${layout.edges.length} arestas do repositorio` +
      ` (${((paths / layout.edges.length) * 100).toFixed(2)}%)`,
  );
});

test("estado vazio e de carregamento montam poucos nos", () => {
  const empty = render([]);
  assert.ok(countElements(empty) < 40, `estado vazio com ${countElements(empty)} nos`);
  // Sai do catalogo, nao cravado: o idioma padrao pode mudar e o teste continua
  // provando o que interessa — que o estado vazio realmente foi renderizado.
  assert.ok(empty.includes(t("graph.empty.title")), "o titulo do estado vazio esta no markup");

  const loading = renderToStaticMarkup(
    createElement(GraphView, {
      commits: [],
      refs: null,
      selected: [],
      primary: null,
      loading: true,
      onSelect: () => {},
    }),
  );
  assert.match(loading, /aria-busy/);
  assert.ok(countElements(loading) < 220, `carregamento com ${countElements(loading)} nos`);
});

test("densidade compacta: colunas colapsadas, metadado na linha e menu por dedo", () => {
  /* O mesmo `GraphView` real, so que com `density: "compact"` — por PROP, e e
     por isso que a prop existe (ver `GraphViewProps.density`). */
  const commits = syntheticRepo(200);
  const html = renderToStaticMarkup(
    createElement(GraphView, {
      commits,
      refs: null,
      selected: [],
      primary: null,
      density: "compact",
      buildCommitMenu: (hash) => [{ label: `Copiar ${hash}`, onSelect: () => {} }],
      onSelect: () => {},
    }),
  );

  /* o grid anuncia as 3 colunas que realmente existem */
  assert.match(html, /aria-colcount="3"/);

  /* autor/data/hash sairam do cabecalho... */
  assert.ok(html.includes(t("graph.column.meta")), "a coluna de detalhes esta no cabecalho");
  assert.ok(!html.includes(t("graph.column.author")), "a coluna de autor nao existe mais");
  assert.ok(!html.includes(t("graph.column.hash")), "a coluna de hash nao existe mais");

  /* ...e o conteudo delas desceu para a linha do commit (o conteudo que o
     balao do hover mostrava, e que no celular nao pode depender de hover). */
  assert.ok(html.includes("Ada Lovelace"), "autor na linha compacta");
  assert.ok(html.includes("3 days ago"), "data na linha compacta");
  assert.ok(html.includes("0000000"), "hash curto na linha compacta");

  /* a linha compacta usa as metricas do celular */
  assert.match(html, /height:52px/);

  /* o "..." (ActionMenu) e a porta do menu por dedo: o gatilho anuncia o
     alvo, mesmo sem o popup no markup (menu fechado nao portaliza nada em
     SSR). */
  assert.match(html, /Commit 0000000/);

  /* sem o balao do hover: nem o registro do gatilho existe no compacto */
  assert.ok(!html.includes("data-base-ui-tooltip"), "sem gatilhos de tooltip no compacto");

  /* o orcamento de nos continua valendo no compacto */
  assert.ok(countTags(html, 'div role="row"') < 60, "janela compacta com menos de 60 linhas");
});
