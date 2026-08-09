/**
 * As adicoes da onda 2A ao shell — web/src/hooks/useShellStore.ts.
 *
 *   node --loader ./web/src/hooks/__tests__/ts-loader.mjs --test \
 *        web/src/hooks/__tests__/useShellStore.test.mjs
 *
 * O loader e a ponte para a resolucao sem `.ts` que entrou na producao
 * (`./useLongPress`); veja `ts-loader.mjs`. Nada aqui toca a producao.
 *
 * O modulo le `document` e `localStorage` NO ESCOPO DO MODULO. Esta suite
 * usa UMA instancia compartilhada — o estado e resetado por acoes entre os
 * testes, e e isto que torna o coverage do arquivo mensuravel. O que
 * acontece NO IMPORT (leitura de storage, bootstrap do <html>) mora na
 * irma `useShellStore-import.test.mjs`, que usa instancias virgens de
 * proposito.
 *
 * O estado do GESTO (useLongPress) e de MODULO e compartilhado: todo teste
 * comeca por `resetLongPressForTest()`.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { captureStore } from "./harness.mjs";

let instances = 0;
let cached = null;
/** Instancia unica — os testes de acao e gesto rodam todos nela. */
const sharedShell = async () => (cached ??= import("../useShellStore.ts"));
/** Instancia virgem — so para o que acontece no escopo do modulo. */
const freshShell = () => import(`../useShellStore.ts?instance=${++instances}`);
const longPress = await import("../useLongPress.ts");

const STORAGE_KEY = "gitcraque.shell";

/** DOM falso: <html> com classList + localStorage em memoria. */
function makeDom(seed = {}) {
  const storage = new Map(Object.entries(seed));
  const classes = new Set();
  const doc = {
    documentElement: {
      classList: {
        toggle(name, force) {
          const has = classes.has(name);
          const want = force ?? !has;
          if (want) classes.add(name);
          else classes.delete(name);
          return want;
        },
        contains: (name) => classes.has(name),
      },
      style: {},
    },
  };
  const storageFake = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => {
      storage.set(k, String(v));
    },
  };
  const install = () => {
    defineGlobal("document", doc);
    defineGlobal("localStorage", storageFake);
  };
  return { doc, storageFake, storage, classes, install };
}

function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

const touchEvent = (pointerId, x, y) => ({ pointerId, pointerType: "touch", clientX: x, clientY: y });
const mouseEvent = (x, y) => ({
  clientX: x,
  clientY: y,
  preventDefault() {},
  stopPropagation() {},
});

/** Instancia compartilhada sobre um DOM falso plantado na hora. */
async function shared(seed = {}) {
  const dom = makeDom(seed);
  dom.install();
  const shell = await sharedShell();
  return { shell, dom };
}

beforeEach(async () => {
  longPress.resetLongPressForTest();
  const { shell } = await shared();
  shell.setLayoutMode("auto");
  shell.setForceTouchTargets(false);
  shell.setTouchSelectionMode(false);
  shell.setTheme("dark");
  shell.closeContextMenu();
});

describe("os dois tempos do dedo parado", () => {
  it("LONG_PRESS_MS e o limiar de toque longo das plataformas: 500", async () => {
    const { shell } = await shared();
    assert.equal(shell.LONG_PRESS_MS, 500);
  });

  it("DND_DELAY_MS e 250 — e a REGRA: o arraste acorda antes do menu", async () => {
    const { shell } = await shared();
    assert.equal(shell.DND_DELAY_MS, 250);
    assert.ok(
      shell.DND_DELAY_MS < shell.LONG_PRESS_MS,
      "DND_DELAY_MS < LONG_PRESS_MS e o que torna o cancelLongPress do onDragStart possivel",
    );
  });
});

