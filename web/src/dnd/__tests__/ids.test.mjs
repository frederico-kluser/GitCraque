/**
 * A invariante dos ids do @dnd-kit.
 *
 *   node --test web/src/dnd/__tests__/ids.test.mjs
 *
 * Este teste existe por causa de um defeito real, e o descreve para que ele nao
 * volte: o chip de uma branch na View Tree e a linha da MESMA branch no rail
 * registravam o mesmo id. O @dnd-kit guarda alvos num mapa por id, entao o
 * segundo sobrescrevia o primeiro — e soltar sobre o chip do grafo nunca
 * colidia, porque o retangulo registrado era o da linha do rail, do outro lado
 * da tela. Nenhum erro no console; o motor semantico simplesmente nao
 * respondia.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { decodeId, encodeId, SCOPE_SEP } from "../ids.ts";

test("a MESMA entidade em telas diferentes gera ids diferentes", () => {
  const noGrafo = encodeId("branch", "main", "graph");
  const noRail = encodeId("branch", "main", "rail");
  assert.notEqual(
    noGrafo,
    noRail,
    "sem escopo, o registro do @dnd-kit sobrescreve um alvo pelo outro",
  );
});

test("a mesma entidade no mesmo escopo gera o mesmo id (estavel entre renders)", () => {
  assert.equal(encodeId("branch", "main", "graph"), encodeId("branch", "main", "graph"));
});

test("entidades diferentes no mesmo escopo nao colidem", () => {
  const ids = new Set([
    encodeId("branch", "main", "graph"),
    encodeId("branch", "develop", "graph"),
    encodeId("remoteBranch", "origin/main", "graph"),
    encodeId("tag", "v1.0.0", "graph"),
    encodeId("commit", "a".repeat(40), "graph"),
  ]);
  assert.equal(ids.size, 5);
});

test("decodeId devolve exatamente o que encodeId recebeu", () => {
  const casos = [
    ["branch", "main", "graph"],
    ["branch", "feature/com/barras", "rail"],
    ["remoteBranch", "origin/feature/x", "graph"],
    ["tag", "v1.0.0-rc.1", "rail"],
    ["commit", "0123456789abcdef0123456789abcdef01234567", "graph"],
  ];
  for (const [type, key, scope] of casos) {
    const volta = decodeId(encodeId(type, key, scope));
    assert.deepEqual(volta, { scope, type, key }, `nao voltou inteiro: ${type}/${key}/${scope}`);
  }
});

test("chave com o separador de escopo dentro nao confunde o decode", () => {
  // Nome de ref nao pode conter `::` pelas regras do git, mas o parser nao pode
  // depender disso para nao quebrar de forma estranha se acontecer.
  const id = encodeId("branch", `estranho${SCOPE_SEP}mesmo`, "rail");
  const volta = decodeId(id);
  assert.equal(volta.scope, "rail");
  assert.equal(volta.type, "branch");
  assert.equal(volta.key, `estranho${SCOPE_SEP}mesmo`);
});

test("id sem escopo (formato antigo) ainda decodifica, com escopo `app`", () => {
  assert.deepEqual(decodeId("branch:main"), { scope: "app", type: "branch", key: "main" });
});

test("o default de escopo e `app`, e difere de graph e rail", () => {
  const semEscopo = encodeId("branch", "main");
  assert.notEqual(semEscopo, encodeId("branch", "main", "graph"));
  assert.notEqual(semEscopo, encodeId("branch", "main", "rail"));
  assert.equal(decodeId(semEscopo).scope, "app");
});
