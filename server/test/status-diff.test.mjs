/**
 * `git status --porcelain=v2 -z` e o parser de patch unificado.
 *
 * O `-z` e o que salva nomes de arquivo com espaco e acento: sem ele o git
 * escapa e cita, e o parser vira exercicio de unquoting.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  getDiff,
  getStatus,
  parseHunkHeader,
  parseStatusV2,
  parseUnifiedDiff,
} from "../src/git/status.mjs";
import { git, makeFixtureRepo } from "./helpers/repo.mjs";

const NUL = "\0";

test("le os cabecalhos # branch.*", () => {
  const stdout = [
    "# branch.oid aaaa",
    "# branch.head main",
    "# branch.upstream origin/main",
    "# branch.ab +3 -2",
    "",
  ].join(NUL);

  const status = parseStatusV2(stdout);
  assert.equal(status.branch, "main");
  assert.equal(status.upstream, "origin/main");
  assert.equal(status.ahead, 3);
  assert.equal(status.behind, 2);
  assert.equal(status.clean, true);
});

test("(detached) vira branch null", () => {
  const status = parseStatusV2(["# branch.head (detached)", ""].join(NUL));
  assert.equal(status.branch, null);
});

test("linha 1: X e o index, Y e a worktree", () => {
  const stdout = [
    "1 M. N... 100644 100644 100644 aaaa bbbb staged.txt",
    "1 .M N... 100644 100644 100644 aaaa bbbb modificado.txt",
    "1 A. N... 000000 100644 100644 0000 cccc novo.txt",
    "1 MM N... 100644 100644 100644 aaaa bbbb os-dois.txt",
    "",
  ].join(NUL);

  const { entries } = parseStatusV2(stdout);
  assert.equal(entries.length, 4);

  assert.deepEqual(
    { ...entries[0] },
    {
      path: "staged.txt",
      code: "M.",
      indexStatus: "modified",
      worktreeStatus: null,
      staged: true,
      unstaged: false,
      untracked: false,
      conflicted: false,
    },
  );
  assert.equal(entries[1].staged, false);
  assert.equal(entries[1].unstaged, true);
  assert.equal(entries[2].indexStatus, "added");
  assert.equal(entries[3].staged, true);
  assert.equal(entries[3].unstaged, true);
});

test("linha 2 (rename) consome DOIS tokens: novo nome e depois o antigo", () => {
  const stdout = [
    "2 R. N... 100644 100644 100644 aaaa bbbb R100 novo/caminho.txt",
    "antigo/caminho.txt",
    "1 .M N... 100644 100644 100644 aaaa bbbb depois.txt",
    "",
  ].join(NUL);

  const { entries } = parseStatusV2(stdout);
  assert.equal(entries.length, 2, "o token do nome antigo nao pode virar uma entrada");
  assert.equal(entries[0].path, "novo/caminho.txt");
  assert.equal(entries[0].oldPath, "antigo/caminho.txt");
  assert.equal(entries[0].indexStatus, "renamed");
  assert.equal(entries[1].path, "depois.txt", "o parser volta ao normal na linha seguinte");
});

test("linha u e conflito; linha ? e untracked", () => {
  const stdout = [
    "u UU N... 100644 100644 100644 100644 aaaa bbbb cccc conflito.txt",
    "? nao-rastreado.txt",
    "? com espaco no nome.txt",
    "! ignorado.log",
    "",
  ].join(NUL);

  const { entries, clean } = parseStatusV2(stdout);
  assert.equal(clean, false);
  assert.equal(entries.length, 3, "arquivos ignorados nao entram no payload");

  assert.equal(entries[0].conflicted, true);
  assert.equal(entries[0].code, "UU");
  assert.equal(entries[0].indexStatus, "unmerged");

  assert.equal(entries[1].untracked, true);
  assert.equal(entries[1].code, "??");
  assert.equal(entries[2].path, "com espaco no nome.txt", "-z preserva o espaco cru");
});

test("parseHunkHeader com e sem contagem", () => {
  assert.deepEqual(parseHunkHeader("@@ -1,7 +1,9 @@ funcao()"), {
    oldStart: 1,
    oldLines: 7,
    newStart: 1,
    newLines: 9,
  });
  assert.deepEqual(parseHunkHeader("@@ -0,0 +1 @@"), {
    oldStart: 0,
    oldLines: 0,
    newStart: 1,
    newLines: 1,
  });
  assert.equal(parseHunkHeader("nao e hunk"), null);
});

test("patch unificado: numeracao correta dos dois lados", () => {
  const patch = [
    "diff --git a/src/app.js b/src/app.js",
    "index 1111111..2222222 100644",
    "--- a/src/app.js",
    "+++ b/src/app.js",
    "@@ -1,4 +1,5 @@",
    " const a = 1",
    "-const b = 2",
    "+const b = 20",
    "+const c = 3",
    " const d = 4",
    " const e = 5",
    "\\ No newline at end of file",
    "",
  ].join("\n");

  const [file] = parseUnifiedDiff(patch);
  assert.equal(file.path, "src/app.js");
  assert.equal(file.binary, false);
  assert.equal(file.hunks.length, 1);

  const linhas = file.hunks[0].lines;
  assert.deepEqual(
    linhas.map((l) => [l.kind, l.oldNumber, l.newNumber]),
    [
      ["context", 1, 1],
      ["del", 2, null],
      ["add", null, 2],
      ["add", null, 3],
      ["context", 3, 4],
      ["context", 4, 5],
      ["meta", null, null],
    ],
  );
  assert.ok(file.raw.startsWith("diff --git"), "raw guarda o patch cru");
});

test("patch com varios arquivos vira varios DiffPayload", () => {
  const patch = [
    "diff --git a/um.txt b/um.txt",
    "--- a/um.txt",
    "+++ b/um.txt",
    "@@ -1 +1 @@",
    "-antigo",
    "+novo",
    "diff --git a/dois.bin b/dois.bin",
    "index 3333333..4444444 100644",
    "Binary files a/dois.bin and b/dois.bin differ",
    "",
  ].join("\n");

  const files = parseUnifiedDiff(patch);
  assert.equal(files.length, 2);
  assert.equal(files[0].path, "um.txt");
  assert.equal(files[1].path, "dois.bin");
  assert.equal(files[1].binary, true, "binario tem de ser detectado");
  assert.equal(files[1].hunks.length, 0);
});

test("rename e capturado com oldPath", () => {
  const patch = [
    "diff --git a/velho.txt b/novo.txt",
    "similarity index 92%",
    "rename from velho.txt",
    "rename to novo.txt",
    "--- a/velho.txt",
    "+++ b/novo.txt",
    "@@ -1 +1 @@",
    "-a",
    "+b",
    "",
  ].join("\n");

  const [file] = parseUnifiedDiff(patch);
  assert.equal(file.path, "novo.txt");
  assert.equal(file.oldPath, "velho.txt");
});

test("status e diff num repo de verdade", async () => {
  const fixture = makeFixtureRepo();
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);

    const limpo = await getStatus();
    assert.equal(limpo.clean, true);
    assert.equal(limpo.branch, "main");
    assert.equal(limpo.cwd, fixture.root);

    fs.writeFileSync(path.join(fixture.root, "src/app.js"), "console.log(1)\nconsole.log(2)\n");
    fs.writeFileSync(path.join(fixture.root, "novo arquivo.txt"), "com espaco no nome\n");

    const sujo = await getStatus();
    assert.equal(sujo.clean, false);
    const modificado = sujo.entries.find((e) => e.path === "src/app.js");
    assert.equal(modificado.unstaged, true);
    assert.equal(modificado.worktreeStatus, "modified");
    const untracked = sujo.entries.find((e) => e.path === "novo arquivo.txt");
    assert.ok(untracked, "arquivo com espaco no nome tem de aparecer intacto");
    assert.equal(untracked.untracked, true);

    const diffs = await getDiff({ path: "src/app.js" });
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].path, "src/app.js");
    assert.ok(diffs[0].hunks[0].lines.some((l) => l.kind === "add"));

    git(fixture.root, "add", "src/app.js");
    const staged = await getDiff({ path: "src/app.js", staged: true });
    assert.equal(staged.length, 1, "com --cached o diff sai do index");

    const doCommit = await getDiff({ hash: fixture.hashes.pipe });
    assert.ok(doCommit.length >= 1, "git show devolve o patch do commit");
    assert.ok(doCommit.some((f) => f.path === "src/app.js"));
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});
