/**
 * PUSH — menu de contexto da branch (caminho vivo do mapa, secao 3.2:
 * "Push desta branch") envia um commit local para o remoto REAL (GitHub).
 *
 * O commit local e criado via CLI no fixture (runtime data, convencao da
 * campanha) — o push precisa de um HEAD local que o remoto nao tem.
 *
 * Fluxo:
 *   1. teste: re-alinha o remoto ao baseline DESTE fixture (cada makeFixture
 *      gera hashes novos — sem o alinhamento o push seria rejeitado com
 *      "fetch first"), cria um commit "feat: commit local para push" em main
 *      (CLI, runtime data), `ensureRemoteAuth` (token do gh no cofre do
 *      app), "Push desta branch" pelo "⋯" da linha da branch no RAIL →
 *      ConfirmHost nao-destrutivo (openPushDialog nunca liga destructive —
 *      defeito conhecido documentado na skill composing-shell-interface) →
 *      botao "Push" — DENTRO do dialog, porque ha dois textos "Push" (titulo
 *      e botao) → toast "Push concluído" (+ confete do app);
 *   2. verificacao: `git ls-remote origin refs/heads/main` == main local.
 *
 * Teardown: main local volta ao baseline ANTES do `resetRemote` (que
 * force-push do main local do fixture) — assim o remoto fica limpo para as
 * specs touch.
 */
import { expect, test } from "@playwright/test";
import { PORTS } from "../../playwright.config.ts";
import { ensureRemoteAuth, makeFixture, resetRemote } from "../../harness/fixture.ts";
import { startAppServer, type RunningServer } from "../../harness/servers.ts";
import { expectToast, waitForGraph } from "../../harness/ui.ts";
import { openAppResilient, waitRemoteQuiet, withRetry } from "./retry.ts";
import { git, gitAsAuthor, gitLsRemote } from "./git-cli.ts";

/** Commit local que o push publica no remoto. */
const LOCAL_SUBJECT = "feat: commit local para push";

let fixture: string;
let server: RunningServer;
let baselineMain: string;

test.beforeAll(async () => {
  fixture = await makeFixture();
  baselineMain = git(fixture, "rev-parse", "main");
  // O alinhamento do remoto e o commit local ficam DENTRO do retry do fluxo
  // (o teste): cada tentativa re-alinha o remoto ao baseline DESTE fixture e
  // recria o commit — o fixture sobe no estado baseline puro.
  server = await startAppServer(fixture, PORTS.mouse);
});

test.beforeEach(async ({ page }) => {
  await openAppResilient(page);
  await waitForGraph(page);
});

test.afterAll(async () => {
  await server?.stop();
  // main local volta ao baseline ANTES do resetRemote (que force-push do
  // main local do fixture — sem o reset, o remoto ficaria com o commit
  // empurrado pela spec).
  git(fixture, "reset", "--hard", baselineMain);
  await withRetry("resetRemote", () => resetRemote(fixture));
});

test("push envia o commit local para o remoto", async ({ page }) => {
  // O FLUXO INTEIRO com retry: o projeto touch muta o MESMO remoto real em
  // paralelo e pode re-alinhar o origin/main entre os nossos passos (o push
  // morreria em "rejected (fetch first)" ou a verificacao pegaria o remoto
  // ja re-alinhado). Cada tentativa re-alinha o remoto ao baseline DESTE
  // fixture, recria o commit local e repete o push.
  await withRetry("fluxo de push", async () => {
    // Espera o remoto quieto antes de comecar a sequencia de mutacoes (o
    // projeto touch muda o origin/main em rajadas quando roda em paralelo).
    await waitRemoteQuiet(() => gitLsRemote(fixture, "refs/heads/main"));
    // Estado deterministico por tentativa: main local de volta ao baseline
    // ANTES do resetRemote — o resetRemote force-push do main LOCAL, e sem o
    // reset ele empurraria o commit do beforeAll em vez do baseline e o push
    // seguinte morreria em "fetch first".
    git(fixture, "reset", "--hard", baselineMain);
    await withRetry("resetRemote", () => resetRemote(fixture));
    gitAsAuthor(fixture, "add", "-A");
    // --allow-empty: numa tentativa repetida a arvore ja esta no baseline e o
    // git recusaria "nothing to commit"; o conteudo do commit nao importa.
    gitAsAuthor(fixture, "commit", "-q", "--allow-empty", "-m", LOCAL_SUBJECT);

    // Token do GitHub no cofre do app — o push roda autenticado. Usa a porta
    // do CONFIG (nao `server.baseUrl`): a varredura de saude do harness cobre
    // 5372..5382 e pode pegar o servidor do projeto vizinho (touch=5373)
    // quando o nosso sobe devagar sob carga — o app e a spec inteira operam
    // na porta do config.
    await ensureRemoteAuth(`http://127.0.0.1:${PORTS.mouse}`);

    // "Push desta branch" pelo "⋯" da linha da branch no RAIL (caminho vivo
    // do mapa, secao 3.2): no viewport 1280 o chip de main no grafo fica
    // atras da coluna do autor quando o chip HEAD ocupa a celula estreita de
    // descricao, entao o rail e a porta confiavel para a branch atual.
    // exact: a LINHA do rail tambem e role=button ("main HEAD Ações da
    // branch main") — o gatilho e so o botao com o rotulo exato.
    await page.getByRole("button", { name: "Ações da branch main", exact: true }).click();
    await page.getByRole("menuitem", { name: "Push desta branch" }).click();

    // ConfirmHost do push: titulo "Push" e botao "Push" — escopado DENTRO do
    // dialog (ha dois "Push": o heading e o botao de confirmar).
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Push" })).toBeVisible();
    await dialog.getByRole("button", { name: "Push", exact: true }).click();

    // Toast de conclusao (rede real — timeout folgado).
    await expectToast(page, "Push concluído", 20_000);

    // git CLI: o remoto REAL esta no HEAD local de main.
    const local = git(fixture, "rev-parse", "main");
    expect(local).not.toBe(baselineMain);
    expect(gitLsRemote(fixture, "refs/heads/main")).toBe(local);
  }, { tries: 2 });
});