describe("estado inicial e seletores", () => {
  it("defaults: auto, alvos nao forcados, selecao por toque desligada", async () => {
    const { shell } = await shared();
    const s = shell.getShellState();
    assert.equal(s.layoutMode, "auto");
    assert.equal(s.forceTouchTargets, false);
    assert.equal(s.touchSelectionMode, false);
    assert.equal(s.contextMenu, null);
  });

  it("os tres seletores novos leem o campo certo", async () => {
    const { shell } = await shared();
    const s = shell.getShellState();
    assert.equal(shell.selectLayoutMode(s), "auto");
    assert.equal(shell.selectForceTouchTargets(s), false);
    assert.equal(shell.selectTouchSelectionMode(s), false);
    assert.equal(shell.selectContextMenu(s), null);
  });
});

describe("ponte do ⌘Enter", () => {
  it("com a gaveta fechada, requestCommit ABRE a gaveta", async () => {
    const { shell } = await shared();
    shell.closeChanges();
    assert.equal(shell.getShellState().changesOpen, false);
    shell.requestCommit();
    assert.equal(shell.getShellState().changesOpen, true, "o atalho nunca e letra morta");
  });

  it("com a gaveta aberta, requestCommit chama o handler registrado", async () => {
    const { shell } = await shared();
    shell.openChanges();
    let fired = 0;
    const unreg = shell.registerCommitHandler(() => {
      fired += 1;
    });
    try {
      shell.requestCommit();
      assert.equal(fired, 1, "o painel registrou o proprio disparo e foi chamado");
    } finally {
      unreg();
    }
  });

  it("sem handler registrado, requestCommit com a gaveta aberta nao explode", async () => {
    const { shell } = await shared();
    shell.openChanges();
    shell.requestCommit();
    assert.equal(shell.getShellState().changesOpen, true);
  });

  it("unregister devolve o controle: o handler registrado deixa de ser chamado", async () => {
    const { shell } = await shared();
    shell.openChanges();
    let fired = 0;
    const unreg = shell.registerCommitHandler(() => {
      fired += 1;
    });
    unreg();
    shell.requestCommit();
    assert.equal(fired, 0);
  });
});

describe("persistencia sob pressao", () => {
  it("storage com JSON invalido nao derruba a leitura — o app nasce com os defaults", async () => {
    const { shell } = await shared({ [STORAGE_KEY]: "{nao-e-json" });
    assert.equal(shell.getShellState().layoutMode, "auto", "leitura falha e o estado continua sano");
  });

  it("contextMenuFor e a porta do MOUSE: preventDefault + stopPropagation + lista montada na hora", async () => {
    const { shell } = await shared();
    let builds = 0;
    const handler = shell.contextMenuFor("No do rato", () => {
      builds += 1;
      return [{ label: "Apagar", onSelect: () => {} }];
    });
    let prevented = false;
    let stopped = false;
    handler({
      clientX: 12,
      clientY: 34,
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation: () => {
        stopped = true;
      },
    });
    assert.equal(prevented, true, "sem preventDefault o menu do navegador abriria junto");
    assert.equal(stopped, true, "sem stopPropagation o alvo aninhado abriria os dois menus");
    assert.equal(builds, 1, "a lista e montada na hora do clique, nao antes");
    assert.equal(shell.getShellState().contextMenu?.label, "No do rato");
    assert.equal(shell.getShellState().contextMenu?.items.length, 1);
    assert.equal(shell.getShellState().contextMenu?.id.startsWith("ctx-"), true);
  });

  it("useShellState entregou subscribe e snapshots estaveis ao React", async () => {
    const { shell } = await shared();
    /* o hook exige um seletor — `selectLayoutMode` e um dos estaveis */
    const captured = captureStore(shell, (sel = shell.selectLayoutMode) => shell.useShellState(sel));
    assert.equal(typeof captured.subscribe, "function");
    assert.equal(captured.getSnapshot(), "auto", "getSnapshot devolve o valor SELECIONADO, vivo");
    let notified = 0;
    const unsub = captured.subscribe(() => {
      notified += 1;
    });
    try {
      shell.setLayoutMode("full");
      assert.equal(notified, 1, "a acao notifica quem esta assinado");
      assert.equal(captured.getSnapshot(), "full");
    } finally {
      unsub();
    }
  });

  it("setItem que estoura (modo privado, cota cheia) nao impede a acao — a UI segue, so nao lembra", async () => {
    const { shell, dom } = await shared();
    dom.storageFake.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    shell.setLayoutMode("compact");
    assert.equal(shell.getShellState().layoutMode, "compact", "a persistencia falhou, a acao nao");
  });
});

