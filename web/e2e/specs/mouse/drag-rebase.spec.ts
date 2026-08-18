/**
 * REBASE POR DRAG — Porta A do mapa (docs/UI-OPERATIONS-MAP.md, secao 3.4):
 * arrastar o CHIP da branch experimento/squash (fonte branch) sobre o CHIP de
 * main (alvo branch) → IntentDialog com DUAS opcoes → "Rebase de
 * experimento/squash em cima de main" (DESTRUTIVA → HoldToConfirmButton de
 * 2 s com "Segure para rebasear") → toast do drag "Rebase concluído"
 * (exec.rebase.done) → verificacoes git CLI + grafo.
 *
 * POR QUE experimento/squash: e a branch local livre do fixture (3 commits
 * "wip: parte *" fora de main, presa em nenhuma worktree) — feature/ui esta
 * checada na worktree extra e o rebase dela e dropado pela matriz
 * (intents.ts:352-356); feature/auth esta 100% mergeada em main.
 *
 * PREPARACAO DO FIXTURE (runtime data, convencao da campanha): sem ele o
 * rebase e DEGENERADO — experimento/squash esta estritamente a frente de
 * main, entao `git rebase main experimento/squash` reaplica os 3 wips sobre o
 * MESMO pai e os hashes NAO mudam (medido empiricamente). Avancar main com 1
 * commit local ("chore: ajuste local em main") faz os wips serem reescritos
 * sobre um pai novo → hashes mudam de verdade (reflog "rebase (finish)").
 *
 * GESTO: page.mouse com passos intermediarios (PointerSensor ativa por
 * distancia acumulada >= 6px, web/src/dnd/sensors.ts:65,74-78). Pointerdown
 * no CENTRO do span do chip de origem: o gridcell de descricao carrega
 * `relative z-10` (CommitRow.tsx), entao o chip fica por cima das colunas de
 * metadados em hit-testing — o gesto real e pegar o chip em QUALQUER ponto;
 * um futuro regresso do stacking falha alto aqui. Drop no centro do span
 * alvo: a colisao do @dnd-kit (pointerWithin) usa getBoundingClientRect dos
 * droppables (so chips no grafo), independente do que cobre visualmente.
 * A confirmacao e SEGURAR 2 s no botao (hold-to-confirm/index.tsx:68,185);
 * soltar antes cancela e nada roda. O backend rebase usa --autostash
 * (server/src/git/ops.mjs:284-288), entao a arvore suja do fixture nao
 * bloqueia — mesmo assim o spec a descarta no preparo (padrao da campanha).
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

/** Commit local que avanca main e faz o rebase reescrever os wips. */
const PREP_SUBJECT = "chore: ajuste local em main";
/** Os 3 commits de experimento/squash que o rebase reescreve. */
const WIP_SUBJECTS = ["wip: parte 1", "wip: parte 2", "wip: parte 3"];

let fixture: string;
let server: RunningServer;

/** Box do SPAN do chip (pai do texto) — o alvo real do pointerdown. */
async function chipSpan(page: Page, name: string): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await branchChip(page, name).first().locator("..").boundingBox();
  if (!box) throw new Error(`chip "${name}" sem caixa visivel no grafo`);
  return box;
}

/** Arrasta o chip de `srcName` sobre o chip de `dstName` com passos. */
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
  // Arvore suja descartada (o backend usaria --autostash de qualquer forma,
  // mas o preparo segue o padrao do rebase.spec.ts), depois 1 commit local em
  // main — sem ele o rebase nao muda os hashes (rebase degenerado).
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

test("rebase por drag: chip experimento/squash sobre chip main com hold de 2 s", async ({ page }) => {
  const beforeHash = git(fixture, "rev-parse", "experimento/squash");
  const mainBefore = git(fixture, "rev-parse", "main");

  // Gesto: drag do chip da branch experimento/squash sobre o chip de main.
  await dragChipOver(page, "experimento/squash", "main");

  // IntentDialog (Porta A): titulo "{from} para {into}" com DUAS opcoes; a
  // destrutiva (rebase) vem com badge "reescreve histórico" e botao de hold.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { level: 2, name: "experimento/squash para main" })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Merge de experimento/squash em main", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("git rebase main experimento/squash").first()).toBeVisible();
  const hold = dialog.getByRole("button", { name: "Segure para rebasear" });
  await expect(hold).toBeVisible();

  // Confirmacao destrutiva: SEGURAR 2 s (default do HoldToConfirmButton);
  // soltar antes cancelaria e nada rodaria.
  await hold.hover();
  await page.mouse.down();
  await page.waitForTimeout(2_300);
  await page.mouse.up();

  // Toast do caminho de drag (exec.rebase.done) — diferente do toast do menu
  // ("{branch} rebaseada sobre {onto}").
  await expectToast(page, "Rebase concluído");

  // git CLI: hashes de experimento/squash MUDARAM, main intocada, e o reflog
  // da branch registrou o rebase.
  const afterHash = git(fixture, "rev-parse", "experimento/squash");
  expect(afterHash).not.toBe(beforeHash);
  expect(git(fixture, "rev-parse", "main")).toBe(mainBefore);
  expect(git(fixture, "reflog", "-1", "--format=%gs", "experimento/squash")).toContain("rebase (finish)");
  // main..experimento/squash = exatamente os 3 wips reescritos (git log e
  // do mais novo para o mais antigo).
  expect(git(fixture, "log", "--format=%s", "main..experimento/squash").split("\n")).toEqual(
    [...WIP_SUBJECTS].reverse(),
  );
  // Arvore esperada: a de main + o conteudo dos wips (exp.txt, 3 linhas).
  expect(git(fixture, "diff", "main...experimento/squash", "--stat")).toContain("exp.txt");

  // Grafo virtualizado: o topo de experimento/squash aparece na area visivel.
  await expect(graphCommitRow(page, "wip: parte 3").first()).toBeVisible({ timeout: 15_000 });
});
