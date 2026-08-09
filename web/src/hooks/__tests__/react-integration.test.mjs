/**
 * Os dois hooks dentro do React: `getServerSnapshot` e o custo de render de
 * `useViewportValue`.
 *
 *   node --test web/src/hooks/__tests__/react-integration.test.mjs
 *
 * ── A ARMADILHA DO getServerSnapshot ──────────────────────────────────
 *
 * `useSyncExternalStore` tem TRES argumentos, e o terceiro e usado sempre que
 * nao ha cliente: `react-dom/server`. `useViewport.ts` devolve ali um valor
 * congelado — desktop, 1280x900, ponteiro fino, sem toque.
 *
 * A consequencia, que este arquivo prova e que ninguem deveria descobrir em
 * producao: **quem renderiza com `react-dom/server` nunca exercita o caminho
 * movel atraves deste hook.** Instalar um `window` de 375px e renderizar no
 * servidor devolve `isMobile: false`. Nao e defeito — o padrao de degradacao
 * escolhido e o layout que o app ja tinha — mas e uma armadilha real para o
 * `web/src/graph/__tests__/*.domtest.ts`, que e exatamente um render de
 * servidor: um teste de virtualizacao que passe a depender de `useViewport`
 * vai medir SEMPRE o layout de desktop, por mais estreita que seja a janela
 * que ele simule, e vai passar verde sem provar nada sobre celular.
 *
 * ── Sobre a contagem de renders ───────────────────────────────────────
 *
 * O `mountHook` de `harness.mjs` e um MODELO do algoritmo do
 * `useSyncExternalStore`, nao o React reconciliando: ele renderiza, assina, e
 * a cada notificacao rele `getSnapshot()` comparando com `Object.is`. O que os
 * casos abaixo provam, entao, e que o STORE respeita o contrato do qual a
 * regra de bailout do React depende. Provar a reconciliacao exigiria DOM, e
 * um DOM falso provaria menos, nao mais.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { COARSE, freshViewport, LANDSCAPE, NO_HOVER } from "./env.mjs";
import { captureStore, mountHook } from "./harness.mjs";

/** Ambiente de celular estreito, retrato, todo o sinal de toque ligado. */
const PHONE = {
  width: 375,
  height: 812,
  media: { [COARSE]: true, [NO_HOVER]: true, [LANDSCAPE]: false },
  maxTouchPoints: 5,
};

describe("getServerSnapshot", () => {
  it("A ARMADILHA: com uma janela de 375px, o render de servidor ainda diz desktop", async () => {
    const { viewport } = await freshViewport(PHONE);

    /* o store do cliente ESTA correto — o desencontro e so no render */
    const client = viewport.getViewport();
    assert.equal(client.isMobile, true);
    assert.equal(client.isTouch, true);

    const seen = [];
    const Probe = () => {
      const v = viewport.useViewport();
      seen.push(v);
      return createElement("span", null, `${v.width}`);
    };

    const html = renderToStaticMarkup(createElement(Probe));

    assert.equal(html, "<span>1280</span>", "o render de servidor mede 1280, e nao os 375 do ambiente");
    assert.equal(seen[0].isMobile, false, "quem renderiza no servidor NUNCA ve o caminho movel");
    assert.equal(seen[0].isDesktop, true);
    assert.equal(seen[0].isTouch, false);
    assert.equal(seen[0].coarsePointer, false);
  });

  it("devolve SEMPRE a mesma referencia, entre renders independentes", async () => {
    const { viewport } = await freshViewport(PHONE);

    const seen = [];
    const Probe = () => {
      seen.push(viewport.useViewport());
      return null;
    };

    renderToStaticMarkup(createElement(Probe));
    renderToStaticMarkup(createElement(Probe));
    renderToStaticMarkup(createElement(Probe, null));

    assert.equal(seen.length, 3);
    assert.equal(seen[0], seen[1], "getServerSnapshot precisa ser constante");
    assert.equal(seen[1], seen[2]);
    assert.ok(Object.isFrozen(seen[0]), "e congelado, para ninguem escrever nele");
  });

  it("o valor constante e desktop com ponteiro fino", async () => {
    const { viewport } = await freshViewport(PHONE);
    const { getServerSnapshot } = captureStore(viewport);
    const v = getServerSnapshot();

    assert.deepEqual(
      { ...v },
      {
        width: 1280,
        height: 900,
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        coarsePointer: false,
        noHover: false,
        isTouch: false,
        landscape: true,
      },
    );
    assert.equal(v.width, viewport.BREAKPOINTS.desktop, "a largura padrao E o corte de desktop");
  });

  it("useViewportValue tambem le o snapshot de servidor no render de servidor", async () => {
    const { viewport } = await freshViewport(PHONE);

    const Probe = () => {
      const isMobile = viewport.useViewportValue(viewport.selectIsMobile);
      const isTouch = viewport.useViewportValue(viewport.selectIsTouch);
      return createElement("span", null, `${isMobile}|${isTouch}`);
    };

    assert.equal(renderToStaticMarkup(createElement(Probe)), "<span>false|false</span>");
  });

  it("o render de servidor nao assina nada — nenhum listener fica para tras", async () => {
    const { env, viewport } = await freshViewport(PHONE);

    const Probe = () => {
      viewport.useViewport();
      return null;
    };
    renderToStaticMarkup(createElement(Probe));

    assert.equal(env.totalListenerCount(), 0, "sem efeito no servidor, nao ha subscricao");
  });
});

