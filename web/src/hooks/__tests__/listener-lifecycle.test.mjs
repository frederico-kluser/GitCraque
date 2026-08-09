/**
 * O CICLO DE VIDA DO LISTENER GLOBAL e o coalescing por frame.
 *
 *   node --test web/src/hooks/__tests__/listener-lifecycle.test.mjs
 *
 * `useViewport.ts` instala UM conjunto de listeners para o app inteiro — dois
 * em `window` (`resize`, `orientationchange`) e tres `change` de media query —
 * na PRIMEIRA subscricao, e os remove na ULTIMA. Cem componentes usando o hook
 * continuam sendo cinco listeners.
 *
 * Os dois modos de falhar sao opostos e igualmente caros:
 *
 *   - Remover cedo demais: um componente desmonta, o listener vai junto, e os
 *     outros noventa e nove param de responder a rotacao da tela. Nao ha erro
 *     no console; a interface so congela numa largura antiga.
 *   - Remover tarde demais (ou nunca): listener vazado apontando para um
 *     `window` morto, e um frame pendente rodando depois do teardown.
 *
 * Ambos sao invisiveis para `tsc`. O que os enxerga e CONTAR listeners vivos, e
 * e isso que o ambiente falso deste diretorio existe para permitir.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { COARSE, freshViewport, LANDSCAPE, NO_HOVER } from "./env.mjs";
import { captureStore, rawSubscribe } from "./harness.mjs";

/* dois de window + um por media query observada */
const WINDOW_LISTENERS = 2;
const MEDIA_LISTENERS = 3;
const TOTAL = WINDOW_LISTENERS + MEDIA_LISTENERS;

describe("instalacao e remocao", () => {
  it("(a) antes da primeira subscricao nao ha listener nenhum", async () => {
    const { env } = await freshViewport();
    assert.equal(env.totalListenerCount(), 0, "importar o modulo nao pode instalar nada");
    assert.ok(env.calls.matchMedia > 0, "mas o modulo JA consultou as media queries na leitura inicial");
  });

  it("(b) a primeira subscricao instala os cinco", async () => {
    const { env, viewport } = await freshViewport();
    const unsubscribe = rawSubscribe(viewport);

    assert.equal(env.windowListenerCount("resize"), 1);
    assert.equal(env.windowListenerCount("orientationchange"), 1);
    assert.equal(env.mediaListenerCount(COARSE), 1);
    assert.equal(env.mediaListenerCount(NO_HOVER), 1);
    assert.equal(env.mediaListenerCount(LANDSCAPE), 1);
    assert.equal(env.totalListenerCount(), TOTAL);

    unsubscribe();
  });

  it("os listeners de window sao passivos — resize nao pode bloquear a rolagem", async () => {
    const { env, viewport } = await freshViewport();
    const unsubscribe = rawSubscribe(viewport);
    for (const seen of env.optionsSeen) {
      assert.deepEqual(seen.options, { passive: true }, `${seen.type} foi registrado sem passive`);
    }
    unsubscribe();
  });

  it("a segunda subscricao NAO instala um segundo conjunto", async () => {
    const { env, viewport } = await freshViewport();
    const first = rawSubscribe(viewport);
    const second = rawSubscribe(viewport);

    assert.equal(env.totalListenerCount(), TOTAL, "cem componentes continuam sendo cinco listeners");

    first();
    second();
  });

  it("(c) com duas subscricoes e uma cancelada, os listeners CONTINUAM", async () => {
    const { env, viewport } = await freshViewport();
    const first = rawSubscribe(viewport);
    const second = rawSubscribe(viewport);

    first();
    assert.equal(env.totalListenerCount(), TOTAL, "ainda ha um assinante vivo");

    second();
  });

  it("(d) a ultima subscricao cancelada remove tudo", async () => {
    const { env, viewport } = await freshViewport();
    const first = rawSubscribe(viewport);
    const second = rawSubscribe(viewport);

    first();
    second();

    assert.equal(env.windowListenerCount(), 0);
    assert.equal(env.mediaListenerCount(), 0, "os `change` sairam dos MESMOS MediaQueryList que os receberam");
    assert.equal(env.calls.windowAdd, env.calls.windowRemove);
    assert.equal(env.calls.mediaAdd, env.calls.mediaRemove);
  });

  it("dez ciclos completos nao deixam residuo", async () => {
    const { env, viewport } = await freshViewport();
    for (let i = 0; i < 10; i += 1) {
      const unsubscribe = rawSubscribe(viewport);
      assert.equal(env.totalListenerCount(), TOTAL, `ciclo ${i}: nao instalou`);
      unsubscribe();
      assert.equal(env.totalListenerCount(), 0, `ciclo ${i}: vazou`);
    }
  });
});

