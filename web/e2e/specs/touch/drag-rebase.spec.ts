/**
 * DRAG-REBASE no toque — o caminho DESTRUTIVO do motor de intencoes:
 * arrastar o chip de experimento/squash sobre o chip de main abre o
 * IntentDialog com as DUAS opcoes (merge nao destrutivo + rebase com badge
 * "reescreve historico"); a opcao rebase exige hold-to-confirm de 2 s
 * (HoldToConfirmButton, holdSeconds default 2; web/src/dialogs/IntentDialog.tsx).
 *
 * O rebase do drag e `git rebase <alvo> <arrastado>` = `git rebase main
 * experimento/squash` — o ARRASTADO e reescrito (intents.ts:356-369;
 * server/src/git/ops.mjs com --autostash). A branch alvo main nao muda.
 *
 * Divergencia necessaria: com main == base de experimento/squash o rebase
 * seria no-op ("up to date", hashes intactos). O spec avanca main com UM
 * commit via git CLI antes de abrir o app — os 3 wips sao reaplicados em cima
 * dele e ganham hashes novos (reflog guarda o tip antigo em
 * experimento/squash@{1}).
 *
 * Verificacao git: rev-parse de main intocada; tip de experimento/squash
 * mudou; mesmos 3 subjects reescritos; hashes novos fora do log do tip antigo
 * (reflog); arvore final = main avancada (base.txt) + exp.txt a/b/c.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { PORTS } from "../../playwright.config.ts";
import { makeFixture } from "../../harness/fixture.ts";
import { startAppServer, type RunningServer } from "../../harness/servers.ts";
import { touchDrag } from "../../harness/touch.ts";
import { branchChip, graphCommitRow, openApp, waitForGraph } from "../../harness/ui.ts";
import { centerOf, holdTouch } from "./helpers.ts";

/**
 * Espera o bounding box do alvo parar de se mover: a entrada do bottom sheet
 * anima y/scale (web/src/dialogs/parts.tsx:143) e um hold medido no meio da
 * animacao erraria o alvo (mesmo flake do tap no drag-merge). Teto de ~2.4 s.
 */
async function settleDialog(page: Page, locator: Locator): Promise<void> {
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
}

const DIVERGENCE_SUBJECT = "chore: base avancada para rebase";

let fixture: string;
let server: RunningServer;

test.beforeAll(async () => {
  fixture = await makeFixture();

  // Divergencia: main avanca 1 commit para o rebase ter o que reescrever.
  fs.writeFileSync(path.join(fixture, "base.txt"), "divergencia\n");
  execFileSync("git", ["-C", fixture, "add", "base.txt"], { encoding: "utf8" });
  execFileSync("git", ["-C", fixture, "commit", "-q", "-m", DIVERGENCE_SUBJECT], { encoding: "utf8" });

  server = await startAppServer(fixture, PORTS.touch);
});

test.afterAll(async () => {
  await server?.stop();
});

test("drag-rebase: chip experimento/squash -> chip main -> hold 2s no rebase -> hashes reescritos", async ({ page }) => {
  await openApp(page);
  await waitForGraph(page);

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
  expect(wipsBefore).toHaveLength(3);

  // ---- 2) o gesto: chip de experimento/squash arrastado ate o chip de main -
  const squashChip = branchChip(page, "experimento/squash");
  const mainChip = branchChip(page, "main");
  await expect(squashChip).toBeVisible();
  await expect(mainChip).toBeVisible();
  await touchDrag(page, await centerOf(squashChip), await centerOf(mainChip));

  // ---- 3) IntentDialog: as duas opcoes; a destrutiva pede hold 2 s --------
  // O label da opcao vem no h3 com o badge "REESCREVE HISTÓRICO" inline, entao
  // a assercao do label e via o botao de hold + o argv cru da preview.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(dialog.getByText("experimento/squash para main", { exact: true })).toBeVisible();

  const holdButton = dialog.getByRole("button", { name: "Segure para rebasear", exact: true });
  await expect(holdButton).toBeVisible();
  await expect(dialog.getByText("git rebase main experimento/squash", { exact: true })).toBeVisible();
  await settleDialog(page, holdButton);
  await holdTouch(page, holdButton, 2_300);

  // ---- 4) toast do caminho de drag (exec.rebase.done) ----------------------
  await expect(page.getByText("Rebase concluído", { exact: true })).toBeVisible({ timeout: 15_000 });

  // ---- 5) git CLI: hashes reescritos, main intocada, arvore esperada -------
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

  const newWipHashes = execFileSync("git", ["-C", fixture, "log", "--format=%H", "main..experimento/squash"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  // Hashes novos: o tip antigo da branch sobrevive no reflog (experimento/squash@{1}).
  const oldLog = execFileSync("git", ["-C", fixture, "log", "--format=%H", "experimento/squash@{1}"], {
    encoding: "utf8",
  });
  for (const h of newWipHashes) {
    expect(oldLog).not.toContain(h);
  }

  // Arvore final: a divergencia de main (base.txt) + os wips (exp.txt a/b/c).
  const baseTxt = execFileSync("git", ["-C", fixture, "show", "experimento/squash:base.txt"], {
    encoding: "utf8",
  });
  expect(baseTxt).toContain("divergencia");
  const expTxt = execFileSync("git", ["-C", fixture, "show", "experimento/squash:exp.txt"], { encoding: "utf8" });
  expect(expTxt.split("\n").filter(Boolean)).toEqual(["a", "b", "c"]);

  // ---- 6) UI: o HEAD do app migrou para o wip reescrito (topo do grafo) ----
  await expect(graphCommitRow(page, "wip: parte 3").first()).toContainText("HEAD", { timeout: 15_000 });
});
