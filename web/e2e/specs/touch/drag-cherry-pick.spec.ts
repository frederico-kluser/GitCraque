/**
 * DRAG-CHERRY-PICK no toque — a unica porta de cherry-pick do layout
 * compacto (o menu de contexto do commit nao existe no toque: o bundle de
 * toque longo da linha e gated por `buildCommitMenu`, que o App nunca passa —
 * CommitRow.tsx:285-298). O caminho real: arrastar a LINHA do commit (nao o
 * chip — o chip abriria o menu/arrasto da branch; o stopPropagation do chip
 * e o que separa as duas origens) e soltar sobre o CHIP da branch alvo.
 * commit->branch = cherry-pick, opcao unica NAO destrutiva
 * (intents.ts:232-276) — confirmacao por clique, sem hold.
 *
 * Commit alvo: "feat(ui): botao primario" (tip de feature/ui) — NAO esta em
 * main no baseline (feature/ui saiu do tip de main e nunca foi integrada) e
 * aplica limpo (ui.txt e arquivo novo). Nao usar "feat(auth): valida token":
 * ele ja e ancestral de main (merge --no-ff de feature/auth) e o cherry-pick
 * geraria CONFLITO add/add em auth.txt.
 *
 * Verificacao git: main avanca EXATAMENTE 1 commit com o subject do aplicado;
 * feature/ui intocada; o subject passa a existir 2x no repositorio.
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

/** Subject do commit que o spec aplica em main (a copia dele). */
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

test("drag-cherry-pick: linha do commit -> chip main -> clique -> 1 commit novo em main", async ({ page }) => {
  await openApp(page);
  await waitForGraph(page);

  // Estado antes.
  const mainBefore = execFileSync("git", ["-C", fixture, "rev-parse", "main"], { encoding: "utf8" }).trim();
  const uiBefore = execFileSync("git", ["-C", fixture, "rev-parse", "feature/ui"], { encoding: "utf8" }).trim();
  const countBefore = Number(
    execFileSync("git", ["-C", fixture, "rev-list", "--count", "main"], { encoding: "utf8" }).trim(),
  );

  // 1) o gesto: toque no TEXTO do subject (a linha, nao o chip da branch) e
  //    arrastar ate o chip de main. O ponto no subject garante origem = commit.
  const row = graphCommitRow(page, SUBJECT).first();
  const subjectText = row.getByText(SUBJECT, { exact: true }).first();
  const mainChip = branchChip(page, "main");
  await expect(subjectText).toBeVisible();
  await expect(mainChip).toBeVisible();
  await touchDrag(page, await centerOf(subjectText), await centerOf(mainChip));

  // 2) IntentDialog: titulo + botao da opcao unica (mesmo label, nao destrutivo).
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(dialog.getByText("Cherry-pick em main", { exact: true }).first()).toBeVisible();
  const pickButton = dialog.getByRole("button", { name: "Cherry-pick em main", exact: true });
  await expect(pickButton).toBeVisible();
  await tapStable(page, pickButton);

  // 3) toast do caminho de drag (exec.cherryPick.done).
  await expect(page.getByText("Cherry-pick aplicado", { exact: true })).toBeVisible({ timeout: 15_000 });

  // 4) git CLI: subject no tip de main; EXATAMENTE 1 commit novo; origem intacta.
  const mainAfter = execFileSync("git", ["-C", fixture, "rev-parse", "main"], { encoding: "utf8" }).trim();
  expect(mainAfter).not.toBe(mainBefore);

  const tipSubject = execFileSync("git", ["-C", fixture, "log", "-1", "--pretty=%s", "main"], {
    encoding: "utf8",
  }).trim();
  expect(tipSubject).toBe(SUBJECT);

  const countAfter = Number(
    execFileSync("git", ["-C", fixture, "rev-list", "--count", "main"], { encoding: "utf8" }).trim(),
  );
  expect(countAfter).toBe(countBefore + 1);

  const uiAfter = execFileSync("git", ["-C", fixture, "rev-parse", "feature/ui"], { encoding: "utf8" }).trim();
  expect(uiAfter).toBe(uiBefore);

  const subjects = execFileSync("git", ["-C", fixture, "log", "--all", "--pretty=%s"], { encoding: "utf8" });
  expect(subjects.split("\n").filter((s) => s === SUBJECT)).toHaveLength(2);

  // 5) UI: a copia vira o tip de main (HEAD na linha do subject aplicado) e o
  //    original de feature/ui segue no grafo — 2 linhas com o mesmo subject.
  await expect(graphCommitRow(page, SUBJECT).first()).toContainText("HEAD", { timeout: 15_000 });
  await expect(page.locator('[role="rowgroup"] [role="row"]', { hasText: SUBJECT })).toHaveCount(2);
});
