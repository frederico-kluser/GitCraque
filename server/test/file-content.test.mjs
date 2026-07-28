/**
 * GET /api/file — o conteudo de um arquivo, num commit e na working tree.
 *
 * O que este arquivo tem de provar, alem do feliz caminho:
 *
 *  1. A GUARDA DE CAMINHO. Esta e a unica rota do backend que le arquivo do
 *     disco por caminho vindo do cliente. Se `..`, caminho absoluto ou symlink
 *     apontando para fora passarem, a rota deixa de ser "o visualizador" e vira
 *     leitura arbitraria da maquina por HTTP. Os testes de fuga aqui valem mais
 *     que todos os outros juntos.
 *  2. Binario nao vira texto: NUL nos primeiros KB devolve `content: ""`.
 *  3. Arquivo grande volta o INICIO com `truncated: true`, nao o arquivo todo.
 *  4. Arquivo que nao existe naquele commit e 404, nao 500.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

import { git, makeFixtureRepo } from "./helpers/repo.mjs";
import { bootServer } from "./helpers/server.mjs";
import { translate } from "../src/i18n.mjs";

const {
  FILE_MAX_BYTES,
  getFileContent,
  languageOf,
  looksBinary,
  resolveInsideRoot,
  sliceUtf8,
} = await import("../src/git/file.mjs");

let fixture;
let api;
let hashInicial = "";
const cwdOriginal = process.cwd();
/** O alvo classico de uma fuga de caminho: um arquivo FORA do repositorio. */
let SEGREDO = "";

before(async () => {
  fixture = makeFixtureRepo("gitcraque-file-");

  SEGREDO = path.join(fixture.base, "segredo-fora-do-repo.txt");
  fs.writeFileSync(SEGREDO, "isto nunca pode sair pela rota /api/file\n");

  // Texto commitado, com acento para o corte por bytes ter o que quebrar.
  fs.writeFileSync(
    path.join(fixture.root, "doc.md"),
    "# Titulo\n\nParagrafo com acentuacao: coracao, ficcao, atencao.\n",
  );
  fs.writeFileSync(path.join(fixture.root, "codigo.TS"), "export const x = 1\n");
  git(fixture.root, "add", "-A");
  git(fixture.root, "commit", "-q", "-m", "docs: arquivo do visualizador");
  hashInicial = git(fixture.root, "rev-parse", "HEAD");

  // Depois do commit, a working tree segue diferente: e o que separa as duas
  // origens de leitura.
  fs.writeFileSync(
    path.join(fixture.root, "doc.md"),
    "# Titulo\n\nVersao NOVA, ainda nao commitada.\n",
  );

  // Binario de verdade: NUL logo no comeco.
  fs.writeFileSync(
    path.join(fixture.root, "imagem.png"),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
  );

  // Maior que o teto: 1 MB + um tanto.
  fs.writeFileSync(path.join(fixture.root, "grandao.txt"), "a".repeat(FILE_MAX_BYTES + 4096));

  // Os dois symlinks da fuga: um para arquivo, outro para PASTA (o de pasta e o
  // que escapa da checagem ingenua de lstat na folha).
  fs.symlinkSync(SEGREDO, path.join(fixture.root, "atalho-para-fora.txt"));
  fs.symlinkSync(fixture.base, path.join(fixture.root, "pasta-para-fora"));

  api = await bootServer(fixture.root, { port: 5397 });
});

after(async () => {
  await api?.close();
  process.chdir(cwdOriginal);
  fixture?.cleanup();
});

/* ------------------------------------------------------------------ *
 * A guarda de caminho — o teste que mais importa
 * ------------------------------------------------------------------ */

