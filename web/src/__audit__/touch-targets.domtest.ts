/**
 * AUDITORIA DE ALVOS DE TOQUE — o que este teste prova e o que NAO prova.
 *
 * PROVA: que nenhum elemento interativo da casca foi montado SEM consideracao
 * de toque. Renderiza a casca real com `react-dom/server` (o mesmo caminho de
 * render do navegador, so que sem layout) e varre o markup emitido: todo
 * `<button>`, todo `[role="button"]` e todo item de popup do Base UI
 * (`role="menuitem"`) precisa carregar pelo menos UM utilitario da variante
 * `touch:` (`touch:min-h-tap`, `touch:size-tap`, `touch:min-w-tap`,
 * `touch:after:size-tap`, `touch:px-3`...) OU o atributo `data-tap-exempt`.
 * Um elemento sem os dois nao passou por consideracao de toque nenhuma — ele
 * ficou no tamanho do ponteiro fino mesmo quando so existe o dedo.
 *
 * NAO PROVA: pixels reais pos-cascata nem gesto. `touch:min-h-tap` so vira
 * 44px na folha que o Tailwind gera; este teste le o JSX, nunca o CSS. Um
 * elemento pode passar AQUI e continuar pequeno se a cascata o esmagar, e
 * pode falhar AQUI e ser grande por layout estrutural (as abas da `MobileNav`
 * tem 56px de barra, mas nenhum utilitario `touch:` as declara). Quando o
 * tamanho vem do layout e nao de um utilitario, o caminho honesto e declarar
 * `data-tap-exempt` com um dos motivos validos abaixo — nunca ficar em
 * silencio. E o inverso tambem vale: quem passa aqui ainda pode errar o dedo
 * na tela se a cascata do CSS encolher o alvo — este teste nao e a prova dos
 * 44px, e o rastreador de quem NAO foi tocado.
 *
 * O QUE `data-tap-exempt` DIZ — "este elemento e intencionalmente NAO
 * dimensionado para toque". Os motivos validos:
 *   1. icone decorativo DENTRO de um pai ja dimensionado para toque
 *      (o alvo e o pai; o icone so viaja dentro dele);
 *   2. elemento visivel SO na media query `(pointer: fine)` — um dedo nunca
 *      o alcanca, entao a regua de 44px nao se aplica;
 *   3. elemento interno de SVG (path, circle...) dentro de um SVG que ja tem
 *      recipiente dimensionado para toque.
 *
 * DECLARACAO NO CONTAINER — a excecao do `CommandPalette` do catalogo. O
 * botao-gatilho dele e o unico cujo `className` o wrapper nao alcanca: o
 * vendor monta a classe inteira do `Dialog.Trigger`, sem pass-through. O host
 * (`app/CommandPaletteHost.tsx`) declara o alvo de toque NO CONTAINER, pela
 * variante arbitraria de descendente `[&>div:first-child>button]:touch:min-h-tap`
 * — a mesma mecanica que o `:hidden` da barra usa — e a barra fica em
 * `display:none` (um dedo nunca chega ao botao). Um ancestral `div` cuja
 * classe carrega um token `[...&...]:touch:` (variante arbitraria de
 * DESCENDENTE — exige `&` dentro dos colchetes) conta como consideracao de
 * toque do elemento: a declaracao existe, so que no wrapper, nao na classe do
 * botao. So valem tokens nessa forma exata — um `touch:px-3` solto num div,
 * e uma variante de si-mesmo como `[data-open]:touch:` (dimensiona a div, nao
 * o botao), NAO isentam o botao dentro dele.
 *
 * COBERTURA — o SSR renderiza o estado INITIAL dos stores (o
 * `getServerSnapshot` do `useSyncExternalStore`): fica de fora, documentado,
 * tudo que so existe com estado — toasts, ConfirmHost aberto, menu de
 * contexto aberto, SettingsDialog e dialogs de operacao, linhas do
 * StatusPanel com SwipeAction, ChangesSheet aberta, linhas do grafo (o log
 * vazio nao emite linhas). E os popups do Base UI nao renderizam em SSR nem
 * com `open` controlado (`Menu.Root open` emite so o gatilho). A regra dos
 * itens de menu e coberta por tres portas: (a) `role="menuitem"` no markup
 * emitido, (b) a constante `MENU_ITEM_CLASS` — a classe unica de TODO item de
 * popup do app —, e (c) uma varredura estatica de AST por `Menu.Item` no JSX
 * da casca, com a granularidade de elemento.
 *
 * FORA DA REGRA — `[role="separator"]`: o `Splitter` e um alvo de arrasto de
 * 9px com `touch-none`, risco conhecido e separado das tres regras deste
 * teste (o teste o renderiza para provar que ele NAO emite botao nenhum).
 * `[aria-roledescription="draggable"]`: nos do dnd-kit, movidos por arrasto,
 * nao por toque simples — excluidos de proposito, como manda a regra. E
 * `motion-ui/**` e do CLI do shadcn, sobrescrito no proximo `add`: um botao
 * interno sem `touch:` aparece como VIOLACAO aqui, mas a correcao e um
 * wrapper na aplicacao, nunca edicao do arquivo do catalogo.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { App } from "../app/App.tsx";
import { MobileNav } from "../app/MobileNav.tsx";
import { StatusFooter } from "../app/StatusFooter.tsx";
import { Splitter } from "../app/Splitter.tsx";
import { RecoveryBoundary } from "../app/RecoveryBoundary.tsx";
import { Toasts } from "../app/Toasts.tsx";
import { ConfirmHost } from "../app/ConfirmHost.tsx";
import { ContextMenuHost } from "../app/ContextMenuHost.tsx";
import { commitMenu } from "../app/menus.ts";
import { Toolbar } from "../panels/Toolbar.tsx";
import { RailPanels } from "../panels/RailPanels.tsx";
import { StatusPanel } from "../panels/StatusPanel.tsx";
import { SidePanel } from "../panels/SidePanel.tsx";
import { ChangesSheet } from "../panels/ChangesSheet.tsx";
import { CommitSearch } from "../panels/CommitSearch.tsx";
import { UndoRedo } from "../panels/UndoRedo.tsx";
import { ActionMenu, MENU_ITEM_CLASS } from "../panels/parts.tsx";
import { RepoPicker } from "../dialogs/RepoPicker.tsx";
import { Button, DialogShell } from "../dialogs/parts.tsx";

/* ------------------------------------------------------------------ */
/* O varredor de markup — HTML em string, sem DOM.                    */
/* ------------------------------------------------------------------ */

