/**
 * As fronteiras de `useViewport.ts`, exatamente nos limites.
 *
 *   node --test web/src/hooks/__tests__/breakpoints.test.mjs
 *
 * `isMobile`/`isTablet`/`isDesktop` sao tres faixas definidas por dois numeros.
 * O erro classico e um `<` que vira `<=`: 768px deixa de ser tablet e volta a
 * ser mobile, o app ganha uma coluna a menos numa largura inteira, e nenhum
 * tipo, nenhum `tsc` e nenhuma revisao acusam. So um teste no pixel exato pega.
 *
 * Por isso aqui nao se testa "1000 e tablet" — isso passaria com qualquer
 * corte entre 769 e 1279. Testa-se 767/768/769 e 1279/1280/1281, os seis
 * unicos valores onde a implementacao pode errar, mais uma varredura que
 * prova a propriedade global: para QUALQUER largura, exatamente UMA das tres
 * faixas responde verdadeiro.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { freshViewport } from "./env.mjs";

/** Le a faixa de uma largura. Sem ninguem assinado, `getViewport()` rele. */
const at = (env, viewport, width) => {
  env.setSize(width, 900);
  return viewport.getViewport();
};

describe("BREAKPOINTS", () => {
  it("vale 768 e 1280, e e o contrato com o CSS", async () => {
    const { viewport } = await freshViewport();
    assert.equal(viewport.BREAKPOINTS.mobile, 768);
    assert.equal(viewport.BREAKPOINTS.desktop, 1280);
  });

  it("e congelado — ninguem move o corte em runtime", async () => {
    const { viewport } = await freshViewport();
    assert.ok(Object.isFrozen(viewport.BREAKPOINTS));
  });
});

describe("fronteira mobile/tablet (768)", () => {
  it("767 ainda e mobile", async () => {
    const { env, viewport } = await freshViewport();
    const v = at(env, viewport, 767);
    assert.equal(v.isMobile, true, "767 < 768 tem de ser mobile");
    assert.equal(v.isTablet, false);
    assert.equal(v.isDesktop, false);
  });

  it("768 JA e tablet — o valor do corte pertence a faixa de CIMA", async () => {
    const { env, viewport } = await freshViewport();
    const v = at(env, viewport, 768);
    assert.equal(v.isMobile, false, "um `<=` no lugar do `<` quebraria exatamente aqui");
    assert.equal(v.isTablet, true);
    assert.equal(v.isDesktop, false);
  });

  it("769 e tablet", async () => {
    const { env, viewport } = await freshViewport();
    const v = at(env, viewport, 769);
    assert.equal(v.isMobile, false);
    assert.equal(v.isTablet, true);
    assert.equal(v.isDesktop, false);
  });
});

describe("fronteira tablet/desktop (1280)", () => {
  it("1279 ainda e tablet", async () => {
    const { env, viewport } = await freshViewport();
    const v = at(env, viewport, 1279);
    assert.equal(v.isMobile, false);
    assert.equal(v.isTablet, true, "1279 < 1280 tem de ser tablet");
    assert.equal(v.isDesktop, false);
  });

  it("1280 JA e desktop — o valor do corte pertence a faixa de CIMA", async () => {
    const { env, viewport } = await freshViewport();
    const v = at(env, viewport, 1280);
    assert.equal(v.isMobile, false);
    assert.equal(v.isTablet, false, "um `<=` no lugar do `<` quebraria exatamente aqui");
    assert.equal(v.isDesktop, true);
  });

  it("1281 e desktop", async () => {
    const { env, viewport } = await freshViewport();
    const v = at(env, viewport, 1281);
    assert.equal(v.isMobile, false);
    assert.equal(v.isTablet, false);
    assert.equal(v.isDesktop, true);
  });
});

describe("as tres faixas particionam a reta", () => {
  it("exatamente UMA e verdadeira, para toda largura varrida", async () => {
    const { env, viewport } = await freshViewport();

    const widths = new Set();
    /* Denso perto dos cortes, esparso longe deles. */
    for (let w = 0; w <= 2600; w += 1) widths.add(w);
    for (const w of [3840, 5120, 7680, 100000]) widths.add(w);

    for (const width of widths) {
      const v = at(env, viewport, width);
      const flags = [v.isMobile, v.isTablet, v.isDesktop];
      const trues = flags.filter(Boolean).length;
      assert.equal(trues, 1, `largura ${width} respondeu ${trues} faixas: ${flags.join()}`);
    }
  });

  it("cada faixa e o intervalo que a documentacao promete", async () => {
    const { env, viewport } = await freshViewport();
    for (let width = 0; width <= 2600; width += 1) {
      const v = at(env, viewport, width);
      assert.equal(v.isMobile, width < 768, `isMobile errado em ${width}`);
      assert.equal(v.isTablet, width >= 768 && width < 1280, `isTablet errado em ${width}`);
      assert.equal(v.isDesktop, width >= 1280, `isDesktop errado em ${width}`);
    }
  });

  it("largura zero e mobile, e nao quebra", async () => {
    const { env, viewport } = await freshViewport();
    const v = at(env, viewport, 0);
    assert.equal(v.isMobile, true);
    assert.equal(v.width, 0);
  });
});

describe("width e height sao repassados crus", () => {
  it("o snapshot devolve o que a janela mede", async () => {
    const { env, viewport } = await freshViewport();
    env.setSize(1024, 768);
    const v = viewport.getViewport();
    assert.equal(v.width, 1024);
    assert.equal(v.height, 768);
  });
});