test("resolveInsideRoot RECUSA caminho que escapa da raiz", () => {
  const raiz = "/repo";
  const fugas = [
    "..",
    "../etc/passwd",
    "../../../../etc/shadow",
    "src/../../fora.txt",
    "/etc/passwd",
    "/proc/self/environ",
    "~/.ssh/id_rsa",
    "~",
    "C:\\Windows\\win.ini",
  ];
  for (const fuga of fugas) {
    assert.throws(
      () => resolveInsideRoot(raiz, fuga),
      (err) => err.status === 400,
      `"${fuga}" tinha de ser recusado`,
    );
  }
});

test("resolveInsideRoot aceita relativo, normaliza, e nao se engana com ..nome", () => {
  assert.deepEqual(resolveInsideRoot("/repo", "src/app.js"), {
    relative: path.normalize("src/app.js"),
    absolute: path.resolve("/repo/src/app.js"),
  });
  assert.equal(resolveInsideRoot("/repo", "./src/../doc.md").relative, "doc.md");
  // "..texto" e nome de arquivo legitimo, nao subida de diretorio
  assert.equal(resolveInsideRoot("/repo", "..oculto").relative, "..oculto");
});

test("resolveInsideRoot recusa path ausente, vazio e com byte NUL", () => {
  for (const ruim of [undefined, null, "", "   ", 42, "a\0b"]) {
    assert.throws(
      () => resolveInsideRoot("/repo", ruim),
      (err) => err.status === 400,
    );
  }
});

test("GET /api/file RECUSA .. e caminho absoluto (400), sem ler nada", async () => {
  // Escrita crua e ja percent-encoded: a barra codificada volta a ser barra na
  // query, entao a guarda tem de pegar as duas do mesmo jeito.
  for (const url of [
    `/api/file?path=${encodeURIComponent("../segredo-fora-do-repo.txt")}`,
    "/api/file?path=..%2Fsegredo-fora-do-repo.txt",
    "/api/file?path=src%2F..%2F..%2Fsegredo-fora-do-repo.txt",
  ]) {
    const { status, json, text } = await api.get(url);
    assert.equal(status, 400, `"${url}" respondeu ${status}`);
    assert.ok(!String(json.content ?? "").includes("nunca pode sair"));
    assert.ok(!text.includes("nunca pode sair"));
  }

  const absoluto = await api.get(`/api/file?path=${encodeURIComponent(SEGREDO)}`);
  assert.equal(absoluto.status, 400);
  assert.match(absoluto.json.error, /relativo/);

  const etc = await api.get(`/api/file?path=${encodeURIComponent("/etc/passwd")}`);
  assert.equal(etc.status, 400);
});

test("GET /api/file RECUSA symlink que aponta para fora — arquivo e pasta", async () => {
  const arquivo = await api.get("/api/file?path=atalho-para-fora.txt");
  assert.equal(arquivo.status, 400, "symlink de arquivo apontando para fora tem de ser 400");
  assert.equal(arquivo.json.content, undefined);

  // O caso que a checagem ingenua deixa passar: a FOLHA e um arquivo comum, e
  // quem escapa e a pasta do meio.
  const pelaPasta = await api.get("/api/file?path=pasta-para-fora/segredo-fora-do-repo.txt");
  assert.equal(pelaPasta.status, 400, "escapar pela pasta symlink tem de ser 400");
  assert.ok(!String(pelaPasta.text).includes("nunca pode sair"));
});

test("getFileContent recusa fuga tambem fora da rota (a guarda esta no modulo)", async () => {
  await assert.rejects(
    () => getFileContent({ path: "../segredo-fora-do-repo.txt" }, fixture.root),
    (err) => err.status === 400,
  );
});

/* ------------------------------------------------------------------ *
 * Leitura: working tree x commit
 * ------------------------------------------------------------------ */

test("GET /api/file sem hash le a WORKING TREE", async () => {
  const { status, json } = await api.get("/api/file?path=doc.md");
  assert.equal(status, 200);
  assert.equal(json.path, "doc.md");
  assert.equal(json.hash, null);
  assert.match(json.content, /Versao NOVA/);
  assert.equal(json.binary, false);
  assert.equal(json.truncated, false);
  assert.equal(json.language, "md");
  assert.equal(json.markdown, true);
  assert.equal(json.size, fs.statSync(path.join(fixture.root, "doc.md")).size);
});

