/**
 * PULL no toque (viewport 390x844) — layout compacto: pull NAO esta na toolbar,
 * mora no menu de estouro "⋯" ("Abrir as demais ações da barra",
 * web/src/panels/Toolbar.tsx:717-744).
 *
 * Fluxo:
 *   1. addRemoteCommit no fixture (1 commit novo no GitHub: "feat: mudanca
 *      remota para teste de pull" — scripts/remote-mutate.mjs);
 *   2. tap no "⋯" -> tap no item "Pull" (action.pull);
 *   3. toast "Pull concluído" (action.pull.done);
 *   4. git CLI no fixture confirma o commit remoto na main;
 *   5. o grafo (virtualizado) mostra a linha do commit remoto;
 *   6. no fim, o fixture volta ao baseline e resetRemote devolve o remoto.
 *
 * O remoto e COMPARTILHADO com as specs mouse, que rodam em paralelo: o ciclo
 * resetRemote -> addRemoteCommit -> pull e tentado varias vezes — se a spec
 * irmã roubar o remoto no meio (reset force-push entre as minhas etapas), o
 * pull falha com "unrelated histories" e o ciclo recomeça do zero.
 */
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

import { PORTS } from "../../playwright.config.ts";
import { addRemoteCommit, ensureRemoteAuth, makeFixture, resetRemote } from "../../harness/fixture.ts";
import { startAppServer, type RunningServer } from "../../harness/servers.ts";
import { tapBySelector } from "../../harness/touch.ts";
import { graphCommitRow, openApp, scrollGraphTo, waitForGraph } from "../../harness/ui.ts";
import { overflowMenu, waitForOperationSettle } from "./helpers.ts";

/** Subject do commit remoto (contrato com scripts/remote-mutate.mjs). */
const REMOTE_SUBJECT = "feat: mudanca remota para teste de pull";
/** Baseline local do fixture (main ANTES do pull) — para restaurar o remoto. */
let baselineHash = "";

let fixture: string;
let server: RunningServer;

test.beforeAll(async () => {
  fixture = await makeFixture();
  // O app roda `git pull --progress` SEM remote/branch: ele depende do
  // upstream da branch. O fixture nasce com `git remote add` (sem upstream —
  // gap do agente de fixture) — o setup abaixo fecha a lacuna pela config,
  // como um repo clonado de verdade teria (sem exigir o ref origin/main).
  execFileSync("git", ["-C", fixture, "config", "branch.main.remote", "origin"], { encoding: "utf8" });
  execFileSync("git", ["-C", fixture, "config", "branch.main.merge", "refs/heads/main"], { encoding: "utf8" });
  server = await startAppServer(fixture, PORTS.touch);
  await ensureRemoteAuth(server.baseUrl);
});

test.afterAll(async () => {
  // Restaura o fixture ao baseline e devolve o remoto compartilhado.
  execFileSync("git", ["-C", fixture, "reset", "--hard", baselineHash], { encoding: "utf8" });
  await resetRemote(fixture);
  await server?.stop();
});

test("pull no toque: overflow ⋯ -> Pull -> toast -> commit remoto no grafo", async ({ page }) => {
  test.setTimeout(240_000);
  await openApp(page);
  await waitForGraph(page);
  // O boot do app busca refs; o item "Pull" fica desabilitado enquanto busy.
  await waitForOperationSettle(page);

  baselineHash = execFileSync("git", ["-C", fixture, "rev-parse", "main"], { encoding: "utf8" }).trim();

  // Antes do pull, o commit remoto NAO esta na main local.
  const before = execFileSync("git", ["-C", fixture, "log", "--oneline", "main"], { encoding: "utf8" });
  expect(before).not.toContain(REMOTE_SUBJECT);

  const toast = page.getByText("Pull concluído", { exact: true });
  const failToast = page.getByText("Pull falhou", { exact: true });
  let done = false;
  for (let attempt = 1; attempt <= 8 && !done; attempt += 1) {
    // Tomada do remoto (pode perder a corrida para a spec irmã — tenta de novo).
    try {
      await resetRemote(fixture);
      await addRemoteCommit(fixture);
    } catch (e) {
      console.log(`[pull] tentativa ${attempt}: reset/addOne falhou: ${String(e).slice(0, 120)}`);
      continue;
    }
    await waitForOperationSettle(page);
    await tapBySelector(page, overflowMenu(page));
    const pullItem = page.getByRole("menuitem", { name: "Pull", exact: true });
    await pullItem.waitFor({ state: "visible", timeout: 5_000 });
    await expect(pullItem).toBeEnabled({ timeout: 5_000 }); // desabilitado enquanto busy
    await tapBySelector(page, pullItem);
    // Espera o desfecho: sucesso OU erro ("Pull falhou" = remoto roubado no meio).
    try {
      await toast.or(failToast).waitFor({ timeout: 12_000 });
      done = await toast.isVisible().catch(() => false);
      console.log(`[pull] tentativa ${attempt}: toast=${done ? "OK" : "FAIL"}`);
    } catch {
      console.log(`[pull] tentativa ${attempt}: sem desfecho`);
    }
    if (!done) await page.waitForTimeout(400);
  }
  expect(done, "o pull nao concluiu em 8 tentativas (remoto disputado com as specs mouse)").toBeTruthy();

  // git CLI no fixture: o commit remoto chegou na main.
  const after = execFileSync("git", ["-C", fixture, "log", "--oneline", "main"], { encoding: "utf8" });
  expect(after).toContain(REMOTE_SUBJECT);
  const head = execFileSync("git", ["-C", fixture, "log", "-1", "--pretty=%s", "main"], {
    encoding: "utf8",
  }).trim();
  expect(head).toBe(REMOTE_SUBJECT);

  // O grafo reflete o commit remoto (virtualizado: rola ate a linha).
  const row = graphCommitRow(page, REMOTE_SUBJECT);
  if (!(await row.first().isVisible().catch(() => false))) {
    await scrollGraphTo(page, REMOTE_SUBJECT);
  }
  await expect(row.first()).toBeVisible();
});
