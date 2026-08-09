/**
 * O shell SEM DOM nenhum — a pergunta da revisao: quem importa o
 * `useShellStore.ts` numa cadeia que renderiza com `react-dom/server`
 * (os `*.domtest.ts` do grafo) pode explodir no escopo do modulo?
 *
 *   node --loader ./web/src/hooks/__tests__/ts-loader.mjs --test \
 *        web/src/hooks/__tests__/useShellStore-nodom.test.mjs
 *
 * A resposta, provada aqui: nao. Sem `document` o bootstrap do <html> e
 * pulado, sem `localStorage` a persistencia e pulada, e todas as acoes
 * seguem funcionando — o estado e de memoria, a UI e que nao tem onde
 * escrever.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

let instances = 0;
const freshShell = () => import(`../useShellStore.ts?instance=${++instances}`);
const longPress = await import("../useLongPress.ts");

describe("import sem document nem localStorage", () => {
  it("carrega com os defaults — nada explode no escopo do modulo", async () => {
    assert.equal(typeof document, "undefined", "pre-condicao: este processo nao tem DOM");
    assert.equal(typeof localStorage, "undefined", "pre-condicao: este processo nao tem storage");
    const shell = await freshShell();
    const s = shell.getShellState();
    assert.equal(s.layoutMode, "auto");
    assert.equal(s.forceTouchTargets, false);
    assert.equal(s.touchSelectionMode, false);
    assert.equal(s.theme, "dark");
  });

  it("applyTouchTargets tem guarda — nao lanca sem document", async () => {
    const shell = await freshShell();
    assert.doesNotThrow(() => shell.applyTouchTargets(true));
    assert.doesNotThrow(() => shell.applyTouchTargets(false));
  });

  it("as acoes de preferencia funcionam so em memoria", async () => {
    const shell = await freshShell();
    shell.setLayoutMode("compact");
    shell.setForceTouchTargets(true);
    shell.toggleTouchSelectionMode();
    const s = shell.getShellState();
    assert.equal(s.layoutMode, "compact");
    assert.equal(s.forceTouchTargets, true);
    assert.equal(s.touchSelectionMode, true);
    assert.doesNotThrow(() => shell.setRailWidth(300));
  });

  it("setTheme nao lanca e grava o estado", async () => {
    const shell = await freshShell();
    assert.doesNotThrow(() => shell.setTheme("light"));
    assert.equal(shell.getShellState().theme, "light");
  });

  it("o gesto de toque longo abre o menu em estado puro, sem janela fantasma", async (t) => {
    longPress.resetLongPressForTest();
    const shell = await freshShell();
    const bundle = shell.longPressMenu("No", () => [{ label: "A", onSelect: () => {} }]);
    t.mock.timers.enable({ apis: ["setTimeout"] });
    bundle.onPointerDown({ pointerId: 7, pointerType: "touch", clientX: 30, clientY: 40 });
    t.mock.timers.tick(501);
    const menu = shell.getShellState().contextMenu;
    assert.ok(menu, "o menu abriu sem DOM nenhum");
    assert.equal(menu.label, "No");
    assert.deepEqual({ x: menu.x, y: menu.y }, { x: 30, y: 40 });
    assert.doesNotThrow(() => longPress.resetLongPressForTest());
  });
});
