/**
 * Cobertura abrangente do fix de exclusao de refs especiais do log
 * (squash 69527ab9 da onda 1).
 *
 * O contrato, independente da implementacao:
 *   - commits alcancaveis APENAS por refs/do-archive/* (branches arquivadas do
 *     deep-orchestrator) ou por refs/stash (cache de trabalho: "WIP on ..." /
 *     "index on ...") NAO podem aparecer no grafo nem no total;
 *   - o total (countCommits) tem de bater com as linhas — paginacao consistente;
 *   - refs legitimas (heads locais, remotes, tags) continuam decorando via %d.
 *
 * O mecanismo (ja implementado em server/src/git/log.mjs):
 *   - getLog monta `[...LOG_ARGS.slice(0,1), --exclude de do-archive, --exclude
 *     de stash, ...LOG_ARGS.slice(1)]` — os excludes ficam entre o subcomando
 *     `log` e o `--all` do LOG_ARGS congelado;
 *   - countCommits idem com `rev-list`.
 *
 * Por que a ORDEM e critica (comportamento real do git 2.43.0, sondado antes
 * de escrever este arquivo):
 *   - excludes ANTES do subcomando: `unknown option` (exit 129);
 *   - excludes DEPOIS do `--all`: o git nao aplica nada — o commit fantasma
 *     continua entrando (o bug antigo era exatamente esse argv);
 *   - excludes entre o subcomando e o `--all`: a unica posicao que exclui.
 *
 * Nao se usa servidor HTTP: teste de modulo puro, como log-exclude-archive.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { LOG_ARGS } from "../src/contract.mjs";
import { countCommits, getLog, parseCommitLine, parseDecoration } from "../src/git/log.mjs";
import { git, makeEmptyRepo, makeFixtureRepo } from "./helpers/repo.mjs";

const REMOTES = new Set(["origin"]);

/**
 * Cria um commit orfao alcancavel APENAS por `targetRef`: commit numa branch
 * temporaria, anota o hash, apaga a branch, move a ref especial para o hash.
 * Como o commit nao tem pais, ele soma exatamente 1 ao `rev-list --all`.
 */
function createOrphan(fixture, fileName, message, targetRef) {
  git(fixture.root, "checkout", "-q", "-b", "temporaria-orfao");
  fs.writeFileSync(path.join(fixture.root, fileName), `${fileName}\n`);
  git(fixture.root, "add", "-A");
  git(fixture.root, "commit", "-q", "-m", message);
  const hash = git(fixture.root, "rev-parse", "HEAD");
  git(fixture.root, "checkout", "-q", "main");
  git(fixture.root, "branch", "-q", "-D", "temporaria-orfao");
  git(fixture.root, "update-ref", targetRef, hash);
  return hash;
}

/**
 * Repositorio cujo UNICO commit do repo inteiro e alcancavel apenas por
 * refs/stash: o branch que o continha e apagado e o HEAD fica num main unborn.
 */
function makeStashOnlyRepo() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "gitcraque-stashonly-"));
  const root = path.join(base, "repo");
  fs.mkdirSync(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Teste GitCraque");
  git(root, "config", "user.email", "teste@gitcraque.dev");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "checkout", "-q", "-b", "temporaria-stash");
  fs.writeFileSync(path.join(root, "stash.txt"), "trabalho em progresso\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "WIP on main");
  const hash = git(root, "rev-parse", "HEAD");
  git(root, "update-ref", "refs/stash", hash);
  git(root, "checkout", "-q", "--orphan", "main");
  git(root, "branch", "-q", "-D", "temporaria-stash");
  return { root, hash, cleanup: () => fs.rmSync(base, { recursive: true, force: true }) };
}

/* ------------------------------------------------------------------ *
 * a. Combinacao: do-archive E stash juntos
 * ------------------------------------------------------------------ */

