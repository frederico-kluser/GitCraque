/**
 * O CONTRATO da variante `touch:` nas pecas compartilhadas.
 *
 *   node --test web/src/hooks/__tests__/touch-variants.test.mjs
 *
 * `panels/parts.tsx` e `dialogs/parts.tsx` sao `.tsx` e o Node nao as
 * importa em runtime — e o que elas carregam de toque sao CLASSES do
 * Tailwind. Este arquivo trava por TEXTO as classes que a onda 2A colocou:
 * a onda 2B vai depender delas (um botao que para de ser alvo de 44px nao
 * quebra tipo nenhum nem `tsc` — so um teste destes pega).
 *
 * A fonte unica dos nomes e `theme.css`: a `@custom-variant touch` vale
 * `(pointer: coarse)` OU `.touch-ui`; os tokens `--spacing-tap` e
 * `--spacing-safe-*` rendem as familias `min-h-tap`, `size-tap`,
 * `pt-safe-top` etc.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const panels = read("../../panels/parts.tsx");
const dialogs = read("../../dialogs/parts.tsx");
const theme = read("../../styles/theme.css");

/** Uma classe pode aparecer em varias linhas — a travada e a presenca, nao a contagem. */
const has = (source, cls) => assert.ok(source.includes(cls), `faltou '${cls}'`);

describe("theme.css — a variante e os tokens que as classes usam", () => {
  it("define @custom-variant touch com as DUAS origens: ponteiro grosseiro OU .touch-ui", () => {
    has(theme, "@custom-variant touch");
    has(theme, "@media (pointer: coarse)");
    has(theme, "&:is(.touch-ui *)");
  });

  it("publica o alvo de 44px e a familia de espacamentos no @theme", () => {
    has(theme, "--tap-target: 44px");
    has(theme, "--spacing-tap: var(--tap-target)");
    has(theme, "--spacing-safe-bottom: var(--safe-bottom)");
  });
});

describe("panels/parts.tsx — alvos de 44px nas pecas da casca", () => {
  it("ToolButton cresce a caixa (min-h/min-w) e a folga (px) nos dois tamanhos", () => {
    has(panels, "touch:min-h-tap touch:min-w-tap touch:px-3");
    has(panels, "touch:min-h-tap touch:min-w-tap touch:px-3.5");
  });

  it("MENU_ITEM_CLASS vira linha de 44px por altura minima", () => {
    has(panels, "touch:min-h-tap touch:px-3");
  });

  it("o gatilho do '...' estica a area clicavel com um ::after de size-tap", () => {
    has(panels, "touch:relative");
    has(panels, "touch:after:size-tap");
    has(panels, "touch:data-[popup-open]:after:hidden");
  });
});

describe("dialogs/parts.tsx — botoes, campos e o bottom sheet", () => {
  it("Button cresce para 44px com folga horizontal maior", () => {
    has(dialogs, "touch:min-h-tap touch:min-w-tap touch:px-5");
  });

  it("os campos de formulario crescem por altura minima sem roubar o clique do cursor", () => {
    has(dialogs, "touch:min-h-tap touch:py-2.5");
  });

  it("a caixa do checkbox cresce um pouco — o alvo de verdade e o label", () => {
    has(dialogs, "touch:size-5");
  });

  it("o DialogShell vira bottom sheet abaixo de 768px, com cantos e safe-area", () => {
    has(dialogs, "max-md:rounded-t-2xl max-md:rounded-b-none max-md:pb-safe-bottom");
    has(dialogs, "max-md:pl-safe-left max-md:pr-safe-right");
    has(dialogs, "max-md:items-end");
  });

  it("o painel usa dvh — a viewport DINAMICA do navegador movel", () => {
    has(dialogs, "max-h-[85dvh]");
    assert.ok(!dialogs.includes("max-h-[85vh]"), "vh mediria com a barra de endereco aberta");
  });
});
