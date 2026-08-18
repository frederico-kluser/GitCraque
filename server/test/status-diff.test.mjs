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
  mergeWordDiff,
  parseHunkHeader,
  parseStatusV2,
  parseUnifiedDiff,
  parseWordDiffPorcelain,
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

/**
 * Word-diff: o formato porcelain NAO usa `[-...-]`/`{+...+}` (isso e o plain).
 * O git emite pedacos com marcador ` ` / `+` / `-` e uma linha `~` DEPOIS de
 * cada pedaco que terminava a linha de origem. A fixture abaixo e saida real
 * do git 2.43 (`--word-diff=porcelain`) para a troca "hello world" ->
 * "hello brave world" + "42" -> "43".
 */
test("word-diff porcelain: linha modificada vira segmentos por palavra", () => {
  const patch = [
    "diff --git a/src/app.js b/src/app.js",
    "index 1111111..2222222 100644",
    "--- a/src/app.js",
    "+++ b/src/app.js",
    "@@ -1,2 +1,2 @@",
    ' const x = "hello ',
    "+brave",
    '  world";',
    "~",
    " const y = ",
    "-42;",
    "+43;",
    "~",
    "",
  ].join("\n");

  const [file] = parseWordDiffPorcelain(patch);
  assert.equal(file.path, "src/app.js");
  assert.equal(file.binary, false);
  assert.equal(file.hunks.length, 1);

  const linhas = file.hunks[0].lines;
  // O conteudo do lado REMOVIDO e aproximado nesta reconstrucao so-porcelain:
  // os chunks de contexto vem do buffer do lado NOVO, e o espaco do "brave"
  // inserido duplica no texto removido ('hello  world' com dois espacos). O
  // merge com o patch classico (`mergeWordDiff`) e que entrega o byte exato.
  assert.deepEqual(
    linhas.map((l) => [l.kind, l.oldNumber, l.newNumber, l.content]),
    [
      ["del", 1, null, 'const x = "hello  world";'],
      ["del", 2, null, "const y = 42;"],
      ["add", null, 1, 'const x = "hello brave world";'],
      ["add", null, 2, "const y = 43;"],
    ],
  );

  // A linha "removida" so tinha palavras de contexto (nada foi removido de
  // verdade — o "brave" foi INSERIDO): sem words, render classico.
  assert.equal(linhas[0].words, undefined);
  assert.deepEqual(linhas[1].words, [
    { kind: "context", text: "const y = " },
    { kind: "del", text: "42;" },
  ]);
  assert.deepEqual(linhas[2].words, [
    { kind: "context", text: 'const x = "hello ' },
    { kind: "add", text: "brave" },
    { kind: "context", text: ' world";' },
  ]);
  assert.deepEqual(linhas[3].words, [
    { kind: "context", text: "const y = " },
    { kind: "add", text: "43;" },
  ]);
  assert.ok(file.raw.startsWith("diff --git"), "raw guarda o patch cru");
});

test("word-diff porcelain: contexto puro entre blocos e casado por indice", () => {
  const patch = [
    "diff --git a/c.txt b/c.txt",
    "index 1111111..2222222 100644",
    "--- a/c.txt",
    "+++ b/c.txt",
    "@@ -4,6 +4,5 @@",
    " keep me",
    "~",
    "-remove me please",
    "~",
    "-multi",
    "~",
    " multi",
    "~",
    " multi",
    "~",
    "+multi end changed",
    "~",
    " end",
    "~",
    "",
  ].join("\n");

  const [file] = parseWordDiffPorcelain(patch);
  const linhas = file.hunks[0].lines;
  assert.deepEqual(
    linhas.map((l) => [l.kind, l.oldNumber, l.newNumber, l.content]),
    [
      ["context", 4, 4, "keep me"],
      ["del", 5, null, "remove me please"],
      ["del", 6, null, "multi"],
      ["context", 7, 5, "multi"],
      ["context", 8, 6, "multi"],
      // A linha de contexto empatada sai com o lado removido (ordem do arquivo
      // antigo); o "multi end changed" vem depois, na passada do lado novo.
      ["context", 9, 8, "end"],
      ["add", null, 7, "multi end changed"],
    ],
  );
  assert.equal(linhas[1].words[0].kind, "del");
  assert.equal(linhas[6].words[0].kind, "add");
  // As linhas de contexto puras nao carregam words.
  assert.equal(linhas[3].words, undefined);
});

