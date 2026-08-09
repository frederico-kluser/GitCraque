/**
 * O que `useViewport.ts` faz quando o ambiente NAO e um navegador completo:
 * ausencia de `window`, ausencia de `matchMedia`, ausencia de `navigator`; a
 * disjuncao que define `isTouch`; e a orientacao com e sem a media query.
 *
 *   node --test web/src/hooks/__tests__/environment-guards.test.mjs
 *
 * ── Por que as guardas importam ───────────────────────────────────────
 *
 * O modulo le o ambiente no ESCOPO DO MODULO. Uma leitura desprotegida nao
 * daria erro de tipo nem de teste unitario do consumidor: daria um
 * `ReferenceError` no instante do import, derrubando qualquer arquivo que
 * importe qualquer coisa da cadeia — inclusive as tres suites que carregam
 * `.ts` direto no Node, onde `window` simplesmente nao existe.
 *
 * ── Por que `isTouch` nao e `coarsePointer` ───────────────────────────
 *
 * O caso que o produto nao pode errar e o laptop com tela sensivel ao toque.
 * Ele responde `(pointer: fine)` — porque o ponteiro PRIMARIO dele e o
 * trackpad — e `(hover: hover)`. As duas media queries dizem "mouse". So
 * `navigator.maxTouchPoints` sabe que ha um dedo possivel. Dai a disjuncao, e
 * dai o caso `isDesktop === true` E `isTouch === true` ao mesmo tempo, que e
 * legitimo e precisa continuar sendo.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { COARSE, freshViewport, LANDSCAPE, NO_HOVER } from "./env.mjs";
import { rawSubscribe } from "./harness.mjs";

describe("sem window", () => {
  it("importar o modulo nao explode e devolve o padrao de desktop", async () => {
    const { viewport } = await freshViewport({ hasWindow: false });
    const v = viewport.getViewport();

    assert.equal(v.width, 1280);
    assert.equal(v.height, 900);
    assert.equal(v.isDesktop, true);
    assert.equal(v.isMobile, false);
    assert.equal(v.isTablet, false);
    assert.equal(v.coarsePointer, false);
    assert.equal(v.noHover, false);
    assert.equal(v.isTouch, false);
    assert.equal(v.landscape, true);
  });

  it("o padrao e congelado e sempre a MESMA referencia", async () => {
    const { viewport } = await freshViewport({ hasWindow: false });
    const first = viewport.getViewport();
    assert.ok(Object.isFrozen(first), "o snapshot padrao tem de ser imutavel");
    for (let i = 0; i < 20; i += 1) assert.equal(viewport.getViewport(), first);
  });

  it("assinar e cancelar nao quebra, e nao instala listener nenhum", async () => {
    const { env, viewport } = await freshViewport({ hasWindow: false });
    let unsubscribe;
    assert.doesNotThrow(() => {
      unsubscribe = rawSubscribe(viewport);
    });
    assert.equal(env.totalListenerCount(), 0, "nao ha window onde instalar");
    assert.doesNotThrow(() => unsubscribe());
  });
});

describe("sem matchMedia", () => {
  it("nao explode, e as consultas caem no fallback", async () => {
    const { viewport } = await freshViewport({
      width: 1000,
      height: 800,
      hasMatchMedia: false,
    });
    const v = viewport.getViewport();

    assert.equal(v.width, 1000, "as medidas continuam vindo de window");
    assert.equal(v.coarsePointer, false, "sem media query, o padrao e ponteiro fino");
    assert.equal(v.noHover, false, "sem media query, o padrao e ter hover");
    assert.equal(v.landscape, true, "landscape cai na razao das medidas: 1000 >= 800");
  });

  it("instala apenas os dois listeners de window", async () => {
    const { env, viewport } = await freshViewport({ hasMatchMedia: false });
    const unsubscribe = rawSubscribe(viewport);

    assert.equal(env.windowListenerCount(), 2);
    assert.equal(env.mediaListenerCount(), 0, "nao ha MediaQueryList para observar");

    unsubscribe();
    assert.equal(env.windowListenerCount(), 0, "e o teardown continua limpo");
  });

  it("resize continua funcionando sem matchMedia", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800, hasMatchMedia: false });
    let notifications = 0;
    const unsubscribe = rawSubscribe(viewport, () => {
      notifications += 1;
    });

    env.setSize(500);
    env.fire("resize");
    env.flushFrames();

    assert.equal(notifications, 1);
    assert.equal(viewport.getViewport().isMobile, true);
    unsubscribe();
  });
});

describe("sem navigator", () => {
  it("maxTouchPoints ausente conta como zero", async () => {
    const { viewport } = await freshViewport({ width: 1000, height: 800, hasNavigator: false });
    assert.equal(viewport.getViewport().isTouch, false);
  });

  it("navigator sem a propriedade maxTouchPoints tambem conta como zero", async () => {
    const { viewport } = await freshViewport({ width: 1000, height: 800, maxTouchPoints: undefined });
    assert.equal(viewport.getViewport().isTouch, false, "o `?? 0` cobre a propriedade ausente");
  });
});

describe("isTouch e a disjuncao de tres sinais", () => {
  const combos = [
    { coarse: false, hover: true, points: 0, isTouch: false, nome: "desktop puro" },
    { coarse: true, hover: true, points: 0, isTouch: true, nome: "so coarsePointer" },
    { coarse: false, hover: false, points: 0, isTouch: true, nome: "so noHover" },
    { coarse: false, hover: true, points: 4, isTouch: true, nome: "so maxTouchPoints" },
    { coarse: true, hover: false, points: 0, isTouch: true, nome: "coarse + noHover" },
    { coarse: true, hover: true, points: 4, isTouch: true, nome: "coarse + pontos" },
    { coarse: false, hover: false, points: 4, isTouch: true, nome: "noHover + pontos" },
    { coarse: true, hover: false, points: 4, isTouch: true, nome: "os tres" },
  ];

  for (const { coarse, hover, points, isTouch, nome } of combos) {
    it(`${nome} -> isTouch ${isTouch}`, async () => {
      const { viewport } = await freshViewport({
        width: 1000,
        height: 800,
        media: { [COARSE]: coarse, [NO_HOVER]: !hover },
        maxTouchPoints: points,
      });
      const v = viewport.getViewport();
      assert.equal(v.coarsePointer, coarse);
      assert.equal(v.noHover, !hover);
      assert.equal(v.isTouch, isTouch);
    });
  }
});

describe("as duas perguntas sao independentes: que tela, e que ponteiro", () => {
  it("DESKTOP COM TELA SENSIVEL AO TOQUE — isDesktop e isTouch ao mesmo tempo", async () => {
    const { viewport } = await freshViewport({
      width: 1920,
      height: 1080,
      /* o laptop conversivel responde `fine` e `hover`: o ponteiro primario
         dele e o trackpad */
      media: { [COARSE]: false, [NO_HOVER]: false, [LANDSCAPE]: true },
      maxTouchPoints: 10,
    });
    const v = viewport.getViewport();

    assert.equal(v.isDesktop, true, "1920px e o grid de tres colunas");
    assert.equal(v.isTouch, true, "e ainda assim ha um dedo possivel");
    assert.equal(v.coarsePointer, false, "o ponteiro PRIMARIO continua sendo fino");
    assert.equal(v.noHover, false, "e o hover continua existindo");
  });

  it("iPad em paisagem — tablet pela largura, grosseiro pelo ponteiro", async () => {
    const { viewport } = await freshViewport({
      width: 1024,
      height: 768,
      media: { [COARSE]: true, [NO_HOVER]: true, [LANDSCAPE]: true },
      maxTouchPoints: 5,
    });
    const v = viewport.getViewport();

    assert.equal(v.isTablet, true, "1024 esta entre 768 e 1280");
    assert.equal(v.isMobile, false, "decidir layout por isTouch erraria aqui");
    assert.equal(v.coarsePointer, true);
    assert.equal(v.isTouch, true);
    assert.equal(v.landscape, true);
  });

  it("celular estreito com mouse bluetooth — mobile pela largura, fino pelo ponteiro", async () => {
    const { viewport } = await freshViewport({
      width: 420,
      height: 900,
      media: { [COARSE]: false, [NO_HOVER]: false, [LANDSCAPE]: false },
      maxTouchPoints: 0,
    });
    const v = viewport.getViewport();

    assert.equal(v.isMobile, true);
    assert.equal(v.coarsePointer, false, "decidir alvo de clique por isMobile erraria aqui");
    assert.equal(v.isTouch, false);
  });
});

