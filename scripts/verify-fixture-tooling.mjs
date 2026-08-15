#!/usr/bin/env node
/**
 * Verificacao das ferramentas de fixture da campanha de testes de
 * manipulacao de git: scripts/make-fixture.mjs e scripts/remote-mutate.mjs.
 *
 * Hermetica: nenhum contato com rede; o "remoto" e um bare repo local em
 * tmpdir. O repo de exemplo do GitHub nunca e tocado — --create-remote fica
 * de fora (e rede) e o remote-mutate roda contra o bare local.
 *
 * O que e provado:
 *
 *   1. estrutura do fixture: 12 commits, 1 merge com 2 pais, tag ANOTADA
 *      v1.0.0, commit com `|` no assunto, 4 branches, arvore suja
 *      (exatamente 1 modificado + exatamente 1 untracked), worktree extra,
 *      remotes origin+backup, origin com a URL exata do repo de exemplo
 *   2. determinismo estrutural: duas execucoes com relogio de committer
 *      fixado darao `git log --all --pretty=%s` byte-identico — ver o
 *      comentario de FROZEN_ENV sobre POR QUE o relogio precisa ser fixado
 *   3. contrato de stdout: UMA linha, path absoluto que contem .git
 *      (o harness da campanha depende disso)
 *   4. remote-mutate contra remote local: --reset idempotente, --add-one
 *      cria exatamente 1 commit com o subject do contrato, --reset restaura
 *      o baseline, e o repo local nunca muda
 *   5. erros: --dest nao-vazio e fixture inexistente saem com exit != 0
 *      e mensagem no stderr
 *
 *   node scripts/verify-fixture-tooling.mjs [--keep]
 *
 * Exit 0 com tudo verde; exit 1 com relatorio das falhas. Como o test:e2e,
 * roda explicito (npm run test:fixture-tooling) e nao entra no npm test.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const KEEP = args.includes("--keep");
const ROOT = path.resolve(import.meta.dirname, "..");
const MAKE_FIXTURE = path.join(ROOT, "scripts", "make-fixture.mjs");
const REMOTE_MUTATE = path.join(ROOT, "scripts", "remote-mutate.mjs");

/** o assunto com `|` — a armadilha do formato mandatorio */
const PIPE_SUBJECT = "fix(parser): trata a|b como um caso so";
/** subject fixo do commit criado pelo --add-one (contrato do remote-mutate) */
const ADD_SUBJECT = "feat: mudanca remota para teste de pull";
/** URL canonica do repo de exemplo — espelha REPO_OWNER/REPO_NAME de
 * make-fixture.mjs:42-45 (nao importamos o script: ele executa CLI no import) */
