/**
 * CHERRY-PICK — menu de contexto da linha do commit (caminho vivo do mapa,
 * secao 3.6, porta de menu) aplica "feat(ui): botao primario" (de
 * feature/ui) em main.
 *
 * POR QUE NAO "feat(auth): valida token" (o commit citado no brief): ele ja
 * e ancestral de main no baseline do fixture — o merge "merge: integra
 * feature/auth" o incluiu — e cherry-pick de commit ja aplicado em main gera
 * CONFLITO add/add (verificado empiricamente), que abriria o ConflictDialog
 * em vez do toast de sucesso. O commit de feature/ui tem o mesmo fluxo
 * (commit de outra branch para main) com apply limpo, e permite a verificacao
 * "nenhum outro commit novo alem do esperado" de forma exata.
 *
 * Fluxo: clique direito na LINHA do commit (nao no chip — o chip abriria o
 * menu da branch) → "Cherry-pick na branch atual" → ConfirmHost
 * nao-destrutivo → botao "Cherry-pick" → toast "Cherry-pick concluído" →
 * verificacoes git CLI + grafo.
 */
import { expect, test } from "@playwright/test";
import { PORTS } from "../../playwright.config.ts";
import { makeFixture } from "../../harness/fixture.ts";
import { startAppServer, type RunningServer } from "../../harness/servers.ts";
import { expectToast, graphCommitRow, waitForGraph } from "../../harness/ui.ts";
import { openAppResilient } from "./retry.ts";
import { git } from "./git-cli.ts";

/** Commit de feature/ui que sera aplicado em main. */
const PICK_SUBJECT = "feat(ui): botao primario";

let fixture: string;
let server: RunningServer;

test.beforeAll(async () => {
  fixture = await makeFixture();
  server = await startAppServer(fixture, PORTS.mouse);
});

test.beforeEach(async ({ page }) => {
  await openAppResilient(page);
  await waitForGraph(page);
});

test.afterAll(async () => {
  await server?.stop();
});

test("cherry-pick do commit de feature/ui para main", async ({ page }) => {
  // Estado inicial para as contagens.
  const sourceHash = git(fixture, "rev-parse", "feature/ui");
  const countBefore = Number(git(fixture, "rev-list", "--count", "main"));

  // Menu de contexto da LINHA do commit (clique no centro da linha: no
  // viewport 1280 a coluna de descricao tem ~50 px e o subject fica com
  // largura 0 quando o chip da branch ocupa a celula — o clique na linha
  // inteira cai no handler do menu do commit de qualquer forma).
  const row = graphCommitRow(page, PICK_SUBJECT);
  await expect(row.first()).toBeVisible();
  await row.first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Cherry-pick na branch atual" }).click();

  // ConfirmHost nao-destrutivo: botao de clique com o label do catalogo.
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Cherry-pick", exact: true }).click();

  // Toast de conclusao do menu.
  await expectToast(page, "Cherry-pick concluído");

  // git CLI: EXATAMENTE 1 commit novo em main, com o subject do aplicado.
  expect(Number(git(fixture, "rev-list", "--count", "main"))).toBe(countBefore + 1);
  expect(git(fixture, "log", "-1", "--format=%s")).toBe(PICK_SUBJECT);
  // E o commit novo e um OBJETO novo (nao um ponteiro para o de feature/ui).
  expect(git(fixture, "rev-parse", "HEAD")).not.toBe(sourceHash);

  // Grafo virtualizado: a linha do commit aplicado aparece na area visivel
  // (o refresh pos-operacao passa por um instante com a lista vazia — o
  // expect re-tenta).
  await expect(graphCommitRow(page, PICK_SUBJECT).first()).toBeVisible({ timeout: 15_000 });
});