type Attrs = Record<string, string>;

/** Atributos de uma tag aberta, um par por atributo (aspas simples ou duplas). */
function parseAttrs(raw: string): Attrs {
  const attrs: Attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

interface InteractiveElement {
  /** posicao no markup, para o relatorio apontar o lugar */
  at: number;
  tag: string;
  role: string | null;
  klass: string;
  exempt: boolean;
  touchClass: string | null;
  /** um ancestral `div` declarou utilitario touch: via variante arbitraria de
   *  descendente (`[...]:touch:`) — a excecao do CommandPalette, ver cabecalho */
  ancestorTouchDeclared: boolean;
}

/** `[&>div:first-child>button]:touch:min-h-tap` — variante arbitraria que
 *  declara um utilitario touch: para um descendente do proprio elemento.
 *  So esta forma conta (tokens `touch:` soltos num div nao isentam o botao).
 *  O `&` dentro dos colchetes e obrigatorio: a forma descendente sempre o
 *  carrega (no SSR emitido, `&amp;`), e uma variante de si-mesmo como
 *  `[data-open]:touch:` dimensiona a propria div, nao o botao dentro dela. */
const DESCENDANT_TOUCH_TOKEN = /^\[[^\]]*&[^\]]*\]:touch:/;

function declaresDescendantTouch(klass: string): boolean {
  for (const token of klass.split(/\s+/)) {
    if (DESCENDANT_TOUCH_TOKEN.test(token)) return true;
  }
  return false;
}

/**
 * Varre o HTML emitido e devolve os elementos interativos: `<button>`,
 * `[role="button"]` (exceto `[aria-roledescription="draggable"]`, no do
 * dnd-kit) e `[role="menuitem"]` (item de popup do Base UI).
 *
 * Nao monta arvore nenhuma: cada tag aberta e avaliada sozinha — o que basta,
 * porque a regra olha os atributos do proprio no. A unica excecao e a
 * DECLARACAO NO CONTAINER do cabecalho: a pilha de `div` abertos (com as
 * classes) acompanha a varredura para reconhecer `[...]:touch:` num ancestral.
 */