test("word-diff porcelain: adicao pura de linha inteira", () => {
  const patch = [
    "diff --git a/e.txt b/e.txt",
    "index 1111111..2222222 100644",
    "--- a/e.txt",
    "+++ b/e.txt",
    "@@ -1 +1,2 @@",
    " line1 keep",
    "~",
    "+brand new added line",
    "~",
    "",
  ].join("\n");

  const [file] = parseWordDiffPorcelain(patch);
  const linhas = file.hunks[0].lines;
  assert.deepEqual(
    linhas.map((l) => [l.kind, l.oldNumber, l.newNumber, l.content]),
    [
      ["context", 1, 1, "line1 keep"],
      ["add", null, 2, "brand new added line"],
    ],
  );
  assert.deepEqual(linhas[1].words, [{ kind: "add", text: "brand new added line" }]);
});

test("word-diff porcelain: comecar com mudanca na primeira linha (sem ~ inicial)", () => {
  const patch = [
    "diff --git a/d.txt b/d.txt",
    "index 1111111..2222222 100644",
    "--- a/d.txt",
    "+++ b/d.txt",
    "@@ -1 +1 @@",
    "-aaa",
    "+AXA",
    " bbb ccc",
    "~",
    "",
  ].join("\n");

  const [file] = parseWordDiffPorcelain(patch);
  const linhas = file.hunks[0].lines;
  // Reconstrucao aproximada (so-porcelain): o espaco antes de "bbb" sumiu —
  // o xdiff de palavras atribuiu o vaozinho ao pedaco anterior. O merge com o
  // patch classico entrega o byte exato ('aaa bbb ccc').
  assert.deepEqual(
    linhas.map((l) => [l.kind, l.oldNumber, l.newNumber, l.content]),
    [
      ["del", 1, null, "aaabbb ccc"],
      ["add", null, 1, "AXAbbb ccc"],
    ],
  );
  assert.deepEqual(linhas[0].words, [
    { kind: "del", text: "aaa" },
    { kind: "context", text: "bbb ccc" },
  ]);
  assert.deepEqual(linhas[1].words, [
    { kind: "add", text: "AXA" },
    { kind: "context", text: "bbb ccc" },
  ]);
});