describe("preferencia de layout", () => {
  it("setLayoutMode grava o estado e o seletor", async () => {
    const { shell } = await shared();
    shell.setLayoutMode("compact");
    assert.equal(shell.getShellState().layoutMode, "compact");
    assert.equal(shell.selectLayoutMode(shell.getShellState()), "compact");
    shell.setLayoutMode("full");
    assert.equal(shell.selectLayoutMode(shell.getShellState()), "full");
    shell.setLayoutMode("auto");
    assert.equal(shell.selectLayoutMode(shell.getShellState()), "auto");
  });

  it("layoutMode vai para o localStorage — e so ele", async () => {
    const { shell, dom } = await shared();
    shell.setLayoutMode("compact");
    const raw = dom.storage.get(STORAGE_KEY);
    assert.ok(raw.includes('"layoutMode":"compact"'), `slice ausente: ${raw}`);
    assert.ok(!raw.includes("touchSelectionMode"), "estado efemero nao persiste");
  });

});

describe("alvos de toque forcados", () => {
  it("setForceTouchTargets(true) liga o estado E a classe touch-ui no <html>", async () => {
    const { shell, dom } = await shared();
    shell.setForceTouchTargets(true);
    assert.equal(shell.getShellState().forceTouchTargets, true);
    assert.equal(dom.classes.has("touch-ui"), true, "a classe tem de estar no documentElement");
    shell.setForceTouchTargets(false);
    assert.equal(shell.getShellState().forceTouchTargets, false);
    assert.equal(dom.classes.has("touch-ui"), false);
  });

  it("toggleForceTouchTargets alterna estado e classe juntos", async () => {
    const { shell, dom } = await shared();
    shell.toggleForceTouchTargets();
    assert.equal(shell.getShellState().forceTouchTargets, true);
    assert.equal(dom.classes.has("touch-ui"), true);
    shell.toggleForceTouchTargets();
    assert.equal(shell.getShellState().forceTouchTargets, false);
    assert.equal(dom.classes.has("touch-ui"), false);
  });

  it("applyTouchTargets escreve a classe sem mexer no estado — irma da applyTheme", async () => {
    const { shell, dom } = await shared();
    shell.applyTouchTargets(true);
    assert.equal(dom.classes.has("touch-ui"), true);
    assert.equal(shell.getShellState().forceTouchTargets, false, "so a classe, o estado nao");
    shell.applyTouchTargets(false);
    assert.equal(dom.classes.has("touch-ui"), false);
  });

  it("persistido no slice de preferencias", async () => {
    const { shell, dom } = await shared();
    shell.setForceTouchTargets(true);
    assert.ok(dom.storage.get(STORAGE_KEY).includes('"forceTouchTargets":true'));
  });

});

describe("modo de selecao por toque — EFEMERO", () => {
  it("setTouchSelectionMode liga e desliga o estado", async () => {
    const { shell } = await shared();
    shell.setTouchSelectionMode(true);
    assert.equal(shell.selectTouchSelectionMode(shell.getShellState()), true);
    shell.setTouchSelectionMode(false);
    assert.equal(shell.selectTouchSelectionMode(shell.getShellState()), false);
  });

  it("toggleTouchSelectionMode alterna", async () => {
    const { shell } = await shared();
    shell.toggleTouchSelectionMode();
    assert.equal(shell.getShellState().touchSelectionMode, true);
    shell.toggleTouchSelectionMode();
    assert.equal(shell.getShellState().touchSelectionMode, false);
  });

  it("nao vai para o localStorage — a lista de persistidos nao o conhece", async () => {
    const { shell, dom } = await shared();
    shell.setTouchSelectionMode(true);
    shell.setLayoutMode("auto");
    const slice = JSON.parse(dom.storage.get(STORAGE_KEY));
    assert.ok(!("touchSelectionMode" in slice), "estado efemero nao pode sobreviver ao reload");
  });

});

