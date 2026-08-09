/**
 * O resolutor de layout — web/src/hooks/useLayoutMode.ts.
 *
 *   node --test web/src/hooks/__tests__/useLayoutMode.test.mjs
 *
 * Tres camadas:
 *  - as funcoes PURAS (`selectAutoLayout`, `resolveLayout`) — a regra de
 *    tablet por orientacao e as fronteiras 768/1280, sem ambiente nenhum;
 *  - `getLayoutMode()` fora do React — le o shell canonico e o viewport
 *    canonico sobre a janela falsa do `env.mjs`;
 *  - `useLayoutMode()` reativo — um driver proprio (mesma tecnica do
 *    `harness.mjs`: trocar o dispatcher do React) que assina os DOIS stores,
 *    porque o harness da suite nao cobre duas assinaturas no mesmo hook.
 *
 * O ambiente tem de existir ANTES do import: `useViewport.ts` le a janela no
 * escopo do modulo. Por isso `installEnv` roda no topo, antes do `await
 * import`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as React from "react";
import { installEnv } from "./env.mjs";

const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

/* Sem matchMedia: o viewport cai no fallback dimensionado (`landscape =
   largura >= altura`), que e exatamente a semantica que a regra de layout
   usa — e os testes de largura controlam a orientacao sozinhas. */
const env = installEnv({ width: 1440, height: 900, hasMatchMedia: false });
const layout = await import("../useLayoutMode.ts");
const shell = await import("../useShellStore.ts");

/** Estado de partida conhecido — o shell nao tem reset exportado. */
function resetShell() {
  shell.setLayoutMode("auto");
  shell.setForceTouchTargets(false);
  shell.setTouchSelectionMode(false);
  shell.setRailWidth(264);
  shell.setDetailWidth(560);
  shell.setTheme("dark");
}

/** Viewport sintetico para a funcao pura — mesmo formato do contrato. */
function vp(width, height, overrides = {}) {
  return {
    width,
    height,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1280,
    isDesktop: width >= 1280,
    landscape: width >= height,
    coarsePointer: false,
    noHover: false,
    isTouch: false,
    ...overrides,
  };
}

/**
 * Monta `useLayoutMode` de VERDADE com os dois stores, fora de um
 * renderizador. Modelo do React: cada assinatura re-renderiza quando o
 * SNAPSHOT dela muda (`Object.is`); um seletor que devolve a mesma string
 * nao re-renderiza nada.
 */
function mountLayout() {
  const stores = [];
  const dispatcher = {
    useCallback: (fn) => fn,
    useSyncExternalStore(subscribe, getSnapshot) {
      const entry = { subscribe, getSnapshot, last: getSnapshot() };
      stores.push(entry);
      return entry.last;
    },
  };
  let value;
  let renders = 0;
  const render = () => {
    const previous = internals.H;
    internals.H = dispatcher;
    try {
      value = layout.useLayoutMode();
    } finally {
      internals.H = previous;
    }
    renders += 1;
  };
  render();
  const unsubs = stores.map((entry) =>
    entry.subscribe(() => {
      const next = entry.getSnapshot();
      if (Object.is(next, entry.last)) return;
      entry.last = next;
      render();
    }),
  );
  return {
    value: () => value,
    renders: () => renders,
    unmount() {
      for (const u of unsubs) u();
    },
  };
}

/** Redimensiona a janela falsa e dispara o ciclo completo do viewport. */
function resizeTo(width, height) {
  env.setSize(width, height);
  env.fire("resize");
  env.flushFrames();
}

describe("selectAutoLayout — o que a TELA pede", () => {
  it("celular e sempre compact, mesmo em paisagem", () => {
    assert.equal(layout.selectAutoLayout(vp(400, 900)), "compact");
    assert.equal(layout.selectAutoLayout(vp(767, 300)), "compact", "767 ainda e mobile");
    assert.equal(layout.selectAutoLayout(vp(0, 0)), "compact", "largura zero nao quebra");
  });

  it("tablet em RETRATO e compact — as colunas laterais comem o grafo", () => {
    assert.equal(layout.selectAutoLayout(vp(768, 1180)), "compact", "768 JA e tablet e o corte pertence a faixa de cima");
    assert.equal(layout.selectAutoLayout(vp(820, 1180)), "compact");
    assert.equal(layout.selectAutoLayout(vp(834, 1112)), "compact");
    assert.equal(layout.selectAutoLayout(vp(1279, 2000)), "compact");
  });

  it("tablet em PAISAGEM e full — sobra largura de trabalho para o grafo", () => {
    assert.equal(layout.selectAutoLayout(vp(768, 500)), "full");
    assert.equal(layout.selectAutoLayout(vp(1024, 900)), "full");
    assert.equal(layout.selectAutoLayout(vp(1279, 800)), "full");
  });

  it("desktop e sempre full", () => {
    assert.equal(layout.selectAutoLayout(vp(1280, 900)), "full", "1280 JA e desktop");
    assert.equal(layout.selectAutoLayout(vp(1920, 1080)), "full");
    assert.equal(layout.selectAutoLayout(vp(5120, 800)), "full");
  });
});

