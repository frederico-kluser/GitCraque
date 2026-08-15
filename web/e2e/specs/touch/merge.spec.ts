/**
 * MERGE no toque — porta do MENU: o "⋯" da branch no rail ("Ações da branch
 * {name}", web/src/panels/RailPanels.tsx:363) -> "Mesclar em {branch}"
 * (menu.branch.mergeInto) -> ConfirmHost.
 *
 * A porta do DRAG (chip da branch sobre o chip alvo -> IntentDialog) vive em
 * drag-merge.spec.ts.
 *
 * Divergencia: sem ela o merge de feature/ui em main seria FAST-FORWARD (0
 * commits de distancia), sem commit de merge novo. O dialogo do merge oferece
 * o toggle "--no-ff" — tap nele e o `git merge --no-ff --no-edit feature/ui`
 * cria o merge commit com 2 pais que o spec verifica.
 *
 * Verificacao git: `git log --merges -1` = novo merge com 2 pais.
 */
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

import { PORTS } from "../../playwright.config.ts";
import { makeFixture } from "../../harness/fixture.ts";
import { startAppServer, type RunningServer } from "../../harness/servers.ts";
import { tapBySelector } from "../../harness/touch.ts";
import { openApp, waitForGraph } from "../../harness/ui.ts";
import { railBranchMenu } from "./helpers.ts";

let fixture: string;
let server: RunningServer;

test.beforeAll(async () => {
  fixture = await makeFixture();
  server = await startAppServer(fixture, PORTS.touch);
});

test.afterAll(async () => {
  await server?.stop();
});

test("merge no toque: rail ⋯ de feature/ui -> Mesclar em main (--no-ff) -> merge commit com 2 pais", async ({ page }) => {
  await openApp(page);
  await waitForGraph(page);

  // Quantos merge commits existem antes.
  const mergesBefore = execFileSync("git", ["-C", fixture, "rev-list", "--merges", "--count", "main"], {
    encoding: "utf8",
  }).trim();

  // 1) rail -> "⋯" de feature/ui -> "Mesclar em main"
  const trigger = await railBranchMenu(page, "feature/ui");
  await tapBySelector(page, trigger);
  const item = page.getByRole("menuitem", { name: "Mesclar em main", exact: true });
  await expect(item).toBeVisible({ timeout: 5_000 });
  await tapBySelector(page, item);

  // 2) ConfirmHost: titulo, toggle --no-ff, botao Merge
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(dialog.getByText("Merge de feature/ui em main", { exact: true })).toBeVisible();

  const noFf = dialog.getByText("--no-ff", { exact: true }).first();
  await tapBySelector(page, noFf);
  await page.waitForTimeout(150);

  const confirm = dialog.getByRole("button", { name: "Merge", exact: true });
  await tapBySelector(page, confirm);

  // 3) toast de sucesso (porta do menu: action.merge.done)
  await expect(page.getByText("feature/ui mesclado em main", { exact: true })).toBeVisible({ timeout: 15_000 });

  // 4) git CLI: merge commit NOVO com 2 pais
  const mergesAfter = execFileSync("git", ["-C", fixture, "rev-list", "--merges", "--count", "main"], {
    encoding: "utf8",
  }).trim();
  expect(Number(mergesAfter)).toBe(Number(mergesBefore) + 1);

  const tipParents = execFileSync("git", ["-C", fixture, "log", "-1", "--pretty=%P", "main"], {
    encoding: "utf8",
  }).trim().split(/\s+/).filter(Boolean);
  expect(tipParents).toHaveLength(2);

  const tipSubject = execFileSync("git", ["-C", fixture, "log", "-1", "--pretty=%s", "main"], {
    encoding: "utf8",
  }).trim();
  expect(tipSubject).toBe("Merge branch 'feature/ui'");

  // O pai "estranho" do merge e o tip antigo de feature/ui.
  const uiTip = execFileSync("git", ["-C", fixture, "rev-parse", "feature/ui"], { encoding: "utf8" }).trim();
  expect(tipParents).toContain(uiTip);
});
