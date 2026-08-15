/**
 * PULL — o botao da toolbar (layout completo, viewport desktop 1280 px) puxa
 * um commit criado no remoto REAL (GitHub) e o grafo mostra o commit novo.
 *
 * Fluxo:
 *   1. `addRemoteCommit` cria 1 commit no remoto (subject fixo);
 *   2. `ensureRemoteAuth` registra o token do gh no cofre do app (askpass);
 *   3. clique em "Pull" na toolbar → toast "Pull concluído";
 *   4. verificacao git CLI: o subject do commit remoto esta no topo do log
 *      local de main;
 *   5. verificacao no GRAFO (virtualizado): a linha do commit aparece.
 *
 * Teardown: o main local volta ao baseline e o remoto e restaurado — o
 * `resetRemote` do harness force-push do main LOCAL, por isso o fixture
 * precisa do hash do baseline antes de qualquer mutacao.
 */
import { expect, test } from "@playwright/test";
import { PORTS } from "../../playwright.config.ts";
import { addRemoteCommit, ensureRemoteAuth, makeFixture, resetRemote } from "../../harness/fixture.ts";
import { startAppServer, type RunningServer } from "../../harness/servers.ts";
import { expectToast, graphCommitRow, waitForGraph } from "../../harness/ui.ts";
import { openAppResilient, waitRemoteQuiet, withRetry } from "./retry.ts";
import { git, gitLsRemote } from "./git-cli.ts";

/** Subject do commit que o remote-mutate adiciona (contrato com scripts/remote-mutate.mjs). */
const REMOTE_SUBJECT = "feat: mudanca remota para teste de pull";

let fixture: string;
let server: RunningServer;
let baselineMain: string;

test.beforeAll(async () => {
  fixture = await makeFixture();
  baselineMain = git(fixture, "rev-parse", "main");
  // ALINHA o remoto ao baseline DESTE fixture: cada makeFixture gera hashes
  // novos, e o origin/main pode estar num baseline de outra execucao — sem o
  // alinhamento o pull morreria em "unrelated histories". Retry: o projeto
  // touch muta o mesmo remoto em paralelo e o GitHub rejeita pushs
  // concorrentes com "cannot lock ref".
  await withRetry("resetRemote", () => resetRemote(fixture));
  // O pull do app roda `git pull --progress` SEM remote/branch — exige que a
  // branch atual rastreeie um remoto (sem upstream o git morre em "There is
  // no tracking information"). O makeFixture nao seta o upstream.
  git(fixture, "branch", "--set-upstream-to=origin/main", "main");
  server = await startAppServer(fixture, PORTS.mouse);
});

test.beforeEach(async ({ page }) => {
  await openAppResilient(page);
  await waitForGraph(page);
});

test.afterAll(async () => {
  await server?.stop();
  // main local volta ao baseline ANTES do resetRemote (que force-push do
  // main local do fixture — sem o reset, o remoto ficaria com o commit puxado).
  git(fixture, "reset", "--hard", baselineMain);
  await withRetry("resetRemote", () => resetRemote(fixture));
});

test("pull traz o commit do remoto e o grafo mostra a linha nova", async ({ page }) => {
  // O FLUXO INTEIRO com retry: o projeto touch muta o MESMO remoto real em
  // paralelo e pode re-alinhar o origin/main entre os nossos passos (o pull
  // morreria em "unrelated histories"). Cada tentativa re-alinha o remoto ao
  // baseline DESTE fixture, refaz o commit remoto e repete o pull.
  await withRetry("fluxo de pull", async () => {
    // Espera o remoto quieto antes de comecar a sequencia de mutacoes (o
    // projeto touch muda o origin/main em rajadas quando roda em paralelo).
    await waitRemoteQuiet(() => gitLsRemote(fixture, "refs/heads/main"));
    // Estado deterministico por tentativa: main local de volta ao baseline
    // ANTES do resetRemote — o resetRemote force-push do main LOCAL, e sem o
    // reset ele empurraria o estado puxado da tentativa anterior.
    git(fixture, "reset", "--hard", baselineMain);
    await withRetry("resetRemote", () => resetRemote(fixture));
    await withRetry("addRemoteCommit", () => addRemoteCommit(fixture));

    // Token do GitHub no cofre do app — o pull roda autenticado. Usa a porta
    // do CONFIG (nao `server.baseUrl`): a varredura de saude do harness cobre
    // 5372..5382 e pode pegar o servidor do projeto vizinho (touch=5373)
    // quando o nosso sobe devagar sob carga — o app e a spec inteira operam
    // na porta do config.
    await ensureRemoteAuth(`http://127.0.0.1:${PORTS.mouse}`);

    // Toolbar (desktop): botao "Pull" com o texto pt do catalogo.
    const pullButton = page.getByRole("button", { name: "Pull", exact: true });
    await expect(pullButton).toBeVisible();
    await pullButton.click();

    // Toast de conclusao (some em 5 s — assere logo apos a acao; rede real
    // pode demorar, por isso o timeout mais folgado).
    await expectToast(page, "Pull concluído", 20_000);

    // git CLI: o commit remoto esta no topo do log local de main.
    expect(git(fixture, "log", "-1", "--format=%s")).toBe(REMOTE_SUBJECT);

    // Grafo virtualizado: o commit puxado aparece na area visivel (o refresh
    // pos-operacao passa por um instante com a lista vazia — o expect
    // re-tenta).
    await expect(graphCommitRow(page, REMOTE_SUBJECT).first()).toBeVisible({ timeout: 20_000 });
  }, { tries: 2 });
});
