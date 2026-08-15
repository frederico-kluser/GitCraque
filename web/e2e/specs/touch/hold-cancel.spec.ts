/**
 * HOLD-CANCEL — o teste NEGATIVO do hold-to-confirm.
 *
 * ConfirmHost destrutivo (rebase, holdSeconds = 1.4 — ConfirmHost.tsx:265-277):
 * segurar o dedo e SOLTAR ANTES do fim cancela a rampa e NADA executa
 * (hold-to-confirm/index.tsx:101-107: `cancelHold` zera o progresso com a
 * transicao snap). Soltar aos ~40% (560 ms de 1400 ms) tem de deixar o git
 * intocado: log e reflog identicos, sem toast de sucesso, dialogo aberto.
 *
 * Controle positivo no final: segurar ate o fim (1.6 s) executa o rebase —
 * prova que o botao funciona e que o cancelamento foi o que o impediu.
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

function gitState(): string {
  const log = execFileSync("git", ["-C", fixture, "log", "--all", "--format=%H %s"], { encoding: "utf8" });
  const reflog = execFileSync("git", ["-C", fixture, "reflog", "--format=%H %gs"], { encoding: "utf8" });
  return `${log}\n=== reflog ===\n${reflog}`;
}

test("hold-cancel: soltar antes do fim nao executa nada; segurar ate o fim rebaseia", async ({ page }) => {
  await openApp(page);
  await waitForGraph(page);

  // ---- cenario: rebase de experimento/squash sobre main (ConfirmHost) -----
  // main avanca (merge --no-ff de feature/ui) para o rebase ter o que reescrever.
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

  // checkout da branch a rebasear
  trigger = await railBranchMenu(page, "experimento/squash");
  await tapBySelector(page, trigger);
  await tapBySelector(page, page.getByRole("menuitem", { name: "Checkout", exact: true }));
  await expect(page.getByText("Em experimento/squash", { exact: true })).toBeVisible({ timeout: 15_000 });
  await waitForOperationSettle(page);

  // abre o ConfirmHost destrutivo do rebase
  trigger = await railBranchMenu(page, "main");
  await tapBySelector(page, trigger);
  await tapBySelector(page, page.getByRole("menuitem", { name: "Rebasear experimento/squash sobre esta", exact: true }));
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  const holdButton = dialog.getByRole("button", { name: "Segure para rebase", exact: true });
  await expect(holdButton).toBeVisible();

  const before = gitState();
  const tipBefore = execFileSync("git", ["-C", fixture, "rev-parse", "experimento/squash"], {
    encoding: "utf8",
  }).trim();

  // ---- solta aos ~40% da duracao (560 ms de 1400 ms) ----------------------
  await holdTouch(page, holdButton, 560);
  await page.waitForTimeout(1_200); // folga para qualquer reacao

  // NADA aconteceu: dialogo aberto, sem toast de sucesso, git identico.
  await expect(dialog).toBeVisible();
  await expect(page.getByText("experimento/squash rebaseada sobre main", { exact: true })).toHaveCount(0);
  expect(gitState()).toBe(before);
  expect(
    execFileSync("git", ["-C", fixture, "rev-parse", "experimento/squash"], { encoding: "utf8" }).trim(),
  ).toBe(tipBefore);

  // ---- controle positivo: segurar ate o fim executa -----------------------
  await holdTouch(page, holdButton, 1_600);
  await expect(page.getByText("experimento/squash rebaseada sobre main", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  const tipAfter = execFileSync("git", ["-C", fixture, "rev-parse", "experimento/squash"], {
    encoding: "utf8",
  }).trim();
  expect(tipAfter).not.toBe(tipBefore);
});