test("orfaos de refs/do-archive/* E refs/stash somem juntos; total == linhas == countCommits", async () => {
  const fixture = makeFixtureRepo();
  try {
    const arquivado = createOrphan(
      fixture,
      "arquivado.txt",
      "wip arquivado pelo orchestrator",
      "refs/do-archive/2026/08/combinacao",
    );
    const stashado = createOrphan(fixture, "stashado.txt", "WIP on main", "refs/stash");

    // Remoto registrado + ref remota decorada sem fetch real.
    git(fixture.root, "remote", "add", "origin", "https://github.com/gitcraque/fixture.git");
    git(fixture.root, "update-ref", "refs/remotes/origin/main", fixture.hashes.merge);

    const payload = await getLog({ cwd: fixture.root });

    // 1. Nenhum orfao aparece no grafo, nem ref de arquivo vaza no parser.
    assert.ok(
      payload.commits.every((c) => c.hash !== arquivado && c.hash !== stashado),
      "commits alcancaveis so por refs especiais nao podem aparecer no log",
    );
    for (const commit of payload.commits) {
      for (const ref of commit.refs) {
        assert.ok(
          !ref.name.startsWith("do-archive/") && ref.name !== "refs/stash",
          `ref especial vazou no parser: ${ref.name}`,
        );
      }
    }

    // 2. Paginacao consistente: total == linhas == countCommits, com os DOIS
    //    excludes ativos ao mesmo tempo.
    assert.equal(
      payload.total,
      payload.commits.length,
      "total do log tem de bater com as linhas (paginacao consistente)",
    );
    assert.equal(await countCommits(fixture.root), payload.commits.length);

    // 3. Os excludes fazem trabalho real: sem eles, os dois orfaos entrariam
    //    (cada um e raiz, entao soma exatamente 1).
    const comExcluido = Number(
      git(
        fixture.root,
        "rev-list",
        "--exclude=refs/do-archive/*",
        "--exclude=refs/stash",
        "--all",
        "--count",
      ),
    );
    const semExcluir = Number(git(fixture.root, "rev-list", "--all", "--count"));
    assert.equal(semExcluir, comExcluido + 2, "sem os excludes os dois orfaos seriam alcancaveis");

    // 4. Refs legitimas continuam decorando: branch local HEAD, remota e tags.
    const merge = payload.commits.find((c) => c.hash === fixture.hashes.merge);
    assert.ok(
      merge.refs.some((r) => r.kind === "localBranch" && r.name === "main" && r.isHead),
      "branch local HEAD continua decorada",
    );
    const remota = merge.refs.find((r) => r.name === "origin/main");
    assert.ok(remota, "branch remota continua decorada no merge");
    assert.equal(remota.kind, "remoteBranch");
    assert.equal(remota.remote, "origin");

    const pipe = payload.commits.find((c) => c.hash === fixture.hashes.pipe);
    const nomesPipe = pipe.refs.map((r) => r.name);
    assert.ok(nomesPipe.includes("v1.0"), "tag anotada continua decorada");
    assert.ok(nomesPipe.includes("leve"), "tag leve continua decorada");
  } finally {
    fixture.cleanup();
  }
});

/* ------------------------------------------------------------------ *
 * b. Ordem do argv: excludes entre o subcomando e o --all
 * ------------------------------------------------------------------ */

