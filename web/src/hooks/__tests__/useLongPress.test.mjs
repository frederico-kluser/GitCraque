/**
 * A maquina de estados do toque longo — web/src/hooks/useLongPress.ts.
 *
 *   node --test web/src/hooks/__tests__/useLongPress.test.mjs
 *
 * O modulo NAO usa hooks do React: o gesto e estado de MODULO (um por tela).
 * A suite usa UMA instancia e `resetLongPressForTest()` entre os testes — o
 * ponto de limpeza que o proprio modulo exporta para este fim. Os timers e o
 * relogio sao mockados por `t.mock.timers`, o que torna deterministico o
 * instante exato em que o timer do gesto dispara e em que a janela fantasma
 * expira.
 *
 * As perguntas adversariais da revisao da onda 2A ganham resposta aqui:
 *  - dois dedos em dois nos: o segundo `pointerdown` desarma sem rearmar;
 *  - janela fantasma: engole UM clique, em fase de CAPTURA, em QUALQUER alvo
 *    do documento, por 900ms — e depois deixa tudo passar;
 *  - um `pointerup`/`pointermove` de outro bundle com o MESMO `pointerId`
 *    mexe no gesto armado (estado e de modulo, os handlers tem de vir do
 *    mesmo gesto).
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

let single = null;

/**
 * Instancia UNICA do modulo, com `resetLongPressForTest()` entre os testes.
 *
 * O estado do gesto e de MODULO de proposito, e o proprio modulo exporta o
 * reset para testes — usar isto (em vez de uma instancia por teste) e
 * tambem um teste do contrato de limpeza, e deixa o coverage do arquivo
 * mensuravel numa unica instancia.
 */
const fresh = async () => (single ??= import("../useLongPress.ts"));

beforeEach(async () => {
  (await fresh()).resetLongPressForTest();
});

/** Evento de ponteiro, do formato que o bundle le. */
const pe = (pointerId, pointerType, x, y) => ({ pointerId, pointerType, clientX: x, clientY: y });

/** Evento de menu, do formato que o bundle le. */
const ce = (x, y, extra = {}) => ({
  clientX: x,
  clientY: y,
  preventDefault() {
    this.prevented = true;
  },
  stopPropagation() {
    this.stopped = true;
  },
  prevented: false,
  stopped: false,
  ...extra,
});

/**
 * Janela falsa SO para o matador de clique fantasma: `abrirJanelaFantasma`
 * instala um `click` de captura em `window` e o remove a si mesmo. Registra
 * as chamadas com o sinalizador de captura, que e parte do contrato.
 */
function installWindow() {
  const listeners = new Map();
  const registered = [];
  const win = {
    addEventListener(type, fn, capture) {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(fn);
      registered.push({ type, capture: capture === true });
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
    },
  };
  Object.defineProperty(globalThis, "window", { value: win, configurable: true, writable: true });
  const fire = (type, overrides = {}) => {
    const event = {
      type,
      preventDefault() {
        this.prevented = true;
      },
      stopPropagation() {
        this.stopped = true;
      },
      prevented: false,
      stopped: false,
      ...overrides,
    };
    const handlers = listeners.get(type);
    if (handlers) for (const fn of [...handlers]) fn(event);
    return event;
  };
  return { win, fire, registered };
}

/** Monta o spy de disparo e o bundle. NAO mexe em timer nenhum. */
function makeBundle(mod, { delayMs = 500, ...rest } = {}) {
  const calls = [];
  const bundle = mod.useLongPress({ onLongPress: (p, o) => calls.push({ p, o }), delayMs, ...rest });
  return { bundle, calls };
}

/** Bundle com timers mockados — chame UMA vez por teste (enable duplo lanca). */
async function armedBundle(t, mod, options = {}) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { bundle, calls } = makeBundle(mod, options);
  return { bundle, calls, tick: (ms) => t.mock.timers.tick(ms) };
}

