/**
 * CANARIO — o minimo que prova que a infraestrutura inteira funciona:
 *
 *   1. o servidor do app sobe contra um fixture fresh (make-fixture);
 *   2. a pagina carrega e o grafo renderiza as linhas de commit;
 *   3. o locale pt foi aplicado: o toolbar mostra "Pull" (chave action.pull);
 *   4. um subject conhecido do baseline do fixture esta visivel
 *      ("feat: primeira funcionalidade" — pode estar no fundo do grafo, e o
 *      helper de scroll virtualizado entra em acao).
 *
 * Roda no projeto `smoke` (porta 5371).
 */
import { expect, test } from "@playwright/test";
import { PORTS } from "../playwright.config.ts";
import { makeFixture } from "../harness/fixture.ts";
import { startAppServer, type RunningServer } from "../harness/servers.ts";
import {
  graphCommitRow,
  openApp,
  scrollGraphTo,
  waitForGraph,
} from "../harness/ui.ts";

/** Subject do baseline do fixture (contrato com scripts/make-fixture.mjs). */
const BASELINE_SUBJECT = "feat: primeira funcionalidade";

let fixture: string;
let server: RunningServer;

test.beforeAll(async () => {
  fixture = await makeFixture();
  server = await startAppServer(fixture, PORTS.smoke);
});

test.afterAll(async () => {
  await server?.stop();
});

test("servidor sobe, pagina carrega, grafo renderiza e o toolbar fala pt", async ({ page }) => {
  await openApp(page);
  await waitForGraph(page);

  // O toolbar (desktop) mostra o botao de pull com o texto pt do catalogo.
  await expect(page.getByRole("button", { name: "Pull", exact: true })).toBeVisible();

  // Subject do baseline: visivel de cara ou apos rolar o grafo virtualizado.
  const row = graphCommitRow(page, BASELINE_SUBJECT);
  if (!(await row.first().isVisible().catch(() => false))) {
    await scrollGraphTo(page, BASELINE_SUBJECT);
  }
  await expect(row.first()).toBeVisible();
});
