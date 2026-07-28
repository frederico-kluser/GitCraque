/**
 * Seletor de repositorios da maquina.
 *
 * O que este arquivo tem de provar, alem do feliz caminho:
 *
 *  1. `openRepository` SO abre repositorio de verdade. E a unica rota do
 *     backend que aceita caminho arbitrario do usuario e mexe no `process.cwd()`
 *     de um processo que executa git — se ela aceitar `/etc`, acabou.
 *  2. `listDirectory` nunca devolve nome de ARQUIVO. Ela existe para escolher
 *     pasta; listar arquivo seria superficie de vazamento sem utilidade.
 *  3. A varredura nao desce dentro de um repositorio ja encontrado, e respeita
 *     os tetos — sem isso, um `/` digitado por engano trava o servidor.
 *
 * `XDG_CONFIG_HOME` aponta para um temporario: teste nao mexe nos recentes de
 * verdade de quem esta rodando a suite.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

const CONFIG_TMP = fs.mkdtempSync(path.join(os.tmpdir(), "gitcraque-config-"));
process.env.XDG_CONFIG_HOME = CONFIG_TMP;

const {
  detectRepoKind,
  forgetRepo,
  getRecentRepos,
  initRepository,
  listDirectory,
  listRoots,
  openRepository,
  scanForRepos,
} = await import("../src/git/discover.mjs");

/* ------------------------------------------------------------------ */

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Teste",
  GIT_AUTHOR_EMAIL: "t@e.dev",
  GIT_COMMITTER_NAME: "Teste",
  GIT_COMMITTER_EMAIL: "t@e.dev",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  LC_ALL: "C",
};
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" }).trim();

let LAB = "";
const CWD_ORIGINAL = process.cwd();

