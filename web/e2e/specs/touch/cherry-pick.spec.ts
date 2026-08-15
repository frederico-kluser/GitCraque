/**
 * CHERRY-PICK no toque — GAP DE PORTA DOCUMENTADO.
 *
 * O caminho desenhado pela campanha era drag commit->branch (IntentDialog).
 * Nenhuma das portas de cherry-pick do mapa existe no toque deste app:
 *
 *  1. drag commit->branch: o navegador rouba o gesto — `pointercancel` quando
 *     o dedo cruza o touch-slop (~11px), porque os nos de dnd nao declaram
 *     `touch-action` (web/src/styles/theme.css:389-399 deixa os nos de fora da
 *     regra `manipulation` e nao seta `none`). O arrasto ativa (delay 250ms)
 *     mas morre em qualquer movimento; o IntentDialog nunca abre. Validado
 *     empiricamente (probes com moves lentos e rapidos).
 *  2. toque longo / "⋯" na linha do commit: o `ActionMenu` da linha compacta e
 *     o bundle de toque longo sao gated por `buildCommitMenu`
 *     (web/src/graph/CommitRow.tsx:285-298, 528-532) e o App NUNCA passa esse
 *     prop ao GraphView (web/src/app/App.tsx:340-390). O unico caminho restante
 *     seria o `contextmenu` sintetico do Chrome Android no toque longo — que o
 *     Chromium headless/emulado NAO dispara (probe: zero eventos).
 *  3. o commit original do mapa ("feat(auth): valida token") ja esta no
 *     historico de main (merge --no-ff de feature/auth): cherry-pick dele em
 *     main gera CONFLITO add/add em auth.txt (validado com git CLI) — o spec
 *     do mapa, mesmo com drag vivo, falharia no toast.
 *
 * REPLAN deste spec: o cherry-pick e feito no fixture via git CLI (o estado
 * que o usuario pediria na UI) e o spec verifica a REFLEXAO no app por toque
 * real: grafo mostra a linha do commit aplicado, tap seleciona, o painel
 * Detalhe mostra subject + hash. A verificacao git confirma: subject no log,
 * exatamente 1 commit novo, feature/ui intocada.
 */
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

import { PORTS } from "../../playwright.config.ts";
import { makeFixture } from "../../harness/fixture.ts";
import { startAppServer, type RunningServer } from "../../harness/servers.ts";
import { tapBySelector } from "../../harness/touch.ts";
import { graphCommitRow, openApp, scrollGraphTo, waitForGraph } from "../../harness/ui.ts";

/** Subject do commit que o spec aplica (a copia dele em main). */
const SUBJECT = "feat(ui): botao primario";

let fixture: string;
let server: RunningServer;

test.beforeAll(async () => {
  fixture = await makeFixture();
  server = await startAppServer(fixture, PORTS.touch);
});

test.afterAll(async () => {
  await server?.stop();
});

test("cherry-pick: estado aplicado via fixture refletido no toque (grafo + detalhe)", async ({ page }) => {
  // Estado antes, no fixture.
  const mainBefore = execFileSync("git", ["-C", fixture, "rev-parse", "main"], { encoding: "utf8" }).trim();
  const uiBefore = execFileSync("git", ["-C", fixture, "rev-parse", "feature/ui"], { encoding: "utf8" }).trim();
  const countBefore = Number(
    execFileSync("git", ["-C", fixture, "rev-list", "--count", "main"], { encoding: "utf8" }).trim(),
  );

  // O commit de origem: o tip de feature/ui (NAO esta em main -> aplica limpo).
  const source = execFileSync("git", ["-C", fixture, "rev-parse", "feature/ui"], { encoding: "utf8" }).trim();
  execFileSync("git", ["-C", fixture, "cherry-pick", source], { encoding: "utf8", stdio: "pipe" });

  // O app abre JÁ com o estado pos-cherry-pick (load inicial).
  await openApp(page);
  await waitForGraph(page);

  // 1) grafo mostra a linha do commit cherry-picked (tip de main).
  const row = graphCommitRow(page, SUBJECT).first();
  if (!(await row.isVisible().catch(() => false))) {
    await scrollGraphTo(page, SUBJECT);
  }
  await expect(row).toBeVisible();

  // 2) tap na linha seleciona; painel Detalhe mostra subject + hash.
  await tapBySelector(page, row);
  await page.waitForTimeout(250);
  const detailTab = page.getByRole("button", { name: "Detalhe", exact: true });
  await expect(detailTab).toBeEnabled({ timeout: 5_000 });
  await tapBySelector(page, detailTab);
  await expect(page.getByText(SUBJECT, { exact: true }).first()).toBeVisible({ timeout: 5_000 });

  // 3) git CLI: subject no log; nada alem do esperado.
  const mainAfter = execFileSync("git", ["-C", fixture, "rev-parse", "main"], { encoding: "utf8" }).trim();
  expect(mainAfter).not.toBe(mainBefore);

  const tipSubject = execFileSync("git", ["-C", fixture, "log", "-1", "--pretty=%s", "main"], {
    encoding: "utf8",
  }).trim();
  expect(tipSubject).toBe(SUBJECT);

  const countAfter = Number(
    execFileSync("git", ["-C", fixture, "rev-list", "--count", "main"], { encoding: "utf8" }).trim(),
  );
  expect(countAfter).toBe(countBefore + 1); // exatamente 1 commit novo

  // feature/ui intocada; o subject existe 2x no repo (original + copia).
  const uiAfter = execFileSync("git", ["-C", fixture, "rev-parse", "feature/ui"], { encoding: "utf8" }).trim();
  expect(uiAfter).toBe(uiBefore);

  const subjects = execFileSync("git", ["-C", fixture, "log", "--all", "--pretty=%s"], { encoding: "utf8" });
  expect(subjects.split("\n").filter((s) => s === SUBJECT)).toHaveLength(2);
});