describe("useViewport() — o viewport inteiro", () => {
  it("re-renderiza a cada pixel, porque `width` e campo publico", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800 });
    const mounted = mountHook(() => viewport.useViewport()).mount();

    assert.equal(mounted.renders(), 1);
    assert.equal(mounted.value().width, 1000);

    for (let i = 1; i <= 3; i += 1) {
      env.setSize(1000 + i);
      env.fire("resize");
      env.flushFrames();
    }

    assert.equal(mounted.renders(), 4, "1 render inicial + 3 mudancas de largura");
    assert.equal(mounted.value().width, 1003);

    mounted.unmount();
  });

  it("um resize que nao muda medida nenhuma nao re-renderiza", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800 });
    const mounted = mountHook(() => viewport.useViewport()).mount();

    for (let i = 0; i < 5; i += 1) {
      env.fire("resize");
      env.flushFrames();
    }

    assert.equal(mounted.renders(), 1, "nenhuma notificacao chegou: o refresh nem avisou");
    assert.equal(mounted.notifications(), 0);

    mounted.unmount();
  });

  it("re-renders do pai nao fazem o React re-assinar", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800 });
    const mounted = mountHook(() => viewport.useViewport()).mount();

    for (let i = 0; i < 5; i += 1) mounted.rerender();

    assert.equal(mounted.subscribeIdentities(), 1, "`subscribe` e constante de modulo");
    assert.equal(env.totalListenerCount(), 5, "e por isso o conjunto de listeners nao foi remontado");

    mounted.unmount();
  });

  it("desmontar solta os listeners", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800 });
    const mounted = mountHook(() => viewport.useViewport()).mount();
    assert.equal(env.totalListenerCount(), 5);
    mounted.unmount();
    assert.equal(env.totalListenerCount(), 0);
  });
});

