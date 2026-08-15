/**
 * Gestao do fixture de operacoes git (gitcraque-teste-operacoes).
 *
 * Interface contratada com o script `scripts/make-fixture.mjs` (entregue pelo
 * agente de fixture desta onda): roda a partir da raiz do repo, imprime o path
 * do fixture criado na stdout e nao toca em nada alem disso. `remote-mutate.mjs`
 * segue a mesma convencao de argv: `--reset <fixture>` e `--add-one <fixture>`
 * (path posicional).
 *
 * O token do GitHub (via `gh auth token`) e carregado na API local de
 * credenciais do app (`POST /api/credentials`) para o trampolim de askpass
 * autenticar pull/push. Ele NUNCA aparece em logs, saida nem codigo: fica em
 * memoria neste modulo e nunca e impresso.
 */
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { ROOT } from "./servers.ts";

const execFileP = promisify(execFile);

/** Sobrescrita de diagnostico (ex.: validar o canario antes do merge do script real). */
const FIXTURE_SCRIPT = process.env.GITCRAQUE_E2E_FIXTURE_SCRIPT
  ? path.resolve(process.env.GITCRAQUE_E2E_FIXTURE_SCRIPT)
  : path.join(ROOT, "scripts", "make-fixture.mjs");

/** Sobrescrita de diagnostico (par do GITCRAQUE_E2E_FIXTURE_SCRIPT). */
const REMOTE_MUTATE_SCRIPT = process.env.GITCRAQUE_E2E_REMOTE_MUTATE_SCRIPT
  ? path.resolve(process.env.GITCRAQUE_E2E_REMOTE_MUTATE_SCRIPT)
  : path.join(ROOT, "scripts", "remote-mutate.mjs");

/** Credencial que o trampolim do app vai oferecer ao git no GitHub. */
const GITHUB_HOST = "github.com";
const GITHUB_USERNAME = "frederico-kluser";
let cachedToken: string | null = null;

function assertScript(script: string, hint: string): void {
  if (!fs.existsSync(script)) {
    throw new Error(
      `nao achei o script ${script}. ${hint}`,
    );
  }
}

/**
 * Cria um fixture novo rodando `scripts/make-fixture.mjs` e devolve o path
 * impresso na stdout. Falha com mensagem clara se o script faltar (a ordem de
 * merge da onda e: fixture primeiro, harness depois) ou se o path nao existir
 * no disco apos a execucao.
 */
export async function makeFixture(): Promise<string> {
  assertScript(
    FIXTURE_SCRIPT,
    "O script de fixture e entregue pelo agente de fixture desta onda (ordem de merge: fixture, depois harness). " +
      "Para validar o harness antes desse merge, aponte a env GITCRAQUE_E2E_FIXTURE_SCRIPT para um script " +
      "com a mesma interface (imprime o path na stdout).",
  );
  const { stdout, stderr } = await execFileP(process.execPath, [FIXTURE_SCRIPT], {
    cwd: ROOT,
    maxBuffer: 1_048_576,
  });
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  const fixture = lines.find((line) => {
    if (!path.isAbsolute(line)) return false;
    try {
      return fs.existsSync(path.join(line, ".git"));
    } catch {
      return false;
    }
  });
  if (!fixture) {
    throw new Error(
      `make-fixture nao imprimiu um path de repositorio git na stdout. Saida:\n${stdout}\n${stderr}`,
    );
  }
  return fixture;
}

/** Volta o remoto do fixture ao estado baseline (desfaz commits e pushs das specs). */
export async function resetRemote(fixturePath: string): Promise<void> {
  assertScript(
    REMOTE_MUTATE_SCRIPT,
    "O script de mutacao do remoto e entregue pelo agente de fixture desta onda (ordem de merge: fixture, depois harness).",
  );
  const { stderr } = await execFileP(
    process.execPath,
    [REMOTE_MUTATE_SCRIPT, "--reset", fixturePath],
    { cwd: ROOT, maxBuffer: 1_048_576 },
  );
  if (stderr.trim()) process.stderr.write(`[e2e] remote-mutate --reset: ${stderr.trim()}\n`);
}

/** Adiciona um commit novo no remoto do fixture (para puxar). */
export async function addRemoteCommit(fixturePath: string): Promise<void> {
  assertScript(
    REMOTE_MUTATE_SCRIPT,
    "O script de mutacao do remoto e entregue pelo agente de fixture desta onda (ordem de merge: fixture, depois harness).",
  );
  const { stderr } = await execFileP(
    process.execPath,
    [REMOTE_MUTATE_SCRIPT, "--add-one", fixturePath],
    { cwd: ROOT, maxBuffer: 1_048_576 },
  );
  if (stderr.trim()) process.stderr.write(`[e2e] remote-mutate --add-one: ${stderr.trim()}\n`);
}

/**
 * Garante que o trampolim de askpass do app conhece a credencial do GitHub:
 * registra via `POST /api/credentials` contra a API local se o host ainda nao
 * estiver no cofre. O token vem de `gh auth token` e mora so em memoria.
 *
 * Se o login do gh falhar, os testes de pull/push DEVEM falhar com mensagem
 * clara — nunca silenciosamente.
 */
export async function ensureRemoteAuth(baseUrl: string): Promise<void> {
  const entries = (await fetch(`${baseUrl}/api/credentials`).then((r) => r.json())).entries as Array<{
    host: string;
  }>;
  if (entries.some((e) => e.host === GITHUB_HOST)) return;

  const token = readGithubToken();
  const res = await fetch(`${baseUrl}/api/credentials`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host: GITHUB_HOST, username: GITHUB_USERNAME, token }),
  });
  if (!res.ok) {
    throw new Error(
      `nao consegui registrar a credencial do GitHub na API local (HTTP ${res.status}): ` +
        `${await res.text()}`,
    );
  }
}

function readGithubToken(): string {
  if (cachedToken !== null) return cachedToken;
  try {
    const raw = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    cachedToken = raw.trim();
    if (!cachedToken) throw new Error("token vazio");
    return cachedToken;
  } catch {
    throw new Error(
      "`gh auth token` falhou — sem token nao ha como autenticar pull/push contra o GitHub. " +
        "Rode `gh auth login` e tente de novo; os testes de rede falham por design neste caso.",
    );
  }
}
