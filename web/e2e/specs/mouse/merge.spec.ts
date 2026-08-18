/**
 * MERGE — menu de contexto da branch (caminho vivo do mapa
 * docs/UI-OPERATIONS-MAP.md, secao 3.3, porta B) mescla feature/ui em main
 * com `--no-ff`.
 *
 * Por que `--no-ff`: feature/ui esta ESTRITAMENTE a frente de main (1 commit
 * apos o merge baseline); `git merge` puro daria fast-forward e nao criaria
 * commit de merge. O toggle `--no-ff` do ConfirmHost garante o commit de
 * merge com 2 pais, que e a verificacao pedida.
 *
 * A branch feature/ui esta checada na worktree extra do fixture — o menu nao
 * bloqueia merge de branch presa (menus.ts:235-241), e o `git merge` le a
 * branch sem conflito com a outra worktree.
 *
 * Fluxo: clique direito no chip `feature/ui` → "Mesclar em main" → ligar
 * `--no-ff` → botao "Merge" (nao-destrutivo, clique) → toast
 * "feature/ui mesclado em main" → verificacoes git CLI + grafo.
 */
import { expect, test } from "@playwright/test";
import { PORTS } from "../../playwright.config.ts";
import { makeFixture } from "../../harness/fixture.ts";
import { startAppServer, type RunningServer } from "../../harness/servers.ts";
import { expectToast, graphCommitRow, waitForGraph } from "../../harness/ui.ts";
import { openAppResilient } from "./retry.ts";
import { git } from "./git-cli.ts";

/** Subject do commit de merge criado pelo `git merge --no-ff --no-edit feature/ui`. */
const MERGE_SUBJECT = "Merge branch 'feature/ui'";

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

test("merge --no-ff de feature/ui em main cria commit de merge de 2 pais", async ({ page }) => {
  // Menu de contexto do chip da branch (grafo): "Mesclar em {branch atual}".
  // Clique no CENTRO do chip, em PIXELS: o `position` do Playwright e um
  // offset em pixels da borda do elemento (0.5 nao significa "metade" — no
  // canto arredondado do chip o ponteiro nem chega ao span). O gridcell de
  // descricao carrega `relative z-10` (CommitRow.tsx), entao o transbordo do
  // chip fica por cima das colunas de metadados em hit-testing — o gesto
  // real e o botao direito em QUALQUER ponto do chip (RefChip.tsx:8-14); um
  // futuro regresso do stacking falha alto aqui (o Playwright recusa clique
  // em ponto coberto).
  const chip = page
    .locator('[role="rowgroup"] span.rounded-full')
    .filter({ hasText: /^feature\/ui$/ })
    .first();
  const box = (await chip.boundingBox())!;
  await chip.click({ button: "right", position: { x: box.width / 2, y: box.height / 2 } });
  await page.getByRole("menuitem", { name: "Mesclar em main" }).click();

  // ConfirmHost: titulo, argv `git merge --no-edit feature/ui`, toggle --no-ff.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Merge de feature/ui em main" })).toBeVisible();
  await dialog.getByRole("switch", { name: "--no-ff" }).click();
  await dialog.getByRole("button", { name: "Merge", exact: true }).click();

  // Toast de conclusao do menu: "{source} mesclado em {target}".
  await expectToast(page, "feature/ui mesclado em main");

  // git CLI: o ultimo merge tem EXATAMENTE 2 pais e o subject esperado.
  const parents = git(fixture, "log", "--merges", "-1", "--format=%P");
  expect(parents.split(/\s+/)).toHaveLength(2);
  expect(git(fixture, "log", "--merges", "-1", "--format=%s")).toBe(MERGE_SUBJECT);
  // feature/ui passou a ser ancestral de main (o merge-base confirma).
  expect(git(fixture, "merge-base", "--is-ancestor", "feature/ui", "main")).toBe("");

  // Grafo virtualizado: o commit de merge aparece na area visivel (o refresh
  // pos-operacao passa por um instante com a lista vazia — o expect re-tenta).
  await expect(graphCommitRow(page, MERGE_SUBJECT).first()).toBeVisible({ timeout: 15_000 });
});
