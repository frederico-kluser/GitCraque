/**
 * Repositorio recem-criado, sem commit nenhum.
 *
 * O `git log` falha com "does not have any commits yet" — e isso e um estado
 * valido do produto, nao um erro. A UI tem de conseguir abrir um repo vazio e
 * mostrar a tela de "faca o primeiro commit".
 */
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import fs from "node:fs";
import path from "node:path";

import { makeEmptyRepo } from "./helpers/repo.mjs";
import { bootServer } from "./helpers/server.mjs";

let vazio;
let api;
const cwdOriginal = process.cwd();

before(async () => {
  vazio = makeEmptyRepo("gitcraque-vazio-");
  api = await bootServer(vazio.root, { port: 5393 });
});

after(async () => {
  await api?.close();
  process.chdir(cwdOriginal);
  vazio?.cleanup();
});

test("GET /api/log num repo vazio devolve empty: true, nao erro", async () => {
  const { status, json } = await api.get("/api/log");
  assert.equal(status, 200);
  assert.equal(json.empty, true);
  assert.equal(json.total, 0);
  assert.deepEqual(json.commits, []);
});

test("GET /api/repo num repo vazio", async () => {
  const { status, json } = await api.get("/api/repo");
  assert.equal(status, 200);
  assert.equal(json.isRepo, true);
  assert.equal(json.head.branch, "main", "a branch existe mesmo sem commit");
  assert.equal(json.head.hash, null, "mas ainda nao aponta para nada");
  assert.equal(json.head.detached, false);
});

test("GET /api/refs e /api/status num repo vazio", async () => {
  const refs = await api.get("/api/refs");
  assert.equal(refs.status, 200);
  assert.deepEqual(refs.json.branches, []);
  assert.deepEqual(refs.json.tags, []);

  const status = await api.get("/api/status");
  assert.equal(status.status, 200);
  assert.equal(status.json.branch, "main");
  assert.equal(status.json.clean, true);
});

test("o primeiro commit pela API tira o repo do estado vazio", async () => {
  fs.writeFileSync(path.join(vazio.root, "inicio.txt"), "comeco\n");
  await api.post("/api/stage", { paths: ["inicio.txt"] });
  const commitado = await api.post("/api/commit", { message: "chore: primeiro commit" });
  assert.equal(commitado.json.ok, true, commitado.json.stderr);

  const log = await api.get("/api/log");
  assert.equal(log.json.empty, false);
  assert.equal(log.json.total, 1);
  assert.equal(log.json.commits[0].subject, "chore: primeiro commit");
  assert.deepEqual(log.json.commits[0].parents, [], "commit raiz nao tem pai");
});