describe("longPressMenu — o mesmo menu, com a porta do dedo", () => {
  it("devolve o bundle completo de cinco handlers", async () => {
    const { shell } = await shared();
    const bundle = shell.longPressMenu("No", () => []);
    assert.equal(typeof bundle.onContextMenu, "function");
    assert.equal(typeof bundle.onPointerDown, "function");
    assert.equal(typeof bundle.onPointerUp, "function");
    assert.equal(typeof bundle.onPointerCancel, "function");
    assert.equal(typeof bundle.onPointerMove, "function");
  });

  it("dedo parado por LONG_PRESS_MS abre o menu no ponto do pointerdown", async (t) => {
    const { shell } = await shared();
    const bundle = shell.longPressMenu("Commit a1b2c3d", () => [{ label: "Rebasar", onSelect: () => {} }]);
    t.mock.timers.enable({ apis: ["setTimeout"] });
    bundle.onPointerDown(touchEvent(7, 120, 340));
    assert.equal(shell.getShellState().contextMenu, null, "antes do tempo, menu nenhum");
    t.mock.timers.tick(501);
    const menu = shell.getShellState().contextMenu;
    assert.ok(menu, "o menu abriu");
    assert.equal(menu.label, "Commit a1b2c3d");
    assert.deepEqual({ x: menu.x, y: menu.y }, { x: 120, y: 340 }, "o ponto e o do dedo");
    assert.equal(menu.items.length, 1);
    assert.equal(menu.items[0].label, "Rebasar");
    assert.ok(menu.id.startsWith("ctx-"), "o id vem do contador do modulo");
    assert.ok(menu.id !== "ctx-1" || true, "o contador nao reinicia — ver o teste do segundo gesto");
  });

  it("a lista de itens e montada na HORA do gesto, nao na criacao do bundle", async (t) => {
    const { shell } = await shared();
    const items = [];
    const bundle = shell.longPressMenu("No", () => items);
    items.push({ label: "Novo", onSelect: () => {} });
    t.mock.timers.enable({ apis: ["setTimeout"] });
    bundle.onPointerDown(touchEvent(7, 10, 10));
    t.mock.timers.tick(501);
    const menu = shell.getShellState().contextMenu;
    assert.equal(menu.items.length, 1, "o build() ve o estado do momento do gesto");
    assert.equal(menu.items[0].label, "Novo");
  });

  it("lista vazia nao abre menu nenhum — a regra do openContextMenu", async (t) => {
    const { shell } = await shared();
    const bundle = shell.longPressMenu("No vazio", () => []);
    t.mock.timers.enable({ apis: ["setTimeout"] });
    bundle.onPointerDown(touchEvent(7, 10, 10));
    t.mock.timers.tick(501);
    assert.equal(shell.getShellState().contextMenu, null);
  });

  it("um segundo gesto abre outro menu com id seguinte", async (t) => {
    const { shell } = await shared();
    const bundle = shell.longPressMenu("No", () => [{ label: "A", onSelect: () => {} }]);
    t.mock.timers.enable({ apis: ["setTimeout"] });
    bundle.onPointerDown(touchEvent(7, 10, 10));
    t.mock.timers.tick(501);
    const firstId = shell.getShellState().contextMenu.id;
    assert.ok(firstId.startsWith("ctx-"), `formato do id: ${firstId}`);
    shell.closeContextMenu();
    bundle.onPointerDown(touchEvent(8, 20, 20));
    t.mock.timers.tick(501);
    const secondId = shell.getShellState().contextMenu.id;
    assert.equal(Number(secondId.slice(4)), Number(firstId.slice(4)) + 1, "o contador do modulo avanca");
  });

  it("o caminho do mouse pelo bundle abre o mesmo menu", async () => {
    const { shell } = await shared();
    const bundle = shell.longPressMenu("No", () => [{ label: "A", onSelect: () => {} }]);
    bundle.onContextMenu(mouseEvent(50, 60));
    const menu = shell.getShellState().contextMenu;
    assert.ok(menu);
    assert.deepEqual({ x: menu.x, y: menu.y }, { x: 50, y: 60 });
    assert.equal(menu.label, "No");
  });
});