describe("landscape", () => {
  it("com a media query disponivel, ela MANDA — mesmo contra a razao das medidas", async () => {
    const { viewport } = await freshViewport({
      width: 1920,
      height: 1080,
      media: { [LANDSCAPE]: false },
    });
    assert.equal(
      viewport.getViewport().landscape,
      false,
      "1920 > 1080 diria paisagem; a consulta do navegador tem de vencer o palpite",
    );
  });

  it("com a media query verdadeira, e paisagem mesmo com a janela mais alta que larga", async () => {
    const { viewport } = await freshViewport({
      width: 800,
      height: 1200,
      media: { [LANDSCAPE]: true },
    });
    assert.equal(viewport.getViewport().landscape, true);
  });

  it("sem matchMedia, o fallback e width >= height", async () => {
    const largura = await freshViewport({ width: 1000, height: 800, hasMatchMedia: false });
    assert.equal(largura.viewport.getViewport().landscape, true);

    const altura = await freshViewport({ width: 800, height: 1000, hasMatchMedia: false });
    assert.equal(altura.viewport.getViewport().landscape, false);
  });

  it("o quadrado exato conta como paisagem — o corte e `>=`, nao `>`", async () => {
    const { viewport } = await freshViewport({ width: 900, height: 900, hasMatchMedia: false });
    assert.equal(viewport.getViewport().landscape, true, "900 >= 900");
  });

  it("um change de orientacao propaga pelo listener da media query", async () => {
    const { env, viewport } = await freshViewport({
      width: 800,
      height: 1200,
      media: { [LANDSCAPE]: false },
    });
    let notifications = 0;
    const unsubscribe = rawSubscribe(viewport, () => {
      notifications += 1;
    });

    assert.equal(viewport.getViewport().landscape, false);

    env.setMedia(LANDSCAPE, true);
    env.setSize(1200, 800);
    env.fireMediaChange(LANDSCAPE);
    env.flushFrames();

    assert.equal(notifications, 1);
    assert.equal(viewport.getViewport().landscape, true);

    unsubscribe();
  });
});