describe("(e) idempotencia do unsubscribe", () => {
  it("cancelar duas vezes o MESMO assinante nao derruba quem continua vivo", async () => {
    const { env, viewport } = await freshViewport();
    const first = rawSubscribe(viewport);
    const second = rawSubscribe(viewport);

    first();
    first();

    assert.equal(
      env.totalListenerCount(),
      TOTAL,
      "o StrictMode chama cleanup de proposito; um segundo cleanup nao pode derrubar o vizinho",
    );

    second();
    assert.equal(env.totalListenerCount(), 0);
  });

  it("cancelar duas vezes o unico assinante nao explode nem re-remove", async () => {
    const { env, viewport } = await freshViewport();
    const unsubscribe = rawSubscribe(viewport);

    unsubscribe();
    assert.equal(env.totalListenerCount(), 0);
    const removesAfterFirst = env.calls.windowRemove;

    assert.doesNotThrow(() => unsubscribe());
    assert.equal(env.calls.windowRemove, removesAfterFirst, "o segundo cleanup nao pode chamar remove de novo");
    assert.equal(env.totalListenerCount(), 0);
  });

  it("monta-desmonta-monta, como o StrictMode faz, termina com os listeners instalados", async () => {
    const { env, viewport } = await freshViewport();

    const firstMount = rawSubscribe(viewport);
    firstMount();
    assert.equal(env.totalListenerCount(), 0);

    const secondMount = rawSubscribe(viewport);
    assert.equal(env.totalListenerCount(), TOTAL, "o remount tem de reinstalar");

    secondMount();
    assert.equal(env.totalListenerCount(), 0);
  });

  it("o cleanup ORFAO do StrictMode nao derruba a remontagem", async () => {
    /* A forma exata do StrictMode: o React cria um `handleStoreChange` NOVO a
       cada invocacao do efeito, entao a remontagem assina com uma FUNCAO
       diferente. Chamar o cleanup velho depois disso tem de ser inofensivo. */
    const { env, viewport } = await freshViewport();
    const { subscribe } = captureStore(viewport);

    const firstCleanup = subscribe(() => {});
    firstCleanup();
    const secondCleanup = subscribe(() => {});

    firstCleanup();

    assert.equal(env.totalListenerCount(), TOTAL, "a montagem viva nao pode cair junto com o cleanup velho");

    secondCleanup();
    assert.equal(env.totalListenerCount(), 0);
  });

  it("ARESTA DOCUMENTADA: reassinar com a MESMA funcao deixa o cleanup velho perigoso", async () => {
    /* `listeners` e um Set, e o cleanup fecha sobre a FUNCAO, nao sobre a
       assinatura. Se o mesmo `listener` for reassinado depois de um teardown
       completo, o cleanup antigo remove a assinatura NOVA e derruba os cinco
       listeners com um assinante vivo.

       Nao e alcancavel pelo React — o `useSyncExternalStore` cria um
       `handleStoreChange` novo por efeito, que e o caso testado acima. Fica
       registrado porque `subscribe` e alcancavel por qualquer consumidor do
       modulo, e sete frentes vao consumi-lo.

       O caso abaixo descreve o comportamento ATUAL. Se um dia o cleanup ganhar
       uma trava de "ja usei", este teste fica vermelho de proposito. */
    const { env, viewport } = await freshViewport();
    const { subscribe } = captureStore(viewport);

    const shared = () => {};
    const staleCleanup = subscribe(shared);
    staleCleanup();
    const liveCleanup = subscribe(shared);
    assert.equal(env.totalListenerCount(), TOTAL);

    staleCleanup();

    assert.equal(
      env.totalListenerCount(),
      0,
      "comportamento atual: o cleanup orfao derruba a assinatura viva que reusou a mesma funcao",
    );

    liveCleanup();
  });

  it("ARESTA DOCUMENTADA: assinar a MESMA funcao duas vezes conta como um assinante so", async () => {
    /* Consequencia do mesmo Set: duas subscricoes com a mesma referencia
       colapsam numa entrada, e o primeiro cleanup ja zera o conjunto. */
    const { env, viewport } = await freshViewport();
    const { subscribe } = captureStore(viewport);

    const shared = () => {};
    const first = subscribe(shared);
    const second = subscribe(shared);

    first();
    assert.equal(env.totalListenerCount(), 0, "comportamento atual: o Set nao conta duas vezes a mesma funcao");

    second();
  });
});