describe("constantes publicas", () => {
  it("MOVE_TOLERANCE_PX e 10 e GHOST_WINDOW_MS e 900", async () => {
    const mod = await fresh();
    assert.equal(mod.MOVE_TOLERANCE_PX, 10);
    assert.equal(mod.GHOST_WINDOW_MS, 900);
  });

  it("longPressHandlers e o proprio useLongPress", async () => {
    const mod = await fresh();
    assert.equal(mod.longPressHandlers, mod.useLongPress);
  });

  it("resetLongPressForTest e exportado como ponto de limpeza publico", async () => {
    const mod = await fresh();
    assert.equal(typeof mod.resetLongPressForTest, "function");
  });
});

describe("armar e disparar", () => {
  it("pointerdown de toque arma; depois do atraso dispara com o ponto e origem touch", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod, { delayMs: 500 });
    bundle.onPointerDown(pe(7, "touch", 120, 340));
    assert.equal(calls.length, 0, "antes do atraso nada pode ter disparado");
    tick(501);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].p, { x: 120, y: 340 }, "o ponto e o do pointerdown");
    assert.equal(calls[0].o, "touch");
  });

  it("pointerdown de MOUSE nunca arma — o mouse tem onContextMenu", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(1, "mouse", 10, 10));
    tick(2000);
    assert.equal(calls.length, 0);
  });

  it("pointerup antes do atraso aborta o gesto", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 10, 10));
    bundle.onPointerUp(pe(7, "touch", 10, 10));
    tick(2000);
    assert.equal(calls.length, 0);
  });

  it("pointerup depois do disparo nao dispara segunda vez", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 10, 10));
    tick(501);
    assert.equal(calls.length, 1);
    bundle.onPointerUp(pe(7, "touch", 10, 10));
    tick(2000);
    assert.equal(calls.length, 1);
  });

  it("pointercancel aborta o gesto — o navegador tomou o gesto, nunca dispara", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 10, 10));
    bundle.onPointerCancel(pe(7, "touch", 10, 10));
    tick(2000);
    assert.equal(calls.length, 0);
  });

  it("moveTolerance personalizada vale — 3px move com tolerancia 2 desarma", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod, { moveTolerance: 2 });
    bundle.onPointerDown(pe(7, "touch", 100, 100));
    bundle.onPointerMove(pe(7, "touch", 103, 100));
    tick(2000);
    assert.equal(calls.length, 0, "3px > 2px de tolerancia: gesto morto");
  });

  it("enabled: false devolve o bundle nulo — nenhum handler faz nada", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod, { enabled: false });
    const ev = ce(10, 10);
    const pt = pe(7, "touch", 10, 10);
    bundle.onContextMenu(ev);
    bundle.onPointerDown(pt);
    bundle.onPointerMove(pt);
    bundle.onPointerUp(pt);
    bundle.onPointerCancel(pt);
    tick(2000);
    assert.equal(calls.length, 0);
    assert.equal(ev.prevented, false, "nem o preventDefault do menu acontece");
  });

  it("enabled omisso vale true", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 10, 10));
    tick(501);
    assert.equal(calls.length, 1);
  });
});

describe("tolerancia de movimento", () => {
  it("movimento dentro da tolerancia (<= 10px) mantem o gesto armado", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 100, 100));
    bundle.onPointerMove(pe(7, "touch", 106, 104));
    tick(501);
    assert.equal(calls.length, 1, "8px de deslocamento diagonal cabem no circulo de raio 10");
  });

  it("exatamente 10px e a borda — nao desarma (comparacao ao quadrado, sem raiz)", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 100, 100));
    bundle.onPointerMove(pe(7, "touch", 110, 100));
    tick(501);
    assert.equal(calls.length, 1, "dx^2 == tolerance^2 nao deve desarmar");
  });

  it("movimento alem da tolerancia desarma — esta rolando, nao pedindo menu", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 100, 100));
    bundle.onPointerMove(pe(7, "touch", 111, 100));
    tick(2000);
    assert.equal(calls.length, 0, "11px > 10px: gesto morto");
  });

  it("pointermove de OUTRO pointerId e ignorado", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 100, 100));
    bundle.onPointerMove(pe(8, "touch", 999, 999));
    tick(501);
    assert.equal(calls.length, 1, "o dedo 8 nao pode matar o gesto do dedo 7");
  });
});