test("status e diff num repo de verdade", async () => {
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

test("mergeWordDiff: conteudo classico exato + palavras do porcelain", () => {
  const plain = [
    "diff --git a/p.js b/p.js",
    "index 1111111..2222222 100644",
    "--- a/p.js",
    "+++ b/p.js",
    "@@ -1,2 +1,2 @@",
    '-const x = "hello world";',
    '+const x = "hello brave world";',
    "-const y = 42;",
    "+const y = 43;",
    "",
  ].join("\n");
  // Saida real do `git diff --word-diff=porcelain` para a mesma mudanca.
  const porcelain = [
    "diff --git a/p.js b/p.js",
    "index 1111111..2222222 100644",
    "--- a/p.js",
    "+++ b/p.js",
    "@@ -1,2 +1,2 @@",
    ' const x = "hello ',
    "+brave",
    '  world";',
    "~",
    " const y = ",
    "-42;",
    "+43;",
    "~",
    "",
  ].join("\n");

  const [file] = mergeWordDiff(parseUnifiedDiff(plain), parseWordDiffPorcelain(porcelain));
  const linhas = file.hunks[0].lines;
  // O conteudo removido vem do patch classico — sem o espaco duplicado que a
  // reconstrucao so-porcelain produziria ('hello  world' com dois espacos).
  assert.equal(linhas[0].content, 'const x = "hello world";');
  assert.equal(linhas[0].words, undefined, "nada foi removido na linha — sem words");
  assert.deepEqual(linhas[1].words, [
    { kind: "context", text: 'const x = "hello ' },
    { kind: "add", text: "brave" },
    { kind: "context", text: ' world";' },
  ]);
  assert.equal(linhas[2].content, "const y = 42;");
  assert.deepEqual(linhas[2].words, [
    { kind: "context", text: "const y = " },
    { kind: "del", text: "42;" },
  ]);
});

test("mergeWordDiff: alinhamento de palavra diferente do de linha", () => {
  // Linhas repetidas fazem o xdiff de palavras empatar diferente do de linhas:
  // o porcelain emparelha o ultimo "multi" com "multi end changed" e o resto
  // como contexto; o classico sai com 4 del + 3 add. O merge atribui as
  // palavras POR INDICE e o resto fica sem highlight.
  const plain = [
    "diff --git a/q.txt b/q.txt",
    "@@ -1,6 +1,5 @@",
    " keep me",
    "-remove me please",
    "-multi",
    "-multi",
    "-multi",
    "+multi",
    "+multi",
    "+multi end changed",
    " end",
    "",
  ].join("\n");
  const porcelain = [
    "diff --git a/q.txt b/q.txt",
    "@@ -1,6 +1,5 @@",
    " keep me",
    "~",
    "-remove me please",
    "~",
    "-multi",
    "~",
    " multi",
    "~",
    " multi",
    "~",
    "+multi end changed",
    "~",
    " end",
    "~",
    "",
  ].join("\n");

  const [file] = mergeWordDiff(parseUnifiedDiff(plain), parseWordDiffPorcelain(porcelain));
  const linhas = file.hunks[0].lines;
  assert.deepEqual(linhas.map((l) => [l.kind, l.content]), [
    ["context", "keep me"],
    ["del", "remove me please"],
    ["del", "multi"],
    ["del", "multi"],
    ["del", "multi"],
    ["add", "multi"],
    ["add", "multi"],
    ["add", "multi end changed"],
    ["context", "end"],
  ]);
  assert.deepEqual(linhas[1].words, [{ kind: "del", text: "remove me please" }]);
  assert.deepEqual(linhas[2].words, [{ kind: "del", text: "multi" }]);
  // As linhas que o git tratou como contexto nao carregam words.
  assert.equal(linhas[3].words, undefined);
  assert.equal(linhas[4].words, undefined);
  assert.equal(linhas[5].words, undefined);
  assert.equal(linhas[6].words, undefined);
  assert.deepEqual(linhas[7].words, [{ kind: "add", text: "multi end changed" }]);
});

/**
 * Regressao do bug de atribuicao: uma linha so-INSERIDA antes de uma linha
 * com palavra del fazia o `~` fechar so o lado adicionado; a linha do lado
 * removido ficava aberta e fundia com a linha seguinte. O pedaco del da
 * linha seguinte era atribuido a linha errada (ou sumia). As fixtures sao
 * saida REAL do git desta maquina.
 */
test("mergeWordDiff: insercao pura + del seguinte — del na linha certa", () => {
  // Antes: const a = 1; / const b = 2; / const c = 3;
  // Depois: const a = 1; // note / const b = 3; / const c = 3;
  const plain = [
    "diff --git a/f.js b/f.js",
    "index 91b9de2..7e31e0d 100644",
    "--- a/f.js",
    "+++ b/f.js",
    "@@ -1,3 +1,3 @@",
    "-const a = 1;",
    "-const b = 2;",
    "+const a = 1; // note",
    "+const b = 3;",
    " const c = 3;",
    "",
  ].join("\n");
  const porcelain = [
    "diff --git a/f.js b/f.js",
    "index 91b9de2..7e31e0d 100644",
    "--- a/f.js",
    "+++ b/f.js",
    "@@ -1,3 +1,3 @@",
    " const a = 1; ",
    "+// note",
    "~",
    " const b = ",
    "-2;",
    "+3;",
    "~",
    " const c = 3;",
    "~",
    "",
  ].join("\n");

  const [file] = mergeWordDiff(parseUnifiedDiff(plain), parseWordDiffPorcelain(porcelain));
  const linhas = file.hunks[0].lines;
  assert.deepEqual(
    linhas.map((l) => [l.kind, l.content]),
    [
      ["del", "const a = 1;"],
      ["del", "const b = 2;"],
      ["add", "const a = 1; // note"],
      ["add", "const b = 3;"],
      ["context", "const c = 3;"],
    ],
  );
  // As palavras da linha 1 nao foram removidas (o xdiff manteve como
  // contexto): a linha del `const a = 1;` fica sem highlight.
  assert.equal(linhas[0].words, undefined, "nada foi removido da linha 1");
  // O del `2;` TEM de ficar na linha `const b = 2;` — nunca na linha
  // `const a = 1; // note` nem sumir.
  assert.deepEqual(linhas[1].words, [
    { kind: "context", text: "const b = " },
    { kind: "del", text: "2;" },
  ]);
  assert.deepEqual(linhas[2].words, [
    { kind: "context", text: "const a = 1; " },
    { kind: "add", text: "// note" },
  ]);
  assert.deepEqual(linhas[3].words, [
    { kind: "context", text: "const b = " },
    { kind: "add", text: "3;" },
  ]);
  assert.equal(linhas[4].words, undefined);
  for (const linha of linhas) {
    if (linha.words) {
      assert.equal(linha.words.map((w) => w.text).join(""), linha.content, "join(words) == content");
    }
  }
});

test("mergeWordDiff: insercao pura + delecao de linha inteira — del na linha certa", () => {
  // A regiao do xdiff de palavras funde as 2 linhas antigas numa so linha
  // logica (` const a = 1; ` + `-const b = 2;` + `+// note` + UM `~`): o
  // porcelain nao carrega a fronteira entre elas. A estrutura sai do patch
  // classico — o pedaco `const b = 2;` tem de cair na SEGUNDA linha del.
  const plain = [
    "diff --git a/f.js b/f.js",
    "index 91b9de2..3df7b1f 100644",
    "--- a/f.js",
    "+++ b/f.js",
    "@@ -1,3 +1,2 @@",
    "-const a = 1;",
    "-const b = 2;",
    "+const a = 1; // note",
    " const c = 3;",
    "",
  ].join("\n");
  const porcelain = [
    "diff --git a/f.js b/f.js",
    "index 91b9de2..3df7b1f 100644",
    "--- a/f.js",
    "+++ b/f.js",
    "@@ -1,3 +1,2 @@",
    " const a = 1; ",
    "-const b = 2;",
    "+// note",
    "~",
    " const c = 3;",
    "~",
    "",
  ].join("\n");

  const [file] = mergeWordDiff(parseUnifiedDiff(plain), parseWordDiffPorcelain(porcelain));
  const linhas = file.hunks[0].lines;
  assert.deepEqual(
    linhas.map((l) => [l.kind, l.content]),
    [
      ["del", "const a = 1;"],
      ["del", "const b = 2;"],
      ["add", "const a = 1; // note"],
      ["context", "const c = 3;"],
    ],
  );
  // A linha 1 foi removida no patch classico, mas as PALAVRAS dela viraram
  // contexto no xdiff (so `const b = 2;` virou del): sem highlight nela.
  assert.equal(linhas[0].words, undefined, "o del da linha 2 nao pode renderizar na linha 1");
  assert.deepEqual(linhas[1].words, [{ kind: "del", text: "const b = 2;" }]);
  assert.deepEqual(linhas[2].words, [
    { kind: "context", text: "const a = 1; " },
    { kind: "add", text: "// note" },
  ]);
  assert.equal(linhas[3].words, undefined);
});

test("mergeWordDiff: insercao pura + linha alterada + linha so-add no fim — del na linha certa", () => {
  const plain = [
    "diff --git a/f.js b/f.js",
    "index 9e55dd9..b1de52f 100644",
    "--- a/f.js",
    "+++ b/f.js",
    "@@ -1,2 +1,3 @@",
    "-const a = 1;",
    "-const b = 2;",
    "+const a = 1; // note",
    "+const b = 3;",
    "+const z = 9;",
    "",
  ].join("\n");
  const porcelain = [
    "diff --git a/f.js b/f.js",
    "index 9e55dd9..b1de52f 100644",
    "--- a/f.js",
    "+++ b/f.js",
    "@@ -1,2 +1,3 @@",
    " const a = 1; ",
    "+// note",
    "~",
    " const b = ",
    "-2;",
    "+3;",
    "~",
    "+const z = 9;",
    "~",
    "",
  ].join("\n");

  const [file] = mergeWordDiff(parseUnifiedDiff(plain), parseWordDiffPorcelain(porcelain));
  const linhas = file.hunks[0].lines;
  assert.deepEqual(
    linhas.map((l) => [l.kind, l.content]),
    [
      ["del", "const a = 1;"],
      ["del", "const b = 2;"],
      ["add", "const a = 1; // note"],
      ["add", "const b = 3;"],
      ["add", "const z = 9;"],
    ],
  );
  assert.equal(linhas[0].words, undefined);
  assert.deepEqual(linhas[1].words, [
    { kind: "context", text: "const b = " },
    { kind: "del", text: "2;" },
  ]);
  assert.deepEqual(linhas[2].words, [
    { kind: "context", text: "const a = 1; " },
    { kind: "add", text: "// note" },
  ]);
  assert.deepEqual(linhas[3].words, [
    { kind: "context", text: "const b = " },
    { kind: "add", text: "3;" },
  ]);
  assert.deepEqual(linhas[4].words, [{ kind: "add", text: "const z = 9;" }]);
});

test("getDiff wordDiff: comando separado, payload aditivo, default intacto", async () => {
  const fixture = makeFixtureRepo();
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    // Muda UMA palavra numa linha existente do fixture.
    fs.writeFileSync(path.join(fixture.root, "src/app.js"), "console.log(1)\nconsole.log(9)\n");

    const classico = await getDiff({ path: "src/app.js" });
    assert.equal(classico.length, 1);
    for (const line of classico[0].hunks[0].lines) {
      assert.equal(line.words, undefined, "sem wordDiff o payload nao muda (campo aditivo)");
    }

    const palavras = await getDiff({ path: "src/app.js", wordDiff: true });
    assert.equal(palavras.length, 1);
    assert.equal(palavras[0].path, "src/app.js");
    // Linha adicionada inteira: a palavra e o conteudo todo (o regex de
    // palavra do git corta em branco, "console.log(9)" e uma palavra so).
    const addLine = palavras[0].hunks[0].lines.find((l) => l.kind === "add");
    assert.ok(addLine.words, "linha alterada carrega segmentos");
    assert.deepEqual(addLine.words, [{ kind: "add", text: "console.log(9)" }]);

    // Staged com word-diff tambem funciona; sem path, o endpoint ignora a
    // flag e cai no caminho classico.
    git(fixture.root, "add", "src/app.js");
    const stagedWords = await getDiff({ path: "src/app.js", staged: true, wordDiff: true });
    assert.ok(stagedWords[0].hunks[0].lines.some((l) => l.words), "staged com word-diff");
    const semPath = await getDiff({ hash: fixture.hashes.pipe, wordDiff: true });
    assert.ok(semPath.length >= 1, "sem path o wordDiff nao muda o comando");
    for (const file of semPath) {
      for (const hunk of file.hunks) {
        for (const line of hunk.lines) assert.equal(line.words, undefined);
      }
    }
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});

test("getDiff wordDiff real: insercao pura + del seguinte — palavra del na linha certa", async () => {
  const fixture = makeFixtureRepo();
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    // Commit base com as DUAS linhas; depois a mudanca realista: linha 1 so
    // ganha um comentario (insercao pura), linha 2 muda de palavra.
    fs.writeFileSync(path.join(fixture.root, "src/app.js"), "const a = 1;\nconst b = 2;\n");
    git(fixture.root, "add", "src/app.js");
    git(fixture.root, "commit", "-q", "-m", "base");
    fs.writeFileSync(
      path.join(fixture.root, "src/app.js"),
      "const a = 1; // note\nconst b = 3;\n",
    );

    const palavras = await getDiff({ path: "src/app.js", wordDiff: true });
    const linhas = palavras[0].hunks[0].lines;
    const del = linhas.find((l) => l.kind === "del" && l.content.includes("b = 2"));
    const add = linhas.find((l) => l.kind === "add" && l.content.includes("b = 3"));
    assert.ok(del, "linha del const b = 2; existe");
    assert.ok(add, "linha add const b = 3; existe");
    // O del `2;` TEM de estar na linha `const b = 2;` — nenhuma outra linha
    // pode carregar a palavra del, e a linha certa nao pode ficar sem ela.
    assert.deepEqual(del.words, [
      { kind: "context", text: "const b = " },
      { kind: "del", text: "2;" },
    ]);
    assert.deepEqual(add.words, [
      { kind: "context", text: "const b = " },
      { kind: "add", text: "3;" },
    ]);
    for (const linha of linhas) {
      if (linha.words) {
        assert.equal(linha.words.map((w) => w.text).join(""), linha.content, "join(words) == content");
      }
    }
    // A palavra del so pode aparecer como segmento del da propria linha.
    for (const linha of linhas) {
      for (const word of linha.words ?? []) {
        if (word.kind === "del") {
          assert.equal(linha.content, "const b = 2;", "del so na linha const b = 2;");
        }
      }
    }
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
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