describe("(f) re-subscrever depois do teardown ressincroniza", () => {
  it("o ambiente que mudou enquanto ninguem ouvia e recuperado na subscricao", async () => {
    const { env, viewport } = await freshViewport({ width: 1440, height: 900 });

    const first = rawSubscribe(viewport);
    assert.equal(viewport.getViewport().isDesktop, true);
    first();

    /* Ninguem esta ouvindo. O `resize` do navegador cai no vazio. */
    env.setSize(500, 900);
    env.setMedia(COARSE, true);

    const notified = [];
    const second = rawSubscribe(viewport, () => notified.push(1));

    assert.equal(env.totalListenerCount(), TOTAL, "reinstalou os listeners");
    const v = viewport.getViewport();
    assert.equal(v.width, 500, "releu a largura que mudou no escuro");
    assert.equal(v.isMobile, true);
    assert.equal(v.coarsePointer, true, "releu tambem as media queries");
    assert.equal(notified.length, 1, "o assinante novo foi avisado na hora, sem esperar um resize");

    second();
  });

  it("se nada mudou no escuro, a re-subscricao nao inventa notificacao", async () => {
    const { env, viewport } = await freshViewport({ width: 1440, height: 900 });
    const first = rawSubscribe(viewport);
    first();

    const notified = [];
    const second = rawSubscribe(viewport, () => notified.push(1));
    assert.equal(notified.length, 0);
    assert.equal(env.totalListenerCount(), TOTAL);

    second();
  });
});

describe("o `subscribe` entregue ao React e estavel", () => {
  it("a mesma referencia entre leituras — senao o React re-assina a cada render", async () => {
    const { viewport } = await freshViewport();
    const a = captureStore(viewport);
    const b = captureStore(viewport);
    assert.equal(a.subscribe, b.subscribe);
    assert.equal(a.getSnapshot, b.getSnapshot);
  });
});

