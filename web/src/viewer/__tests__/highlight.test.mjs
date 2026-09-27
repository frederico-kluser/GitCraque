/**
 * Realce de sintaxe leve — contrato do `highlight.ts`:
 *   - cinco tipos coloridos (comment, string, number, keyword, function) e o
 *     resto "plain";
 *   - runs plain NUNCA viram token colorido — e a regra que mantem o DOM dos
 *     testes de render do diff estavel;
 *   - comentarios de bloco e template strings atravessam linhas (estado
 *     carregado), e o estado nao vaza entre pedidos;
 *   - `detectLang` e pela extensao; desconhecida cai em "plain".
 */
import assert from "node:assert/strict";
import test from "node:test";

import { detectLang, highlightLines, tokenizeLine } from "../highlight.ts";

const kinds = (line, lang = "c") => tokenizeLine(line, lang).map((t) => `${t.kind}:${t.text}`);

test("c: comentario, string, numero, keyword e funcao cada um na sua cor", () => {
  const got = kinds('const total = calc(42); // soma');
  assert.deepEqual(got, [
    "keyword:const",
    "plain: total = ",
    "function:calc",
    "plain:(",
    "number:42",
    "plain:); ",
    "comment:// soma",
  ]);
});

test("plain puro e um unico run — nada de spans para texto comum", () => {
  assert.deepEqual(kinds("added "), ["plain:added "]);
  assert.deepEqual(kinds("keep "), ["plain:keep "]);
  assert.deepEqual(kinds(" here"), ["plain: here"]);
});

test("string com aspas escapadas fecha no lugar certo", () => {
  const got = kinds('msg = "a \\"b\\" c"; x');
  assert.deepEqual(got, [
    "plain:msg = ",
    'string:"a \\"b\\" c"',
    "plain:; x",
  ]);
});

test("c: comentario de bloco atravessa linhas", () => {
  const [a, b, c] = highlightLines(["abre /* tudo", "ainda comentario", "fim */ code()"], "c");
  assert.equal(a.at(-1).kind, "comment");
  assert.ok(b.every((t) => t.kind === "comment"));
  assert.deepEqual(c[0], { text: "fim */", kind: "comment" });
  assert.ok(c.some((t) => t.kind === "function" && t.text === "code"));
});

test("c: template string atravessa linhas", () => {
  const [a, b] = highlightLines(["msg = `linha um", "linha dois` + x"], "c");
  assert.equal(a.at(-1).kind, "string");
  assert.equal(b[0].kind, "string");
  assert.equal(b.at(-1).kind, "plain");
});

test("python: def vira keyword, nome seguido de ( vira funcao, # e comentario", () => {
  const got = kinds("def soma(a):  # soma dois", "python");
  assert.deepEqual(got, [
    "keyword:def",
    "plain: ",
    "function:soma",
    "plain:(a):  ",
    "comment:# soma dois",
  ]);
});

test("python: aspas triplas atravessam linhas", () => {
  const [a, b] = highlightLines(['doc = """texto', 'mais texto""" + x'], "python");
  assert.equal(a.at(-1).kind, "string");
  assert.equal(b[0].kind, "string");
});

test("json: so strings, numeros e literais — sem funcoes", () => {
  const got = kinds('{"n": 12, "ok": true}', "json");
  assert.deepEqual(got, [
    "plain:{",
    'string:"n"',
    "plain:: ",
    "number:12",
    "plain:, ",
    'string:"ok"',
    "plain:: ",
    "keyword:true",
    "plain:}",
  ]);
});

test("css: @regra vira keyword e numero leva unidade", () => {
  const got = kinds("@media print { width: 100px }", "css");
  assert.ok(got.includes("keyword:@media"));
  assert.ok(got.includes("number:100px"));
});

test("html: comentario de bloco atravessa linhas e tag vira keyword", () => {
  const [a, b] = highlightLines(["<!-- oi", "fim --> <div>"], "html");
  assert.ok(a.every((t) => t.kind === "comment"));
  assert.equal(b[0].kind, "comment");
  assert.ok(b.some((t) => t.kind === "keyword" && t.text === "<div"));
});

test("detectLang: por extensao, com fallback plain", () => {
  assert.equal(detectLang("web/src/App.tsx"), "c");
  assert.equal(detectLang("server/src/index.mjs"), "c");
  assert.equal(detectLang("data.json"), "json");
  assert.equal(detectLang("styles/theme.css"), "css");
  assert.equal(detectLang("index.html"), "html");
  assert.equal(detectLang("script.py"), "python");
  assert.equal(detectLang("README.md"), "plain");
  assert.equal(detectLang("Makefile"), "plain");
});

test("o estado nao vaza entre pedidos", () => {
  const [a] = highlightLines(["/* aberto"], "c");
  assert.equal(a.at(-1).kind, "comment");
  // novo pedido comeca limpo: o comentario anterior nao contamina
  const [b] = highlightLines(["x = 1"], "c");
  assert.deepEqual(b, [
    { text: "x = ", kind: "plain" },
    { text: "1", kind: "number" },
  ]);
});