const ORIGIN_URL = "https://github.com/frederico-kluser/gitcraque-teste-operacoes.git";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? `\n      ${detail}` : ""}`);
  }
  return ok;
}

const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

/* ------------------------------------------------------------------ */
/* ambiente git neutralizado, como no verify-e2e                       */
/* ------------------------------------------------------------------ */

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

/* Relogio fixo para o teste de determinismo. A ordem padrao do git log
 * segue a data de committer; com datas vivas, os commits do fixture
 * cruzam a fronteira de segundo em pontos aleatorios de cada execucao e o
 * git reordena os empates de segundo — verificado: duas execucoes com
 * datas vivas divergiram na posicao de "feat(auth): valida token". Com a
 * data fixa a ordem vira FIFO topologico e fica byte-estavel. O
 * make-fixture faz spread de process.env, entao a data chega ao git sem
 * tocar no script. */
const FROZEN_DATE = "2026-01-01T12:00:00Z";
const FROZEN_ENV = { ...GIT_ENV, GIT_AUTHOR_DATE: FROZEN_DATE, GIT_COMMITTER_DATE: FROZEN_DATE };

function git(cwd, ...a) {
  const r = spawnSync("git", a, { cwd, encoding: "utf8", env: GIT_ENV });
  if (r.status !== 0) {
    throw new Error(`git ${a.join(" ")} falhou (${r.status}): ${r.stderr}`);
  }
  return r.stdout.trim();
}

/** roda um dos scripts de producao; retorna status/stdout/stderr crus */
function runScript(script, scriptArgs, env = GIT_ENV) {
  const r = spawnSync(process.execPath, [script, ...scriptArgs], { encoding: "utf8", env });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** linhas nao-vazias do stdout (o contrato e UMA linha) */
const stdoutLines = (r) => r.stdout.split("\n").filter((l) => l.trim().length > 0);

/** check() que registra falha (em vez de explodir) quando o ambiente quebrou */
function safe(name, fn) {
  try {
    return check(name, fn());
  } catch (e) {
    return check(name, false, e.message);
  }
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "fixture-tooling-"));
const created = []; // fixtures rastreaveis para --keep / limpeza

/* ------------------------------------------------------------------ */
/* 1. estrutura do fixture                                             */
/* ------------------------------------------------------------------ */

section("1. make-fixture — estrutura do fixture");

const dest = path.join(work, "repo");
const r1 = runScript(MAKE_FIXTURE, ["--dest", dest]);
const fixturePath = stdoutLines(r1)[0];
if (fixturePath) created.push(fixturePath);

check("make-fixture sai com exit 0", r1.status === 0, `status ${r1.status}: ${r1.stderr}`);
check("stdout tem UMA linha", stdoutLines(r1).length === 1, `recebi ${stdoutLines(r1).length}: ${JSON.stringify(r1.stdout)}`);
check("a linha e um path absoluto", !!fixturePath && path.isAbsolute(fixturePath), String(fixturePath));
check("o path contem .git", !!fixturePath && fs.existsSync(path.join(fixturePath, ".git")));
check("stderr vazio no sucesso", r1.stderr === "", JSON.stringify(r1.stderr));

const subjects = () => git(fixturePath, "log", "--all", "--pretty=%s").split("\n");
const subjectList = () => subjects().join("\n");

safe("12 commits em rev-list --all", () => Number(git(fixturePath, "rev-list", "--all", "--count")) === 12);
safe("12 subjects em git log --all", () => subjects().length === 12, String(subjects().length));
safe("commit com `|` no assunto existe", () => subjects().includes(PIPE_SUBJECT));
safe(
  "exatamente 1 merge commit, com o subject do contrato",
  () => {
    const m = git(fixturePath, "log", "--all", "--merges", "--pretty=%s").split("\n").filter(Boolean);
    return m.length === 1 && m[0] === "merge: integra feature/auth";
  },
  git(fixturePath, "log", "--all", "--merges", "--pretty=%s").split("\n").filter(Boolean).join(" | "),
);
safe(
  "o merge tem 2 pais",
  () => git(fixturePath, "rev-list", "--parents", "--all").split("\n").some((l) => l.trim().split(/\s+/).length === 3),
);
safe("tag v1.0.0 existe", () => git(fixturePath, "tag", "-l", "v1.0.0") === "v1.0.0");
safe("v1.0.0 e tag ANOTADA (objeto tag, nao commit)", () => git(fixturePath, "cat-file", "-t", "v1.0.0") === "tag");
safe(
  "as 4 branches esperadas",
  () => {
    const bs = git(fixturePath, "branch", "--format=%(refname:short)").split("\n");
    return ["main", "feature/auth", "feature/ui", "experimento/squash"].every((b) => bs.includes(b));
  },
  git(fixturePath, "branch", "--format=%(refname:short)").split("\n").join(", "),
);
safe(
  "arvore suja: EXATAMENTE 1 modificado (src.txt) + EXATAMENTE 1 untracked (untracked.txt)",
  () => {
    // o helper git() faz trim: a linha " M src.txt" do porcelain chega sem o
    // espaco inicial. "M src.txt" (1 espaco) so casa o modificado
    // NAO-estagiado — o estagiado seria "M  src.txt" (2 espacos).
    const lines = git(fixturePath, "status", "--porcelain").split("\n").filter(Boolean);
    return lines.length === 2 && lines.includes("M src.txt") && lines.includes("?? untracked.txt");
  },
  git(fixturePath, "status", "--porcelain").split("\n").join(" / "),
);
safe(
  "worktree extra da feature/ui (<dest>-wt)",
  () => {
    const ls = git(fixturePath, "worktree", "list").split("\n").filter(Boolean);
    return ls.length === 2 && ls[1].startsWith(`${fixturePath}-wt`) && ls[1].includes("feature/ui");
  },
  git(fixturePath, "worktree", "list").replaceAll("\n", " / "),
);
safe(
  "remotes origin + backup presentes",
  () => {
    const rs = git(fixturePath, "remote").split("\n");
    return rs.includes("origin") && rs.includes("backup");
  },
  git(fixturePath, "remote").split("\n").join(", "),
);
safe(
  "origin aponta para a URL EXATA do repo de exemplo",
  () => git(fixturePath, "remote", "get-url", "origin") === ORIGIN_URL,
  git(fixturePath, "remote", "get-url", "origin"),
);

// --keep e no-op documentado: nao muda o comportamento nem a saida
const destK = path.join(work, "repoK");
const rK = runScript(MAKE_FIXTURE, ["--dest", destK, "--keep"]);
const pathK = stdoutLines(rK)[0];
if (pathK) created.push(pathK);
check("--keep (no-op) sai com exit 0", rK.status === 0, `status ${rK.status}: ${rK.stderr}`);
check(
  "--keep nao muda o contrato: stdout UMA linha com path contendo .git",
  stdoutLines(rK).length === 1 && !!pathK && fs.existsSync(path.join(pathK, ".git")),
  `stdout: ${JSON.stringify(rK.stdout)}`,
);

/* ------------------------------------------------------------------ */
/* 2. determinismo estrutural                                          */
/* ------------------------------------------------------------------ */

section("2. Determinismo estrutural");

// dir pre-existente e vazio: exercita o outro ramo do --dest
const destB = path.join(work, "repoB");
fs.mkdirSync(destB, { recursive: true });
const rB = runScript(MAKE_FIXTURE, ["--dest", destB], FROZEN_ENV);
created.push(destB);

const destC = path.join(work, "repoC");
const rC = runScript(MAKE_FIXTURE, ["--dest", destC], FROZEN_ENV);
created.push(destC);

check("2a execucao (relogio fixo) sai com exit 0", rB.status === 0, `status ${rB.status}: ${rB.stderr}`);
check("3a execucao (relogio fixo) sai com exit 0", rC.status === 0, `status ${rC.status}: ${rC.stderr}`);
check(
  "mesmos subjects na MESMA ordem entre duas execucoes (git log --all --pretty=%s)",
  git(destB, "log", "--all", "--pretty=%s") === git(destC, "log", "--all", "--pretty=%s"),
  "ordens divergem",
);
safe("cada execucao tem 12 subjects", () => git(destC, "log", "--all", "--pretty=%s").split("\n").length === 12);
safe("a branch principal e main nas duas", () =>
  git(destB, "rev-parse", "--abbrev-ref", "HEAD") === "main" && git(destC, "rev-parse", "--abbrev-ref", "HEAD") === "main",
);

// com datas VIVAS o contrato real e "mesmos subjects, mesma topologia";
// a ordem do log pode variar (fronteira de segundo), entao compara o
// CONJUNTO ordenado + a contagem — imune a empate de segundo
const destD = path.join(work, "repoD");
const rD = runScript(MAKE_FIXTURE, ["--dest", destD]);
created.push(destD);
check("execucao com datas vivas sai com exit 0", rD.status === 0, `status ${rD.status}: ${rD.stderr}`);
safe(
  "datas vivas: MESMO CONJUNTO de subjects (ordenado) da execucao da seccao 1",
  () => {
    const a = git(fixturePath, "log", "--all", "--pretty=%s").split("\n").sort().join("\n");
    const d = git(destD, "log", "--all", "--pretty=%s").split("\n").sort().join("\n");
    return a === d;
  },
);
safe("datas vivas: mesma contagem de commits", () =>
  git(fixturePath, "rev-list", "--all", "--count") === git(destD, "rev-list", "--all", "--count"),
);

/* ------------------------------------------------------------------ */
/* 3. contrato de stdout (modo padrao, sem --dest)                     */
/* ------------------------------------------------------------------ */

section("3. make-fixture — contrato de stdout");

const r3 = runScript(MAKE_FIXTURE, []);
const l3 = stdoutLines(r3)[0];
if (l3) created.push(l3);

check("sem --dest (mkdtemp) sai com exit 0", r3.status === 0, `status ${r3.status}: ${r3.stderr}`);
check("stdout tem UMA linha", stdoutLines(r3).length === 1, `recebi ${stdoutLines(r3).length}: ${JSON.stringify(r3.stdout)}`);
check("a linha e um path absoluto", !!l3 && path.isAbsolute(l3), String(l3));
check("o path contem .git", !!l3 && fs.existsSync(path.join(l3, ".git")));
check("stderr vazio no sucesso", r3.stderr === "", JSON.stringify(r3.stderr));

/* ------------------------------------------------------------------ */
/* 4. remote-mutate contra remote bare LOCAL                           */
/* ------------------------------------------------------------------ */

section("4. remote-mutate contra remote bare local");

const bare = path.join(work, "remote.git");
// --initial-branch=main: o HEAD do remoto precisa ser uma ref que existe
// (como no GitHub). Sem a flag, com GIT_CONFIG_GLOBAL=/dev/null o default
// compilado e "master" e o HEAD fica pendurado — o clone do remote-mutate
// sai vazio e o push do --add-one falha com "src refspec main does not
// match any". Com HEAD=main o clone e determinista. Observacao reportada
// para o remote-mutate: doAddOne assume HEAD de remoto resolvivel.
const initBare = spawnSync("git", ["init", "--bare", "--initial-branch=main", bare], { encoding: "utf8", env: GIT_ENV });
check("bare local criado em tmpdir (HEAD=main)", initBare.status === 0, initBare.stderr);

const baseline = git(fixturePath, "rev-parse", "main");
git(fixturePath, "remote", "set-url", "origin", bare);

const rReset1 = runScript(REMOTE_MUTATE, [fixturePath, "--reset"]);
check("--reset sai com exit 0", rReset1.status === 0, `status ${rReset1.status}: ${rReset1.stderr}`);
check(
  "--reset imprime UMA linha com o hash do baseline",
  stdoutLines(rReset1).length === 1 && rReset1.stdout.trim() === baseline,
  `stdout: ${JSON.stringify(rReset1.stdout)}`,
);
check(
  "origin/main == main local (ls-remote)",
  git(fixturePath, "ls-remote", "origin", "refs/heads/main").startsWith(baseline),
  git(fixturePath, "ls-remote", "origin", "refs/heads/main"),
);

const rReset2 = runScript(REMOTE_MUTATE, [fixturePath, "--reset"]);
check("2a execucao de --reset sai com exit 0 (idempotente)", rReset2.status === 0, `status ${rReset2.status}: ${rReset2.stderr}`);
check("... e imprime o mesmo hash", rReset2.stdout.trim() === baseline, `stdout: ${JSON.stringify(rReset2.stdout)}`);

// flag primeiro: o contrato aceita path e flag em qualquer ordem
const rAdd = runScript(REMOTE_MUTATE, ["--add-one", fixturePath]);
check("--add-one sai com exit 0", rAdd.status === 0, `status ${rAdd.status}: ${rAdd.stderr}`);
check(
  "--add-one imprime o subject do commit criado",
  rAdd.stdout.trim() === ADD_SUBJECT,
  `stdout: ${JSON.stringify(rAdd.stdout)}`,
);
const localCount = Number(git(fixturePath, "rev-list", "--count", "main"));
const bareCount = Number(git(bare, "rev-list", "--count", "main"));
check(
  "exatamente 1 commit novo no remoto (count difere em 1)",
  bareCount === localCount + 1,
  `local ${localCount}, remoto ${bareCount}`,
);
safe("o commit novo tem o subject do contrato", () => git(bare, "log", "-1", "main", "--pretty=%s") === ADD_SUBJECT);
check("o repo local nunca muda: main intacta", git(fixturePath, "rev-parse", "main") === baseline);
check(
  "a arvore suja local NAO foi tocada pelas mutacoes",
  git(fixturePath, "status", "--porcelain").includes("M src.txt") &&
    git(fixturePath, "status", "--porcelain").includes("?? untracked.txt"),
);

const rReset3 = runScript(REMOTE_MUTATE, [fixturePath, "--reset"]);
check(
  "--reset apos --add-one restaura o baseline",
  rReset3.status === 0 &&
    Number(git(bare, "rev-list", "--count", "main")) === localCount &&
    git(fixturePath, "ls-remote", "origin", "refs/heads/main").startsWith(baseline),
  `status ${rReset3.status}, stdout ${JSON.stringify(rReset3.stdout)}`,
);

/* ------------------------------------------------------------------ */
/* 5. erros                                                            */
/* ------------------------------------------------------------------ */

section("5. Erros");

const nonEmpty = path.join(work, "ocupado");
fs.mkdirSync(nonEmpty);
fs.writeFileSync(path.join(nonEmpty, "x.txt"), "conteudo");
const rErr1 = runScript(MAKE_FIXTURE, ["--dest", nonEmpty]);
check("--dest nao-vazio sai com exit != 0", rErr1.status !== 0, `status ${rErr1.status}`);
check("... com mensagem no stderr", rErr1.stderr.length > 0, JSON.stringify(rErr1.stderr));
check("... e sem tocar no conteudo do dir", fs.readFileSync(path.join(nonEmpty, "x.txt"), "utf8") === "conteudo");

const ghost = path.join(work, "nao-existe");
const rErr2 = runScript(REMOTE_MUTATE, [ghost, "--reset"]);
check("fixture inexistente sai com exit != 0", rErr2.status !== 0, `status ${rErr2.status}`);
check("... com mensagem no stderr", rErr2.stderr.length > 0, JSON.stringify(rErr2.stderr));

const rErr3 = runScript(REMOTE_MUTATE, []);
check("remote-mutate sem sub-comando sai com exit != 0", rErr3.status !== 0, `status ${rErr3.status}`);
check("... com mensagem no stderr", rErr3.stderr.length > 0, JSON.stringify(rErr3.stderr));

const rErr4 = runScript(REMOTE_MUTATE, [fixturePath, "--reset", "--add-one"]);
check("dois sub-comandos juntos sao recusados", rErr4.status !== 0, `status ${rErr4.status}`);

const rHelp1 = runScript(MAKE_FIXTURE, ["--help"]);
check("make-fixture --help sai com exit 0", rHelp1.status === 0, `status ${rHelp1.status}`);

const rHelp2 = runScript(REMOTE_MUTATE, ["--help"]);
check("remote-mutate --help sai com exit 0", rHelp2.status === 0, `status ${rHelp2.status}`);

/* ------------------------------------------------------------------ */
/* resumo                                                              */
/* ------------------------------------------------------------------ */

console.log(`\n\x1b[1m${passed} passaram, ${failed} falharam\x1b[0m`);
if (failures.length) {
  console.log("\nFalhas:");
  for (const f of failures) console.log(`  · ${f}`);
}

let ok = failed === 0;
if (!KEEP) {
  for (const d of created) {
    if (!d) continue;
    try {
      git(d, "worktree", "remove", "--force", `${d}-wt`);
    } catch {
      /* melhor esforco: a worktree pode nem existir */
    }
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* melhor esforco */
    }
    try {
      fs.rmSync(`${d}-wt`, { recursive: true, force: true });
    } catch {
      /* melhor esforco */
    }
  }
  try {
    fs.rmSync(work, { recursive: true, force: true });
  } catch {
    /* melhor esforco */
  }
} else {
  console.log("\nfixtures preservadas:");
  for (const d of created) if (d) console.log(`  ${d}`);
  console.log(`  ${work}`);
}
process.exit(ok ? 0 : 1);
