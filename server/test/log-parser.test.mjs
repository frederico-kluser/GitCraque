/**
 * O teste mais importante do backend: o assunto do commit pode conter `|`, que
 * e o proprio separador do formato mandatorio. Se o parser dividir a linha
 * ingenuamente, todo commit com pipe na mensagem desalinha os campos.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { parseCommitLine, parseDecoration, getLog } from "../src/git/log.mjs";
import { makeEmptyRepo, makeFixtureRepo, PIPE_SUBJECT } from "./helpers/repo.mjs";

const REMOTES = new Set(["origin", "upstream"]);

test("divide os 4 primeiros campos pela esquerda e os 2 ultimos pela direita", () => {
  const line = [
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb cccccccccccccccccccccccccccccccccccccccc",
    "Fulano de Tal",
    "fulano@exemplo.com",
    "assunto simples",
    "3 days ago",
    " (HEAD -> main, origin/main, tag: v1.0)",
  ].join("|");

  const commit = parseCommitLine(line, REMOTES);
  assert.equal(commit.hash, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.deepEqual(commit.parents, [
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "cccccccccccccccccccccccccccccccccccccccc",
  ]);
  assert.equal(commit.authorName, "Fulano de Tal");
  assert.equal(commit.authorEmail, "fulano@exemplo.com");
  assert.equal(commit.subject, "assunto simples");
  assert.equal(commit.relativeDate, "3 days ago");
  assert.equal(commit.decorationRaw, " (HEAD -> main, origin/main, tag: v1.0)");
});

test("o assunto com | fica INTEIRO", () => {
  const subject = "feat: a | b | c — tres pipes no assunto";
  const line = [
    "1111111111111111111111111111111111111111",
    "2222222222222222222222222222222222222222",
    "Fulano",
    "fulano@exemplo.com",
    subject,
    "2 hours ago",
    "",
  ].join("|");

  const commit = parseCommitLine(line, REMOTES);
  assert.equal(commit.subject, subject, "o assunto tem de sobreviver aos pipes");
  assert.equal(commit.authorEmail, "fulano@exemplo.com");
  assert.equal(commit.relativeDate, "2 hours ago");
  assert.equal(commit.decorationRaw, "");
});

test("assunto que TERMINA e COMECA com | tambem sobrevive", () => {
  const subject = "| borda esquerda e direita |";
  const line = ["a".repeat(40), "", "N", "e@e", subject, "1 second ago", ""].join("|");
  const commit = parseCommitLine(line, REMOTES);
  assert.equal(commit.subject, subject);
  assert.deepEqual(commit.parents, [], "sem pais = commit raiz");
});

test("commit raiz nao tem pais", () => {
  const line = ["a".repeat(40), "", "N", "e@e", "raiz", "1 year ago", ""].join("|");
  assert.deepEqual(parseCommitLine(line, REMOTES).parents, []);
});

test("linha truncada devolve null em vez de objeto quebrado", () => {
  assert.equal(parseCommitLine("so|tres|campos", REMOTES), null);
  assert.equal(parseCommitLine("", REMOTES), null);
});

test("decoracao: HEAD -> main vira DOIS refs", () => {
  const refs = parseDecoration(" (HEAD -> main)", REMOTES);
  assert.equal(refs.length, 2);
  assert.deepEqual(refs[0], { kind: "head", name: "HEAD", isHead: true });
  assert.equal(refs[1].kind, "localBranch");
  assert.equal(refs[1].name, "main");
  assert.equal(refs[1].fullName, "refs/heads/main");
  assert.equal(refs[1].isHead, true);
});

test("decoracao: origin/main vira remoteBranch com remote", () => {
  const refs = parseDecoration(" (origin/main)", REMOTES);
  assert.equal(refs[0].kind, "remoteBranch");
  assert.equal(refs[0].remote, "origin");
  assert.equal(refs[0].fullName, "refs/remotes/origin/main");
});

test("decoracao: feature/x NAO vira remoteBranch quando nao ha remoto assim", () => {
  const refs = parseDecoration(" (feature/login)", REMOTES);
  assert.equal(refs[0].kind, "localBranch");
  assert.equal(refs[0].name, "feature/login");
});

test("decoracao: tag: v1 vira tag", () => {
  const refs = parseDecoration(" (tag: v1.0, tag: leve)", REMOTES);
  assert.equal(refs.length, 2);
  assert.equal(refs[0].kind, "tag");
  assert.equal(refs[0].name, "v1.0");
  assert.equal(refs[0].fullName, "refs/tags/v1.0");
});

test("decoracao: HEAD sozinho (detached) tambem e um ref", () => {
  const refs = parseDecoration(" (HEAD)", REMOTES);
  assert.equal(refs.length, 1);
  assert.deepEqual(refs[0], { kind: "head", name: "HEAD", isHead: true });
});

test("decoracao vazia devolve lista vazia", () => {
  assert.deepEqual(parseDecoration("", REMOTES), []);
  assert.deepEqual(parseDecoration("   ", REMOTES), []);
});

test("getLog num repo de verdade traz o commit com | inteiro", async () => {
  const fixture = makeFixtureRepo();
  try {
    const payload = await getLog({ cwd: fixture.root });
    assert.equal(payload.empty, false);
    assert.ok(payload.total >= 7, `esperava >= 7 commits, veio ${payload.total}`);
    assert.equal(payload.cwd, fixture.root);
    assert.ok(payload.elapsedMs >= 0);

    const comPipe = payload.commits.find((c) => c.hash === fixture.hashes.pipe);
    assert.ok(comPipe, "o commit com pipe tem de estar no log");
    assert.equal(comPipe.subject, PIPE_SUBJECT);
    assert.equal(comPipe.authorEmail, "teste@gitcraque.dev");

    const merge = payload.commits.find((c) => c.hash === fixture.hashes.merge);
    assert.equal(merge.parents.length, 2, "o merge tem dois pais");
  } finally {
    fixture.cleanup();
  }
});

test("getLog pagina com limit e skip", async () => {
  const fixture = makeFixtureRepo();
  try {
    const primeiraPagina = await getLog({ cwd: fixture.root, limit: 3 });
    assert.equal(primeiraPagina.commits.length, 3);
    const segundaPagina = await getLog({ cwd: fixture.root, limit: 3, skip: 3 });
    assert.equal(segundaPagina.skip, 3);
    assert.notEqual(primeiraPagina.commits[0].hash, segundaPagina.commits[0].hash);
  } finally {
    fixture.cleanup();
  }
});

test("repositorio sem commit e estado valido, nao erro", async () => {
  const empty = makeEmptyRepo();
  try {
    const payload = await getLog({ cwd: empty.root });
    assert.equal(payload.empty, true);
    assert.equal(payload.total, 0);
    assert.deepEqual(payload.commits, []);
  } finally {
    empty.cleanup();
  }
});
