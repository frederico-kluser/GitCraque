/**
 * O que acontece NO IMPORT do shell — leitura de storage e bootstrap do
 * <html>, antes de qualquer acao. Cada caso precisa de uma instancia virgem
 * (`?instance=N`): o modulo le `document`/`localStorage` no escopo do
 * modulo, e e esse pre-estado que esta em prova.
 *
 *   node --loader ./web/src/hooks/__tests__/ts-loader.mjs --test \
 *        web/src/hooks/__tests__/useShellStore-import.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

let instances = 0;
const freshShell = () => import(`../useShellStore.ts?instance=${++instances}`);

const STORAGE_KEY = "gitcraque.shell";

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
  return {
    doc,
    classes,
    install() {
      Object.defineProperty(globalThis, "document", { value: doc, configurable: true, writable: true });
      Object.defineProperty(globalThis, "localStorage", { value: storageFake, configurable: true, writable: true });
    },
  };
}

async function fresh(seed = {}) {
  const dom = makeDom(seed);
  dom.install();
  const shell = await freshShell();
  return { shell, dom };
}

describe("leitura de preferencias no escopo do modulo", () => {
  it("JSON quebrado no storage nao derruba o import — nasce com os defaults", async () => {
    const { shell } = await fresh({ [STORAGE_KEY]: "{nao-e-json" });
    assert.equal(shell.getShellState().layoutMode, "auto");
    assert.equal(shell.getShellState().forceTouchTargets, false);
  });

  it("valor invalido de layoutMode cai no auto — localStorage e editavel a mao", async () => {
    const { shell } = await fresh({ [STORAGE_KEY]: '{"layoutMode":"banana"}' });
    assert.equal(shell.getShellState().layoutMode, "auto");
  });

  it("preferencia valida de layoutMode sobrevive ao import", async () => {
    const { shell } = await fresh({ [STORAGE_KEY]: '{"layoutMode":"compact"}' });
    assert.equal(shell.getShellState().layoutMode, "compact");
  });

  it("forca de alvos nao-booleana cai no false — JSON.parse devolve o que estiver escrito", async () => {
    const { shell } = await fresh({ [STORAGE_KEY]: '{"forceTouchTargets":"true"}' });
    assert.equal(shell.getShellState().forceTouchTargets, false);
  });

  it("forca de alvos verdadeira e restaurada do storage", async () => {
    const { shell } = await fresh({ [STORAGE_KEY]: '{"forceTouchTargets":true}' });
    assert.equal(shell.getShellState().forceTouchTargets, true);
  });
});

describe("bootstrap do <html> no escopo do modulo", () => {
  it("a classe touch-ui nasce ANTES do primeiro render, direto do storage", async () => {
    const { shell, dom } = await fresh({ [STORAGE_KEY]: '{"forceTouchTargets":true}' });
    assert.equal(dom.classes.has("touch-ui"), true, "sem nenhuma acao: so o import");
    assert.equal(shell.getShellState().forceTouchTargets, true);
  });

  it("o tema dark tambem nasce no <html> — sem flash de cor errada", async () => {
    const { dom } = await fresh();
    assert.equal(dom.classes.has("dark"), true);
    assert.equal(dom.doc.documentElement.style.colorScheme, "dark");
  });
});

describe("estado efemero nunca e restaurado", () => {
  it("touchSelectionMode ligado num import morre no proximo", async () => {
    const dom = makeDom();
    dom.install();
    const first = await freshShell();
    first.setTouchSelectionMode(true);
    assert.equal(first.getShellState().touchSelectionMode, true);
    const second = await freshShell();
    assert.equal(second.getShellState().touchSelectionMode, false, "reload nao volta numa armadilha");
  });
});