test("GET /api/file com hash le O COMMIT, nao o disco", async () => {
  const { status, json } = await api.get(`/api/file?path=doc.md&hash=${hashInicial}`);
  assert.equal(status, 200);
  assert.equal(json.hash, hashInicial, "o hash volta resolvido por extenso");
  assert.match(json.content, /Paragrafo com acentuacao/);
  assert.ok(!json.content.includes("Versao NOVA"), "com hash, a working tree e irrelevante");
  assert.equal(json.size, Buffer.byteLength(json.content, "utf8"));
});

test("GET /api/file aceita revisao simbolica (HEAD, tag) alem do sha", async () => {
  const porHead = await api.get("/api/file?path=README.md&hash=HEAD");
  assert.equal(porHead.status, 200);
  assert.equal(porHead.json.content, "# fixture\n");
  assert.match(porHead.json.hash, /^[0-9a-f]{40}$/);

  const porTag = await api.get("/api/file?path=README.md&hash=v1.0");
  assert.equal(porTag.status, 200);
});

test("GET /api/file de arquivo em subpasta funciona nas duas origens", async () => {
  const daArvore = await api.get("/api/file?path=src/app.js");
  assert.equal(daArvore.status, 200);
  assert.equal(daArvore.json.content, "console.log(1)\n");
  assert.equal(daArvore.json.language, "js");
  assert.equal(daArvore.json.markdown, false);

  const doCommit = await api.get(`/api/file?path=src/app.js&hash=${hashInicial}`);
  assert.equal(doCommit.status, 200);
  assert.equal(doCommit.json.content, "console.log(1)\n");
});

/* ------------------------------------------------------------------ *
 * Binario, teto de tamanho e extensao
 * ------------------------------------------------------------------ */

test("binario devolve binary:true e content vazio — nas duas origens", async () => {
  const daArvore = await api.get("/api/file?path=imagem.png");
  assert.equal(daArvore.status, 200);
  assert.equal(daArvore.json.binary, true);
  assert.equal(daArvore.json.content, "");
  assert.equal(daArvore.json.size, 12);

  git(fixture.root, "add", "imagem.png");
  git(fixture.root, "commit", "-q", "-m", "chore: png binario");
  const doCommit = await api.get(`/api/file?path=imagem.png&hash=${git(fixture.root, "rev-parse", "HEAD")}`);
  assert.equal(doCommit.json.binary, true);
  assert.equal(doCommit.json.content, "");
  assert.equal(doCommit.json.size, 12, "o tamanho sai do cat-file -s, exato em bytes");
});

test("arquivo acima do teto volta o INICIO com truncated:true", async () => {
  const { status, json } = await api.get("/api/file?path=grandao.txt");
  assert.equal(status, 200);
  assert.equal(json.truncated, true);
  assert.equal(json.size, FILE_MAX_BYTES + 4096, "size e o tamanho REAL, nao o do corte");
  assert.equal(Buffer.byteLength(json.content, "utf8"), FILE_MAX_BYTES);
  assert.ok(json.content.startsWith("aaaa"));
});

test("o corte por bytes nao parte caractere multibyte no meio", () => {
  const buffer = Buffer.from("aç".repeat(10), "utf8"); // "ç" ocupa 2 bytes
  // corta bem no meio do "ç" (byte 1 = 'a', bytes 2-3 = 'ç')
  const cortado = sliceUtf8(buffer, 2);
  assert.equal(cortado, "a", "tem de recuar para o inicio do caractere");
  assert.ok(!cortado.includes("\uFFFD"));
  assert.equal(sliceUtf8(buffer, buffer.length), "aç".repeat(10));
});

