/**
 * REBASE no toque — caminho do menu (ConfirmHost), o unico alcancavel no
 * layout compacto (o arrasto branch->branch morre no roubo de gesto do
 * navegador; gap documentado no handoff).
 *
 * O item do menu rebase a branch ATUAL em cima da branch do menu
 * (menu.branch.rebaseOnto -> openRebaseOnto, actions.ts:361-383). Entao:
 *
 *   1. main avanca ANTES do rebase (merge --no-ff de feature/ui) — sem
 *      divergencia o rebase de experimento/squash sobre main e no-op
 *      ("Current branch is up to date", hashes intactos);
 *   2. checkout de experimento/squash (rail "⋯" -> "Checkout");
 *   3. rail "⋯" de main -> "Rebasear experimento/squash sobre esta" ->
 *      ConfirmHost DESTRUTIVO -> hold-to-confirm 1.4s (ConfirmHost.tsx:265-277)
 *      -> toast "experimento/squash rebaseada sobre main";
 *   4. git CLI: hashes dos 3 wips mudaram; arvore final = main avancada +
 *      exp.txt; main intocada.
 */
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

import { PORTS } from "../../playwright.config.ts";
import { makeFixture } from "../../harness/fixture.ts";
import { startAppServer, type RunningServer } from "../../harness/servers.ts";
import { tapBySelector } from "../../harness/touch.ts";
import { openApp, waitForGraph } from "../../harness/ui.ts";
import { holdTouch, railBranchMenu, waitForOperationSettle } from "./helpers.ts";

let fixture: string;
let server: RunningServer;

test.beforeAll(async () => {
  fixture = await makeFixture();
  server = await startAppServer(fixture, PORTS.touch);
});

test.afterAll(async () => {
  await server?.stop();
});

test("rebase no toque: divergencia + checkout + rebase com hold 1.4s -> hashes reescritos", async ({ page }) => {
  await openApp(page);
  await waitForGraph(page);

  // ---- 0) divergencia: main avanca com merge --no-ff de feature/ui --------
  let trigger = await railBranchMenu(page, "feature/ui");
  await tapBySelector(page, trigger);
  await tapBySelector(page, page.getByRole("menuitem", { name: "Mesclar em main", exact: true }));
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await tapBySelector(page, dialog.getByText("--no-ff", { exact: true }).first());
  await page.waitForTimeout(150);
  await tapBySelector(page, dialog.getByRole("button", { name: "Merge", exact: true }));
  await expect(page.getByText("feature/ui mesclado em main", { exact: true })).toBeVisible({ timeout: 15_000 });
  await waitForOperationSettle(page);

  // ---- 1) estado antes do rebase ------------------------------------------
  const mainBefore = execFileSync("git", ["-C", fixture, "rev-parse", "main"], { encoding: "utf8" }).trim();
  const squashBefore = execFileSync("git", ["-C", fixture, "rev-parse", "experimento/squash"], {
    encoding: "utf8",
  }).trim();
  const wipsBefore = execFileSync("git", ["-C", fixture, "log", "--format=%s", "main..experimento/squash"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);

  // ---- 2) checkout de experimento/squash pelo rail ------------------------
  trigger = await railBranchMenu(page, "experimento/squash");
  await tapBySelector(page, trigger);
  await tapBySelector(page, page.getByRole("menuitem", { name: "Checkout", exact: true }));
  await expect(page.getByText("Em experimento/squash", { exact: true })).toBeVisible({ timeout: 15_000 });
  await waitForOperationSettle(page);

  // ---- 3) rebase da branch atual sobre main, com hold-to-confirm ----------
  trigger = await railBranchMenu(page, "main");
  await tapBySelector(page, trigger);
  const rebaseItem = page.getByRole("menuitem", { name: "Rebasear experimento/squash sobre esta", exact: true });
  await expect(rebaseItem).toBeVisible({ timeout: 5_000 });
  await tapBySelector(page, rebaseItem);

  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(dialog.getByText("Rebase de experimento/squash sobre main", { exact: true })).toBeVisible();

  // ConfirmHost destrutivo: hold de 1.4 s (ConfirmHost.tsx:265-277).
  const holdButton = dialog.getByRole("button", { name: "Segure para rebase", exact: true });
  await expect(holdButton).toBeVisible();
  await holdTouch(page, holdButton, 1_600);
  await expect(page.getByText("experimento/squash rebaseada sobre main", { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  // ---- 4) git CLI: hashes mudaram, ordem final correta, main intocada -----
  const mainAfter = execFileSync("git", ["-C", fixture, "rev-parse", "main"], { encoding: "utf8" }).trim();
  expect(mainAfter).toBe(mainBefore); // o alvo nao e reescrito

  const squashAfter = execFileSync("git", ["-C", fixture, "rev-parse", "experimento/squash"], {
    encoding: "utf8",
  }).trim();
  expect(squashAfter).not.toBe(squashBefore);

  const wipsAfter = execFileSync("git", ["-C", fixture, "log", "--format=%s", "main..experimento/squash"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  expect(wipsAfter).toEqual(wipsBefore); // mesmos 3 wips, reescritos
  expect(wipsAfter).toHaveLength(3);

  const newWipHashes = execFileSync("git", ["-C", fixture, "log", "--format=%H", "main..experimento/squash"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  // Os 3 hashes novos nao existiam na branch antes do rebase (reflog do
  // checkout anterior guarda o tip antigo).
  const oldLog = execFileSync("git", ["-C", fixture, "log", "--format=%H", "experimento/squash@{1}"], {
    encoding: "utf8",
  });
  for (const h of newWipHashes) {
    expect(oldLog).not.toContain(h);
  }

  // Arvore final: ui.txt (da main avancada) + exp.txt (dos wips reescritos).
  const uiTxt = execFileSync("git", ["-C", fixture, "show", "experimento/squash:ui.txt"], { encoding: "utf8" });
  expect(uiTxt).toContain("botao");
  const expTxt = execFileSync("git", ["-C", fixture, "show", "experimento/squash:exp.txt"], { encoding: "utf8" });
  expect(expTxt.split("\n").filter(Boolean)).toEqual(["a", "b", "c"]);
});