describe("multi-toque: um gesto por tela", () => {
  it("segundo pointerdown desarma SEM rearmar — pinca ou rolagem de duas maos, nunca menu", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 10, 10));
    bundle.onPointerDown(pe(8, "touch", 400, 10));
    tick(2000);
    assert.equal(calls.length, 0, "dois dedos nao abrem menu nenhum");
  });

  it("bundle B desarma o gesto do bundle A — o estado e de MODULO, um por tela", async (t) => {
    const mod = await fresh();
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const a = makeBundle(mod);
    const b = makeBundle(mod);
    a.bundle.onPointerDown(pe(7, "touch", 10, 10));
    b.bundle.onPointerUp(pe(7, "touch", 10, 10));
    t.mock.timers.tick(2000);
    assert.equal(a.calls.length, 0, "o pointerup (mesmo id) passado pelo outro bundle desarma");
  });

  it("bundle B tambem desarma com pointermove do mesmo id", async (t) => {
    const mod = await fresh();
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const a = makeBundle(mod);
    const b = makeBundle(mod);
    a.bundle.onPointerDown(pe(7, "touch", 10, 10));
    b.bundle.onPointerMove(pe(7, "touch", 999, 999));
    t.mock.timers.tick(2000);
    assert.equal(a.calls.length, 0);
  });
});

describe("onContextMenu: mouse, sintetico do Android e janela fantasma", () => {
  it("clique direito de mouse fora de qualquer janela dispara com origem mouse e barra o nativo", async (t) => {
    const mod = await fresh();
    const { bundle, calls } = await armedBundle(t, mod);
    const ev = ce(50, 60);
    bundle.onContextMenu(ev);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].o, "mouse");
    assert.deepEqual(calls[0].p, { x: 50, y: 60 });
    assert.equal(ev.prevented, true);
    assert.equal(ev.stopped, true);
  });

  it("contextmenu sintetico (pointerType touch) com o dedo ainda em baixo abre com origem touch e desarma o timer", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 30, 40));
    bundle.onContextMenu(ce(30, 40, { pointerType: "touch" }));
    assert.equal(calls.length, 1, "o sintetico se antecipou ao timer: abre aqui");
    assert.equal(calls[0].o, "touch");
    tick(2000);
    assert.equal(calls.length, 1, "e o timer nao pode abrir a segunda copia");
  });

  it("contextmenu sintetico que chega DEPOIS do timer nao abre nada — janela fantasma ativa", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 30, 40));
    tick(501);
    assert.equal(calls.length, 1);
    bundle.onContextMenu(ce(30, 40, { pointerType: "touch" }));
    assert.equal(calls.length, 1, "o sintetico atrasado e engolido pela janela");
  });

  it("clique direito de mouse dentro da janela fantasma tambem e engolido — preco aceito", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 30, 40));
    tick(501);
    bundle.onContextMenu(ce(200, 200));
    assert.equal(calls.length, 1);
  });

  it("fora da janela fantasma o mouse volta ao comportamento historico", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 30, 40));
    tick(501);
    bundle.onPointerUp(pe(7, "touch", 30, 40));
    tick(901);
    bundle.onContextMenu(ce(200, 200));
    assert.equal(calls.length, 2, "o direito de um minuto depois volta a ser mouse");
    assert.equal(calls[1].o, "mouse");
  });

  it("contextmenu com pointerType touch, sem gesto armado e fora da janela, abre como toque", async (t) => {
    const mod = await fresh();
    const { bundle, calls } = await armedBundle(t, mod);
    bundle.onContextMenu(ce(5, 5, { pointerType: "touch" }));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].o, "touch");
  });

  it("contextmenu sem pointerType com o gesto em curso abre como toque (ordem A do Android)", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 30, 40));
    bundle.onContextMenu(ce(30, 40));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].o, "touch");
    tick(2000);
    assert.equal(calls.length, 1);
  });
});