function interactiveElements(html: string): InteractiveElement[] {
  const out: InteractiveElement[] = [];
  const re = /<(\/?)([a-zA-Z][-a-zA-Z0-9:]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;
  const divStack: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const [, slash, tag, rawAttrs] = m;
    if (slash) {
      if (tag === "div") divStack.pop();
      continue; // tag de fechamento
    }
    const attrs = parseAttrs(rawAttrs);
    const role = attrs["role"] ?? null;
    const roledesc = attrs["aria-roledescription"] ?? null;

    const isButton = tag === "button";
    const isRoleButton = role === "button" && roledesc !== "draggable";
    const isMenuItem = role === "menuitem";
    if (isButton || isRoleButton || isMenuItem) {
      out.push({
        at: m.index,
        tag,
        role,
        klass: attrs["class"] ?? "",
        exempt: "data-tap-exempt" in attrs,
        touchClass: firstTouchUtility(attrs["class"] ?? ""),
        ancestorTouchDeclared: divStack.some(declaresDescendantTouch),
      });
    }
    if (tag === "div") divStack.push(attrs["class"] ?? "");
  }
  return out;
}

function firstTouchUtility(klass: string): string | null {
  for (const token of klass.split(/\s+/)) {
    if (token.startsWith("touch:")) return token;
  }
  return null;
}

const ok = (el: InteractiveElement) =>
  el.exempt || el.touchClass !== null || el.ancestorTouchDeclared;

function describe(el: InteractiveElement): string {
  const role = el.role ? ` role="${el.role}"` : "";
  const klass = el.klass ? ` class="${el.klass.slice(0, 140)}${el.klass.length > 140 ? "…" : ""}"` : "";
  return `<${el.tag}${role}> em ${el.at}${klass}`;
}

/** Audit de um render: lista as violacoes, uma por linha, com o elemento. */
function auditMarkup(name: string, html: string): string[] {
  return interactiveElements(html)
    .filter((el) => !ok(el))
    .map((el) => `${name}: ${describe(el)}\n    sem utilitario touch: e sem data-tap-exempt`);
}

function auditRender(name: string, node: ReactElement): string[] {
  return auditMarkup(name, renderToStaticMarkup(node));
}

/* ------------------------------------------------------------------ */
/* Fixtures — a casca no estado INITIAL dos stores.                    */
/* ------------------------------------------------------------------ */

const FIXTURES: Array<[string, ReactElement]> = [
  ["App (casca completa)", createElement(App)],
  ["Toolbar", createElement(Toolbar)],
  ["StatusFooter", createElement(StatusFooter)],
  ["MobileNav", createElement(MobileNav)],
  [
    "Splitter (role=separator — fora das tres regras)",
    createElement(Splitter, { axis: "x", value: 300, sign: 1, min: 200, max: 460, label: "rail", onChange: () => {} }),
  ],
  ["RailPanels", createElement(RailPanels)],
  ["StatusPanel", createElement(StatusPanel)],
  ["SidePanel (DetailPanel vazio)", createElement(SidePanel)],
  ["ChangesSheet (fechada)", createElement(ChangesSheet)],
  ["CommitSearch", createElement(CommitSearch)],
  ["UndoRedo", createElement(UndoRedo)],
  ["RepoPicker", createElement(RepoPicker)],
  [
    "dialogs/parts (DialogShell + Button)",
    createElement(
      DialogShell,
      { open: true, title: "auditoria", onClose: () => {} },
      createElement(Button, { onClick: () => {}, children: "ok" }),
    ),
  ],
  // Itens REAIS do menu de commit, com o popup do Base UI — o gatilho no
  // markup; os itens nas tres portas da regra de Menu.Item.
  ["ActionMenu (parts) com commitMenu real", createElement(ActionMenu, { items: commitMenu("abc1234") })],
];

for (const [name, node] of FIXTURES) {
  test(`audit fixture: ${name}`, () => {
    const violations = auditRender(name, node);
    assert.deepEqual(
      violations,
      [],
      violations.length === 0 ? undefined : `elementos interativos sem consideracao de toque:\n${violations.join("\n")}`,
    );
  });
}

/* ------------------------------------------------------------------ */
/* Conteudo preso a estado — renderiza null em SSR, documentado.       */
/* ------------------------------------------------------------------ */

