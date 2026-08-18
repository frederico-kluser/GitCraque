/**
 * O RENDER DO DIFF — word-diff, colapso de hunk, tipografia e helpers.
 *
 * `DiffView.tsx` e `RawView.tsx` sao JSX: o `node --test` do runner do viewer
 * nao os carrega a runtime (type stripping nao erase JSX). Este entry roda via
 * esbuild (mesmo padrao do grafo) e renderiza os componentes DE VERDADE com
 * `react-dom/server` — o mesmo caminho de render do navegador, so que sem
 * layout — e audita o markup emitido, classe por classe.
 *
 * O que este teste prova, e o que nao:
 *
 *  · prova o CONTRATO de render: segmentos de palavra por tipo (add/del/context),
 *    botao de hunk com `aria-expanded`, reticencias no colapso, numeracao dos
 *    hunks seguintes intacta, tipografia 13px com gutter `px-2.5 py-1`, so
 *    token semantico (nunca hex);
 *  · NAO prova o CLIQUE: SSR nao tem eventos. O fio do clique
 *    (botao -> onToggleHunk -> estado no FileViewer) pertence ao e2e, que tem
 *    browser de verdade. O que aqui se prova do lado controlado: o `collapsed`
 *    (Set de chaves `oldStart:newStart`) vira a arvore certa no markup.
 *
 * O texto das etiquetas sai do catalogo (`t`), nunca cravado no teste.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { countChanges, DiffView, pickPatch } from "../DiffView.tsx";
import { toLines } from "../RawView.tsx";
import { t } from "@/i18n";
import type { DiffHunk, DiffPayload, DiffLine } from "@/types/git";

/* ------------------------------------------------------------------ */
/* Helpers de markup                                                   */
/* ------------------------------------------------------------------ */

const has = (html: string, needle: string) => html.includes(needle);

const count = (html: string, needle: string) => html.split(needle).length - 1;

interface ButtonAttrs {
  [name: string]: string;
}

/** Enumera os <button> abertos, com os atributos de cada um. */
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

const line = (
  kind: DiffLine["kind"],
  content: string,
  oldNumber: number | null,
  newNumber: number | null,
  words?: DiffLine["words"],
): DiffLine => (words ? { kind, content, oldNumber, newNumber, words } : { kind, content, oldNumber, newNumber });

const HUNK_A: DiffHunk = {
  header: "@@ -1,4 +1,5 @@",
  oldStart: 1,
  oldLines: 4,
  newStart: 1,
  newLines: 5,
  lines: [
    line("context", "import x from \"y\";", 1, 1),
    line("context", "keep this", 2, 2, [
      { kind: "context", text: "keep " },
      { kind: "context", text: "this" },
    ]),
    line("add", "added feature here", null, 3, [
      { kind: "context", text: "added " },
      { kind: "add", text: "feature" },
      { kind: "context", text: " here" },
    ]),
    line("del", "removed legacy", 3, null, [
      { kind: "context", text: "removed " },
      { kind: "del", text: "legacy" },
    ]),
    line("add", "plain add line", null, 4),
  ],
};

const HUNK_B: DiffHunk = {
  header: "@@ -20,3 +21,3 @@",
  oldStart: 20,
  oldLines: 3,
  newStart: 21,
  newLines: 3,
  lines: [line("context", "tail context", 20, 21)],
};

function makePatch(overrides?: Partial<DiffPayload>): DiffPayload {
  return {
    path: "src/app.ts",
    binary: false,
    raw: "",
    hunks: [HUNK_A, HUNK_B],
    ...overrides,
  };
}

function render(patch: DiffPayload | null, props: Partial<Parameters<typeof DiffView>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(DiffView, { patch, path: "src/app.ts", ...props }),
  );
}

/* ------------------------------------------------------------------ */
/* 1. Word-diff: segmentos coloridos por tipo                          */
/* ------------------------------------------------------------------ */

test("linha add com words: o segmento add inverte os dois tokens", () => {
  const html = render(makePatch());
  assert.ok(
    has(html, `<span class="rounded-[2px] bg-diff-add-fg text-diff-add-bg">feature</span>`),
    "o segmento add nao tem fundo forte + texto claro",
  );
});