test("argv do getLog: excludes ANTES do --all — o git so exclui nessa posicao", async () => {
  const fixture = makeFixtureRepo();
  try {
    const orfao = createOrphan(
      fixture,
      "wip-ordem.txt",
      "wip ordem do argv",
      "refs/do-archive/2026/08/ordem",
    );

    // A ordem que o getLog monta (leitura do codigo em log.mjs:179-184):
    // LOG_ARGS com os excludes splicados logo apos o subcomando.
    const ordemCerta = [
      ...LOG_ARGS.slice(0, 1),
      "--exclude=refs/do-archive/*",
      "--exclude=refs/stash",
      ...LOG_ARGS.slice(1),
    ];
    assert.ok(
      ordemCerta.indexOf("--exclude=refs/do-archive/*") < ordemCerta.indexOf("--all"),
      "os excludes tem de vir ANTES do --all no argv",
    );

    // 1. Sem exclude nenhum, o orfao entra (a falha que o fix corrige).
    const semExclude = git(fixture.root, ...LOG_ARGS);
    assert.ok(semExclude.includes(orfao), "sem --exclude o orfao e alcancavel");

    // 2. Na posicao certa (entre o subcomando e o --all), o orfao some.
    const comExclude = git(fixture.root, ...ordemCerta);
    assert.ok(!comExclude.includes(orfao), "com os excludes na posicao certa o orfao some");

    // 3. Excludes DEPOIS do --all: o git nao aplica — o orfao CONTINUA
    //    (era o argv do bug antigo, `[...LOG_ARGS, --exclude]`).
    const ordemErrada = [...LOG_ARGS, "--exclude=refs/do-archive/*", "--exclude=refs/stash"];
    const comExcludeDepois = git(fixture.root, ...ordemErrada);
    assert.ok(
      comExcludeDepois.includes(orfao),
      "exclude depois do --all nao exclui nada (prova a necessidade da ordem)",
    );

    // 4. Excludes ANTES do subcomando: o git rejeita o argv. (Captura o stderr
    //    para o teste rodar sem vazar o usage do git no console.)
    const rejeitado = spawnSync(
      "git",
      ["--exclude=refs/do-archive/*", ...LOG_ARGS],
      {
        cwd: fixture.root,
        encoding: "utf8",
        env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
      },
    );
    assert.equal(rejeitado.status, 129, "git sai com 129 (uso invalido)");
    assert.match(
      rejeitado.stderr,
      /unknown option/,
      "exclude antes do subcomando e rejeitado pelo git",
    );

    // 5. O payload do getLog coincide com a saida da ordem certa: e o argv
    //    que a producao monta (uma ordem errada incluiria o orfao e quebraria
    //    a igualdade de hashes).
    const payload = await getLog({ cwd: fixture.root });
    const hashesCerta = new Set(comExclude.split("\n").map((l) => l.split("|")[0]));
    assert.equal(hashesCerta.size, payload.commits.length);
    for (const commit of payload.commits) {
      assert.ok(hashesCerta.has(commit.hash), `payload do getLog != saida da ordem certa: ${commit.hash}`);
    }
    assert.equal(payload.total, payload.commits.length);
  } finally {
    fixture.cleanup();
  }
});

/* ------------------------------------------------------------------ *
 * c. parseCommitLine / parseDecoration com refs especiais
 * ------------------------------------------------------------------ */

test("parseCommitLine: refs/stash na decoracao vira kind stash", () => {
  const line = [
    "f".repeat(40),
    "",
    "Fulano",
    "fulano@exemplo.com",
    "assunto com stash",
    "2 days ago",
    " (refs/stash)",
  ].join("|");
  const commit = parseCommitLine(line, REMOTES);
  assert.equal(commit.refs.length, 1);
  assert.deepEqual(commit.refs[0], {
    kind: "stash",
    name: "refs/stash",
    fullName: "refs/stash",
    isHead: false,
  });
});

test("parseDecoration: refs/do-archive aninhada e classificada pelo fallback do parser", () => {
  // refFromName nao conhece o namespace de arquivo: o nome inteiro
  // (refs/do-archive/2026/08/xxx) cai no ramo de fallback localBranch. A
  // exclusao acontece no git (o --exclude), ANTES do parser — o teste de
  // integracao acima prova que essas linhas nunca chegam num repo de verdade
  // (e o %d por padrao tambem nao decoraria um ref fora dos namespaces
  // conhecidos). Este teste pina o que o parser faria se a linha chegasse.
  const refs = parseDecoration(" (refs/do-archive/2026/08/xxx)", REMOTES);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].name, "refs/do-archive/2026/08/xxx");
  assert.equal(refs[0].kind, "localBranch");
  assert.equal(refs[0].fullName, "refs/heads/refs/do-archive/2026/08/xxx");
  assert.equal(refs[0].isHead, false);
});

