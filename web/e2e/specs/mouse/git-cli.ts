/**
 * Verificacao git CLI das specs de mouse — a contraparte do que a UI faz.
 *
 * Disciplina:
 *  - config global/sistema NEUTRALIZADA (`GIT_CONFIG_GLOBAL=/dev/null`): as
 *    verificacoes sao deterministicas e nao dependem do usuario da maquina;
 *  - commits via CLI (runtime data, convencao da campanha) usam a identidade
 *    do fixture (Ana Torres), como o `scripts/make-fixture.mjs`;
 *  - `ls-remote` contra o GitHub usa o helper de credencial do gh (o token
 *    vive so no ambiente, nunca em argv/env do git — mesma regra do
 *    `scripts/remote-mutate.mjs`).
 */
import { execFileSync } from "node:child_process";

const BASE_ENV: Record<string, string> = {
  ...(process.env as Record<string, string>),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
};

/** Identidade deterministica do fixture para os commits criados via CLI. */
const FIXTURE_AUTHOR: Record<string, string> = {
  GIT_AUTHOR_NAME: "Ana Torres",
  GIT_AUTHOR_EMAIL: "ana@exemplo.dev",
  GIT_COMMITTER_NAME: "Ana Torres",
  GIT_COMMITTER_EMAIL: "ana@exemplo.dev",
};

function runGit(fixture: string, args: string[], env: Record<string, string>): string {
  const out = execFileSync("git", ["-C", fixture, ...args], {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return out.trim();
}

/** `git -C <fixture> <args>` — so leitura (log, rev-parse, diff, reflog). */
export function git(fixture: string, ...args: string[]): string {
  return runGit(fixture, args, BASE_ENV);
}

/** Variante com a identidade do fixture — para commits locais (runtime data). */
export function gitAsAuthor(fixture: string, ...args: string[]): string {
  return runGit(fixture, args, { ...BASE_ENV, ...FIXTURE_AUTHOR });
}

/**
 * `git ls-remote origin <ref>` com o helper de credencial do gh. Devolve o
 * hash, ou "" se a ref nao existir no remoto.
 */
export function gitLsRemote(fixture: string, ref: string): string {
  const out = runGit(
    fixture,
    ["-c", "credential.helper=!gh auth git-credential", "ls-remote", "origin", ref],
    BASE_ENV,
  );
  return out.split(/\s+/)[0] ?? "";
}
