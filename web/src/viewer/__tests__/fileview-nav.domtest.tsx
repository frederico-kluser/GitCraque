/**
 * NAVEGACAO PREV/NEXT DO PAINEL — com os hooks DE VERDADE.
 *
 * Renderiza o `FileViewPanel` completo via `react-dom/server` (mesmo caminho
 * de render do navegador, sem layout; os efeitos nao rodam, entao o cache de
 * detalhe de commit fica vazio — o que torna este entry a prova do caso
 * "arquivo de commit ainda sem lista").
 *
 * O que se prova aqui:
 *  · arquivo da arvore de trabalho (hash nulo): os botoes NEM EXISTEM;
 *  · arquivo de commit: um botao prev e um next, com aria-label do catalogo
 *    (viewer.prevFile / viewer.nextFile) — nunca texto cravado;
 *  · sem lista de arquivos conhecida, os dois ficam desabilitados.
 *
 * A matriz completa (meio da lista habilitado, pontas desabilitadas) mora no
 * entry irmão `fileview-nav-matrix.domtest.tsx`, que injeta o stub de hook.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FileViewPanel } from "../../panels/FileViewPanel.tsx";
import { t } from "@/i18n";
import type { OpenFile } from "@/state/store";

interface ButtonAttrs {
  [name: string]: string;
}

function buttons(html: string): ButtonAttrs[] {
  const out: ButtonAttrs[] = [];
  const re = /<button\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs: ButtonAttrs = {};
    for (const [, name, value] of m[1].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) {
      attrs[name] = value;
    }
    out.push(attrs);
  }
  return out;
}

const navButtons = (file: OpenFile) => {
  const html = renderToStaticMarkup(createElement(FileViewPanel, { file, className: "" }));
  const list = buttons(html);
  return {
    html,
    prev: list.find((b) => b["aria-label"] === t("viewer.prevFile")) ?? null,
    next: list.find((b) => b["aria-label"] === t("viewer.nextFile")) ?? null,
  };
};

test("as etiquetas prev/next existem no catalogo corrente (nao sao a propria chave)", () => {
  assert.notEqual(t("viewer.prevFile"), "viewer.prevFile");
  assert.notEqual(t("viewer.nextFile"), "viewer.nextFile");
});

test("arquivo da arvore de trabalho: prev/next nao existem no painel", () => {
  const { html, prev, next } = navButtons({ path: "a.txt", hash: null, fromWorkingTree: true });
  assert.equal(prev, null, "botao prev existe para working tree");
  assert.equal(next, null, "botao next existe para working tree");
  assert.ok(!html.includes(t("viewer.prevFile")), "etiqueta prev no markup da working tree");
  assert.ok(!html.includes(t("viewer.nextFile")), "etiqueta next no markup da working tree");
});

test("arquivo de commit ainda sem lista conhecida: os dois botoes existem e desabilitados", () => {
  const { prev, next } = navButtons({ path: "a.txt", hash: "abc123", fromWorkingTree: false });
  assert.ok(prev, "botao prev nao existe para arquivo de commit");
  assert.ok(next, "botao next nao existe para arquivo de commit");
  assert.ok("disabled" in prev, "prev deveria estar desabilitado sem lista");
  assert.ok("disabled" in next, "next deveria estar desabilitado sem lista");
});

test("a etiqueta dos botoes vem do catalogo, nao do titulo do arquivo", () => {
  const { prev, next } = navButtons({ path: "a.txt", hash: "abc123", fromWorkingTree: false });
  assert.ok(prev, "botao prev nao existe");
  assert.ok(next, "botao next nao existe");
  assert.equal(prev["aria-label"], t("viewer.prevFile"));
  assert.equal(next["aria-label"], t("viewer.nextFile"));
  // Sem alvo, o title mostra a etiqueta (nao um caminho que nao existe).
  assert.equal(prev["title"], t("viewer.prevFile"));
  assert.equal(next["title"], t("viewer.nextFile"));
});