describe("resolveLayout — a preferencia vence o que a tela pede", () => {
  it("auto deixa a tela decidir", () => {
    assert.equal(layout.resolveLayout("auto", "compact"), "compact");
    assert.equal(layout.resolveLayout("auto", "full"), "full");
  });

  it("compact e full sobrescrevem o auto, nos dois sentidos", () => {
    assert.equal(layout.resolveLayout("compact", "full"), "compact", "monitor grande, pessoa quer coluna unica");
    assert.equal(layout.resolveLayout("full", "compact"), "full", "celular, pessoa quer as tres colunas");
  });
});

describe("getLayoutMode — fora do React", () => {
  it("segue a tela com preferencia auto", () => {
    resetShell();
    env.setSize(1440, 900);
    assert.equal(layout.getLayoutMode(), "full");
    env.setSize(400, 900);
    assert.equal(layout.getLayoutMode(), "compact");
    env.setSize(820, 1180);
    assert.equal(layout.getLayoutMode(), "compact", "tablet retrato");
    env.setSize(1024, 900);
    assert.equal(layout.getLayoutMode(), "full", "tablet paisagem");
    env.setSize(767, 500);
    assert.equal(layout.getLayoutMode(), "compact");
    env.setSize(1280, 900);
    assert.equal(layout.getLayoutMode(), "full");
  });

  it("a preferencia vence o tamanho, nos dois sentidos", () => {
    resetShell();
    shell.setLayoutMode("compact");
    env.setSize(1440, 900);
    assert.equal(layout.getLayoutMode(), "compact", "desktop forçado a coluna unica");
    shell.setLayoutMode("full");
    env.setSize(400, 900);
    assert.equal(layout.getLayoutMode(), "full", "celular forcado a tres colunas");
    shell.setLayoutMode("auto");
    env.setSize(1440, 900);
    assert.equal(layout.getLayoutMode(), "full");
  });
});

describe("useLayoutMode — reativo aos dois stores", () => {
  it("nasce com o layout da tela e reage a preferencia", () => {
    resetShell();
    env.setSize(1440, 900);
    const m = mountLayout();
    try {
      assert.equal(m.value(), "full");
      assert.equal(m.renders(), 1, "um so render na montagem");

      shell.setLayoutMode("compact");
      assert.equal(m.value(), "compact", "a mudanca de preferencia re-renderiza");
      assert.equal(m.renders(), 2);

      shell.setLayoutMode("auto");
      assert.equal(m.value(), "full");
    } finally {
      m.unmount();
    }
  });

  it("mudanca em campo NAO observado nao re-renderiza — o seletor e quem manda", () => {
    resetShell();
    env.setSize(1440, 900);
    const m = mountLayout();
    try {
      shell.setRailWidth(300);
      assert.equal(m.renders(), 1, "selectLayoutMode continua 'auto': bailout");

      shell.setTouchSelectionMode(true);
      assert.equal(m.renders(), 1, "modo de selecao nao tem efeito no layout");

      shell.setTheme("light");
      assert.equal(m.renders(), 1);
    } finally {
      m.unmount();
    }
  });

  it("reage ao redimensionamento da tela", () => {
    resetShell();
    env.setSize(1440, 900);
    const m = mountLayout();
    try {
      resizeTo(400, 900);
      assert.equal(m.value(), "compact", "celular: coluna unica");
      assert.equal(m.renders(), 2);

      resizeTo(820, 1180);
      assert.equal(m.value(), "compact", "tablet retrato");
      assert.equal(m.renders(), 2, "compact -> compact nao re-renderiza: bailout do seletor");

      resizeTo(1024, 900);
      assert.equal(m.value(), "full", "tablet paisagem");
      assert.equal(m.renders(), 3);

      resizeTo(1440, 900);
      assert.equal(m.value(), "full");
      assert.equal(m.renders(), 3, "full -> full tambem baila");
    } finally {
      m.unmount();
    }
  });

  it("a preferencia continua valendo quando a tela muda", () => {
    resetShell();
    env.setSize(1440, 900);
    const m = mountLayout();
    try {
      shell.setLayoutMode("compact");
      resizeTo(400, 900);
      assert.equal(m.value(), "compact", "compact manual sobrevive ao resize");
      resizeTo(1920, 1080);
      assert.equal(m.value(), "compact");
    } finally {
      m.unmount();
    }
  });

  it("depois do unmount nenhuma mudanca re-renderiza", () => {
    resetShell();
    env.setSize(1440, 900);
    const m = mountLayout();
    m.unmount();
    const renders = m.renders();
    shell.setLayoutMode("compact");
    resizeTo(400, 900);
    assert.equal(m.value(), "full", "o ultimo valor renderizado fica");
    assert.equal(m.renders(), renders, "nenhum render a mais");
  });
});