describe("coalescing por requestAnimationFrame", () => {
  it("N eventos de resize viram UMA notificacao", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800 });
    let notifications = 0;
    const unsubscribe = rawSubscribe(viewport, () => {
      notifications += 1;
    });

    /* o navegador dispara resize dezenas de vezes durante UM arrasto */
    for (let i = 1; i <= 20; i += 1) {
      env.setSize(1000 + i);
      env.fire("resize");
    }

    assert.equal(env.pendingFrames(), 1, "vinte eventos agendaram um frame so");
    assert.equal(notifications, 0, "nada foi notificado antes do frame rodar");

    env.flushFrames();

    assert.equal(notifications, 1, "uma notificacao, nao vinte");
    assert.equal(viewport.getViewport().width, 1020, "e ela carrega a ULTIMA medida, nao a primeira");

    unsubscribe();
  });

  it("resize, orientationchange e change de media query compartilham o mesmo frame", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800, media: { [COARSE]: false } });
    let notifications = 0;
    const unsubscribe = rawSubscribe(viewport, () => {
      notifications += 1;
    });

    env.setSize(1300);
    env.fire("resize");
    env.fire("orientationchange");
    env.setMedia(COARSE, true);
    env.fireMediaChange(COARSE);

    assert.equal(env.pendingFrames(), 1);
    env.flushFrames();

    assert.equal(notifications, 1);
    const v = viewport.getViewport();
    assert.equal(v.isDesktop, true);
    assert.equal(v.coarsePointer, true);

    unsubscribe();
  });

  it("depois do frame rodar, o proximo resize agenda um frame NOVO", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800 });
    let notifications = 0;
    const unsubscribe = rawSubscribe(viewport, () => {
      notifications += 1;
    });

    env.setSize(1100);
    env.fire("resize");
    env.flushFrames();
    assert.equal(notifications, 1);

    env.setSize(1200);
    env.fire("resize");
    assert.equal(env.pendingFrames(), 1, "a trava do frame foi liberada");
    env.flushFrames();
    assert.equal(notifications, 2);

    unsubscribe();
  });

  it("um frame que roda sem nada ter mudado nao notifica", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800 });
    let notifications = 0;
    const unsubscribe = rawSubscribe(viewport, () => {
      notifications += 1;
    });

    env.fire("resize");
    env.flushFrames();

    assert.equal(notifications, 0, "resize que nao mudou medida nenhuma e ruido");
    unsubscribe();
  });

  it("o teardown CANCELA o frame pendente — nada roda depois do ultimo unsubscribe", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800 });
    let notifications = 0;
    const unsubscribe = rawSubscribe(viewport, () => {
      notifications += 1;
    });

    env.setSize(1400);
    env.fire("resize");
    assert.equal(env.pendingFrames(), 1);

    unsubscribe();

    assert.equal(env.pendingFrames(), 0, "cancelAnimationFrame nao foi chamado no teardown");
    assert.equal(env.flushFrames(), 0);
    assert.equal(notifications, 0);
  });

  it("sem cancelAnimationFrame, o frame orfao roda e nao quebra nada", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800, hasCancelRaf: false });
    let notifications = 0;
    const unsubscribe = rawSubscribe(viewport, () => {
      notifications += 1;
    });

    env.setSize(1400);
    env.fire("resize");
    unsubscribe();

    assert.doesNotThrow(() => env.flushFrames());
    assert.equal(notifications, 0, "sem assinante, o refresh orfao nao avisa ninguem");
  });

  it("sem requestAnimationFrame, cai para notificacao sincrona", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800, hasRaf: false });
    let notifications = 0;
    const unsubscribe = rawSubscribe(viewport, () => {
      notifications += 1;
    });

    env.setSize(1100);
    env.fire("resize");
    assert.equal(notifications, 1, "sem frame para agendar, o refresh e imediato");

    env.setSize(1200);
    env.fire("resize");
    assert.equal(notifications, 2, "e sem coalescing, como esperado nesse fallback");

    unsubscribe();
  });
});

describe("varios assinantes recebem a mesma notificacao", () => {
  it("todos os assinantes vivos sao avisados uma vez por mudanca", async () => {
    const { env, viewport } = await freshViewport({ width: 1000, height: 800 });
    const counts = [0, 0, 0];
    const unsubs = counts.map((_, i) =>
      rawSubscribe(viewport, () => {
        counts[i] += 1;
      }),
    );

    env.setSize(1400);
    env.fire("resize");
    env.flushFrames();

    assert.deepEqual(counts, [1, 1, 1]);

    unsubs[1]();
    env.setSize(700);
    env.fire("resize");
    env.flushFrames();

    assert.deepEqual(counts, [2, 1, 2], "o assinante cancelado parou de receber, os outros nao");

    unsubs[0]();
    unsubs[2]();
  });
});