describe("useViewportValue(selector) — so o campo que interessa", () => {
  it("re-renderiza SO quando o valor selecionado muda", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800 });
    const mounted = mountHook(() => viewport.useViewportValue(viewport.selectIsMobile)).mount();

    assert.equal(mounted.value(), false);
    assert.equal(mounted.renders(), 1);

    /* tres resizes dentro da faixa de tablet: o store notifica, o valor nao muda */
    for (const width of [1100, 1200, 1279]) {
      env.setSize(width);
      env.fire("resize");
      env.flushFrames();
    }

    assert.equal(mounted.notifications(), 3, "o store avisou nas tres vezes");
    assert.equal(mounted.renders(), 1, "e o bailout do Object.is descartou as tres");
    assert.equal(mounted.value(), false);

    /* agora cruzando o corte */
    env.setSize(500);
    env.fire("resize");
    env.flushFrames();

    assert.equal(mounted.renders(), 2, "so a mudanca de faixa custou um render");
    assert.equal(mounted.value(), true);

    mounted.unmount();
  });

  it("cada seletor de modulo isola o consumidor do resto do viewport", async () => {
    const { env, viewport } = await freshViewport({
      width: 1000,
      height: 800,
      media: { [COARSE]: false },
    });
    const mobile = mountHook(() => viewport.useViewportValue(viewport.selectIsMobile)).mount();
    const coarse = mountHook(() => viewport.useViewportValue(viewport.selectCoarsePointer)).mount();

    env.setMedia(COARSE, true);
    env.fireMediaChange(COARSE);
    env.flushFrames();

    assert.equal(coarse.renders(), 2, "quem observa o ponteiro re-renderizou");
    assert.equal(mobile.renders(), 1, "quem observa a faixa de largura nao");
    assert.equal(coarse.value(), true);

    mobile.unmount();
    coarse.unmount();
  });

  it("um seletor primitivo escrito inline continua correto, so desperdica getSnapshot", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800 });
    /* a seta e criada de novo a cada render: as deps do useCallback mudam */
    const mounted = mountHook(() => viewport.useViewportValue((v) => v.isMobile)).mount();

    mounted.rerender();
    mounted.rerender();

    env.setSize(1100);
    env.fire("resize");
    env.flushFrames();

    assert.equal(mounted.value(), false);
    assert.equal(mounted.renders(), 3, "so os dois re-renders forcados; a notificacao nao mudou o valor");

    mounted.unmount();
  });

  it("DOCUMENTADO: um seletor que monta objeto novo quebra o contrato de cache", async () => {
    const { viewport } = await freshViewport({ width: 1000, height: 800 });

    const estavel = captureStore(viewport, () => viewport.useViewportValue(viewport.selectIsMobile));
    assert.equal(
      estavel.getSnapshot(),
      estavel.getSnapshot(),
      "seletor primitivo: duas leituras seguidas dao o MESMO valor",
    );

    const perigoso = captureStore(viewport, () =>
      viewport.useViewportValue((v) => ({ isMobile: v.isMobile })),
    );
    assert.notEqual(
      perigoso.getSnapshot(),
      perigoso.getSnapshot(),
      "seletor que monta objeto: cada leitura da um objeto diferente",
    );

    /* Este `notEqual` E o defeito. Num React de verdade, `getSnapshot` que
       nunca repete referencia significa que o valor "sempre mudou": o React
       re-renderiza, rele, ve outro objeto, re-renderiza — o aviso "The result
       of getSnapshot should be cached" e uma aba travada. Por isso a
       documentacao do modulo manda usar os `select*` de modulo, e por isso
       este caso fica aqui: para o contrato ficar executavel, e nao so escrito. */
  });

  it("dois consumidores do mesmo seletor compartilham UM conjunto de listeners", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800 });
    const a = mountHook(() => viewport.useViewportValue(viewport.selectIsDesktop)).mount();
    const b = mountHook(() => viewport.useViewportValue(viewport.selectIsDesktop)).mount();

    assert.equal(env.totalListenerCount(), 5);

    env.setSize(1400);
    env.fire("resize");
    env.flushFrames();

    assert.equal(a.value(), true);
    assert.equal(b.value(), true);
    assert.equal(a.renders(), 2);
    assert.equal(b.renders(), 2);

    a.unmount();
    assert.equal(env.totalListenerCount(), 5, "b continua vivo");
    b.unmount();
    assert.equal(env.totalListenerCount(), 0);
  });

  it("selectLandscape acompanha a rotacao", async () => {
    const { env, viewport } = await freshViewport({
      width: 800,
      height: 1200,
      media: { [LANDSCAPE]: false, [COARSE]: true, [NO_HOVER]: true },
    });
    const mounted = mountHook(() => viewport.useViewportValue(viewport.selectLandscape)).mount();

    assert.equal(mounted.value(), false);

    env.setMedia(LANDSCAPE, true);
    env.setSize(1200, 800);
    env.fire("orientationchange");
    env.flushFrames();

    assert.equal(mounted.value(), true);
    assert.equal(mounted.renders(), 2);

    mounted.unmount();
  });
});