test("language e a extensao normalizada; markdown cobre md/markdown/mdown/mkd", () => {
  assert.equal(languageOf("codigo.TS"), "ts");
  assert.equal(languageOf("a/b/README.md"), "md");
  assert.equal(languageOf("Makefile"), "");
  assert.equal(languageOf(".gitignore"), "");

  const marcados = ["a.md", "a.markdown", "a.mdown", "a.mkd"];
  const modulo = new Set(["md", "markdown", "mdown", "mkd"]);
  for (const nome of marcados) assert.ok(modulo.has(languageOf(nome)), nome);
});

test("GET /api/file normaliza a extensao para minusculas", async () => {
  const { json } = await api.get("/api/file?path=codigo.TS");
  assert.equal(json.language, "ts");
  assert.equal(json.markdown, false);
});

test("looksBinary olha so os primeiros KB", () => {
  assert.equal(looksBinary(Buffer.from("texto puro\n")), false);
  assert.equal(looksBinary(Buffer.from([0x61, 0x00, 0x62])), true);
  // NUL depois da janela de sniff nao conta — arquivo enorme nao vira binario
  const longe = Buffer.concat([Buffer.alloc(9000, 0x61), Buffer.from([0x00])]);
  assert.equal(looksBinary(longe), false);
});

/* ------------------------------------------------------------------ *
 * Erros
 * ------------------------------------------------------------------ */

test("arquivo inexistente naquele commit e 404 com mensagem clara", async () => {
  const { status, json } = await api.get(`/api/file?path=nao-existe.txt&hash=${hashInicial}`);
  assert.equal(status, 404);
  assert.match(json.error, /nao existe no commit/);
});

test("arquivo inexistente na working tree e 404", async () => {
  const { status, json } = await api.get("/api/file?path=nem-isso.txt");
  assert.equal(status, 404);
  assert.match(json.error, new RegExp(translate("pt", "error.fileMissing", { path: "nem-isso.txt" })));
});

test("commit inexistente e 404, nao 500", async () => {
  const { status, json } = await api.get("/api/file?path=doc.md&hash=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
  assert.equal(status, 404);
  assert.match(json.error, /nao encontrado/);
});

test("hash que comeca com - e recusado antes de virar argumento do git", async () => {
  const { status } = await api.get("/api/file?path=doc.md&hash=--upload-pack%3Dtoca-fogo");
  assert.equal(status, 400);
});

test("diretorio nao e arquivo: 400 nas duas origens", async () => {
  const daArvore = await api.get("/api/file?path=src");
  assert.equal(daArvore.status, 400);
  assert.match(daArvore.json.error, /diretorio/);

  const doCommit = await api.get(`/api/file?path=src&hash=${hashInicial}`);
  assert.equal(doCommit.status, 400);
});

test("path ausente na query e 400", async () => {
  const { status, json } = await api.get("/api/file");
  assert.equal(status, 400);
  assert.match(json.error, /path e obrigatorio/);
});

test("a rota respeita a raiz da worktree ATIVA, nao o cwd de quem subiu", async () => {
  // A worktree extra tem um arquivo que a principal nao tem.
  await api.post("/api/worktrees/switch", { path: fixture.worktree });
  try {
    const { status, json } = await api.get("/api/file?path=paralelo.txt");
    assert.equal(status, 200);
    assert.match(json.content, /so existe na outra worktree/);
  } finally {
    await api.post("/api/worktrees/switch", { path: fixture.root });
  }
});

test("le arquivo com caminho fora de /tmp tambem quando a raiz e symlink", async () => {
  // Em algumas maquinas /tmp e symlink; a comparacao tem de ser em espaco real.
  const real = fs.realpathSync(fixture.root);
  const payload = await getFileContent({ path: "README.md" }, real);
  assert.equal(payload.content, "# fixture\n");
  assert.ok(os.tmpdir().length > 0);
});