test("conteudo preso a estado renderiza null em SSR (cobertura documentada)", () => {
  for (const [name, node] of [
    ["Toasts", createElement(Toasts)],
    ["ConfirmHost", createElement(ConfirmHost)],
    ["ContextMenuHost", createElement(ContextMenuHost)],
  ] as Array<[string, ReactElement]>) {
    const violations = auditRender(name, node);
    assert.deepEqual(violations, [], `esperado null em SSR para ${name}: ${violations.join("\n")}`);
  }
});

/**
 * O fallback do `RecoveryBoundary` so existe apos um erro em tempo de
 * execucao — e o React NAO suporta error boundary no render de servidor: a
 * excecao atravessa a fronteira e chega ao chamador. O botao de recarregar do
 * fallback fica fora da cobertura SSR; o teste abaixo trava essa verdade
 * (se um dia o React renderizar o fallback no servidor, este teste quebra e
 * o botao passa a ser auditado).
 */
test("RecoveryBoundary: error boundary nao pega no SSR — fallback fora da cobertura", () => {
  const ThrowsDuringRender = () => {
    throw new Error("falha proposital");
  };
  assert.throws(
    () => renderToStaticMarkup(createElement(RecoveryBoundary, null, createElement(ThrowsDuringRender))),
    /falha proposital/,
    "o React SSR rejoga o erro; o fallback (e o seu botao) nao renderiza aqui",
  );
});

/* ------------------------------------------------------------------ */
/* Regra de Menu.Item — tres portas.                                   */
/* ------------------------------------------------------------------ */

test("MENU_ITEM_CLASS — a classe unica dos itens de popup — carrega consideracao de toque", () => {
  assert.ok(
    firstTouchUtility(MENU_ITEM_CLASS) !== null,
    `MENU_ITEM_CLASS perdeu o utilitario touch: (atual: "${MENU_ITEM_CLASS.slice(0, 80)}")`,
  );
});

/**
 * Varredura estatica por `Menu.Item` no JSX da casca (app, panels, dialogs),
 * com granularidade de ELEMENTO: o `className` de cada item precisa carregar
 * `touch:` ou a constante `MENU_ITEM_CLASS` (que ja tem o utilitario, provado
 * acima). E a unica porta que enxerga os itens de popup fechado em SSR.
 */
function staticMenuItemViolations(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const webSrc = resolve(here, "..", "..");
  const violations: string[] = [];

  const scan = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        if (entry === "__tests__" || entry === "__audit__") continue;
        scan(path);
      } else if (entry.endsWith(".tsx")) {
        inspect(path);
      }
    }
  };

  const inspect = (file: string) => {
    const source = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node)) {
        inspectElement(node.openingElement.tagName, node.openingElement.attributes, node.openingElement.getStart(sf), sf, file);
      } else if (ts.isJsxSelfClosingElement(node)) {
        inspectElement(node.tagName, node.attributes, node.getStart(sf), sf, file);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  };

  const inspectElement = (
    tagName: ts.JsxTagNameExpression,
    attributes: ts.JsxAttributes,
    start: number,
    sf: ts.SourceFile,
    file: string,
  ) => {
    if (
      !ts.isPropertyAccessExpression(tagName) ||
      !ts.isIdentifier(tagName.expression) ||
      tagName.expression.text !== "Menu" ||
      tagName.name.text !== "Item"
    ) {
      return;
    }
    const classNameAttr = attributes.properties.find(
      (p): p is ts.JsxAttribute =>
        ts.isJsxAttribute(p) && ts.isIdentifier(p.name) && p.name.text === "className",
    );
    const text = classNameAttr?.initializer ? classNameAttr.initializer.getText(sf) : "";
    if (!/touch:/.test(text) && !/MENU_ITEM_CLASS/.test(text)) {
      const { line } = sf.getLineAndCharacterOfPosition(start);
      violations.push(
        `${file}:${line + 1}: Menu.Item sem touch: e sem MENU_ITEM_CLASS no className` +
          (text ? ` (className: ${text.slice(0, 90)})` : " (sem className)"),
      );
    }
  };

  for (const front of ["app", "panels", "dialogs"]) scan(join(webSrc, front));
  return violations;
}

test("nenhum Menu.Item do JSX da casca ficou sem consideracao de toque", () => {
  const violations = staticMenuItemViolations();
  assert.deepEqual(violations, [], `Menu.Item sem consideracao de toque:\n${violations.join("\n")}`);
});

/* ------------------------------------------------------------------ */
/* Unidade — as bordas da regra, com markup artificial.                */
/* ------------------------------------------------------------------ */

