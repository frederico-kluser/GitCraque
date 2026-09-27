/**
 * A lista de projetos abertos (tabs) do shell store: registar sem duplicar,
 * fechar, persistir no slice gravado e sobreviver a lixo no storage.
 *
 *   node --loader ./web/src/hooks/__tests__/ts-loader.mjs --test \
 *        web/src/hooks/__tests__/open-projects.test.mjs
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
    storage,
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

describe("tabs de projetos abertos", () => {
  it("openProjectTab regista sem duplicar e atualiza o rotulo", async () => {
    const { shell } = await fresh();
    shell.openProjectTab({ path: "/a", name: "A" });
    shell.openProjectTab({ path: "/b", name: "B" });
    shell.openProjectTab({ path: "/a", name: "A-novo" });
    const open = shell.getShellState().openProjects;
    assert.equal(open.length, 2);
    assert.deepEqual(open[0], { path: "/a", name: "A-novo" });
  });

  it("closeProjectTab remove so a pedida", async () => {
    const { shell } = await fresh();
    shell.openProjectTab({ path: "/a", name: "A" });
    shell.openProjectTab({ path: "/b", name: "B" });
    shell.closeProjectTab("/a");
    assert.deepEqual(
      shell.getShellState().openProjects.map((tab) => tab.path),
      ["/b"],
    );
  });

  it("a lista persiste no slice gravado", async () => {
    const { shell, dom } = await fresh();
    shell.openProjectTab({ path: "/a", name: "A" });
    const slice = JSON.parse(dom.storage.get(STORAGE_KEY));
    assert.deepEqual(slice.openProjects, [{ path: "/a", name: "A" }]);
  });

  it("lixo no storage nasce como lista vazia", async () => {
    const { shell } = await fresh({
      [STORAGE_KEY]: JSON.stringify({ openProjects: [{ path: 7 }, null, { name: "sem path" }] }),
    });
    assert.deepEqual(shell.getShellState().openProjects, []);
  });
});
