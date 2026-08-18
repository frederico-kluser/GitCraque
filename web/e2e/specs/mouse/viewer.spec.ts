/**
 * VIEWER DE DIFF — os elementos que a onda 2 (squash 3a203d19) adicionou e que
 * a campanha ainda nao cobria: navegacao prev/next entre os arquivos de um
 * commit (`web/src/panels/FileViewPanel.tsx`), o colapso de hunk
 * (`web/src/viewer/DiffView.tsx`, aria-expanded) e o highlight intra-linha do
 * word-diff (segmentos `words` com `WORD_TONE`).
 *
 * O commit do spec e criado via git CLI no fixture (convencao da campanha:
 * identidade Ana Torres) porque NENHUM commit do baseline tem 2+ arquivos na
 * lista do detalhe: o unico candidato, o merge "merge: integra feature/auth",
 * sai VAZIO — `getCommitFiles` usa `git show --name-status` SEM `-m`
 * (`server/src/git/log.mjs:361-364`), e `git show` de merge sem `-m` nao
 * lista arquivo nenhum.
 *
 * O commit novo tem tres arquivos:
 *   - alpha.txt e beta.txt: novos;
 *   - src.txt: "linha 3" vira "linha 33" — a troca de palavra que o
 *     `--word-diff=porcelain` destaca como segmentos del "3" / add "33"
 *     (verificado contra o backend: `getDiff` com wordDiff devolve
 *     `words:[{kind:"context",text:"linha "},{kind:"del"|"add",text:"3"|"33"}]`).
 * Ordem da lista = ordem do `git show --name-status` (alfabetica): alpha,
 * beta, src.
 *
 * Fluxo para abrir um arquivo: clique na linha do commit no grafo (seleciona)
 * → lista de arquivos no detalhe → clique na linha do arquivo → FileViewPanel.
 */
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { PORTS } from "../../playwright.config.ts";
import { makeFixture } from "../../harness/fixture.ts";
import { startAppServer, type RunningServer } from "../../harness/servers.ts";
import { graphCommitRow, waitForGraph } from "../../harness/ui.ts";
import { gitAsAuthor } from "./git-cli.ts";
import { openAppResilient } from "./retry.ts";

/** Subject do commit criado pelo spec (contrato interno). */
const VIEWER_SUBJECT = "feat(vetor): navegacao de arquivos";
/** Ordem dos arquivos na lista do commit (`git show --name-status`). */
const FIRST_FILE = "alpha.txt";
const MIDDLE_FILE = "beta.txt";
const LAST_FILE = "src.txt";

let fixture: string;
let server: RunningServer;

test.beforeAll(async () => {
  fixture = await makeFixture();
  // Commit com 3 arquivos: 2 novos + mudanca de palavra em src.txt. O
  // `src.txt` do fixture termina com a linha suja "nao commitado" (baseline);
  // o overwrite deixa so as quatro linhas, com a "linha 3" alterada.
  fs.writeFileSync(path.join(fixture, FIRST_FILE), "alpha 1\nalpha 2\nalpha 3\n");
  fs.writeFileSync(path.join(fixture, MIDDLE_FILE), "beta 1\nbeta 2\n");
  fs.writeFileSync(path.join(fixture, LAST_FILE), "linha 1\nlinha 2\nlinha 33\nlinha 4\n");
  gitAsAuthor(fixture, "add", FIRST_FILE, MIDDLE_FILE, LAST_FILE);
  gitAsAuthor(fixture, "commit", "-q", "-m", VIEWER_SUBJECT);
  server = await startAppServer(fixture, PORTS.mouse);
});

test.beforeEach(async ({ page }) => {
  await openAppResilient(page);
  await waitForGraph(page);
});

test.afterAll(async () => {
  await server?.stop();
});

/** Seleciona o commit do spec no grafo e espera a lista de arquivos. */
async function openCommit(page: Page): Promise<void> {
  const row = graphCommitRow(page, VIEWER_SUBJECT);
  await row.first().click();
  await expect(page.getByRole("button", { name: FIRST_FILE })).toBeVisible();
}

/**
 * O visualizador esta mostrando `name`. O section carrega o aria-label
 * "Visualizador de {path}" (`viewer.label`, pt.ts:404) — unico por arquivo,
 * mesmo durante o crossfade do SidePanel, que so dura quando a tela TROCA
 * (detalhe → view); a navegacao prev/next re-renderiza a mesma tela.
 */
async function expectOpenFile(page: Page, name: string): Promise<void> {
  await expect(page.locator(`[aria-label="Visualizador de ${name}"]`)).toBeVisible();
}