test("a regra aceita qualquer utilitario touch:, nao so os de dimensao", () => {
  const html = [
    `<button class="touch:min-h-tap">a</button>`,
    `<button class="px-2 touch:size-tap">b</button>`,
    `<button class="touch:after:size-tap touch:relative">c</button>`,
    `<button class="touch:px-3">d</button>`,
    `<button class="b">e</button>`,
    `<button class="touch:min-w-tap">f</button>`,
  ].join("");
  const sem = interactiveElements(html).filter((el) => !ok(el));
  assert.deepEqual(sem.map((el) => el.klass), ["b"]);
});

test("data-tap-exempt isenta qualquer elemento, mesmo sem classe", () => {
  const html = `<button data-tap-exempt>sair</button>`;
  assert.deepEqual(interactiveElements(html).filter((el) => !ok(el)), []);
});

test("um div ancestral que declara touch: por variante arbitraria isenta o botao", () => {
  const html = [
    `<div class="[&amp;&gt;div:first-child&gt;button]:touch:min-h-tap">`,
    `<div class="barra"><button class="gatilho">x</button></div>`,
    `</div>`,
    `<div class="touch:px-3"><button class="solto">y</button></div>`,
    `<div class="[data-open]:touch:px-3"><button class="si-mesmo">w</button></div>`,
    `<button class="orfao">z</button>`,
  ].join("");
  const sem = interactiveElements(html).filter((el) => !ok(el));
  assert.deepEqual(
    sem.map((el) => el.klass),
    ["solto", "si-mesmo", "orfao"],
    "so o gatilho do container declarado passa — touch: solto no div, variante de si-mesmo ([data-open]:touch:) e orfao violam",
  );
});

test("no do dnd-kit ([aria-roledescription=draggable]) nao conta como role=button", () => {
  const html = [
    `<div role="button" aria-roledescription="draggable" class="muda">alvo de arrasto</div>`,
    `<div role="button" class="muda-comum">alvo de toque comum</div>`,
  ].join("");
  const encontrados = interactiveElements(html);
  assert.equal(encontrados.length, 1, "so o alvo de toque comum entra na auditoria");
  assert.equal(encontrados[0]!.klass, "muda-comum", "o excluido e o no do dnd-kit");
  assert.deepEqual(encontrados.filter((el) => !ok(el)), encontrados, "o alvo de toque comum viola a regra");
});

test("[role=menuitem] segue a mesma regra (porta DOM de item de popup)", () => {
  const html = [
    `<div role="menuitem" class="touch:min-h-tap">um</div>`,
    `<div role="menuitem" class="flex">dois</div>`,
  ].join("");
  const sem = interactiveElements(html).filter((el) => !ok(el));
  assert.equal(sem.length, 1, "so o segundo menuitem viola a regra");
  assert.match(sem[0]!.klass, /^flex$/, "a violacao e o item sem utilitario touch:");
});

test("o Splitter emite role=separator, nao botao nem role=button", () => {
  const html = renderToStaticMarkup(
    createElement(Splitter, { axis: "x", value: 300, sign: 1, min: 200, max: 460, label: "rail", onChange: () => {} }),
  );
  assert.match(html, /role="separator"/, "o Splitter tem que continuar sendo uma separadora");
  assert.deepEqual(interactiveElements(html), [], "separadora nao e alvo de toque simples");
});

/* ------------------------------------------------------------------ */
/* Relatorio geral — imprime sempre, para o verify-touch.mjs.          */
/* ------------------------------------------------------------------ */

test("relatorio da auditoria (imprime o quadro completo)", () => {
  const report: string[] = [];
  let total = 0;
  let auditados = 0;
  for (const [name, node] of FIXTURES) {
    const html = renderToStaticMarkup(node);
    auditados += interactiveElements(html).length;
    const violations = auditMarkup(name, html);
    total += violations.length;
    report.push(...violations);
  }
  for (const violation of staticMenuItemViolations()) {
    total += 1;
    report.push(violation);
  }
  const frame = "─".repeat(Math.max(0, 64));
  console.log(`\n${frame}`);
  console.log(`AUDITORIA DE ALVOS DE TOQUE — ${auditados} elementos auditados, ${total} violacao(es)`);
  if (report.length > 0) {
    console.log("VIOLACOES:");
    console.log(report.join("\n"));
  } else {
    console.log("nenhuma violacao — todo elemento interativo emitido tem consideracao de toque");
  }
  console.log(`${frame}\n`);
});
