/**
 * PUSH no toque — o commit a empurrar e criado PELA UI de toque (gaveta de
 * alteracoes: "Preparar tudo" -> mensagem -> "Commit"), e o push sai pelo menu
 * de estouro "⋯" -> "Push" (action.push.title) -> ConfirmHost -> botao "Push"
 * (action.push.confirm — TAP, sem hold: openPushDialog nunca seta
 * `destructive`, defeito conhecido e documentado no mapa).
 *
 * O "long-press no item de push" da tarefa nao existe no codigo vivo: o item
 * do menu e tap, e o ConfirmHost do push nao e destrutivo (revalidado em
 * web/src/app/actions.ts:133-193).
 *
 * O remoto e COMPARTILHADO com as specs mouse (paralelas): o push e retentado
 * com resetRemote antes de cada tentativa. No fim o fixture volta ao baseline
 * e o remoto e restaurado.
 *
 * Verificacao: ls-remote de origin/main == main local apos o push.
 */
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

import { PORTS } from "../../playwright.config.ts";
import { ensureRemoteAuth, makeFixture, resetRemote } from "../../harness/fixture.ts";
import { startAppServer, type RunningServer } from "../../harness/servers.ts";
import { tapBySelector } from "../../harness/touch.ts";
import { openApp, waitForGraph } from "../../harness/ui.ts";
import { changesButton, overflowMenu, waitForOperationSettle } from "./helpers.ts";

/** Subject do commit local criado pela gaveta. */
const COMMIT_SUBJECT = "feat: commit da campanha de toque";
let baselineHash = "";

let fixture: string;
let server: RunningServer;

test.beforeAll(async () => {
  fixture = await makeFixture();
  server = await startAppServer(fixture, PORTS.touch);
  await ensureRemoteAuth(server.baseUrl);
});

test.afterAll(async () => {
  // Restaura o fixture ao baseline e devolve o remoto compartilhado.
  execFileSync("git", ["-C", fixture, "reset", "--hard", baselineHash], { encoding: "utf8" });
  await resetRemote(fixture);
  await server?.stop();
});

/** ls-remote autenticado via gh (token nunca entra em argv/env do git). */
function lsRemoteMain(): string {
  const out = execFileSync(
    "git",
    ["-c", "credential.helper=!gh auth git-credential", "ls-remote", "origin", "refs/heads/main"],
    { cwd: fixture, encoding: "utf8" },
  );
  return out.trim().split(/\s+/)[0] ?? "";
}

test("push no toque: commit pela gaveta + overflow Push -> remoto atualizado", async ({ page }) => {
  test.setTimeout(240_000);
  await openApp(page);
  await waitForGraph(page);

  baselineHash = execFileSync("git", ["-C", fixture, "rev-parse", "main"], { encoding: "utf8" }).trim();

  // ---- 1) cria o commit local pela gaveta de alteracoes (tudo por tap) ----
  await tapBySelector(page, changesButton(page));
  await expect(page.getByRole("button", { name: "Preparar tudo", exact: true }).first()).toBeVisible({
    timeout: 5_000,
  });
  // A gaveta anima para dentro: tap durante a animacao erra o alvo (e o
  // backdrop fecha a gaveta). Espera o assento antes de tocar.
  await page.waitForTimeout(600);
  await tapBySelector(page, page.getByRole("button", { name: "Preparar tudo", exact: true }).first());
  await waitForOperationSettle(page);

  const messageBox = page.getByPlaceholder("Mensagem do commit");
  await messageBox.waitFor({ state: "visible", timeout: 10_000 });
  await tapBySelector(page, messageBox);
  await page.keyboard.type(COMMIT_SUBJECT);
  // O botao de commit do CommitBox tem aria-label proprio (commit.button.label
  // = "Criar commit") — o nome acessivel NAO e o texto visivel "Commit".
  const commitButton = page.getByRole("button", { name: "Criar commit", exact: true });
  await expect(commitButton).toBeEnabled({ timeout: 5_000 });
  await tapBySelector(page, commitButton);
  await expect(page.getByText("Commit criado", { exact: true })).toBeVisible({ timeout: 15_000 });
  await waitForOperationSettle(page);

  const localMain = execFileSync("git", ["-C", fixture, "rev-parse", "main"], { encoding: "utf8" }).trim();
  const localSubject = execFileSync("git", ["-C", fixture, "log", "-1", "--pretty=%s", "main"], {
    encoding: "utf8",
  })
    .trim();
  expect(localSubject).toBe(COMMIT_SUBJECT);

  // ---- 2) fecha a gaveta e empurra pelo estouro (com retentativa) ---------
  // Fecha a gaveta pelo X proprio (changes.sheet.close = "Fechar alterações").
  await tapBySelector(page, page.getByRole("button", { name: "Fechar alterações", exact: true }));
  await expect(page.getByRole("button", { name: "Histórico", exact: true })).toBeVisible({ timeout: 5_000 });

  const toast = page.getByText("Push concluído", { exact: true });
  const failToast = page.getByText("Push falhou", { exact: true });
  let done = false;
  for (let attempt = 1; attempt <= 8 && !done; attempt += 1) {
    try {
      await resetRemote(fixture); // garante o baseline remoto para o push valer
    } catch {
      continue;
    }
    // Se a tentativa anterior falhou e o dialogo ficou aberto, fecha antes.
    const dialogOpen = page.getByRole("dialog");
    if (await dialogOpen.isVisible().catch(() => false)) {
      const cancel = dialogOpen.getByRole("button", { name: "Cancelar", exact: true });
      if (await cancel.isVisible().catch(() => false)) await tapBySelector(page, cancel);
    }
    await waitForOperationSettle(page);
    await tapBySelector(page, overflowMenu(page));
    const pushItem = page.getByRole("menuitem", { name: "Push", exact: true });
    await pushItem.waitFor({ state: "visible", timeout: 5_000 });
    await expect(pushItem).toBeEnabled({ timeout: 5_000 }); // item desabilitado enquanto busy
    await tapBySelector(page, pushItem);
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 5_000 });
    const confirm = dialog.getByRole("button", { name: "Push", exact: true });
    await expect(confirm).toBeEnabled({ timeout: 5_000 });
    await tapBySelector(page, confirm);
    try {
      await toast.or(failToast).waitFor({ timeout: 12_000 });
      done = await toast.isVisible().catch(() => false);
    } catch {
      /* remoto disputado; recomeça */
    }
    if (!done) await page.waitForTimeout(400);
  }
  expect(done, "o push nao concluiu em 8 tentativas (remoto disputado com as specs mouse)").toBeTruthy();

  // ---- 3) remoto atualizado ----------------------------------------------
  const remoteMain = lsRemoteMain();
  expect(remoteMain).toBe(localMain);

  // O subject remoto confirma o conteudo (fetch local do ref, sem tocar em nada).
  execFileSync(
    "git",
    ["-c", "credential.helper=!gh auth git-credential", "fetch", "--quiet", "origin", "main"],
    { cwd: fixture, encoding: "utf8" },
  );
  const remoteSubject = execFileSync("git", ["-C", fixture, "log", "-1", "--pretty=%s", "origin/main"], {
    encoding: "utf8",
  })
    .toString()
    .trim();
  expect(remoteSubject).toBe(COMMIT_SUBJECT);
});
