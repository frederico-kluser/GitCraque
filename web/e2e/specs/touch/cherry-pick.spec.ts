/**
 * CHERRY-PICK no toque — caminho REAL da UI por drag, variante OFF-HEAD.
 *
 * DECISAO DE ESCOPO (onda 3): o drag-cherry-pick.spec.ts cobre o fluxo
 * principal (commit -> main, o ramo atual). Este spec cobre a variante que
 * exerce codigo DISTINTO do app: o drop em uma branch que NAO e o HEAD.
 * Nesse caso o IntentDialog mostra a descricao off-head (intents.ts:
 * intent.cherryPick.offHead — "o backend faz o checkout antes"), o servidor
 * faz `git checkout experimento/squash` antes do cherry-pick
 * (server/src/git/ops.mjs) e o HEAD do app migra para a branch alvo. As
 * assercoes sao as mesmas em forma, mas sobre a branch alvo e com o HEAD
 * movido — nada do fluxo on-head e duplicado.
 *
 * O replan degradado da onda 2 (cherry-pick feito via git CLI no fixture e a
 * UI apenas refletindo) foi REVOGADO: ele existia porque o arrasto por toque
 * morria no pointercancel do navegador — bug corrigido em 754cae3e (TouchSensor
 * para ponteiro coarse). O drag commit->branch e a unica porta de
 * cherry-pick do layout compacto: o menu de contexto do commit nao existe no
 * toque (bundle gated por buildCommitMenu, que o App nunca passa).
 *
 * Commit alvo: "feat(ui): botao primario" (tip de feature/ui) — nao esta em
 * experimento/squash nem em main, e ui.txt e arquivo novo: apply limpo.
 *
 * Verificacao git: experimento/squash avanca EXATAMENTE 1 commit com o
 * subject do aplicado; main e feature/ui intocadas; HEAD do app em
 * experimento/squash (grafo: chip HEAD na linha da copia).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

import { PORTS } from "../../playwright.config.ts";
import { makeFixture } from "../../harness/fixture.ts";
import { startAppServer, type RunningServer } from "../../harness/servers.ts";
import { tapBySelector, touchDrag } from "../../harness/touch.ts";
import { branchChip, graphCommitRow, openApp, waitForGraph } from "../../harness/ui.ts";
import { centerOf } from "./helpers.ts";

/**
 * Tap com espera de ESTABILIDADE: espera o bounding box do alvo parar de se
 * mover antes de medir e tocar. A entrada do bottom sheet anima y/scale
 * (web/src/dialogs/parts.tsx:143) e um tap medido no meio da animacao
 * erraria o alvo (flake observado no drag-merge). Teto de ~2.4 s.
 */
async function tapStable(page: Page, locator: Locator): Promise<void> {
  await locator.waitFor({ state: "visible" });
  let prev = await locator.boundingBox();
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(120);
    const box = await locator.boundingBox();
    if (
      box &&
      prev &&
      Math.abs(box.x - prev.x) < 1 &&
      Math.abs(box.y - prev.y) < 1 &&
      Math.abs(box.width - prev.width) < 1 &&
      Math.abs(box.height - prev.height) < 1
    ) {
      break;
    }
    prev = box;
  }
  await tapBySelector(page, locator);
}

/** Subject do commit que o spec aplica em experimento/squash (a copia dele). */
const SUBJECT = "feat(ui): botao primario";

let fixture: string;
let server: RunningServer;

test.beforeAll(async () => {
  fixture = await makeFixture();
  server = await startAppServer(fixture, PORTS.touch);
});

test.afterAll(async () => {
  await server?.stop();
});

test("cherry-pick off-head por drag: linha do commit -> chip experimento/squash -> checkout + copia", async ({ page }) => {
  await openApp(page);
  await waitForGraph(page);

  // Estado antes.
  const squashBefore = execFileSync("git", ["-C", fixture, "rev-parse", "experimento/squash"], {
    encoding: "utf8",
  }).trim();
  const countBefore = Number(
    execFileSync("git", ["-C", fixture, "rev-list", "--count", "experimento/squash"], { encoding: "utf8" }).trim(),
  );
  const mainBefore = execFileSync("git", ["-C", fixture, "rev-parse", "main"], { encoding: "utf8" }).trim();
  const uiBefore = execFileSync("git", ["-C", fixture, "rev-parse", "feature/ui"], { encoding: "utf8" }).trim();

  // 1) o gesto: toque no TEXTO do subject (origem = commit, nao a branch) e
  //    arrastar ate o chip de experimento/squash (alvo = branch NAO atual).
  const row = graphCommitRow(page, SUBJECT).first();
  const subjectText = row.getByText(SUBJECT, { exact: true }).first();
  const squashChip = branchChip(page, "experimento/squash");
  await expect(subjectText).toBeVisible();
  await expect(squashChip).toBeVisible();
  await touchDrag(page, await centerOf(subjectText), await centerOf(squashChip));

  // 2) IntentDialog: descricao OFF-HEAD (o backend faz o checkout antes).
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(dialog.getByText("Cherry-pick em experimento/squash", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText(/não é o ramo atual/).first()).toBeVisible();
  const pickButton = dialog.getByRole("button", { name: "Cherry-pick em experimento/squash", exact: true });
  await expect(pickButton).toBeVisible();
  await tapStable(page, pickButton);

  // 3) toast do caminho de drag (exec.cherryPick.done).
  await expect(page.getByText("Cherry-pick aplicado", { exact: true })).toBeVisible({ timeout: 15_000 });

  // 4) git CLI: EXATAMENTE 1 commit novo em experimento/squash; main e
  //    feature/ui intocadas.
  const squashAfter = execFileSync("git", ["-C", fixture, "rev-parse", "experimento/squash"], {
    encoding: "utf8",
  }).trim();
  expect(squashAfter).not.toBe(squashBefore);

  const tipSubject = execFileSync("git", ["-C", fixture, "log", "-1", "--pretty=%s", "experimento/squash"], {
    encoding: "utf8",
  }).trim();
  expect(tipSubject).toBe(SUBJECT);

  const countAfter = Number(
    execFileSync("git", ["-C", fixture, "rev-list", "--count", "experimento/squash"], { encoding: "utf8" }).trim(),
  );
  expect(countAfter).toBe(countBefore + 1);

  expect(
    execFileSync("git", ["-C", fixture, "rev-parse", "main"], { encoding: "utf8" }).trim(),
  ).toBe(mainBefore);
  expect(
    execFileSync("git", ["-C", fixture, "rev-parse", "feature/ui"], { encoding: "utf8" }).trim(),
  ).toBe(uiBefore);

  // 5) UI: o checkout moveu o HEAD do app — a linha da copia (tip de
  //    experimento/squash) carrega o chip HEAD e o original segue no grafo.
  await expect(graphCommitRow(page, SUBJECT).first()).toContainText("HEAD", { timeout: 15_000 });
  await expect(page.locator('[role="rowgroup"] [role="row"]', { hasText: SUBJECT })).toHaveCount(2);
});
