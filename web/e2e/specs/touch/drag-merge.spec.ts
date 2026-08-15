/**
 * DRAG-MERGE no toque — Porta A do mapa (motor de intencoes), o gesto
 * principal do app: arrastar o CHIP da branch de origem sobre o chip da
 * branch alvo (toque parado 250 ms acorda o arrasto — TouchSensor de ponteiro
 * coarse, web/src/dnd/sensors.ts; o chip escala 1.5x durante o arrasto,
 * RefChip.tsx) e o IntentDialog decide a operacao pelo par
 * (branch->branch = merge + rebase; web/src/dnd/intents.ts:318-387).
 *
 * O drag de feature/ui -> main precisa de DIVERGENCIA: sem ela, main e o pai
 * direto do tip de feature/ui e `git merge feature/ui` seria FAST-FORWARD, sem
 * commit de merge novo. O fixture nasce com main == feature/ui^ (feature/ui
 * saiu do tip atual de main), entao o spec avanca main com UM commit de
 * divergencia via git CLI ANTES de abrir o app. O drag entao produz o merge
 * commit de verdade, com 2 pais, e feature/ui vira ancestral de main.
 *
 * Nota: a opcao rebase do IntentDialog NAO aparece neste par — feature/ui
 * esta checada na worktree extra do fixture (<dest>-wt) e o motor filtra o
 * rebase de branch presa em outra worktree (intents.ts:366-371).
 *
 * Verificacao git: `git rev-list --merges --count main` sobe de 1 para 2; o
 * tip novo tem 2 pais (o tip avancado de main e o tip de feature/ui); subject
 * "Merge branch 'feature/ui'" (git merge --no-edit); `merge-base
 * --is-ancestor feature/ui main` passa.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { PORTS } from "../../playwright.config.ts";
import { makeFixture } from "../../harness/fixture.ts";
import { startAppServer, type RunningServer } from "../../harness/servers.ts";
import { tapBySelector, touchDrag } from "../../harness/touch.ts";
import { branchChip, graphCommitRow, openApp, waitForGraph } from "../../harness/ui.ts";
import { centerOf } from "./helpers.ts";

/**
 * Tap com espera de ESTABILIDADE: espera o bounding box do alvo parar de se
 * mover antes de medir e tocar. A entrada do bottom sheet anima y/scale
 * (web/src/dialogs/parts.tsx:143 — `initial { scale: 0.97, y }`) e um tap
 * medido no meio da animacao erraria o alvo (flake observado aqui). Teto de
 * ~2.4 s; sem estabilidade, tapa mesmo assim.
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

const DIVERGENCE_SUBJECT = "chore: base avancada para merge";

let fixture: string;
let server: RunningServer;

test.beforeAll(async () => {
  fixture = await makeFixture();

  // Divergencia: main avanca 1 commit (feature/ui continua no tip antigo).
  fs.writeFileSync(path.join(fixture, "base.txt"), "divergencia\n");
  execFileSync("git", ["-C", fixture, "add", "base.txt"], { encoding: "utf8" });
  execFileSync("git", ["-C", fixture, "commit", "-q", "-m", DIVERGENCE_SUBJECT], { encoding: "utf8" });

  server = await startAppServer(fixture, PORTS.touch);
});

test.afterAll(async () => {
  await server?.stop();
});

test("drag-merge: chip feature/ui -> chip main -> IntentDialog -> Merge -> merge commit com 2 pais", async ({ page }) => {
  await openApp(page);
  await waitForGraph(page);

  // Quantos merge commits existem antes (baseline: 1 — o de feature/auth).
  const mergesBefore = execFileSync("git", ["-C", fixture, "rev-list", "--merges", "--count", "main"], {
    encoding: "utf8",
  }).trim();

  // 1) o gesto: repouso 300 ms no chip de feature/ui e arrastar ate o chip de main.
  const uiChip = branchChip(page, "feature/ui");
  const mainChip = branchChip(page, "main");
  await expect(uiChip).toBeVisible();
  await expect(mainChip).toBeVisible();
  await touchDrag(page, await centerOf(uiChip), await centerOf(mainChip));

  // 2) IntentDialog: titulo do par e a opcao unica de merge (o rebase foi
  //    filtrado — feature/ui presa na worktree do fixture).
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(dialog.getByText("feature/ui para main", { exact: true })).toBeVisible();
  const mergeButton = dialog.getByRole("button", { name: "Merge de feature/ui em main", exact: true });
  await expect(mergeButton).toBeVisible();

  // 3) merge NAO e destrutivo: confirmacao por clique.
  await tapStable(page, mergeButton);

  // 4) toast do caminho de drag (exec.merge.done — distinto do toast do menu).
  await expect(page.getByText("Merge concluído", { exact: true })).toBeVisible({ timeout: 15_000 });

  // 5) git CLI: merge commit NOVO com 2 pais; feature/ui ancestral de main.
  const mergesAfter = execFileSync("git", ["-C", fixture, "rev-list", "--merges", "--count", "main"], {
    encoding: "utf8",
  }).trim();
  expect(Number(mergesAfter)).toBe(Number(mergesBefore) + 1);

  const tipParents = execFileSync("git", ["-C", fixture, "log", "-1", "--pretty=%P", "main"], {
    encoding: "utf8",
  })
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  expect(tipParents).toHaveLength(2);

  const tipSubject = execFileSync("git", ["-C", fixture, "log", "-1", "--pretty=%s", "main"], {
    encoding: "utf8",
  }).trim();
  expect(tipSubject).toBe("Merge branch 'feature/ui'");

  // O pai "estranho" e o tip de feature/ui (o outro e o main avancado).
  const uiTip = execFileSync("git", ["-C", fixture, "rev-parse", "feature/ui"], { encoding: "utf8" }).trim();
  expect(tipParents).toContain(uiTip);

  let ancestor = true;
  try {
    execFileSync("git", ["-C", fixture, "merge-base", "--is-ancestor", "feature/ui", "main"], {
      encoding: "utf8",
    });
  } catch {
    ancestor = false;
  }
  expect(ancestor).toBe(true);

  // 6) UI: a linha do merge commit aparece no grafo apos o refresh.
  await expect(graphCommitRow(page, "Merge branch 'feature/ui'").first()).toBeVisible({ timeout: 15_000 });
});
