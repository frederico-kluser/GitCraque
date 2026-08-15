#!/usr/bin/env node
/**
 * Monta o repositorio de fixture da campanha de testes de manipulacao de git.
 *
 * Deterministico na ESTRUTURA: mesmos subjects, mesma topologia, mesmos
 * autores/committers a cada execucao (os hashes podem variar). Espelha o
 * padrao do scripts/verify-e2e.mjs: helper git() com GIT_AUTHOR_NAME/EMAIL
 * "Ana Torres" <ana@exemplo.dev> e GIT_CONFIG_GLOBAL=/dev/null.
 *
 * Estrutura do fixture:
 *   - main: README "chore: bootstrap", "feat: primeira funcionalidade",
 *     commit com "|" no assunto, "docs: descreve o pipeline", "perf: reduz
 *     alocacao" e o merge --no-ff de feature/auth
 *   - feature/auth com 2 commits, merge --no-ff em main
 *   - feature/ui com 1 commit
 *   - experimento/squash com 3 wips
 *   - tag anotada v1.0.0
 *   - arvore suja (1 modificado nao commitado + 1 untracked)
 *   - worktree extra da branch feature/ui (pasta irma <dest>-wt)
 *   - remoto origin = https://github.com/frederico-kluser/gitcraque-teste-operacoes.git
 *     + remoto backup fake
 *
 * Uso:
 *   node scripts/make-fixture.mjs [--dest <path>] [--keep] [--create-remote]
 *
 * Flags:
 *   --dest <path>     diretorio do fixture (padrao: mkdtemp em os.tmpdir())
 *   --keep            aceito por compatibilidade com verify-e2e; no-op, pois
 *                     o fixture NAO e apagado por padrao (a campanha usa o
 *                     path impresso)
 *   --create-remote   cria o repo PRIVADO gitcraque-teste-operacoes em
 *                     frederico-kluser via `gh` e empurra o baseline da main
 *
 * Saida: UMA linha no stdout com o caminho do fixture; nada mais. Erros vao
 * para o stderr com exit != 0.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_OWNER = "frederico-kluser";
const REPO_NAME = "gitcraque-teste-operacoes";
const REPO_FULL = `${REPO_OWNER}/${REPO_NAME}`;
const ORIGIN_URL = `https://github.com/${REPO_FULL}.git`;

/** o assunto com `|` — a armadilha do formato mandatorio */
const PIPE_SUBJECT = "fix(parser): trata a|b como um caso so";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Ana Torres",
  GIT_AUTHOR_EMAIL: "ana@exemplo.dev",
  GIT_COMMITTER_NAME: "Ana Torres",
  GIT_COMMITTER_EMAIL: "ana@exemplo.dev",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
};

/** helper de credencial do gh: o token vive no ambiente (GH_TOKEN) e nunca
 * entra em argv, no env do git, em arquivos ou em logs. */
const CRED = ["-c", "credential.helper=!gh auth git-credential"];

function git(cwd, ...a) {
  const r = spawnSync("git", a, { cwd, encoding: "utf8", env: GIT_ENV });
  if (r.status !== 0) {
    throw new Error(`git ${a.join(" ")} falhou (${r.status}): ${r.stderr}`);
  }
  return r.stdout.trim();
}

function buildFixture(dest) {
  const w = (file, line, msg) => {
    fs.appendFileSync(path.join(dest, file), `${line}\n`);
    git(dest, "add", "-A");
    git(dest, "commit", "-q", "-m", msg);
  };
  git(dest, "init", "-q", "-b", "main");
  w("README.md", "# Fixture", "chore: bootstrap");
  w("src.txt", "linha 1", "feat: primeira funcionalidade");
  w("src.txt", "linha 2", PIPE_SUBJECT);
  w("src.txt", "linha 3", "docs: descreve o pipeline");
  git(dest, "checkout", "-q", "-b", "feature/auth");
  w("auth.txt", "token", "feat(auth): valida token");
  w("auth.txt", "refresh", "feat(auth): refresh de sessao");
  git(dest, "checkout", "-q", "main");
  w("src.txt", "linha 4", "perf: reduz alocacao");
  git(dest, "merge", "-q", "--no-ff", "feature/auth", "-m", "merge: integra feature/auth");
  git(dest, "checkout", "-q", "-b", "feature/ui");
  w("ui.txt", "botao", "feat(ui): botao primario");
  git(dest, "checkout", "-q", "main");
  git(dest, "checkout", "-q", "-b", "experimento/squash");
  w("exp.txt", "a", "wip: parte 1");
  w("exp.txt", "b", "wip: parte 2");
  w("exp.txt", "c", "wip: parte 3");
  git(dest, "checkout", "-q", "main");
  git(dest, "tag", "-a", "v1.0.0", "-m", "primeira versao estavel");
  fs.appendFileSync(path.join(dest, "src.txt"), "nao commitado\n");
  fs.writeFileSync(path.join(dest, "untracked.txt"), "novo\n");
  git(dest, "worktree", "add", "-q", `${dest}-wt`, "feature/ui");
  git(dest, "remote", "add", "origin", ORIGIN_URL);
  git(dest, "remote", "add", "backup", "git@gitlab.com:exemplo/fixture.git");
}