describe("janela fantasma: o clique emulado", () => {
  it("o matador e instalado em fase de CAPTURA em window", async (t) => {
    const mod = await fresh();
    const { win, registered } = installWindow();
    const { bundle, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 10, 10));
    tick(501);
    const clicks = win.listenerCount("click");
    assert.equal(clicks, 1);
    const entry = registered.filter((r) => r.type === "click");
    assert.equal(entry[0].capture, true, "em borbulha o clique ja teria selecionado a linha");
  });

  it("engole UM clique — o segundo passa", async (t) => {
    const mod = await fresh();
    const { fire } = installWindow();
    const { bundle, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 10, 10));
    tick(501);

    const first = fire("click");
    assert.equal(first.prevented, true, "o clique fantasma morre: preventDefault + stop");
    assert.equal(first.stopped, true);

    const second = fire("click");
    assert.equal(second.prevented, false, "um so clique e engolido por gesto");
  });

  it("clique apos a janela de 900ms passa — o matador se removeu sozinho", async (t) => {
    const mod = await fresh();
    const { fire } = installWindow();
    const { bundle, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 10, 10));
    tick(501);
    tick(901);
    const late = fire("click");
    assert.equal(late.prevented, false);
  });

  it("a rede de seguranca remove o matador mesmo sem clique nenhum", async (t) => {
    const mod = await fresh();
    const { win, fire } = installWindow();
    const { bundle, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 10, 10));
    tick(501);
    assert.equal(win.listenerCount("click"), 1);
    tick(901);
    assert.equal(win.listenerCount("click"), 0, "nao pode ficar pendurado ate o proximo clique de verdade");
    const late = fire("click");
    assert.equal(late.prevented, false);
  });

  it("clique direito de mouse NAO abre janela fantasma — clique depois dele passa", async (t) => {
    const mod = await fresh();
    const { fire } = installWindow();
    const { bundle } = await armedBundle(t, mod);
    bundle.onContextMenu(ce(50, 60));
    const click = fire("click");
    assert.equal(click.prevented, false, "caminho do mouse nao engole clique nenhum");
  });

  it("sem window o gesto dispara e o matador nao e instalado — degrada onde nao ha DOM", async (t) => {
    /* Os testes anteriores instalam window na mesma ordem; este caso precisa
       do processo sem janela nenhuma. */
    delete globalThis.window;
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 10, 10));
    tick(501);
    assert.equal(calls.length, 1, "o gesto abre o menu mesmo sem window");
    assert.equal(typeof globalThis.window, "undefined", "pre-condicao: sem janela, sem matador");
  });
});

describe("cancelLongPress — o gancho do onDragStart do dnd", () => {
  it("cancela o timer pendente: o menu nao abre no meio do arraste", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 10, 10));
    mod.cancelLongPress();
    tick(2000);
    assert.equal(calls.length, 0);
  });

  it("limpa a bandeira do gesto: o contextmenu seguinte volta a ser tratado como mouse", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 10, 10));
    mod.cancelLongPress();
    tick(1);
    bundle.onContextMenu(ce(50, 60));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].o, "mouse", "sem dedo em baixo e fora da janela, e mouse");
  });

  it("e seguro chamar com nada armado", async (t) => {
    const mod = await fresh();
    assert.doesNotThrow(() => mod.cancelLongPress());
  });
});

