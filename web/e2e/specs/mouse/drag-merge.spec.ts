/**
 * MERGE POR DRAG — Porta A do mapa (docs/UI-OPERATIONS-MAP.md, secao 3.3):
 * arrastar o CHIP da branch feature/ui (fonte branch) sobre o CHIP de main
 * (alvo branch) → IntentDialog → opcao unica "Merge de feature/ui em main"
 * (nao destrutiva → botao de CLIQUE) → toast do drag "Merge concluído"
 * (exec.merge.done, diferente do toast do menu) → verificacoes git CLI + grafo.
 *
 * PREPARACAO DO FIXTURE (runtime data, convencao da campanha — mesmo padrao
 * do rebase.spec.ts:47-59):
 *   - feature/ui esta ESTRITAMENTE a frente de main (1 commit apos o merge
 *     baseline); `git merge` puro faria fast-forward e NAO criaria commit de
 *     merge. O caminho de drag do IntentDialog NAO tem o toggle --no-ff do
 *     ConfirmHost do menu (intents.ts:340-348 envia so {source, into};
 *     server/src/git/ops.mjs:264-274 so adiciona --no-ff quando pedido).
 *   - entao o spec avanca main com 1 commit local ("chore: ajuste local em
 *     main"), divergindo de feature/ui: o merge vira real (nao-FF) e cria o
 *     commit de merge com 2 pais que e a verificacao pedida.
 *
 * GESTO: page.mouse com passos intermediarios — o PointerSensor ativa por
 * DISTANCIA ACUMULADA >= 6px (web/src/dnd/sensors.ts:65,74-78); teleporte nao
 * ativa. O pointerdown vai no CENTRO do span do chip de origem: o gridcell de
 * descricao carrega `relative z-10` (CommitRow.tsx), entao o chip fica por
 * cima das colunas de metadados em hit-testing — o gesto real e pegar o chip
 * em QUALQUER ponto; um futuro regresso do stacking falha alto aqui. O DROP
 * usa a geometria do @dnd-kit (getBoundingClientRect, colisao pointerWithin),
 * entao o centro do span alvo e ponto seguro mesmo se coberto pela meta — so
 * os CHIPS sao droppables no grafo (CommitRow nao registra droppable), logo o
 * over final so pode ser o chip main.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PORTS } from "../../playwright.config.ts";
import { makeFixture } from "../../harness/fixture.ts";
import { startAppServer, type RunningServer } from "../../harness/servers.ts";
import { branchChip, expectToast, graphCommitRow, waitForGraph } from "../../harness/ui.ts";
import { openAppResilient } from "./retry.ts";
import { git, gitAsAuthor } from "./git-cli.ts";

/** Subject do commit de merge criado por `git merge --no-edit feature/ui`. */
const MERGE_SUBJECT = "Merge branch 'feature/ui'";
/** Commit local que avanca main e faz o merge divergir (nao-FF). */
const PREP_SUBJECT = "chore: ajuste local em main";

let fixture: string;
let server: RunningServer;

/** Box do SPAN do chip (pai do texto) — o alvo real do pointerdown. */
async function chipSpan(page: Page, name: string): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await branchChip(page, name).first().locator("..").boundingBox();
  if (!box) throw new Error(`chip "${name}" sem caixa visivel no grafo`);
  return box;
}

/**
 * Arrasta o chip de `srcName` sobre o chip de `dstName` com passos
 * intermediarios (sensor: distance 6px acumulada). Pointerdown no centro do
 * span de origem; soltura no centro do span alvo.
 */
async function dragChipOver(page: Page, srcName: string, dstName: string): Promise<void> {
  const src = await chipSpan(page, srcName);
  const dst = await chipSpan(page, dstName);
  const sx = src.x + src.width / 2;
  const sy = src.y + src.height / 2;
  const dx = dst.x + dst.width / 2;
  const dy = dst.y + dst.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(sx + ((dx - sx) * i) / steps, sy + ((dy - sy) * i) / steps);
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
}

test.beforeAll(async () => {
  fixture = await makeFixture();
  // Arvore suja do fixture descartada (nao e parte deste fluxo), depois 1
  // commit local em main: sem ele o merge seria fast-forward.
  execFileSync("git", ["-C", fixture, "checkout", "--", "."], { stdio: "ignore" });
  execFileSync("git", ["-C", fixture, "clean", "-f"], { stdio: "ignore" });
  fs.appendFileSync(path.join(fixture, "main-extra.txt"), "conteudo local\n");
  gitAsAuthor(fixture, "add", "-A");
  gitAsAuthor(fixture, "commit", "-q", "-m", PREP_SUBJECT);
  server = await startAppServer(fixture, PORTS.mouse);
});

test.beforeEach(async ({ page }) => {
  await openAppResilient(page);
  await waitForGraph(page);
});

test.afterAll(async () => {
  await server?.stop();
});

test("merge por drag: chip feature/ui sobre chip main cria merge de 2 pais", async ({ page }) => {
  // Gesto: drag do chip da branch feature/ui sobre o chip de main.
  await dragChipOver(page, "feature/ui", "main");

  // IntentDialog (Porta A): titulo "{from} para {into}" e UMA opcao — o rebase
  // nao entra na lista porque feature/ui esta checado na worktree extra
  // (intents.ts:352-356, heldByOtherWorktree). Opcao nao destrutiva → botao
  // de CLIQUE com o proprio label (IntentDialog.tsx:102-106).
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { level: 2, name: "feature/ui para main" })).toBeVisible();
  await expect(dialog.getByText("git merge feature/ui").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Merge de feature/ui em main", exact: true }).click();

  // Toast do caminho de drag (exec.merge.done) — diferente do toast do menu
  // ("{source} mesclado em {target}").
  await expectToast(page, "Merge concluído");

  // git CLI: o ultimo merge tem EXATAMENTE 2 pais, o subject esperado e
  // feature/ui passou a ser ancestral de main.
  const parents = git(fixture, "log", "--merges", "-1", "--format=%P");
  expect(parents.split(/\s+/)).toHaveLength(2);
  expect(git(fixture, "log", "--merges", "-1", "--format=%s")).toBe(MERGE_SUBJECT);
  expect(git(fixture, "merge-base", "--is-ancestor", "feature/ui", "main")).toBe("");

  // Grafo virtualizado: o commit de merge aparece na area visivel (o refresh
  // pos-operacao passa por um instante com a lista vazia — o expect re-tenta).
  await expect(graphCommitRow(page, MERGE_SUBJECT).first()).toBeVisible({ timeout: 15_000 });
});
