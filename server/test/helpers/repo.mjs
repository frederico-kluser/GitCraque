/**
 * Fixture: monta um repositorio git de verdade em /tmp para os testes.
 *
 * O historico e desenhado para bater exatamente nas armadilhas do backend:
 *  - um commit com `|` no assunto (a armadilha do parser de log);
 *  - varias branches e um merge (o grafo tem de ter ramificacao);
 *  - tag anotada e tag leve;
 *  - uma worktree extra (a troca por process.chdir);
 *  - uma branch com 3 commits sequenciais para o squash.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** O assunto com pipe: e ele que quebra qualquer parser ingenuo. */
export const PIPE_SUBJECT = "feat: pipeline | etapa 2 | com pipes no assunto";

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Teste GitCraque",
  GIT_AUTHOR_EMAIL: "teste@gitcraque.dev",
  GIT_COMMITTER_NAME: "Teste GitCraque",
  GIT_COMMITTER_EMAIL: "teste@gitcraque.dev",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  LC_ALL: "C",
  LANG: "C",
};

export function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, env: ENV, encoding: "utf8" }).trim();
}

function write(cwd, file, content) {
  const target = path.join(cwd, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function commit(cwd, file, content, message) {
  write(cwd, file, content);
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", message);
  return git(cwd, "rev-parse", "HEAD");
}

/**
 * @returns {{root: string, worktree: string, cleanup: () => void, hashes: Record<string,string>}}
 */
export function makeFixtureRepo(prefix = "gitcraque-test-") {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const root = path.join(base, "repo");
  fs.mkdirSync(root);

  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Teste GitCraque");
  git(root, "config", "user.email", "teste@gitcraque.dev");
  git(root, "config", "commit.gpgsign", "false");

  const hashes = {};
  hashes.primeiro = commit(root, "README.md", "# fixture\n", "primeiro commit");
  hashes.pipe = commit(root, "src/app.js", "console.log(1)\n", PIPE_SUBJECT);

  git(root, "tag", "-a", "v1.0", "-m", "release anotada 1.0");
  git(root, "tag", "leve");

  // Branch de feature que depois vira merge.
  git(root, "checkout", "-q", "-b", "feature/login");
  hashes.login1 = commit(root, "src/login.js", "export const login = 1\n", "feat: tela de login");
  hashes.login2 = commit(root, "src/login.js", "export const login = 2\n", "fix: valida a senha");

  git(root, "checkout", "-q", "main");
  hashes.mainExtra = commit(root, "docs/nota.md", "nota\n", "docs: nota solta na main");
  git(root, "merge", "-q", "--no-ff", "feature/login", "-m", "merge: feature/login na main");
  hashes.merge = git(root, "rev-parse", "HEAD");

  // Branch descartavel com 3 commits sequenciais, para o teste de squash.
  git(root, "checkout", "-q", "-b", "squash-me");
  hashes.s1 = commit(root, "squash.txt", "um\n", "wip: parte 1");
  hashes.s2 = commit(root, "squash.txt", "um\ndois\n", "wip: parte 2");
  hashes.s3 = commit(root, "squash.txt", "um\ndois\ntres\n", "wip: parte 3");
  git(root, "checkout", "-q", "main");

  // Worktree extra: e o alvo do POST /api/worktrees/switch.
  const worktree = path.join(base, "wt-extra");
  git(root, "worktree", "add", "-q", "-b", "trabalho-paralelo", worktree);
  commit(worktree, "paralelo.txt", "so existe na outra worktree\n", "chore: commit na worktree extra");

  return {
    base,
    root,
    worktree,
    hashes,
    cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}

/** Repositorio recem-criado, sem commit nenhum — o estado `empty: true`. */
export function makeEmptyRepo(prefix = "gitcraque-empty-") {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  git(base, "init", "-q", "-b", "main");
  git(base, "config", "user.name", "Teste GitCraque");
  git(base, "config", "user.email", "teste@gitcraque.dev");
  return { root: base, cleanup: () => fs.rmSync(base, { recursive: true, force: true }) };
}
