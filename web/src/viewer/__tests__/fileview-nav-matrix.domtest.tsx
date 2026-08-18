/**
 * MATRIZ DA NAVEGACAO PREV/NEXT — com o stub de hook injetado.
 *
 * O `useCommitDetail` de verdade le um cache PRIVADO de modulo que nenhum
 * teste alcanca sem DOM e sem efeitos. Este entry e empacotado com
 * `--alias:@/hooks=hooks-stub.ts`, entao o painel renderiza com a lista de
 * arquivos que o teste decidir. O alias vale PARA ESTE BUNDLE apenas — o entry
 * irmao `fileview-nav.domtest.tsx` roda com os hooks reais.
 *
 * A matriz que se prova: prev/next derivam da posicao do arquivo na lista —
 * meio habilitado dos dois lados, pontas desabilitadas, fora-da-lista e
 * working tree desabilitados ou ausentes.
 *
 * O mesmo stub controla o viewport, entao aqui tambem mora a prova do DiffView
 * compacto (uma coluna de numero, cabecalho de hunk de 3 colunas).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FileViewPanel } from "../../panels/FileViewPanel.tsx";
import { DiffView } from "../DiffView.tsx";
import { setCommitDetail, setCompact } from "./hooks-stub.ts";
import { t } from "@/i18n";
import type { CommitDetail, CommitFileChange, DiffPayload } from "@/types/git";
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

const file = (path: string): CommitFileChange => ({
  path,
  status: "modified",
  insertions: 0,
  deletions: 0,
  binary: false,
});

const FILES = ["a.ts", "b.ts", "c.ts"].map(file);

const detail = (files: CommitFileChange[]): CommitDetail => ({
  hash: "abc123",
  abbrevHash: "abc123",
  parents: [],
  authorName: "T",
  authorEmail: "t@t",
  authorDate: "",
  committerName: "T",
  committerEmail: "t@t",
  committerDate: "",
  subject: "",
  body: "",
  refs: [],
  files,
  stats: { filesChanged: files.length, insertions: 0, deletions: 0 },
});

const navButtons = (file: OpenFile) => {
  const html = renderToStaticMarkup(createElement(FileViewPanel, { file, className: "" }));
  const list = buttons(html);
  return {
    html,
    prev: list.find((b) => b["aria-label"] === t("viewer.prevFile")) ?? null,
    next: list.find((b) => b["aria-label"] === t("viewer.nextFile")) ?? null,
  };
};

test.beforeEach(() => {
  setCommitDetail(detail(FILES));
  setCompact(false);
});

test("arquivo do meio da lista: prev e next habilitados, cada um com o title do vizinho", () => {
  const { prev, next } = navButtons({ path: "b.ts", hash: "abc123", fromWorkingTree: false });
  assert.ok(prev && !("disabled" in prev), "prev do meio deveria estar habilitado");
  assert.ok(next && !("disabled" in next), "next do meio deveria estar habilitado");
  assert.equal(prev["title"], "a.ts");
  assert.equal(next["title"], "c.ts");
});

test("primeiro da lista: prev desabilitado, next habilitado", () => {
  const { prev, next } = navButtons({ path: "a.ts", hash: "abc123", fromWorkingTree: false });
  assert.ok(prev && "disabled" in prev, "prev da ponta deveria estar desabilitado");
  assert.ok(next && !("disabled" in next), "next da ponta deveria estar habilitado");
  assert.equal(next["title"], "b.ts");
});

test("ultimo da lista: next desabilitado, prev habilitado", () => {
  const { prev, next } = navButtons({ path: "c.ts", hash: "abc123", fromWorkingTree: false });
  assert.ok(next && "disabled" in next, "next da ponta deveria estar desabilitado");
  assert.ok(prev && !("disabled" in prev), "prev da ponta deveria estar habilitado");
  assert.equal(prev["title"], "b.ts");
});

test("arquivo fora da lista: os dois desabilitados", () => {
  const { prev, next } = navButtons({ path: "z.ts", hash: "abc123", fromWorkingTree: false });
  assert.ok(prev && "disabled" in prev, "prev fora da lista deveria estar desabilitado");
  assert.ok(next && "disabled" in next, "next fora da lista deveria estar desabilitado");
});

test("working tree com lista conhecida: os botoes continuam ausentes (o gate e o hash)", () => {
  const { html, prev, next } = navButtons({ path: "b.ts", hash: null, fromWorkingTree: true });
  assert.equal(prev, null);
  assert.equal(next, null);
  assert.ok(!html.includes(t("viewer.prevFile")));
});

/* ------------------------------------------------------------------ */
/* DiffView compacto (tela estreita) — o stub controla o viewport      */
/* ------------------------------------------------------------------ */

const PATCH: DiffPayload = {
  path: "a.txt",
  binary: false,
  raw: "",
  hunks: [
    {
      header: "@@ -1,1 +1,1 @@",
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      lines: [{ kind: "add", content: "x", oldNumber: null, newNumber: 1 }],
    },
  ],
};

test("compacto: grade de tres colunas com um numero por linha, cabecalho de 3", () => {
  setCompact(true);
  const html = renderToStaticMarkup(createElement(DiffView, { patch: PATCH, path: "a.txt" }));
  assert.ok(
    html.includes("grid-cols-[auto_auto_1fr]"),
    "a grade compacta nao tem tres colunas",
  );
  assert.ok(html.includes("col-span-3"), "o cabecalho compacto nao ocupa 3 colunas");
  // Uma coluna de numero so: o numero NOVO aparece quando existe.
  assert.ok(html.includes(">1</span>"), "o numero novo sumiu no modo compacto");
});

test("desktop: grade de quatro colunas e cabecalho de 4 (pos-contrario do compacto)", () => {
  setCompact(false);
  const html = renderToStaticMarkup(createElement(DiffView, { patch: PATCH, path: "a.txt" }));
  assert.ok(html.includes("grid-cols-[auto_auto_auto_1fr]"), "a grade desktop perdeu 4 colunas");
  assert.ok(html.includes("col-span-4"), "o cabecalho desktop nao ocupa 4 colunas");
  // Em desktop a linha add tem as DUAS colunas de numero: a antiga vazia + a nova.
  const gutters = html.match(/class="select-none px-2\.5 py-1[^"]*"/g) ?? [];
  assert.ok(gutters.length >= 2, "a linha add desktop nao tem as duas colunas de numero");
});
