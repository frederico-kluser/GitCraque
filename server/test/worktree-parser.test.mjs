/**
 * `git worktree list --porcelain`: registros separados por linha em branco,
 * com flags soltas (`bare`, `detached`, `locked [motivo]`, `prunable [motivo]`).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { parseWorktreePorcelain, listWorktrees, getWorktreesPayload } from "../src/git/worktree.mjs";
import { makeFixtureRepo } from "./helpers/repo.mjs";

test("parseia registros separados por linha em branco", () => {
  const stdout = [
    "worktree /home/u/projeto",
    "HEAD 1111111111111111111111111111111111111111",
    "branch refs/heads/main",
    "",
    "worktree /home/u/projeto-wt",
    "HEAD 2222222222222222222222222222222222222222",
    "detached",
    "",
  ].join("\n");

  const worktrees = parseWorktreePorcelain(stdout);
  assert.equal(worktrees.length, 2);

  assert.equal(worktrees[0].path, "/home/u/projeto");
  assert.equal(worktrees[0].branch, "main", "refs/heads/main vira main");
  assert.equal(worktrees[0].isMain, true, "a primeira entrada e a principal");
  assert.equal(worktrees[0].detached, false);
  assert.equal(worktrees[0].label, "projeto");

  assert.equal(worktrees[1].isMain, false);
  assert.equal(worktrees[1].detached, true);
  assert.equal(worktrees[1].branch, null);
  assert.equal(worktrees[1].label, "projeto-wt");
});

test("le as flags soltas bare, locked e prunable com motivo", () => {
  const stdout = [
    "worktree /srv/bare.git",
    "bare",
    "",
    "worktree /home/u/travada",
    "HEAD 3333333333333333333333333333333333333333",
    "branch refs/heads/x",
    "locked pendrive removido",
    "",
    "worktree /home/u/orfa",
    "HEAD 4444444444444444444444444444444444444444",
    "detached",
    "prunable gitdir file points to non-existent location",
    "",
  ].join("\n");

  const [bare, travada, orfa] = parseWorktreePorcelain(stdout);
  assert.equal(bare.bare, true);
  assert.equal(bare.head, null);

  assert.equal(travada.locked, true);
  assert.equal(travada.lockReason, "pendrive removido");

  assert.equal(orfa.prunable, true);
  assert.equal(orfa.locked, false);
});

test("locked sem motivo continua locked", () => {
  const stdout = ["worktree /a", "HEAD " + "5".repeat(40), "branch refs/heads/y", "locked", ""].join(
    "\n",
  );
  const [wt] = parseWorktreePorcelain(stdout);
  assert.equal(wt.locked, true);
  assert.equal(wt.lockReason, undefined);
});

test("saida vazia devolve lista vazia", () => {
  assert.deepEqual(parseWorktreePorcelain(""), []);
});

test("num repo de verdade, isActive segue o process.cwd()", async () => {
  const fixture = makeFixtureRepo();
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    const naPrincipal = await listWorktrees();
    assert.equal(naPrincipal.length, 2);
    assert.equal(naPrincipal.find((w) => w.isActive).path, fixture.root);
    assert.equal(naPrincipal.find((w) => w.isMain).path, fixture.root);

    process.chdir(fixture.worktree);
    const naExtra = await listWorktrees();
    const ativa = naExtra.find((w) => w.isActive);
    assert.equal(ativa.path, fixture.worktree);
    assert.equal(ativa.isMain, false);
    assert.equal(ativa.branch, "trabalho-paralelo");

    const payload = await getWorktreesPayload();
    assert.equal(payload.cwd, process.cwd());
    assert.equal(payload.mainRoot, fixture.root);
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});
