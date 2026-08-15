/**
 * CHERRY-PICK POR DRAG — Porta A do mapa (docs/UI-OPERATIONS-MAP.md, secao
 * 3.6): arrastar a LINHA do commit "feat(ui): botao primario" (fonte tipo
 * commit — a linha inteira e arrastavel, CommitRow.tsx:232-238) sobre o CHIP
 * de main (alvo branch) → IntentDialog com opcao unica "Cherry-pick em main"
 * (nao destrutiva → botao de CLIQUE) → toast do drag "Cherry-pick aplicado"
 * (exec.cherryPick.done) → verificacoes git CLI + grafo.
 *
 * POR QUE "feat(ui): botao primario" e nao "feat(auth): valida token": o de
 * auth ja e ancestral de main no baseline (entrou pelo merge "merge: integra
 * feature/auth") e cherry-pick de commit ja aplicado gera CONFLITO add/add
 * (documentado em cherry-pick.spec.ts:6-12). O de feature/ui e o commit de
 * outra branch para main com apply limpo, e permite a verificacao "exatamente
 * 1 commit novo" de forma exata.
 *
 * GESTO: page.mouse com passos intermediarios (PointerSensor ativa por
 * distancia acumulada >= 6px, web/src/dnd/sensors.ts:65,74-78). O pointerdown
 * da LINHA vai a esquerda dos chips (a coluna de descricao do commit) — pegar
 * o chip de feature/ui na linha viraria drag de branch; o drop vai no CENTRO
 * do span do chip main (colisao pointerWithin por getBoundingClientRect; so
 * chips sao droppables no grafo — a linha nao registra droppable).
 */
import { expect, test, type Page } from "@playwright/test";
import { PORTS } from "../../playwright.config.ts";
import { makeFixture } from "../../harness/fixture.ts";
import { startAppServer, type RunningServer } from "../../harness/servers.ts";
import { branchChip, expectToast, graphCommitRow, waitForGraph } from "../../harness/ui.ts";
import { openAppResilient } from "./retry.ts";
import { git } from "./git-cli.ts";

/** Commit de feature/ui que sera aplicado em main. */
const PICK_SUBJECT = "feat(ui): botao primario";

let fixture: string;
let server: RunningServer;

/** Box do SPAN do chip (pai do texto) — o alvo real do pointerdown. */
async function chipSpan(page: Page, name: string): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await branchChip(page, name).first().locator("..").boundingBox();
  if (!box) throw new Error(`chip "${name}" sem caixa visivel no grafo`);
  return box;
}

/**
 * Arrasta a LINHA do commit `rowSubject` sobre o chip `dstName`, com passos
 * intermediarios (sensor: distance 6px acumulada). O pointerdown sai da
 * coluna de descricao da linha (x do row + 80, antes dos chips) para nao
 * virar drag de branch; a soltura e no centro do span do chip alvo.
 */
async function dragRowOverChip(page: Page, rowSubject: string, dstName: string): Promise<void> {
  const row = await graphCommitRow(page, rowSubject).first().boundingBox();
  if (!row) throw new Error(`linha "${rowSubject}" sem caixa visivel no grafo`);
  const dst = await chipSpan(page, dstName);
  const sx = row.x + 80;
  const sy = row.y + row.height / 2;
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
  server = await startAppServer(fixture, PORTS.mouse);
});

test.beforeEach(async ({ page }) => {
  await openAppResilient(page);
  await waitForGraph(page);
});

test.afterAll(async () => {
  await server?.stop();
});

test("cherry-pick por drag: linha feat(ui) sobre chip main aplica 1 commit", async ({ page }) => {
  // Estado inicial para as contagens.
  const sourceHash = git(fixture, "rev-parse", "feature/ui");
  const countBefore = Number(git(fixture, "rev-list", "--count", "main"));

  // Gesto: drag da linha do commit de feature/ui sobre o chip de main.
  await dragRowOverChip(page, PICK_SUBJECT, "main");

  // IntentDialog (Porta A): titulo "Cherry-pick em {branch}" (h2) e opcao
  // unica nao destrutiva → botao de CLIQUE com o proprio label. O titulo e o
  // label da opcao (h3) tem o MESMO texto — o level 2 desambigua.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { level: 2, name: "Cherry-pick em main" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cherry-pick em main", exact: true }).click();

  // Toast do caminho de drag (exec.cherryPick.done) — diferente do toast do
  // menu ("Cherry-pick concluído").
  await expectToast(page, "Cherry-pick aplicado");

  // git CLI: EXATAMENTE 1 commit novo em main, com o subject do aplicado, e
  // o commit novo e um OBJETO novo (nao um ponteiro para o de feature/ui).
  expect(Number(git(fixture, "rev-list", "--count", "main"))).toBe(countBefore + 1);
  expect(git(fixture, "log", "-1", "--format=%s")).toBe(PICK_SUBJECT);
  expect(git(fixture, "rev-parse", "HEAD")).not.toBe(sourceHash);

  // Grafo virtualizado: o commit aplicado aparece na area visivel (o refresh
  // pos-operacao passa por um instante com a lista vazia — o expect re-tenta).
  await expect(graphCommitRow(page, PICK_SUBJECT).first()).toBeVisible({ timeout: 15_000 });
});