function repoExists() {
  const r = spawnSync("gh", ["repo", "view", REPO_FULL, "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
    encoding: "utf8",
    env: { ...process.env, GH_PROMPT_DISABLED: "1" },
  });
  return r.status === 0;
}

function pushBaseline(dest) {
  const p = spawnSync("git", [...CRED, "push", "-q", "-u", "origin", "main"], {
    cwd: dest,
    encoding: "utf8",
    env: GIT_ENV,
  });
  if (p.status !== 0) {
    throw new Error(`push do baseline falhou (${p.status}): ${p.stderr}`);
  }
}

/** garante que o remote origin aponta para a URL do repo de exemplo */
function ensureOrigin(dest) {
  const has = spawnSync("git", ["remote", "get-url", "origin"], {
    cwd: dest,
    encoding: "utf8",
    env: GIT_ENV,
  }).status === 0;
  if (has) git(dest, "remote", "set-url", "origin", ORIGIN_URL);
  else git(dest, "remote", "add", "origin", ORIGIN_URL);
}

function createRemote(dest) {
  if (repoExists()) {
    console.error(`repo ${REPO_FULL} ja existe — pulando criacao`);
    ensureOrigin(dest);
    pushBaseline(dest);
    return;
  }
  // o gh nao adiciona o remote quando o origin ja existe no source; remove
  // temporariamente e o proprio gh recria apontando para o repo novo
  git(dest, "remote", "remove", "origin");
  const r = spawnSync(
    "gh",
    ["repo", "create", REPO_NAME, "--private", "--source", dest, "--remote", "origin", "--push"],
    { encoding: "utf8", env: { ...process.env, GH_PROMPT_DISABLED: "1" } },
  );
  if (r.status !== 0) {
    // fallback: garante o repo criado e empurra com o helper de credencial
    console.error(`gh repo create --source falhou (${r.status}): ${r.stderr}`);
    if (!repoExists()) {
      const empty = spawnSync("gh", ["repo", "create", REPO_NAME, "--private"], {
        encoding: "utf8",
        env: { ...process.env, GH_PROMPT_DISABLED: "1" },
      });
      if (empty.status !== 0) {
        throw new Error(`gh repo create vazio falhou (${empty.status}): ${empty.stderr}`);
      }
    }
    ensureOrigin(dest);
    pushBaseline(dest);
  }
}

function verifyRemote(dest) {
  const view = spawnSync("gh", ["repo", "view", REPO_FULL, "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
    encoding: "utf8",
    env: { ...process.env, GH_PROMPT_DISABLED: "1" },
  });
  if (view.status !== 0) {
    throw new Error(`gh repo view falhou (${view.status}): ${view.stderr}`);
  }
  const localMain = git(dest, "rev-parse", "main");
  const remoteLine = git(dest, ...CRED, "ls-remote", "origin", "refs/heads/main");
  const remoteMain = remoteLine.split(/\s+/)[0] ?? "";
  if (remoteMain !== localMain) {
    throw new Error(`origin/main (${remoteMain}) != main local (${localMain})`);
  }
}

function main() {
  const args = process.argv.slice(2);
  let dest = null;
  let createRemoteFlag = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dest") {
      dest = args[++i];
      if (!dest) throw new Error("--dest precisa de um path");
    } else if (a === "--keep") {
      /* no-op: o fixture nunca e apagado por padrao (a campanha usa o path) */
    } else if (a === "--create-remote") {
      createRemoteFlag = true;
    } else if (a === "--help" || a === "-h") {
      console.log("uso: node scripts/make-fixture.mjs [--dest <path>] [--keep] [--create-remote]");
      process.exit(0);
    } else {
      throw new Error(`flag desconhecida: ${a}`);
    }
  }

  let createdByUs = false;
  if (dest) {
    dest = path.resolve(dest);
    if (fs.existsSync(dest)) {
      if (fs.readdirSync(dest).length > 0) throw new Error(`--dest nao esta vazio: ${dest}`);
    } else {
      fs.mkdirSync(dest, { recursive: true });
    }
  } else {
    dest = fs.mkdtempSync(path.join(os.tmpdir(), "gitcraque-fixture-"));
    createdByUs = true;
  }

  try {
    buildFixture(dest);
    if (createRemoteFlag) {
      createRemote(dest);
      verifyRemote(dest);
    }
    process.stdout.write(`${dest}\n`);
  } catch (e) {
    // melhor esforco de limpeza so do que nos criamos
    try {
      git(dest, "worktree", "remove", "--force", `${dest}-wt`);
    } catch {
      /* a worktree pode nem ter sido criada */
    }
    if (createdByUs) fs.rmSync(dest, { recursive: true, force: true });
    throw e;
  }
}

try {
  main();
} catch (e) {
  console.error(`erro: ${e.message}`);
  process.exit(1);
}
