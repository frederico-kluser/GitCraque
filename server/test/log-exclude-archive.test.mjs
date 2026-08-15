/**
 * Regressao: commits alcancaveis APENAS por refs/do-archive/* (branches
 * arquivadas pelo deep-orchestrator) nao podem aparecer no log nem no total.
 *
 * O bug: getLog montava `[...LOG_ARGS, "--exclude=refs/do-archive/*"]`, com o
 * --exclude DEPOIS do --all do LOG_ARGS. O git so aplica --exclude aos
 * seletores de ref que vem depois dele ("the next --all, --branches, ..."),
 * entao nada era excluido: o log trazia commits "wip" que o GitKraken nao
 * mostra, e o total (countCommits, que ja usava a ordem certa) divergia das
 * linhas — paginacao inconsistente. Se o --exclude vier antes do subcomando,
 * o git rejeita com "unknown option". A ordem correta e: subcomando, exclude,
 * --all (dentro do LOG_ARGS congelado).
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import { countCommits, getLog } from "../src/git/log.mjs";
import { git, makeFixtureRepo } from "./helpers/repo.mjs";

test("refs/do-archive/* somem do log e do total; refs legitimas continuam decorando", async () => {
  const fixture = makeFixtureRepo();
  try {
    // Commit "wip" alcancavel APENAS por refs/do-archive: cria numa branch
    // temporaria, anota o hash, apaga a branch, cria a ref de arquivo.
    git(fixture.root, "checkout", "-q", "-b", "temporaria-arquivavel");
    const wipFile = path.join(fixture.root, "wip.txt");
    fs.writeFileSync(wipFile, "wip\n");
    git(fixture.root, "add", "-A");
    git(fixture.root, "commit", "-q", "-m", "wip");
    const wipHash = git(fixture.root, "rev-parse", "HEAD");
    git(fixture.root, "checkout", "-q", "main");
    git(fixture.root, "branch", "-q", "-D", "temporaria-arquivavel");
    git(fixture.root, "update-ref", "refs/do-archive/teste/xxx", wipHash);

    // Branch remota decorada sem fetch real: remoto registrado + ref remota.
    git(fixture.root, "remote", "add", "origin", "https://github.com/gitcraque/fixture.git");
    git(fixture.root, "update-ref", "refs/remotes/origin/main", fixture.hashes.merge);

    const payload = await getLog({ cwd: fixture.root });

    // 1. O commit "wip" nao pode aparecer no grafo, nem nenhuma ref de arquivo.
    assert.ok(
      payload.commits.every((c) => c.hash !== wipHash),
      "commit alcancavel so por refs/do-archive/* nao pode aparecer no log",
    );
    for (const commit of payload.commits) {
      for (const ref of commit.refs) {
        assert.ok(
          !ref.name.startsWith("do-archive/"),
          `ref de arquivo vazou no parser: ${ref.name}`,
        );
      }
    }

    // 2. O total paga da mesma selecao que as linhas: log e countCommits.
    assert.equal(
      payload.total,
      payload.commits.length,
      "total do log tem de bater com as linhas (paginacao consistente)",
    );
    assert.equal(await countCommits(fixture.root), payload.commits.length);

    // 3. O teste exercita o exclude de verdade: sem ele, o wip entraria.
    const comExcluido = Number(
      git(fixture.root, "rev-list", "--exclude=refs/do-archive/*", "--all", "--count"),
    );
    const semExcluir = Number(git(fixture.root, "rev-list", "--all", "--count"));
    assert.equal(semExcluir, comExcluido + 1, "sem o exclude o wip seria alcancavel");

    // 4. Refs legitimas continuam decorando: branch local, remota e tags.
    const merge = payload.commits.find((c) => c.hash === fixture.hashes.merge);
    const remota = merge.refs.find((r) => r.name === "origin/main");
    assert.ok(remota, "branch remota continua decorada no merge");
    assert.equal(remota.kind, "remoteBranch");
    assert.equal(remota.remote, "origin");
    assert.ok(
      merge.refs.some((r) => r.kind === "localBranch" && r.name === "main" && r.isHead),
      "branch local HEAD continua decorada",
    );

    const pipe = payload.commits.find((c) => c.hash === fixture.hashes.pipe);
    const nomesPipe = pipe.refs.map((r) => r.name);
    assert.ok(nomesPipe.includes("v1.0"), "tag anotada continua decorada");
    assert.ok(nomesPipe.includes("leve"), "tag leve continua decorada");
  } finally {
    fixture.cleanup();
  }
});