test("linha del com words: o segmento del usa os tokens del invertidos", () => {
  const html = render(makePatch());
  assert.ok(
    has(html, `<span class="rounded-[2px] bg-diff-del-fg text-diff-del-bg">legacy</span>`),
    "o segmento del nao tem fundo forte + texto claro",
  );
});

test("segmento context nao ganha cor nenhuma", () => {
  const html = render(makePatch());
  assert.ok(has(html, `<span class="">added </span>`), "o contexto do add sumiu ou ganhou cor");
  assert.ok(has(html, `<span class="">removed </span>`), "o contexto do del sumiu ou ganhou cor");
  assert.ok(has(html, `<span class=""> here</span>`), "o contexto final sumiu ou ganhou cor");
  assert.ok(has(html, `<span class="">keep </span>`), "o contexto puro sumiu ou ganhou cor");
});

test("o tipo do segmento vem do SEGMENTO, nao da linha: add dentro de del usa token add", () => {
  const patch = makePatch();
  const delWithAddWord = line("del", "old new", 5, null, [
    { kind: "context", text: "old " },
    { kind: "add", text: "new" },
  ]);
  patch.hunks = [
    {
      header: "@@ -5,1 +5,1 @@",
      oldStart: 5,
      oldLines: 1,
      newStart: 5,
      newLines: 1,
      lines: [delWithAddWord],
    },
  ];
  const html = render(patch);
  // A LINHA carrega o tom del; o SEGMENTO add inverte os tokens dele.
  assert.ok(
    has(html, `<span class="py-1 pr-3 whitespace-pre-wrap break-words bg-diff-del-bg text-diff-del-fg">`),
    "a linha del nao carregou o tom del",
  );
  assert.ok(
    has(html, `<span class="rounded-[2px] bg-diff-add-fg text-diff-add-bg">new</span>`),
    "o segmento add dentro de linha del nao inverteu os tokens",
  );
});

test("os textos dos segmentos somam o conteudo inteiro, na ordem", () => {
  const html = render(makePatch());
  const wordTexts = ["added ", "feature", " here", "removed ", "legacy"];
  let cursor = html.indexOf("added ");
  for (const text of wordTexts) {
    const at = html.indexOf(text, cursor);
    assert.ok(at >= 0, `segmento "${text}" fora de ordem ou sumido`);
    cursor = at + text.length;
  }
});

test("sem words: linha inteira com a cor do tipo, sem spans internos", () => {
  const html = render(makePatch());
  assert.ok(
    has(html, `<span class="py-1 pr-3 whitespace-pre-wrap break-words bg-diff-add-bg text-diff-add-fg">plain add line</span>`),
    "linha add sem words nao renderizou inteira com o tom",
  );
  const linhaCrua = count(html, `>plain add line<`);
  assert.equal(linhaCrua, 1);
  // A linha de contexto pura nao carrega tom nenhum.
  assert.ok(
    has(html, `<span class="py-1 pr-3 whitespace-pre-wrap break-words">import x from &quot;y&quot;;</span>`),
    "contexto puro ganhou cor",
  );
});

test("linha de conteudo vazio cai para espaco visivel", () => {
  const patch = makePatch();
  patch.hunks = [
    {
      header: "@@ -1,1 +1,1 @@",
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      lines: [line("add", "", null, 1)],
    },
  ];
  const html = render(patch);
  assert.ok(has(html, `> </span>`), "conteudo vazio nao virou espaco");
});

test("o marcador e os numeros da linha add/del carregam o tom da linha", () => {
  const html = render(makePatch());
  assert.ok(
    has(html, `<span class="select-none px-1 text-center bg-diff-add-bg text-diff-add-fg" aria-hidden="true">+</span>`),
    "o marcador + nao carregou o tom add",
  );
  assert.ok(
    has(html, `<span class="select-none px-1 text-center bg-diff-del-bg text-diff-del-fg" aria-hidden="true">-</span>`),
    "o marcador - nao carregou o tom del",
  );
});

