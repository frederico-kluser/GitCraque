/**
 * for-each-ref numa passada so, ahead/behind vindos de `%(upstream:track)`,
 * stashes, HEAD e a deteccao de operacao pendente pelos arquivos do git-dir.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  detectPending,
  getHeadState,
  getRefsPayload,
  parseForEachRef,
  parseStashList,
  parseTrack,
} from "../src/git/refs.mjs";
import { parseRemotes, remoteHost } from "../src/git/remotes.mjs";
import { getGitDir } from "../src/git/worktree.mjs";
import { git, makeFixtureRepo } from "./helpers/repo.mjs";

const US = "\u001f";
const row = (...fields) => fields.join(US);

test("separa branches locais, remotas e tags numa passada", () => {
  const stdout = [
    row("refs/heads/main", "main", "a".repeat(40), "commit", "origin/main", "[ahead 2, behind 1]", "*", "assunto main", ""),
    row("refs/heads/feature/login", "feature/login", "b".repeat(40), "commit", "", "", " ", "assunto feat", ""),
    row("refs/remotes/origin/main", "origin/main", "c".repeat(40), "commit", "", "", " ", "", ""),
    row("refs/tags/v1.0", "v1.0", "d".repeat(40), "tag", "", "", " ", "release anotada", "e".repeat(40)),
    row("refs/tags/leve", "leve", "f".repeat(40), "commit", "", "", " ", "assunto do commit", ""),
  ].join("\n");

  const { branches, remoteBranches, tags } = parseForEachRef(stdout, new Set(["origin"]));

  assert.equal(branches.length, 2);
  assert.equal(branches[0].name, "main");
  assert.equal(branches[0].isHead, true, "%(HEAD) === * marca a branch corrente");
  assert.equal(branches[0].upstream, "origin/main");
  assert.equal(branches[0].ahead, 2);
  assert.equal(branches[0].behind, 1);
  assert.equal(branches[1].isHead, false);
  assert.equal(branches[1].upstream, undefined);

  assert.equal(remoteBranches.length, 1);
  assert.equal(remoteBranches[0].remote, "origin");
  assert.equal(remoteBranches[0].shortName, "main");

  assert.equal(tags.length, 2);
  const anotada = tags.find((t) => t.name === "v1.0");
  assert.equal(anotada.annotated, true);
  assert.equal(anotada.message, "release anotada");
  assert.equal(anotada.target, "e".repeat(40), "tag anotada aponta para o commit derefado");
  const leve = tags.find((t) => t.name === "leve");
  assert.equal(leve.annotated, false);
  assert.equal(leve.message, undefined, "tag leve nao tem mensagem propria");
});

test("upstream:track em todas as formas", () => {
  assert.deepEqual(parseTrack(""), { ahead: 0, behind: 0 });
  assert.deepEqual(parseTrack("[ahead 3]"), { ahead: 3, behind: 0 });
  assert.deepEqual(parseTrack("[behind 7]"), { ahead: 0, behind: 7 });
  assert.deepEqual(parseTrack("[ahead 1, behind 2]"), { ahead: 1, behind: 2 });
  assert.deepEqual(parseTrack("[gone]"), { ahead: 0, behind: 0 });
});

test("stash list quebra o titulo em branch + mensagem", () => {
  const stdout = [
    row("stash@{0}", "a".repeat(40), "WIP on main: 1234abc assunto anterior", "2 minutes ago"),
    row("stash@{1}", "b".repeat(40), "On feature/login: minha mensagem", "1 day ago"),
  ].join("\n");

  const stashes = parseStashList(stdout);
  assert.equal(stashes.length, 2);
  assert.equal(stashes[0].index, 0);
  assert.equal(stashes[0].branch, "main");
  assert.equal(stashes[0].message, "1234abc assunto anterior");
  assert.equal(stashes[1].branch, "feature/login");
  assert.equal(stashes[1].message, "minha mensagem");
  assert.equal(stashes[1].relativeDate, "1 day ago");
});

test("remote -v vira lista com host e https", () => {
  const stdout = [
    "origin\thttps://github.com/usuario/repo.git (fetch)",
    "origin\thttps://github.com/usuario/repo.git (push)",
    "ssh\tgit@gitlab.com:grupo/proj.git (fetch)",
    "ssh\tgit@gitlab.com:grupo/proj.git (push)",
  ].join("\n");

  const remotes = parseRemotes(stdout);
  assert.equal(remotes.length, 2);
  assert.equal(remotes[0].name, "origin");
  assert.equal(remotes[0].host, "github.com");
  assert.equal(remotes[0].https, true);
  assert.equal(remotes[1].host, "gitlab.com");
  assert.equal(remotes[1].https, false);
});

test("remoteHost cobre https, ssh:// e a forma scp", () => {
  assert.equal(remoteHost("https://github.com/u/r.git"), "github.com");
  assert.equal(remoteHost("ssh://git@bitbucket.org:22/u/r.git"), "bitbucket.org");
  assert.equal(remoteHost("git@github.com:u/r.git"), "github.com");
  assert.equal(remoteHost(""), "");
});

test("detectPending le rebase-merge/msgnum e end", async () => {
  const fixture = makeFixtureRepo();
  try {
    const gitDir = await getGitDir(fixture.root);
    assert.equal(await detectPending(gitDir), null, "repo limpo nao tem operacao pendente");

    const dir = path.join(gitDir, "rebase-merge");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "msgnum"), "2\n");
    fs.writeFileSync(path.join(dir, "end"), "5\n");
    fs.writeFileSync(path.join(dir, "interactive"), "");
    fs.writeFileSync(path.join(dir, "stopped-sha"), `${"a".repeat(40)}\n`);

    const pending = await detectPending(gitDir);
    assert.equal(pending.kind, "rebase-interactive");
    assert.equal(pending.step, 2);
    assert.equal(pending.total, 5);
    assert.equal(pending.current, "a".repeat(40));

    fs.rmSync(dir, { recursive: true, force: true });
    fs.writeFileSync(path.join(gitDir, "CHERRY_PICK_HEAD"), `${"b".repeat(40)}\n`);
    assert.equal((await detectPending(gitDir)).kind, "cherry-pick");
    fs.rmSync(path.join(gitDir, "CHERRY_PICK_HEAD"));

    fs.writeFileSync(path.join(gitDir, "REVERT_HEAD"), `${"c".repeat(40)}\n`);
    assert.equal((await detectPending(gitDir)).kind, "revert");
    fs.rmSync(path.join(gitDir, "REVERT_HEAD"));

    fs.writeFileSync(path.join(gitDir, "BISECT_LOG"), "");
    assert.equal((await detectPending(gitDir)).kind, "bisect");
  } finally {
    fixture.cleanup();
  }
});

test("getRefsPayload num repo de verdade", async () => {
  const fixture = makeFixtureRepo();
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    git(fixture.root, "stash", "list"); // garante que o comando existe

    const payload = await getRefsPayload();
    assert.equal(payload.head.branch, "main");
    assert.equal(payload.head.detached, false);
    assert.equal(payload.head.pending, null);

    const nomes = payload.branches.map((b) => b.name).sort();
    assert.deepEqual(nomes, ["feature/login", "main", "squash-me", "trabalho-paralelo"]);

    const main = payload.branches.find((b) => b.name === "main");
    assert.equal(main.isHead, true);
    assert.equal(main.checkedOutIn, fixture.root, "main esta checada na worktree principal");

    const paralela = payload.branches.find((b) => b.name === "trabalho-paralelo");
    assert.equal(
      paralela.checkedOutIn,
      fixture.worktree,
      "branch checada em OUTRA worktree nao pode receber checkout",
    );

    const tags = payload.tags.map((t) => t.name).sort();
    assert.deepEqual(tags, ["leve", "v1.0"]);
    assert.equal(payload.tags.find((t) => t.name === "v1.0").annotated, true);
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});

test("HEAD destacado e reportado como detached", async () => {
  const fixture = makeFixtureRepo();
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    git(fixture.root, "checkout", "-q", "--detach", "HEAD");
    const head = await getHeadState();
    assert.equal(head.detached, true);
    assert.equal(head.branch, null);
    assert.ok(head.hash);
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});
