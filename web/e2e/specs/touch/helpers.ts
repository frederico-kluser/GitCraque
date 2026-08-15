/**
 * Helpers locais das specs de TOQUE — alem do harness (intocavel).
 *
 * O gesto proprio de HOLD existe porque o `hold-to-confirm` do app responde a
 * `pointerdown`/`pointerup` (web/src/components/motion-ui/hold-to-confirm/
 * index.tsx:136-142) e o CDP `Input.dispatchTouchEvent` entrega pointer events
 * com `pointerType: "touch"` (validado empiricamente).
 *
 * NAO ha drag aqui: o arrasto por toque neste app morre no roubo de gesto do
 * navegador (`pointercancel` quando o dedo cruza o touch-slop; o app nao seta
 * `touch-action` nos nos de dnd — theme.css:389-399 — e o Chromium cancela o
 * pointer a ~11px de movimento). Portas alcancaveis no toque: menus "⋯"
 * (ActionMenu) e dialogos de confirmacao. Gap documentado no handoff.
 */
import type { Locator, Page } from "@playwright/test";
import { tapBySelector } from "../../harness/touch.ts";

/** Ponto central de um elemento visivel. */
export async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`sem boundingBox: ${locator}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Hold-to-confirm por toque: touchStart no centro, espera `ms`, touchEnd.
 * Dedo PARADO (movimento cancelaria: o browser roubaria o gesto).
 */
export async function holdTouch(page: Page, locator: Locator, ms: number): Promise<void> {
  const p = await centerOf(locator);
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
  await page.waitForTimeout(ms);
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** Garante o painel do rail visivel (aba "Repo" da MobileNav) e devolve o
 *  gatilho "⋯" da branch (aria-label `Ações da branch {name}`).
 *
 * `exact: true` e obrigatorio: a propria linha da branch e um `role="button"`
 * cujo nome acessivel CONTEM o rotulo do gatilho (concatenacao do texto).
 *
 * `scrollIntoViewIfNeeded` e obrigatorio tambem: apos um refresh (ex.: merge),
 * o container do rail rola sozinho (foco/render) e o gatilho pode parar sob a
 * toolbar com o centro em y<40 — um tap ai acertaria o "⋯" da toolbar. */
export async function railBranchMenu(page: Page, name: string): Promise<Locator> {
  const trigger = page.getByRole("button", { name: `Ações da branch ${name}`, exact: true });
  if (!(await trigger.isVisible().catch(() => false))) {
    const repoTab = page.getByRole("button", { name: "Repo", exact: true });
    await tapBySelector(page, repoTab);
    await trigger.waitFor({ state: "visible", timeout: 5_000 });
  }
  await trigger.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  return trigger;
}

/**
 * Espera a operacao em curso (com o refresh que a segue) terminar: a barra de
 * progresso da toolbar (role=progressbar) so some quando o `runOperation`
 * inteiro — toast + refreshAll — conclui. Sem isto o rail re-renderiza no meio
 * de um tap e o gatilho muda de lugar entre a medicao do box e o toque.
 */
export async function waitForOperationSettle(page: Page, timeout = 15_000): Promise<void> {
  const bar = page.getByRole("progressbar");
  if (await bar.isVisible().catch(() => false)) {
    await bar.waitFor({ state: "hidden", timeout });
  }
  await page.waitForTimeout(300);
}

/** Abre o menu "⋯" da toolbar compacta (estouro). */
export function overflowMenu(page: Page): Locator {
  return page.getByRole("button", { name: "Abrir as demais ações da barra" });
}

/** Abre o painel de alteracoes pela toolbar (gaveta tela cheia no compacto). */
export function changesButton(page: Page): Locator {
  return page.getByRole("button", { name: "Abrir alterações e commitar" });
}