/* ------------------------------------------------------------------ */
/* 2. Colapso de hunks                                                 */
/* ------------------------------------------------------------------ */

test("o cabecalho de hunk e um botao expandido por padrao, com etiqueta do catalogo", () => {
  const html = render(makePatch());
  const hunkButtons = buttons(html).filter((b) => b["aria-expanded"] !== undefined);
  assert.equal(hunkButtons.length, 2, "esperado um botao por hunk");
  for (const b of hunkButtons) {
    assert.equal(b["aria-expanded"], "true");
    assert.equal(b["aria-label"], t("diff.hunk.collapse"), "etiqueta nao veio do catalogo");
  }
});

test("hunk no Set colapsa: aria-expanded=false, etiqueta expandir, reticencias", () => {
  const html = render(makePatch(), { collapsed: new Set(["1:1"]) });
  const [first, second] = buttons(html).filter((b) => b["aria-expanded"] !== undefined);
  assert.equal(first["aria-expanded"], "false");
  assert.equal(first["aria-label"], t("diff.hunk.expand"));
  assert.equal(second["aria-expanded"], "true");
  // Reticencias com aria-hidden — o cabecalho ja diz qual hunk esta dobrado.
  assert.ok(has(html, `aria-hidden="true">…</div>`), "as reticencias nao apareceram");
  // As linhas do hunk colapsado somem do markup. (A palavra "legacy" sai num
  // span proprio, entao a ausencia e conferida no span inteiro.)
  assert.ok(!has(html, "plain add line"), "linha do hunk colapsado ainda no markup");
  assert.ok(!has(html, ">legacy</span>"), "linha do hunk colapsado ainda no markup");
  assert.ok(has(html, "tail context"), "linha do hunk aberto sumiu");
});

test("a chave do estado e oldStart:newStart — chave errada nao colapsa", () => {
  const html = render(makePatch(), { collapsed: new Set(["999:999"]) });
  const [first] = buttons(html).filter((b) => b["aria-expanded"] !== undefined);
  assert.equal(first["aria-expanded"], "true", "chave errada colapsou o hunk");
  assert.ok(has(html, "plain add line"), "nada deveria ter colapsado");
});

test("colapsar so o segundo hunk nao toca no primeiro", () => {
  const html = render(makePatch(), { collapsed: new Set(["20:21"]) });
  assert.ok(has(html, "plain add line"), "o primeiro hunk colapsou junto");
  // A palavra "legacy" sai num span proprio; o texto da linha del nao e
  // contiguo no markup (cada segmento de palavra e um <span>).
  assert.ok(has(html, ">legacy</span>"), "o primeiro hunk colapsou junto");
  assert.ok(!has(html, "tail context"), "o segundo hunk ficou aberto");
  assert.equal(count(html, "…"), 1);
});

test("os dois hunks colapsados: duas linhas de reticencias", () => {
  const html = render(makePatch(), { collapsed: new Set(["1:1", "20:21"]) });
  assert.equal(count(html, "…"), 2);
  assert.ok(!has(html, "plain add line") && !has(html, "tail context"), "sobrou linha de hunk");
});

test("os numeros dos hunks seguintes continuam corretos depois do colapso", () => {
  const html = render(makePatch(), { collapsed: new Set(["1:1"]) });
  // O hunk B comeca na linha nova 21 — linha de contexto, tom vazio: a celula
  // de numero novo tem de mostrar 21 mesmo assim (a classe base do gutter,
  // com text-muted-foreground/70, permanece).
  assert.ok(
    has(html, `<span class="select-none px-2.5 py-1 text-right tabular-nums text-muted-foreground/70">21</span>`),
    "numero da linha 21 sumiu ou mudou",
  );
  // E o antigo 20 na coluna de origem.
  assert.ok(
    has(html, `<span class="select-none px-2.5 py-1 text-right tabular-nums text-muted-foreground/70">20</span>`),
    "numero antigo 20 sumiu ou mudou",
  );
});

/* ------------------------------------------------------------------ */
/* 3. Tipografia e tokens                                              */
/* ------------------------------------------------------------------ */

