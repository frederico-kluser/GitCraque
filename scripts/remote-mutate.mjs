#!/usr/bin/env node
/**
 * Muta o remoto da campanha de testes (origin -> o repo de exemplo do GitHub)
 * para exercitar o teste de pull do GitCraque.
 *
 * Uso:
 *   node scripts/remote-mutate.mjs <fixture> --reset
 *   node scripts/remote-mutate.mjs <fixture> --add-one
 *   (a flag e o path podem vir em qualquer ordem)
 *
 * --reset    restaura o remoto ao baseline local do fixture: clone limpo de
 *            origin em tmpdir (valida acesso e autenticacao) + force-push da
 *            main do fixture para origin. Deterministico e idempotente.
 *            Imprime o hash de origin/main.
 *
 * --add-one  clona origin em tmpdir, cria EXATAMENTE 1 commit novo ("feat:
 *            mudanca remota para teste de pull") e faz push para origin.
 *            Imprime o subject do commit criado.
 *
 * Autenticacao: o token vive no ambiente (GH_TOKEN) via CLI `gh`. Todo contato
 * com o remoto usa `git -c credential.helper='!gh auth git-credential'` — o
 * token nunca entra em argv, no env do git, em arquivos ou em logs.
 *
 * Saida: UMA linha no stdout; erros vao para o stderr com exit != 0.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

/** helper de credencial do gh: le o token do ambiente SEM tocar a config global */
const CRED = ["-c", "credential.helper=!gh auth git-credential"];

function git(cwd, ...a) {
  const r = spawnSync("git", a, { cwd, encoding: "utf8", env: GIT_ENV });
  if (r.status !== 0) {
    throw new Error(`git ${a.join(" ")} falhou (${r.status}): ${r.stderr}`);
  }
  return r.stdout.trim();
}

function errExit(msg) {
  console.error(`erro: ${msg}`);
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let sub = null;
  let fixture = null;
  for (const a of args) {
    if (a === "--reset" || a === "--add-one") {
      if (sub) errExit("apenas um sub-comando: --reset ou --add-one");
      sub = a;
    } else if (a === "--help" || a === "-h") {
      console.log("uso: node scripts/remote-mutate.mjs <fixture> [--reset|--add-one]");
      process.exit(0);
    } else if (a.startsWith("-")) {
      errExit(`flag desconhecida: ${a}`);
    } else {
      if (fixture) errExit("apenas um path de fixture");
      fixture = a;
    }
  }
  if (!sub) errExit("faltou o sub-comando: --reset ou --add-one");
  if (!fixture) errExit("faltou o path do fixture");
  return { sub, fixture: path.resolve(fixture) };
}

function originUrl(fixture) {
  const r = spawnSync("git", ["remote", "get-url", "origin"], {
    cwd: fixture,
    encoding: "utf8",
    env: GIT_ENV,
  });
  if (r.status !== 0) {
    throw new Error(`fixture sem remote origin: ${r.stderr}`);
  }
  return r.stdout.trim();
}

function cloneOrigin(url, dir) {
  const r = spawnSync("git", [...CRED, "clone", "--quiet", url, dir], {
    encoding: "utf8",
    env: GIT_ENV,
  });
  if (r.status !== 0) {
    throw new Error(`clone de origin falhou (${r.status}): ${r.stderr}`);
  }
  return dir;
}

function doReset(fixture) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gitcraque-mutate-"));
  try {
    const url = originUrl(fixture);
    // clone limpo de origin: valida acesso e autenticacao antes de mutar
    cloneOrigin(url, path.join(tmp, "clone"));
    // baseline local do fixture: a fonte da verdade (a arvore suja nao
    // participa do push)
    const baseline = git(fixture, "rev-parse", "main");
    const p = spawnSync("git", [...CRED, "push", "--quiet", "--force", "origin", "main"], {
      cwd: fixture,
      encoding: "utf8",
      env: GIT_ENV,
    });
    if (p.status !== 0) {
      throw new Error(`force-push do baseline falhou (${p.status}): ${p.stderr}`);
    }
    const remoteLine = git(fixture, ...CRED, "ls-remote", "origin", "refs/heads/main");
    const now = remoteLine.split(/\s+/)[0] ?? "";
    if (now !== baseline) {
      throw new Error(`origin/main (${now}) != baseline (${baseline})`);
    }
    process.stdout.write(`${now}\n`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function doAddOne(fixture) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gitcraque-mutate-"));
  try {
    const url = originUrl(fixture);
    const clone = path.join(tmp, "clone");
    cloneOrigin(url, clone);
    // 1 commit novo; o conteudo carrega carimbo de tempo para que chamadas
    // repetidas criem um commit genuinamente novo (o subject e fixo)
    fs.appendFileSync(path.join(clone, "mudanca-remota.txt"), `linha remota\n${new Date().toISOString()}\n`);
    git(clone, "add", "-A");
    git(clone, "commit", "-q", "-m", "feat: mudanca remota para teste de pull");
    const subject = git(clone, "log", "-1", "--pretty=%s");
    const p = spawnSync("git", [...CRED, "push", "--quiet", "origin", "main"], {
      cwd: clone,
      encoding: "utf8",
      env: GIT_ENV,
    });
    if (p.status !== 0) {
      throw new Error(`push falhou (${p.status}): ${p.stderr}`);
    }
    process.stdout.write(`${subject}\n`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const { sub, fixture } = parseArgs();
if (!fs.existsSync(path.join(fixture, ".git"))) {
  errExit(`nao e um repositorio git: ${fixture}`);
}
try {
  if (sub === "--reset") doReset(fixture);
  else doAddOne(fixture);
} catch (e) {
  errExit(e.message);
}