before(() => {
  LAB = fs.mkdtempSync(path.join(os.tmpdir(), "gitcraque-lab-"));
  // dois repositorios comuns, um aninhado fundo, um bare, e pastas sem git
  for (const rel of ["alpha", "beta", "ninho/mais/fundo"]) {
    const dir = path.join(LAB, rel);
    fs.mkdirSync(dir, { recursive: true });
    git(dir, "init", "-q", "-b", "main");
    fs.writeFileSync(path.join(dir, "a.txt"), "x\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "commit inicial");
  }
  fs.mkdirSync(path.join(LAB, "so-uma-pasta"), { recursive: true });
  fs.writeFileSync(path.join(LAB, "um-arquivo.txt"), "nao sou pasta\n");
  fs.writeFileSync(path.join(LAB, "alpha", "outro-arquivo.md"), "nem eu\n");
  git(LAB, "init", "-q", "--bare", path.join(LAB, "pelado.git"));
  // subpasta dentro de um repo, para provar que abrir por ela entra na raiz
  fs.mkdirSync(path.join(LAB, "alpha", "src", "deep"), { recursive: true });
});

after(() => {
  process.chdir(CWD_ORIGINAL);
  fs.rmSync(LAB, { recursive: true, force: true });
  fs.rmSync(CONFIG_TMP, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ *
 * detectRepoKind
 * ------------------------------------------------------------------ */

test("detectRepoKind separa repo comum, bare, worktree ligada e pasta comum", () => {
  assert.deepEqual(detectRepoKind(path.join(LAB, "alpha")), {
    isRepo: true,
    isBare: false,
    isWorktree: false,
  });
  assert.deepEqual(detectRepoKind(path.join(LAB, "pelado.git")), {
    isRepo: true,
    isBare: true,
    isWorktree: false,
  });
  assert.deepEqual(detectRepoKind(path.join(LAB, "so-uma-pasta")), {
    isRepo: false,
    isBare: false,
    isWorktree: false,
  });

  // `.git` como ARQUIVO e worktree ligada
  const wt = path.join(LAB, "alpha-wt");
  git(path.join(LAB, "alpha"), "worktree", "add", "-q", "-b", "ramo-wt", wt);
  try {
    const kind = detectRepoKind(wt);
    assert.equal(kind.isRepo, true);
    assert.equal(kind.isWorktree, true, ".git e arquivo numa worktree ligada");
  } finally {
    git(path.join(LAB, "alpha"), "worktree", "remove", "--force", wt);
  }
});

/* ------------------------------------------------------------------ *
 * listDirectory
 * ------------------------------------------------------------------ */

test("listDirectory devolve SO pastas — nunca nome de arquivo", async () => {
  const payload = await listDirectory(LAB);
  const nomes = payload.entries.map((e) => e.name);
  assert.ok(nomes.includes("alpha"));
  assert.ok(nomes.includes("so-uma-pasta"));
  assert.ok(
    !nomes.includes("um-arquivo.txt"),
    `arquivo vazou na listagem: ${nomes.join(", ")}`,
  );
});

test("listDirectory marca quais pastas sao repositorios, e poe repos primeiro", async () => {
  const payload = await listDirectory(LAB);
  const alpha = payload.entries.find((e) => e.name === "alpha");
  const comum = payload.entries.find((e) => e.name === "so-uma-pasta");
  assert.equal(alpha.isRepo, true);
  assert.equal(comum.isRepo, false);

  const primeiroComum = payload.entries.findIndex((e) => !e.isRepo);
  const ultimoRepo = payload.entries.map((e) => e.isRepo).lastIndexOf(true);
  assert.ok(ultimoRepo < primeiroComum, "os repositorios tem de vir antes das pastas comuns");
});

test("listDirectory expoe o pai, para o botao de subir um nivel", async () => {
  const payload = await listDirectory(path.join(LAB, "alpha"));
  assert.equal(payload.parent, LAB);
  assert.equal(payload.self.isRepo, true, "a propria pasta listada e um repo");
});

test("listDirectory recusa caminho inexistente (404) e arquivo (400)", async () => {
  await assert.rejects(
    () => listDirectory(path.join(LAB, "nao-existe-mesmo")),
    (err) => err.status === 404,
  );
  await assert.rejects(
    () => listDirectory(path.join(LAB, "um-arquivo.txt")),
    (err) => err.status === 400,
  );
});

test("listRoots so devolve raizes que existem nesta maquina", async () => {
  const { roots, home } = await listRoots();
  assert.ok(roots.length > 0);
  assert.ok(roots.some((r) => r.path === home), "a pasta pessoal sempre entra");
  for (const r of roots) {
    assert.ok(fs.existsSync(r.path), `${r.path} foi oferecido mas nao existe`);
  }
});

/* ------------------------------------------------------------------ *
 * scanForRepos
 * ------------------------------------------------------------------ */

test("a varredura acha os repositorios, inclusive o aninhado fundo", async () => {
  const { repos } = await scanForRepos({ roots: [LAB], depth: 5 });
  const caminhos = repos.map((r) => r.path);
  assert.ok(caminhos.includes(path.join(LAB, "alpha")));
  assert.ok(caminhos.includes(path.join(LAB, "beta")));
  assert.ok(
    caminhos.includes(path.join(LAB, "ninho", "mais", "fundo")),
    `nao achou o aninhado: ${caminhos.join(", ")}`,
  );
});

test("a varredura enriquece cada achado com ramo e data do ultimo commit", async () => {
  const { repos } = await scanForRepos({ roots: [LAB], depth: 5 });
  const alpha = repos.find((r) => r.path === path.join(LAB, "alpha"));
  assert.equal(alpha.name, "alpha");
  assert.equal(alpha.branch, "main");
  assert.match(alpha.lastCommitRelative, /ago|second|minute/);
});

test("a varredura NAO desce dentro de um repositorio ja encontrado", async () => {
  const { repos } = await scanForRepos({ roots: [LAB], depth: 5 });
  assert.ok(
    !repos.some((r) => r.path.startsWith(path.join(LAB, "alpha", path.sep))),
    "submodulo/worktree aninhada nao pode aparecer como entrada solta",
  );
});

test("a varredura respeita o teto de profundidade", async () => {
  const { repos } = await scanForRepos({ roots: [LAB], depth: 1 });
  const caminhos = repos.map((r) => r.path);
  assert.ok(caminhos.includes(path.join(LAB, "alpha")), "profundidade 1 ainda ve os filhos diretos");
  assert.ok(
    !caminhos.includes(path.join(LAB, "ninho", "mais", "fundo")),
    "profundidade 1 nao pode alcancar o neto",
  );
});

test("a varredura respeita o teto de resultados e reporta que truncou", async () => {
  const payload = await scanForRepos({ roots: [LAB], depth: 5, limit: 1 });
  assert.equal(payload.repos.length, 1);
  assert.equal(payload.truncated, true);
  assert.ok(payload.elapsedMs >= 0);
});

/* ------------------------------------------------------------------ *
 * openRepository — a guarda que segura tudo
 * ------------------------------------------------------------------ */

test("openRepository entra no repositorio e muda o process.cwd()", async () => {
  const alvo = path.join(LAB, "beta");
  const { root } = await openRepository(alvo);
  assert.equal(fs.realpathSync(root), fs.realpathSync(alvo));
  assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(alvo));
});

test("abrir por uma SUBPASTA entra pela raiz da worktree, nao pela subpasta", async () => {
  const { root } = await openRepository(path.join(LAB, "alpha", "src", "deep"));
  assert.equal(
    fs.realpathSync(root),
    fs.realpathSync(path.join(LAB, "alpha")),
    "o servidor tem de ficar na raiz, senao o status e o log saem parciais",
  );
});

test("openRepository RECUSA pasta que nao e repositorio git", async () => {
  await assert.rejects(
    () => openRepository(path.join(LAB, "so-uma-pasta")),
    (err) => err.status === 400 && /nao e um repositorio git/.test(err.message),
  );
});

test("openRepository recusa caminho inexistente e arquivo", async () => {
  await assert.rejects(
    () => openRepository(path.join(LAB, "nao-existe")),
    (err) => err.status === 404,
  );
  await assert.rejects(
    () => openRepository(path.join(LAB, "um-arquivo.txt")),
    (err) => err.status === 400,
  );
});

test("openRepository recusa caminho vazio", async () => {
  for (const ruim of ["", "   ", null, undefined, 42]) {
    await assert.rejects(
      () => openRepository(ruim),
      (err) => err.status === 400,
    );
  }
});

/* ------------------------------------------------------------------ *
 * Recentes
 * ------------------------------------------------------------------ */

test("abrir um repositorio o poe no topo dos recentes, sem duplicar", async () => {
  await openRepository(path.join(LAB, "alpha"));
  await openRepository(path.join(LAB, "beta"));
  await openRepository(path.join(LAB, "alpha"));

  const { entries } = await getRecentRepos();
  assert.equal(entries[0].path, fs.realpathSync(path.join(LAB, "alpha")).replace(/\/$/, "") ||
    path.join(LAB, "alpha"), "o ultimo aberto vem primeiro");
  const alphas = entries.filter((e) => e.path.endsWith(`${path.sep}alpha`));
  assert.equal(alphas.length, 1, "reabrir promove, nao duplica");
  assert.equal(entries[0].branch, "main");
  assert.equal(entries[0].exists, true);
});

test("recente cuja pasta sumiu vem com exists:false em vez de estourar", async () => {
  const efemero = path.join(LAB, "efemero");
  fs.mkdirSync(efemero, { recursive: true });
  git(efemero, "init", "-q", "-b", "main");
  await openRepository(efemero);
  fs.rmSync(efemero, { recursive: true, force: true });

  const { entries } = await getRecentRepos();
  const sumido = entries.find((e) => e.path.endsWith(`${path.sep}efemero`));
  assert.equal(sumido.exists, false);
});

test("forgetRepo tira o repositorio da lista", async () => {
  const alvo = path.join(LAB, "beta");
  await openRepository(alvo);
  const depois = await forgetRepo(alvo);
  assert.ok(!depois.entries.some((e) => e.path.endsWith(`${path.sep}beta`)));
});

/* ------------------------------------------------------------------ *
 * initRepository
 * ------------------------------------------------------------------ */

test("initRepository cria o repositorio e ja entra nele", async () => {
  const novo = path.join(LAB, "recem-criado");
  const { result, opened } = await initRepository(novo, { initialBranch: "principal" });
  assert.equal(result.ok, true, result.stderr);
  assert.ok(opened, "depois do init o servidor tem de entrar no repositorio");
  assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(novo));
  assert.equal(detectRepoKind(novo).isRepo, true);
});

test("initRepository recusa pasta que ja e repositorio", async () => {
  await assert.rejects(
    () => initRepository(path.join(LAB, "alpha")),
    (err) => err.status === 409,
  );
});