describe("resetLongPressForTest", () => {
  it("desarma o gesto pendente", async (t) => {
    const mod = await fresh();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 10, 10));
    mod.resetLongPressForTest();
    tick(2000);
    assert.equal(calls.length, 0);
  });

  it("fecha a janela fantasma: clique depois do reset passa e o mouse volta a ser mouse", async (t) => {
    const mod = await fresh();
    const { fire } = installWindow();
    const { bundle, calls, tick } = await armedBundle(t, mod);
    bundle.onPointerDown(pe(7, "touch", 10, 10));
    tick(501);
    mod.resetLongPressForTest();
    const click = fire("click");
    assert.equal(click.prevented, false, "o reset zera firedAt: nada dentro da janela");
    bundle.onContextMenu(ce(50, 60));
    assert.equal(calls.length, 2, "o gesto que o reset desarmou ja disparou antes; este e novo");
    assert.equal(calls[1].o, "mouse", "fora da janela, o direito volta a ser mouse");
  });
});

describe("chain — encadear handlers soltos", () => {
  it("roda na ordem dada com o MESMO evento", async () => {
    const mod = await fresh();
    const order = [];
    const fn = mod.chain(
      (e) => order.push(`a:${e.v}`),
      (e) => order.push(`b:${e.v}`),
      (e) => order.push(`c:${e.v}`),
    );
    fn({ v: 1 });
    assert.deepEqual(order, ["a:1", "b:1", "c:1"]);
  });

  it("pula entradas ausentes (undefined/null)", async () => {
    const mod = await fresh();
    const order = [];
    mod.chain(undefined, (e) => order.push(`x:${e}`), null)(7);
    assert.deepEqual(order, ["x:7"]);
  });

  it("sem handlers nao faz nada e nao quebra", async () => {
    const mod = await fresh();
    assert.doesNotThrow(() => mod.chain()({}));
  });
});

describe("withLongPress — encadear com os listeners do @dnd-kit", () => {
  it("deixa o resto do mapa intacto (o onKeyDown do KeyboardSensor nao pode morrer)", async () => {
    const mod = await fresh();
    const { bundle } = makeBundle(mod);
    const onKeyDown = () => {};
    const merged = mod.withLongPress({ onKeyDown }, bundle);
    assert.equal(merged.onKeyDown, onKeyDown, "mesma referencia, nao uma copia");
  });

  it("encadeia os cinco: o do dnd roda PRIMEIRO, o do menu depois", async () => {
    const mod = await fresh();
    const { bundle } = makeBundle(mod);
    const order = [];
    const listeners = {
      onPointerDown: (e) => order.push(`dnd:${e.clientX}`),
      onContextMenu: (e) => order.push(`dnd-ctx:${e.clientX}`),
    };
    const merged = mod.withLongPress(listeners, bundle);
    merged.onPointerDown(pe(7, "touch", 10, 10));
    merged.onContextMenu(ce(20, 30));
    assert.deepEqual(order, ["dnd:10", "dnd-ctx:20"]);
  });

  it("funciona sem listeners nenhum (alvo sem arraste)", async () => {
    const mod = await fresh();
    const { bundle } = makeBundle(mod);
    const merged = mod.withLongPress(undefined, bundle);
    assert.equal(typeof merged.onPointerDown, "function");
    assert.equal(typeof merged.onContextMenu, "function");
    assert.equal(typeof merged.onPointerUp, "function");
    assert.equal(typeof merged.onPointerCancel, "function");
    assert.equal(typeof merged.onPointerMove, "function");
  });

  it("handler ausente num dos cinco nao derruba o do bundle", async () => {
    const mod = await fresh();
    const { bundle } = makeBundle(mod);
    const merged = mod.withLongPress({ onPointerDown: undefined }, bundle);
    assert.equal(typeof merged.onPointerDown, "function");
    assert.doesNotThrow(() => merged.onPointerDown(pe(7, "touch", 1, 1)));
  });
});
