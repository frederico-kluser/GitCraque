/**
 * Servico dos estaticos da SPA.
 *
 * Arquivo proprio de proposito, e nao mais um bloco dentro de `api.test.mjs`:
 * estes testes precisam subir MAIS DE UM servidor, e `src/runtime.mjs` e um
 * singleton de processo — o segundo `createServer` sobrescreve `runtime.hub`, e
 * o primeiro servidor para de emitir eventos de WebSocket. O `node --test` da um
 * processo por arquivo, entao aqui a invariante "um servidor por processo"
 * continua valendo entre os testes dos outros arquivos.
 *
 * O teste do 503 tambem e hermetico por construcao: `distDir` aponta para um
 * diretorio vazio em vez de depender de `web/dist` nao existir. A versao
 * anterior passava numa arvore recem-clonada e falhava assim que alguem rodava
 * `npm run build`.
 */
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { makeFixtureRepo } from "./helpers/repo.mjs";
import { bootServer } from "./helpers/server.mjs";

let fixture;
const cwdOriginal = process.cwd();
const temporarios = [];

const tempDir = (prefixo) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
  temporarios.push(dir);
  return dir;
};

before(() => {
  fixture = makeFixtureRepo("gitcraque-static-");
});

after(() => {
  process.chdir(cwdOriginal);
  fixture?.cleanup();
  for (const dir of temporarios) fs.rmSync(dir, { recursive: true, force: true });
});

test("sem web/dist, a raiz explica como buildar", async () => {
  const vazio = tempDir("gitcraque-sem-dist-");
  const api = await bootServer(fixture.root, { port: 5395, distDir: vazio });
  try {
    const res = await api.fetchRaw("/");
    assert.equal(res.status, 503);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.match(await res.text(), /npm run build/);
  } finally {
    await api.close();
  }
});

test("com web/dist, serve o index.html e faz fallback de SPA sem engolir /api", async () => {
  const dist = tempDir("gitcraque-com-dist-");
  fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>GitCraque</title>");
  fs.mkdirSync(path.join(dist, "assets"));
  fs.writeFileSync(path.join(dist, "assets", "app.js"), "export const a = 1;\n");

  const api = await bootServer(fixture.root, { port: 5396, distDir: dist });
  try {
    const raiz = await api.fetchRaw("/");
    assert.equal(raiz.status, 200);
    assert.match(raiz.headers.get("content-type"), /text\/html/);
    assert.match(await raiz.text(), /GitCraque/);

    // Um asset real e servido com o content-type certo, e nao pelo fallback.
    const asset = await api.fetchRaw("/assets/app.js");
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), /javascript/);

    // Rota desconhecida que nao comeca com /api devolve o index (fallback de SPA).
    const spa = await api.fetchRaw("/qualquer/rota/da/spa");
    assert.equal(spa.status, 200);
    assert.match(await spa.text(), /GitCraque/);

    // Mas /api desconhecida continua 404 em JSON — o fallback NAO pode engolir a API,
    // senao um erro de rota vira uma pagina HTML no lugar de um erro tratavel.
    const api404 = await api.fetchRaw("/api/nao-existe");
    assert.equal(api404.status, 404);
    assert.doesNotMatch(api404.headers.get("content-type") ?? "", /text\/html/);
  } finally {
    await api.close();
  }
});
