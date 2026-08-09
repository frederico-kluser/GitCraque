/**
 * A ESTABILIDADE DE IDENTIDADE DO SNAPSHOT — o teste que impede o app de travar.
 *
 *   node --test web/src/hooks/__tests__/snapshot-identity.test.mjs
 *
 * `useSyncExternalStore` compara o retorno de `getSnapshot()` com `Object.is`.
 * Se `getSnapshot` montasse um objeto novo a cada chamada, cada render
 * produziria um valor "diferente", o React re-renderizaria, chamaria
 * `getSnapshot` de novo, e assim para sempre: o aviso "The result of
 * getSnapshot should be cached" e uma aba congelada. Nao e um bug de
 * performance — e o app parado.
 *
 * A defesa em `useViewport.ts` tem duas metades, e as duas sao testadas aqui:
 *
 *   1. `getSnapshot` NUNCA consulta o ambiente. Devolve a variavel de modulo.
 *   2. `refresh()` compara CAMPO A CAMPO e so troca a variavel quando algum
 *      campo mudou de valor — descartando o objeto recem-lido quando ele e
 *      igual ao antigo.
 *
 * A metade 2 e a que exige teste campo a campo: basta ela esquecer UM campo na
 * comparacao para aquele campo parar de propagar, silenciosamente. Um snapshot
 * que nunca muda tambem passa no teste de "nao entra em laco".
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { COARSE, freshViewport, LANDSCAPE, NO_HOVER } from "./env.mjs";
import { captureStore, rawSubscribe } from "./harness.mjs";

describe("sem nada mudar, a referencia e a mesma", () => {
  it("100 chamadas de getViewport() devolvem O MESMO objeto", async () => {
    const { viewport } = await freshViewport({ width: 1440, height: 900 });
    const first = viewport.getViewport();
    for (let i = 0; i < 100; i += 1) {
      assert.equal(viewport.getViewport(), first, `a chamada ${i} montou um objeto novo`);
    }
  });

  it("getSnapshot, chamado em rajada como o React chama, nao muda de referencia", async () => {
    const { viewport } = await freshViewport();
    const { getSnapshot } = captureStore(viewport);
    const first = getSnapshot();
    for (let i = 0; i < 1000; i += 1) {
      assert.equal(getSnapshot(), first, "getSnapshot instavel = laco infinito no React");
    }
  });

  it("com alguem assinado, getSnapshot e getViewport veem o MESMO objeto", async () => {
    const { viewport } = await freshViewport();
    const { subscribe, getSnapshot } = captureStore(viewport);
    const unsubscribe = subscribe(() => {});
    assert.equal(getSnapshot(), viewport.getViewport());
    unsubscribe();
  });

  it("um refresh que nao encontra mudanca nao troca a referencia", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800 });
    const unsubscribe = rawSubscribe(viewport);
    const before = viewport.getViewport();

    for (let i = 0; i < 10; i += 1) {
      env.fire("resize");
      env.flushFrames();
    }

    assert.equal(viewport.getViewport(), before, "resize sem mudanca de medida nao pode trocar o objeto");
    unsubscribe();
  });
});

describe("cada campo publico, mudando sozinho, troca a referencia", () => {
  /**
   * Um caso por campo controlavel de forma independente. `isMobile`,
   * `isTablet` e `isDesktop` derivam de `width` e viajam com ele.
   */
  const cases = [
    {
      field: "width",
      setup: { width: 1000, height: 800 },
      mutate: (env) => env.setSize(1001),
      expect: (v) => assert.equal(v.width, 1001),
    },
    {
      field: "height",
      setup: { width: 1000, height: 800 },
      mutate: (env) => env.setSize(1000, 801),
      expect: (v) => assert.equal(v.height, 801),
    },
    {
      field: "coarsePointer",
      setup: { width: 1000, height: 800, media: { [COARSE]: false } },
      mutate: (env) => env.setMedia(COARSE, true),
      expect: (v) => assert.equal(v.coarsePointer, true),
    },
    {
      field: "noHover",
      setup: { width: 1000, height: 800, media: { [NO_HOVER]: false } },
      mutate: (env) => env.setMedia(NO_HOVER, true),
      expect: (v) => assert.equal(v.noHover, true),
    },
    {
      field: "landscape",
      setup: { width: 1000, height: 800, media: { [LANDSCAPE]: true } },
      mutate: (env) => env.setMedia(LANDSCAPE, false),
      expect: (v) => assert.equal(v.landscape, false),
    },
    {
      field: "isTouch (por maxTouchPoints, que nenhuma media query enxerga)",
      setup: { width: 1000, height: 800, maxTouchPoints: 0 },
      mutate: (env) => env.setTouchPoints(5),
      expect: (v) => assert.equal(v.isTouch, true),
    },
  ];

  for (const { field, setup, mutate, expect } of cases) {
    it(`${field} muda -> referencia nova`, async () => {
      const { env, viewport } = await freshViewport(setup);
      const before = viewport.getViewport();
      mutate(env);
      const after = viewport.getViewport();
      assert.notEqual(after, before, `mudar ${field} nao trocou a referencia — o campo nao propaga`);
      expect(after);
    });
  }

  it("mudar width DENTRO da mesma faixa ainda troca a referencia", async () => {
    const { env, viewport } = await freshViewport({ width: 800, height: 600 });
    const before = viewport.getViewport();
    env.setSize(900);
    const after = viewport.getViewport();

    assert.notEqual(after, before, "width e campo publico: 800 -> 900 tem de propagar");
    assert.equal(before.isTablet, true);
    assert.equal(after.isTablet, true, "nenhuma faixa foi cruzada");
    assert.equal(after.width, 900);
  });

  it("voltar ao valor anterior nao ressuscita a referencia antiga", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800 });
    const first = viewport.getViewport();
    env.setSize(1200);
    const middle = viewport.getViewport();
    env.setSize(1000);
    const back = viewport.getViewport();

    assert.notEqual(middle, first);
    assert.notEqual(back, first, "a identidade nao e memoizada por valor, e nem precisa ser");
    assert.deepEqual({ ...back }, { ...first }, "mas o CONTEUDO tem de voltar identico");
  });
});