test("parseCommitLine: do-archive aninhada junto com stash e HEAD -> main", () => {
  const line = [
    "e".repeat(40),
    "",
    "Fulano",
    "fulano@exemplo.com",
    "assunto com refs especiais",
    "2 days ago",
    " (HEAD -> main, refs/stash, refs/do-archive/2026/08/xxx)",
  ].join("|");
  const commit = parseCommitLine(line, REMOTES);
  assert.deepEqual(commit.refs.map((r) => r.kind), ["head", "localBranch", "stash", "localBranch"]);
  assert.equal(commit.refs[2].name, "refs/stash");
  assert.equal(commit.refs[3].name, "refs/do-archive/2026/08/xxx");
});

/* ------------------------------------------------------------------ *
 * d. Bordas
 * ------------------------------------------------------------------ */

test("borda: repositorio sem stash nem do-archive — log limpo, total consistente", async () => {
  const fixture = makeFixtureRepo();
  try {
    const payload = await getLog({ cwd: fixture.root });
    assert.equal(payload.empty, false);
    assert.ok(payload.total > 0);
    assert.equal(payload.total, payload.commits.length, "total == linhas num repo limpo");
    assert.equal(await countCommits(fixture.root), payload.commits.length);

    // Sem refs especiais, --all, --branches --remotes --tags e countCommits
    // contam a mesma coisa.
    const comTudo = Number(git(fixture.root, "rev-list", "--all", "--count"));
    const uniaoLegitima = Number(
      git(fixture.root, "rev-list", "--branches", "--remotes", "--tags", "--count"),
    );
    assert.equal(comTudo, payload.total);
    assert.equal(uniaoLegitima, payload.total);
  } finally {
    fixture.cleanup();
  }
});

test("borda: stash e o UNICO commit do repo inteiro — grafo vazio, total 0", async () => {
  const repo = makeStashOnlyRepo();
  try {
    // Prova do cenario: o unico commit existe e e alcancavel so pelo stash.
    assert.equal(git(repo.root, "rev-list", "--all", "--count"), "1");
    assert.equal(git(repo.root, "rev-list", "--exclude=refs/stash", "--all", "--count"), "0");

    const payload = await getLog({ cwd: repo.root });
    assert.deepEqual(payload.commits, [], "o commit do stash nao pode entrar no grafo");
    assert.equal(payload.total, 0);
    assert.equal(payload.empty, true, "repo sem commit visivel e o estado vazio valido");
    assert.equal(await countCommits(repo.root), 0);
  } finally {
    repo.cleanup();
  }
});

test("borda: repositorio totalmente vazio — countCommits e 0 e log continua vazio", async () => {
  const empty = makeEmptyRepo();
  try {
    assert.equal(await countCommits(empty.root), 0);
    const payload = await getLog({ cwd: empty.root });
    assert.equal(payload.empty, true);
    assert.equal(payload.total, 0);
    assert.deepEqual(payload.commits, []);
  } finally {
    empty.cleanup();
  }
});

/* ------------------------------------------------------------------ *
 * e. Contagem: countCommits == uniao das refs legitimas
 * ------------------------------------------------------------------ */

test("contagem: countCommits com os excludes == rev-list --branches --remotes --tags", async () => {
  // Com as refs especiais presentes, a uniao das refs legitimas e a definicao
  // do que o grafo deve mostrar.
  const fixture = makeFixtureRepo();
  try {
    createOrphan(fixture, "arquivado.txt", "wip arquivado", "refs/do-archive/2026/08/contagem");
    createOrphan(fixture, "stashado.txt", "WIP on main", "refs/stash");
    git(fixture.root, "remote", "add", "origin", "https://github.com/gitcraque/fixture.git");
    git(fixture.root, "update-ref", "refs/remotes/origin/main", fixture.hashes.merge);

    const uniaoLegitima = Number(
      git(fixture.root, "rev-list", "--branches", "--remotes", "--tags", "--count"),
    );
    assert.equal(await countCommits(fixture.root), uniaoLegitima);

    const payload = await getLog({ cwd: fixture.root });
    assert.equal(payload.total, uniaoLegitima);
    assert.equal(payload.commits.length, uniaoLegitima);
  } finally {
    fixture.cleanup();
  }
});
