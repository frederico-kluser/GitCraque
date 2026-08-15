/**
 * REBASE — menu de contexto da branch (caminho vivo do mapa, secao 3.4,
 * porta de menu) rebasa feature/auth sobre main com hold-to-confirm 1.4 s.
 *
 * PREPARACAO DO FIXTURE (runtime data, convencao da campanha):
 *   - o fixture baseline NAO tem branch divergente com commits proprios:
 *     feature/ui esta estritamente a frente de main (git 2.43 trata o rebase
 *     dela como NO-OP "up to date") e presa na worktree extra (a opcao rebase
 *     do drag e dropada); feature/auth esta 100% mergeada em main. Entao:
 *     1) a arvore suja e descartada (src.txt difere entre main e
 *        feature/auth — o checkout CLI nao passaria com a sujeira);
 *     2) `git checkout feature/auth`;
 *     3) 1 commit local novo em feature/auth ("feat(auth): ajuste de
 *        rebase") — o UNICO commit que o rebase vai reescrever.
 *   - o app sobe com HEAD=feature/auth, que e o que o caminho de menu exige:
 *     "Rebasear {branch atual} sobre esta" rebasa o HEAD atual sobre o chip
 *     clicado (menus.ts:243-248, actions.ts:361-383).
 *
 * O argv real do app: `git rebase --autostash main feature/auth` (destrutivo
 * → HoldToConfirmButton de 1.4 s com "Segure para rebase").
 *
 * Verificacao: hash de feature/auth MUDOU (reflog "rebase (finish)"),
 * main..feature/auth tem exatamente 1 commit (o reescrito), o diff
 * main...feature/auth e o do commit reescrito, e o grafo mostra o commit no
 * topo. (O "diff vazio" do brief valeria so no rebase degenerado de commits
 * ja mergeados — aqui o diff esperado e exatamente o do commit reescrito.)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PORTS } from "../../playwright.config.ts";
import { makeFixture } from "../../harness/fixture.ts";
import { startAppServer, type RunningServer } from "../../harness/servers.ts";
import { branchChip, expectToast, graphCommitRow, scrollGraphTo, waitForGraph } from "../../harness/ui.ts";
import { openAppResilient } from "./retry.ts";
import { git, gitAsAuthor } from "./git-cli.ts";

/** Commit local criado no fixture para o rebase reescrever. */
const LOCAL_SUBJECT = "feat(auth): ajuste de rebase";

let fixture: string;
let server: RunningServer;
/** Hash de feature/auth ANTES do rebase (o reescrito tem que mudar). */
let beforeHash: string;

test.beforeAll(async () => {
  fixture = await makeFixture();
  // Arvore suja descartada para o checkout CLI de feature/auth (src.txt
  // difere entre as branches).
  execFileSync("git", ["-C", fixture, "checkout", "--", "."], { stdio: "ignore" });
  execFileSync("git", ["-C", fixture, "clean", "-f"], { stdio: "ignore" });
  git(fixture, "checkout", "-q", "feature/auth");
  // 1 commit local — o unico candidato a reescrita do rebase.
  fs.appendFileSync(path.join(fixture, "auth.txt"), "linha de rebase\n");
  gitAsAuthor(fixture, "add", "-A");
  gitAsAuthor(fixture, "commit", "-q", "-m", LOCAL_SUBJECT);
  beforeHash = git(fixture, "rev-parse", "feature/auth");
  server = await startAppServer(fixture, PORTS.mouse);
});

test.beforeEach(async ({ page }) => {
  await openAppResilient(page);
  await waitForGraph(page);
});

test.afterAll(async () => {
  await server?.stop();
});

test("rebase de feature/auth sobre main pelo menu com hold de 1.4 s", async ({ page }) => {
  // O chip de main fica na linha do commit de merge do baseline; garante a
  // linha montada antes do clique com o botao direito.
  await scrollGraphTo(page, "merge: integra feature/auth");
  // Clique posicionado na borda esquerda do chip (ver merge.spec.ts: a coluna
  // de descricao e estreita no viewport 1280 e o autor cobre o centro).
  await branchChip(page, "main").click({ button: "right", position: { x: 3, y: 10 } });
  await page.getByRole("menuitem", { name: "Rebasear feature/auth sobre esta" }).click();

  // ConfirmHost destrutivo: botao de hold com "Segure para rebase" (1.4 s).
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Rebase de feature/auth sobre main" }),
  ).toBeVisible();
  const hold = dialog.getByRole("button", { name: "Segure para rebase" });
  await expect(hold).toBeVisible();
  await hold.hover();
  await page.mouse.down();
  await page.waitForTimeout(1_700); // > 1.4 s da rampa do hold
  await page.mouse.up();

  // Toast do menu: "{branch} rebaseada sobre {onto}".
  await expectToast(page, "feature/auth rebaseada sobre main");

  // git CLI: o hash MUDOU e o reflog registrou o rebase.
  const afterHash = git(fixture, "rev-parse", "feature/auth");
  expect(afterHash).not.toBe(beforeHash);
  expect(git(fixture, "reflog", "-1", "--format=%gs", "feature/auth")).toContain("rebase (finish)");
  // Exatamente 1 commit em main..feature/auth: o local, reescrito.
  expect(git(fixture, "log", "--format=%s", "main..feature/auth")).toBe(LOCAL_SUBJECT);
  // Arvore final esperada: main + o conteudo do commit reescrito.
  expect(git(fixture, "diff", "main...feature/auth", "--stat")).toContain("auth.txt");

  // Grafo virtualizado: o commit reescrito aparece na area visivel (o refresh
  // pos-operacao passa por um instante com a lista vazia — o expect re-tenta).
  await expect(graphCommitRow(page, LOCAL_SUBJECT).first()).toBeVisible({ timeout: 15_000 });
});
