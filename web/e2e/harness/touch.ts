/**
 * Emulacao de TOQUE REAL via CDP (`Input.dispatchTouchEvent`). Mouse NAO e
 * usado aqui — os handlers do app distinguem eventos de ponteiro por tipo, e
 * os gestos (long-press para menu de contexto, hold-to-confirm, drag mobile,
 * auto-scroll) so exercitam o caminho de toque com eventos touch de verdade.
 *
 * Premissa de uso: rodar apenas no projeto `touch` (hasTouch: true,
 * isMobile: true no config). O `dispatchTouchEvent` exige a emulacao de toque
 * ativa no contexto — o Playwright a liga junto com `hasTouch`.
 */
import type { CDPSession, Locator, Page } from "@playwright/test";

export interface Point {
  x: number;
  y: number;
}

interface TouchPoint {
  x: number;
  y: number;
  /** 0 = polegar: sem raio nem pressao para nao confundir hit-testing. */
  radiusX?: number;
  radiusY?: number;
  force?: number;
  id?: number;
}

/** Sessoes CDP por pagina (criar uma por gesto e caro e ruidoso). */
const sessions = new WeakMap<Page, CDPSession>();

async function cdp(page: Page): Promise<CDPSession> {
  const held = sessions.get(page);
  if (held) return held;
  const session = await page.context().newCDPSession(page);
  sessions.set(page, session);
  return session;
}

async function dispatch(page: Page, type: "touchStart" | "touchMove" | "touchEnd", points: TouchPoint[]) {
  await (await cdp(page)).send("Input.dispatchTouchEvent", { type, touchPoints: points });
}

/** Toque simples: touchStart + touchEnd no mesmo ponto. */
export async function tap(page: Page, x: number, y: number): Promise<void> {
  await dispatch(page, "touchStart", [{ x, y }]);
  await dispatch(page, "touchEnd", []);
}

/** Toque longo (long-press) — menu de contexto no toque e hold-to-confirm. */
export async function longPress(page: Page, x: number, y: number, ms = 600): Promise<void> {
  await dispatch(page, "touchStart", [{ x, y }]);
  await page.waitForTimeout(ms);
  await dispatch(page, "touchEnd", []);
}

/**
 * Arraste: touchStart em `from`, REPOUSO de 300 ms, N touchMove interpolados
 * ate `to`, touchEnd.
 *
 * O repouso NAO e enfeite — e o contrato do sensor real. Para ponteiro coarse
 * o app usa `TouchSensor` com `{ delay: 250, tolerance: 5 }`
 * (`web/src/dnd/GitDndProvider.tsx:232`; `web/src/dnd/sensors.ts:56-59`,
 * `DND_DELAY_MS`/`DND_TOLERANCE_PX`): o arraste so
 * acorda por TEMPO DE REPOUSO, e qualquer deslocamento maior que 5 px
 * acumulados DENTRO da janela de 250 ms CANCELA a ativacao (dnd-kit 6.3.1,
 * `handleMove` -> `handleCancel`). Mover cedo e rapido (como o gesto antigo
 * fazia, terminando antes dos 250 ms) matava o drag no primeiro move.
 * (NAO e `PointerSensor` para o dedo: com ele o pan do `touch-action: auto`
 * matava o drag com `pointercancel` mesmo apos a ativacao; o `TouchSensor`
 * trava o pan com o `touchmove` nao-passivo SO depois dos 250 ms — swipe
 * rapido passa dos 5 px e a lista rola.)
 * 300 ms = 250 ms do delay + ~50 ms de folga para o timer do dnd-kit
 * disparar e a ativacao se completar; so depois disso os moves passam a mover
 * o arrasto ativo. O passo pequeno (default 12) e o intervalo (~15 ms) dao ao
 * dnd-kit os eventos progressivos que ele espera — um teleporte unico nao
 * move drag em lugar nenhum.
 */
export async function touchDrag(
  page: Page,
  from: Point,
  to: Point,
  steps = 12,
): Promise<void> {
  await dispatch(page, "touchStart", [{ x: from.x, y: from.y }]);
  // Repouso sem moves: o dedo PARADO acorda o arraste aos 250 ms.
  await page.waitForTimeout(300);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await dispatch(page, "touchMove", [
      { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t },
    ]);
    await page.waitForTimeout(15);
  }
  await page.waitForTimeout(40);
  await dispatch(page, "touchEnd", []);
}

/** Toque no CENTRO de um elemento (por selector Playwright). */
export async function tapBySelector(page: Page, locator: Locator): Promise<void> {
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`sem boundingBox para tocar: ${locator}`);
  await tap(page, box.x + box.width / 2, box.y + box.height / 2);
}
