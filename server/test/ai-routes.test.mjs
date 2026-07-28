/**
 * A superficie REST do agente, pela porta.
 *
 * UM SERVIDOR POR ARQUIVO: `runtime` e singleton do processo e `createServer`
 * o sobrescreve (ver `src/runtime.mjs`). Por isso estas rotas moram num arquivo
 * separado de `ai.test.mjs`, que nao sobe servidor nenhum.
 *
 * Nada aqui gasta credito: sem chave configurada, as rotas que custam dinheiro
 * recusam antes de chegar na rede, e e exatamente esse contrato que se testa.
 */
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

import * as session from "../src/ai/session.mjs";
import { AGENT_MODEL } from "../src/ai/pi.mjs";
import { TRANSCRIBE_MODEL } from "../src/ai/openrouter.mjs";
import { translate } from "../src/i18n.mjs";
import { makeFixtureRepo } from "./helpers/repo.mjs";
import { bootServer } from "./helpers/server.mjs";

let fixture;
let api;
let configDir;
const cwdOriginal = process.cwd();
const xdgOriginal = process.env.XDG_CONFIG_HOME;
const envKeyOriginal = process.env.OPENROUTER_API_KEY;

before(async () => {
  // A configuracao vai para um temporario: a suite nao pode ler nem escrever a
  // chave real de quem esta rodando os testes.
  configDir = await fsp.mkdtemp(path.join(os.tmpdir(), "gitcraque-ai-cfg-"));
  process.env.XDG_CONFIG_HOME = configDir;
  delete process.env.OPENROUTER_API_KEY;

  fixture = makeFixtureRepo("gitcraque-ai-");
  api = await bootServer(fixture.root, { port: 5393 });
});

after(async () => {
  await api?.close();
  process.chdir(cwdOriginal);
  session.resetForTest();
  if (xdgOriginal === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = xdgOriginal;
  if (envKeyOriginal !== undefined) process.env.OPENROUTER_API_KEY = envKeyOriginal;
  await fsp.rm(configDir, { recursive: true, force: true });
  fixture?.cleanup?.();
});

test("GET /ai/status diz que nao ha chave e qual modelo cada perna usa", async () => {
  const res = await api.get("/api/ai/status");
  assert.equal(res.status, 200);
  assert.equal(res.json.hasKey, false);
  assert.equal(res.json.keySource, "none");
  assert.equal(res.json.masked, "");
  assert.equal(res.json.transcribeModel, TRANSCRIBE_MODEL);
  assert.equal(res.json.agentModel, AGENT_MODEL);
  assert.equal(res.json.busy, false);
  assert.equal(res.json.session, null);
  // A descoberta do pi tem de responder alguma coisa mesmo sem o binario.
  assert.ok(["path", "npx"].includes(res.json.pi.kind));
});

test("POST /ai/key grava e devolve so a mascara — nunca a chave", async () => {
  const res = await api.post("/api/ai/key", { key: "sk-or-v1-supersecreta-1234" });
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
  assert.ok(!res.text.includes("supersecreta"), "a chave nao pode voltar no corpo");
  assert.match(res.json.masked, /^sk-or-/);
  assert.match(res.json.masked, /1234$/);

  const status = await api.get("/api/ai/status");
  assert.equal(status.json.hasKey, true);
  assert.equal(status.json.keySource, "stored");
  assert.ok(!status.text.includes("supersecreta"), "o status tambem nao pode vazar");
});

test("POST /ai/key com chave vazia e recusado", async () => {
  const res = await api.post("/api/ai/key", { key: "  " });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, translate("pt", "error.aiKeyEmpty"));
});

test("DELETE /ai/key apaga e o status volta a dizer que nao ha chave", async () => {
  const res = await api.del("/api/ai/key");
  assert.equal(res.status, 200);
  assert.equal(res.json.removed, true);

  const status = await api.get("/api/ai/status");
  assert.equal(status.json.hasKey, false);
});

test("sem chave, /ai/transcribe recusa antes de tocar a rede", async () => {
  const res = await api.post("/api/ai/transcribe", { audio: "UklGRiQA", format: "webm" });
  assert.equal(res.status, 401);
  assert.equal(res.json.error, translate("pt", "error.aiKeyMissing"));
});

test("sem chave, /ai/run recusa antes de abrir sessao", async () => {
  const res = await api.post("/api/ai/run", { utterance: "cria a branch x" });
  assert.equal(res.status, 401);
  assert.equal(session.isAgentBusy(), false, "a sessao nao pode ter sido aberta");
});

test("/ai/run sem texto e 400, e a validacao vem antes da chave", async () => {
  const res = await api.post("/api/ai/run", { utterance: "   " });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, translate("pt", "error.aiUtteranceRequired"));
});

test("/ai/abort sem sessao devolve aborted:false em vez de erro", async () => {
  const res = await api.post("/api/ai/abort", {});
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { ok: true, aborted: false });
});

test("com sessao aberta, MUTACAO da interface e recusada com 409", async () => {
  // O portao existe para isto: o pi mexendo no repositorio e a pessoa
  // arrastando um commit ao mesmo tempo terminariam em index.lock.
  session.resetForTest();
  session.begin({ utterance: "faz o rebase", source: "voice" });
  try {
    const res = await api.post("/api/branch/create", { name: "durante-a-sessao" });
    assert.equal(res.status, 409);
    assert.equal(res.json.error, translate("pt", "error.aiBusy"));

    const status = await api.get("/api/ai/status");
    assert.equal(status.json.busy, true);
    assert.equal(status.json.session.utterance, "faz o rebase");
    assert.equal(status.json.session.source, "voice");
  } finally {
    session.resetForTest();
  }
});

test("com sessao aberta, LEITURA continua passando", async () => {
  // Metade do desenho: barrar escrita da interface sem cegar a interface. Se a
  // leitura tambem parasse, o grafo congelaria durante toda a sessao.
  session.resetForTest();
  session.begin({ utterance: "x", source: "text" });
  try {
    for (const rota of ["/api/refs", "/api/status", "/api/log?limit=5"]) {
      const res = await api.get(rota);
      assert.equal(res.status, 200, `${rota} deveria continuar respondendo`);
    }
  } finally {
    session.resetForTest();
  }
});

test("fechada a sessao, a mutacao volta a funcionar", async () => {
  session.resetForTest();
  const res = await api.post("/api/branch/create", { name: "depois-da-sessao" });
  assert.equal(res.status, 200);
});