test("prev/next trocam o arquivo aberto do commit", async ({ page }) => {
  await openCommit(page);

  // Abre o PRIMEIRO arquivo da lista.
  await page.getByRole("button", { name: FIRST_FILE }).click();
  await expectOpenFile(page, FIRST_FILE);
  // O diff dele aparece (conteudo do arquivo novo).
  await expect(page.getByText("alpha 1", { exact: true })).toBeVisible();

  // Proximo: beta.txt — o titulo do visualizador muda.
  await page.getByRole("button", { name: "Próximo arquivo" }).click();
  await expectOpenFile(page, MIDDLE_FILE);
  await expect(page.getByText("beta 1", { exact: true })).toBeVisible();

  // Proximo de novo: src.txt.
  await page.getByRole("button", { name: "Próximo arquivo" }).click();
  await expectOpenFile(page, LAST_FILE);
  await expect(page.getByText("linha 33", { exact: true })).toBeVisible();

  // Volta um: beta.txt de novo.
  await page.getByRole("button", { name: "Arquivo anterior" }).click();
  await expectOpenFile(page, MIDDLE_FILE);
  await expect(page.getByText("beta 1", { exact: true })).toBeVisible();
});

test("prev fica desabilitado na ponta inicial e next na final", async ({ page }) => {
  await openCommit(page);
  const prev = page.getByRole("button", { name: "Arquivo anterior" });
  const next = page.getByRole("button", { name: "Próximo arquivo" });

  // Ponta inicial: so o "Próximo" existe.
  await page.getByRole("button", { name: FIRST_FILE }).click();
  await expectOpenFile(page, FIRST_FILE);
  await expect(prev).toBeDisabled();
  await expect(next).toBeEnabled();

  // Meio: os dois habilitados.
  await next.click();
  await expectOpenFile(page, MIDDLE_FILE);
  await expect(prev).toBeEnabled();
  await expect(next).toBeEnabled();

  // Ponta final: so o "Anterior" existe.
  await next.click();
  await expectOpenFile(page, LAST_FILE);
  await expect(prev).toBeEnabled();
  await expect(next).toBeDisabled();
});

test("o header de hunk colapsa o bloco e expande de volta", async ({ page }) => {
  await openCommit(page);
  await page.getByRole("button", { name: LAST_FILE }).click();
  await expectOpenFile(page, LAST_FILE);

  // O cabecalho do hunk e um botao: aria-expanded=true e o label de recolher
  // (`diff.hunk.collapse` = "Recolher bloco de alterações", pt.ts:432).
  const collapse = page.getByRole("button", { name: "Recolher bloco de alterações" });
  await expect(collapse).toBeVisible();
  await expect(collapse).toHaveAttribute("aria-expanded", "true");

  // Clique: colapsa — aria-expanded=false, o label vira expandir
  // (`diff.hunk.expand` = "Expandir bloco de alterações", pt.ts:433) e as
  // reticencias substituem as linhas do hunk.
  await collapse.click();
  const expand = page.getByRole("button", { name: "Expandir bloco de alterações" });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("…", { exact: true })).toBeVisible();
  await expect(page.getByText("linha 33", { exact: true })).toBeHidden();

  // De novo no header: expande — volta ao estado inicial.
  await expand.click();
  await expect(page.getByRole("button", { name: "Recolher bloco de alterações" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.getByText("…", { exact: true })).toBeHidden();
  await expect(page.getByText("linha 33", { exact: true })).toBeVisible();
});

test("a linha alterada renderiza segmentos com destaque intra-linha", async ({ page }) => {
  await openCommit(page);
  await page.getByRole("button", { name: LAST_FILE }).click();
  await expectOpenFile(page, LAST_FILE);

  // O word-diff (o viewer pede `wordDiff: true` em `useDiffResource`) divide a
  // linha em segmentos com `WORD_TONE`: a palavra removida "3" carrega
  // `bg-diff-del-fg` e a adicionada "33" carrega `bg-diff-add-fg` — os fundos
  // fortes invertidos que destacam a palavra sobre o fundo fraco da linha.
  const removedWord = page.locator("span.bg-diff-del-fg", { hasText: "3" });
  const addedWord = page.locator("span.bg-diff-add-fg", { hasText: "33" });
  await expect(removedWord).toBeVisible();
  await expect(addedWord).toBeVisible();

  // E o segmento NAO e a linha inteira: a linha ainda mostra o texto completo
  // com as duas versoes ("linha 3" removida e "linha 33" adicionada).
  await expect(page.getByText("linha 3", { exact: true })).toBeVisible();
  await expect(page.getByText("linha 33", { exact: true })).toBeVisible();
});