test("a grade usa 13px no conteudo e a numeracao respira com px-2.5 py-1", () => {
  const html = render(makePatch());
  assert.ok(
    has(html, `class="grid items-start font-mono text-[13px] leading-relaxed pb-safe-bottom grid-cols-[auto_auto_auto_1fr]"`),
    "a grade nao tem text-[13px] nem as quatro colunas",
  );
  assert.ok(
    has(html, `class="select-none px-2.5 py-1 text-right tabular-nums text-muted-foreground/70"`),
    "a celula de numero nao tem px-2.5 py-1",
  );
  assert.ok(
    has(html, `class="py-1 pr-3 whitespace-pre-wrap break-words"`),
    "a celula de conteudo perdeu py-1 pr-3",
  );
  assert.ok(has(html, `class="select-none px-1 text-center"`), "o marcador perdeu px-1");
});

test("nenhum hex nem cor crua no markup — so token semantico", () => {
  const html = render(makePatch());
  assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}\b/, "hex na saida");
  assert.doesNotMatch(html, /rgb\(|hsl\(/, "funcao de cor na saida");
  const PALETA = [
    "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal",
    "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink",
    "rose", "stone", "neutral", "zinc", "gray", "grey", "slate", "black", "white",
  ];
  for (const cor of PALETA) {
    assert.doesNotMatch(html, new RegExp(`-(?:${cor})-`, "i"), `paleta numerada ${cor} na saida`);
  }
});

/* ------------------------------------------------------------------ */
/* 4. Estados de borda do DiffView                                     */
/* ------------------------------------------------------------------ */

test("patch nulo mostra o aviso de sem mudancas, com o caminho pedido", () => {
  const html = render(null);
  assert.ok(has(html, t("diff.noChanges.title")), "aviso de sem mudancas ausente");
  assert.ok(has(html, t("diff.noChanges.body", { path: "src/app.ts" })), "caminho ausente do aviso");
});

test("patch binario mostra o aviso de binario, com o caminho do patch", () => {
  const html = render(makePatch({ binary: true, path: "logo.png" }));
  assert.ok(has(html, t("diff.binary.title")), "aviso de binario ausente");
  assert.ok(has(html, t("diff.binary.body", { path: "logo.png" })), "caminho ausente do aviso");
});

test("patch sem hunks mostra o aviso de patch vazio", () => {
  const html = render(makePatch({ hunks: [] }));
  assert.ok(has(html, t("diff.emptyPatch.title")), "aviso de patch vazio ausente");
});

test("rename mostra a linha antiga no cabecalho", () => {
  const html = render(makePatch({ oldPath: "src/legacy.ts" }));
  assert.ok(has(html, "src/legacy.ts"), "caminho antigo ausente do cabecalho de rename");
});

/* ------------------------------------------------------------------ */
/* 5. Helpers puros                                                    */
/* ------------------------------------------------------------------ */

test("countChanges soma add e del por hunk", () => {
  assert.deepEqual(countChanges(makePatch()), { added: 2, removed: 1 });
  assert.deepEqual(countChanges(makePatch({ hunks: [] })), { added: 0, removed: 0 });
  assert.deepEqual(countChanges(null), { added: 0, removed: 0 });
});

test("pickPatch acha por path, por oldPath e cai para o primeiro", () => {
  const a = makePatch({ path: "a.ts" });
  const b = makePatch({ path: "b.ts", oldPath: "b.old.ts" });
  const patches = [a, b];
  assert.equal(pickPatch(patches, "a.ts"), a);
  assert.equal(pickPatch(patches, "b.old.ts"), b, "oldPath nao resolveu");
  assert.equal(pickPatch(patches, "inexistente.ts"), a, "nao caiu para o primeiro");
  assert.equal(pickPatch([], "a.ts"), null);
  assert.equal(pickPatch(null, "a.ts"), null);
});

test("toLines: sem linha fantasma do \\n final", () => {
  assert.deepEqual(toLines(""), []);
  assert.deepEqual(toLines("a\nb\n"), ["a", "b"]);
  assert.deepEqual(toLines("solo"), ["solo"]);
  assert.deepEqual(toLines("\n"), [""]);
});