describe("o snapshot tem exatamente os nove campos do contrato", () => {
  it("nem um a mais, nem um a menos", async () => {
    const { viewport } = await freshViewport();
    const keys = Object.keys(viewport.getViewport()).sort();
    assert.deepEqual(keys, [
      "coarsePointer",
      "height",
      "isDesktop",
      "isMobile",
      "isTablet",
      "isTouch",
      "landscape",
      "noHover",
      "width",
    ]);
  });

  it("todo campo derivado e booleano, e as medidas sao numeros", async () => {
    const { viewport } = await freshViewport();
    const v = viewport.getViewport();
    for (const key of ["isMobile", "isTablet", "isDesktop", "coarsePointer", "noHover", "isTouch", "landscape"]) {
      assert.equal(typeof v[key], "boolean", `${key} deveria ser booleano`);
    }
    assert.equal(typeof v.width, "number");
    assert.equal(typeof v.height, "number");
  });
});

describe("os seletores de modulo sao estaveis", () => {
  it("a identidade nao muda entre leituras — o useCallback depende disso", async () => {
    const { viewport } = await freshViewport();
    assert.equal(viewport.selectIsMobile, viewport.selectIsMobile);
    assert.equal(viewport.selectIsTouch, viewport.selectIsTouch);
  });

  it("cada seletor le o campo que o nome promete", async () => {
    const { env, viewport } = await freshViewport({
      width: 700,
      height: 900,
      media: { [COARSE]: true, [NO_HOVER]: true, [LANDSCAPE]: false },
    });
    const v = viewport.getViewport();
    assert.equal(viewport.selectIsMobile(v), v.isMobile);
    assert.equal(viewport.selectIsTablet(v), v.isTablet);
    assert.equal(viewport.selectIsDesktop(v), v.isDesktop);
    assert.equal(viewport.selectIsTouch(v), v.isTouch);
    assert.equal(viewport.selectCoarsePointer(v), v.coarsePointer);
    assert.equal(viewport.selectLandscape(v), v.landscape);

    /* E os valores concretos, para o caso nao virar tautologia. */
    assert.equal(viewport.selectIsMobile(v), true);
    assert.equal(viewport.selectCoarsePointer(v), true);
    assert.equal(viewport.selectLandscape(v), false);
    env.setSize(1400);
    assert.equal(viewport.selectIsDesktop(viewport.getViewport()), true);
  });
});
