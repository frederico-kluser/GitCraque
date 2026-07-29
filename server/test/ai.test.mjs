/**
 * As partes puras do agente: prompt, traducao de evento do pi, argv, ambiente,
 * portao de sessao, cliente da OpenRouter e o cofre da chave.
 *
 * Nada aqui sobe servidor nem toca rede. O `fetch` e injetado, o `spawn` e
 * injetado, e o `XDG_CONFIG_HOME` aponta para um temporario — a suite do
 * backend nao pode depender de credencial nem de conexao para passar.
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import * as key from "../src/ai/key.mjs";
import * as pi from "../src/ai/pi.mjs";
import * as session from "../src/ai/session.mjs";
import {
  AUDIO_FORMATS,
  MODEL_AUDIO_FORMATS,
  RECORDER_FORMATS,
  TRANSCRIBE_MODEL,
  checkReachable,
  transcribe,
} from "../src/ai/openrouter.mjs";
import {
  MAX_BRANCHES,
  buildRepoSnapshot,
  buildSystemPrompt,
  buildUserMessage,
} from "../src/ai/prompt.mjs";

/* ------------------------------------------------------------------ *
 * prompt.mjs
 * ------------------------------------------------------------------ */

test("o retrato leva o caminho do projeto e a branch corrente", () => {
  const snapshot = buildRepoSnapshot({
    cwd: "/home/alguem/projeto",
    head: { branch: "main", detached: false },
    branches: [{ name: "main" }, { name: "feature/pagamento-pix" }],
    status: { clean: true, entries: [] },
  });
  assert.match(snapshot, /\/home\/alguem\/projeto/);
  assert.match(snapshot, /HEAD: main/);
  assert.match(snapshot, /feature\/pagamento-pix/);
  assert.match(snapshot, /limpa/);
});

test("HEAD destacado aparece como destacado, nao como branch vazia", () => {
  const snapshot = buildRepoSnapshot({
    cwd: "/tmp/x",
    head: { detached: true, hash: "abc1234" },
  });
  assert.match(snapshot, /destacado em abc1234/);
});

test("working tree suja conta os arquivos", () => {
  const snapshot = buildRepoSnapshot({
    cwd: "/tmp/x",
    status: { clean: false, entries: [{}, {}, {}] },
  });
  assert.match(snapshot, /suja \(3 arquivo/);
});

test("lista longa de branches e cortada MAS avisa quantas ficaram de fora", () => {
  // O aviso e o ponto do teste: truncar em silencio faria o agente concluir
  // que a branch nao existe quando ela so nao coube no retrato.
  const branches = Array.from({ length: MAX_BRANCHES + 25 }, (_, i) => ({ name: `b${i}` }));
  const snapshot = buildRepoSnapshot({ cwd: "/tmp/x", branches });
  assert.match(snapshot, /e mais 25/);
  assert.ok(!snapshot.includes("b249,"), "nao deve listar alem do teto");
});

test("sem refs, o retrato diz (nenhuma) em vez de deixar vazio", () => {
  const snapshot = buildRepoSnapshot({ cwd: "/tmp/x" });
  assert.match(snapshot, /Branches locais: \(nenhuma\)/);
});

test("o system prompt carrega a doutrina junto do retrato", () => {
  const prompt = buildSystemPrompt({ cwd: "/tmp/x", branches: [{ name: "main" }] });
  assert.match(prompt, /LEVE A INTENCAO ATE O FIM/);
  assert.match(prompt, /CONFLITO SE RESOLVE/);
  assert.match(prompt, /NADA INTERATIVO/);
  assert.match(prompt, /Retrato do repositorio/);
});

test("a mensagem distingue ditado de digitado", () => {
  assert.match(buildUserMessage("faz o rebase", "voice"), /DITOU/);
  assert.match(buildUserMessage("faz o rebase", "voice"), /transcricao automatica/);
  assert.match(buildUserMessage("faz o rebase", "text"), /DIGITOU/);
  assert.match(buildUserMessage("  faz o rebase  ", "text"), /faz o rebase/);
});

/* ------------------------------------------------------------------ *
 * pi.mjs — traducao de evento
 * ------------------------------------------------------------------ */

test("tool_execution_start do bash expoe o comando literal", () => {
  const out = pi.translateEvent({
    type: "tool_execution_start",
    toolName: "bash",
    args: { command: "git rebase main" },
  });
  assert.equal(out.kind, "tool");
  assert.equal(out.tool, "bash");
  assert.equal(out.command, "git rebase main");
});

test("tool que nao e bash nao inventa comando", () => {
  const out = pi.translateEvent({
    type: "tool_execution_start",
    toolName: "read",
    args: { path: "/tmp/a.txt" },
  });
  assert.equal(out.command, "");
  assert.equal(out.file, "/tmp/a.txt");
});

test("so o text_delta vira texto; thinking_delta e descartado", () => {
  const texto = pi.translateEvent({
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", delta: "oi" },
  });
  assert.deepEqual(texto, { kind: "text", delta: "oi" });
  const pensando = pi.translateEvent({
    type: "message_update",
    assistantMessageEvent: { type: "thinking_delta", delta: "hmm" },
  });
  assert.equal(pensando, null);
});

test("message_end sem custo nao vira evento", () => {
  assert.equal(pi.translateEvent({ type: "message_end", message: { usage: {} } }), null);
  const comCusto = pi.translateEvent({
    type: "message_end",
    message: { usage: { cost: { total: 0.0123 } } },
  });
  assert.deepEqual(comCusto, { kind: "usage", cost: 0.0123 });
});

test("falha do provider chega por stopReason, NAO por type:'error'", () => {
  // Carga real capturada rodando o pi com uma chave invalida. O pi nao emite
  // {type:"error"} nesse caso; sem este ramo o motivo se perderia e a bolha
  // mostraria so "exit 1" no erro mais comum de todos.
  const out = pi.translateEvent({
    type: "message_end",
    message: {
      role: "assistant",
      content: [],
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
      usage: { cost: { total: 0 } },
      stopReason: "error",
      errorMessage: "401 User not found.",
    },
  });
  assert.deepEqual(out, { kind: "error", message: "401 User not found." });
});

test("turno abortado tambem vira erro, mesmo sem errorMessage", () => {
  const out = pi.translateEvent({
    type: "message_end",
    message: { stopReason: "aborted" },
  });
  assert.equal(out.kind, "error");
  assert.match(out.message, /aborted/);
});

test("runAgent devolve o motivo do provider em vez do codigo de saida", async () => {
  const result = await pi.runAgent({
    apiKey: "k",
    systemPrompt: "S",
    message: "M",
    cwd: os.tmpdir(),
    onEvent: () => {},
    spawnImpl: fakeSpawn(
      [
        JSON.stringify({ type: "agent_start" }),
        JSON.stringify({
          type: "message_end",
          message: { stopReason: "error", errorMessage: "401 User not found." },
        }),
      ],
      { code: 1 },
    ),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "401 User not found.");
});

test("evento desconhecido e lixo nao derrubam o parser", () => {
  assert.equal(pi.translateEvent({ type: "coisa_nova" }), null);
  assert.equal(pi.translateEvent(null), null);
  assert.equal(pi.translateEvent("texto"), null);
  assert.equal(pi.translateEvent(42), null);
});

test("tool_execution_end carrega o fracasso", () => {
  const out = pi.translateEvent({ type: "tool_execution_end", toolName: "bash", isError: true });
  assert.equal(out.kind, "tool-end");
  assert.equal(out.failed, true);
});

/* ------------------------------------------------------------------ *
 * pi.mjs — argv e ambiente
 * ------------------------------------------------------------------ */

test("a argv pede modo nao interativo, json e sem sessao em disco", () => {
  const args = pi.buildPiArgs({ systemPrompt: "SYS", message: "MSG" });
  assert.ok(args.includes("--print"));
  assert.deepEqual(args.slice(args.indexOf("--mode"), args.indexOf("--mode") + 2), [
    "--mode",
    "json",
  ]);
  assert.ok(args.includes("--no-session"), "sessao em disco poderia acabar num commit");
  assert.equal(args[args.length - 1], "MSG", "a mensagem e o ultimo argumento posicional");
});

test("sem `thinking` a argv sai identica a de sempre", () => {
  // A chamada de voz nao pode mudar de comportamento por causa da de conflito.
  const sem = pi.buildPiArgs({ systemPrompt: "SYS", message: "MSG" });
  assert.ok(!sem.includes("--thinking"));
});

test("`thinking` vira --thinking, e nivel invalido nao entra na argv", () => {
  const args = pi.buildPiArgs({ systemPrompt: "SYS", message: "MSG", thinking: pi.MAX_THINKING });
  assert.deepEqual(args.slice(args.indexOf("--thinking"), args.indexOf("--thinking") + 2), [
    "--thinking",
    "xhigh",
  ]);
  assert.equal(pi.MAX_THINKING, "xhigh", "xhigh e o teto que o pi 0.73.x aceita");

  // Nivel inventado faria o pi sair com erro de uso DEPOIS de a sessao abrir.
  const invalido = pi.buildPiArgs({ systemPrompt: "SYS", message: "MSG", thinking: "maximo" });
  assert.ok(!invalido.includes("--thinking"));
  assert.ok(!invalido.includes("maximo"));
});

test("A CHAVE NUNCA ENTRA NA ARGV", () => {
  // Argumento de processo e legivel por qualquer usuario da maquina. Este teste
  // existe para que ninguem "simplifique" trocando o env por --api-key.
  const args = pi.buildPiArgs({ systemPrompt: "SYS", message: "MSG" });
  assert.ok(!args.includes("--api-key"));
  assert.ok(!args.some((a) => a.includes("sk-or-")));
});

test("o ambiente leva a chave, o hermetismo e o trampolim do askpass", () => {
  const env = pi.buildPiEnv("sk-or-teste");
  assert.equal(env.OPENROUTER_API_KEY, "sk-or-teste");
  assert.equal(env.PI_OFFLINE, "1");
  assert.equal(env.PI_TELEMETRY, "0");
  assert.match(env.PI_CODING_AGENT_DIR, /gitcraque/);
  assert.equal(env.GIT_EDITOR, "true", "editor aberto travaria a sessao inteira");
  assert.equal(env.GIT_PAGER, "cat");
});

test("discoverPi cai para npx quando o pi nao esta no PATH", async () => {
  const original = process.env.PATH;
  process.env.PATH = path.join(os.tmpdir(), "gitcraque-path-vazio");
  try {
    const launcher = await pi.discoverPi();
    assert.equal(launcher.kind, "npx");
    assert.ok(launcher.prefixArgs.includes(pi.PI_PACKAGE));
    assert.equal(launcher.needsDownload, true);
  } finally {
    process.env.PATH = original;
  }
});

test("discoverPi acha o binario quando ele esta no PATH", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "gitcraque-pi-"));
  const fake = path.join(dir, "pi");
  await fsp.writeFile(fake, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const original = process.env.PATH;
  process.env.PATH = dir;
  try {
    const launcher = await pi.discoverPi();
    assert.equal(launcher.kind, "path");
    assert.equal(launcher.command, fake);
    assert.equal(launcher.needsDownload, false);
  } finally {
    process.env.PATH = original;
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * pi.mjs — runAgent com spawn falso
 * ------------------------------------------------------------------ */

/** Um filho de mentira que cospe as linhas dadas e fecha. */
function fakeSpawn(lines, { code = 0, stderr = "" } = {}) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.stderr = new EventEmitter();
    child.stderr.setEncoding = () => {};
    child.kill = () => {};
    setImmediate(() => {
      for (const line of lines) child.stdout.emit("data", `${line}\n`);
      if (stderr) child.stderr.emit("data", stderr);
      child.emit("close", code);
    });
    return child;
  };
}

test("runAgent junta o texto, soma o custo e repassa os eventos", async () => {
  const events = [];
  const result = await pi.runAgent({
    apiKey: "sk-or-teste",
    systemPrompt: "SYS",
    message: "MSG",
    cwd: os.tmpdir(),
    onEvent: (e) => events.push(e),
    spawnImpl: fakeSpawn([
      JSON.stringify({ type: "agent_start" }),
      JSON.stringify({
        type: "tool_execution_start",
        toolName: "bash",
        args: { command: "git status" },
      }),
      JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "cri" } }),
      JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "ei a branch" } }),
      JSON.stringify({ type: "message_end", message: { usage: { cost: { total: 0.002 } } } }),
      JSON.stringify({ type: "agent_end" }),
    ]),
  });
  assert.equal(result.ok, true);
  assert.equal(result.text, "criei a branch");
  assert.equal(result.cost, 0.002);
  assert.deepEqual(
    events.map((e) => e.kind),
    ["start", "tool", "text", "text", "usage", "end"],
  );
});

test("linha que nao e json (banner do npx) e ignorada sem quebrar", async () => {
  const events = [];
  const result = await pi.runAgent({
    apiKey: "k",
    systemPrompt: "S",
    message: "M",
    cwd: os.tmpdir(),
    onEvent: (e) => events.push(e),
    spawnImpl: fakeSpawn([
      "npm warn deprecated glob@7",
      "added 114 packages in 1s",
      JSON.stringify({ type: "agent_start" }),
    ]),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(events.map((e) => e.kind), ["start"]);
});

test("saida diferente de zero devolve ok:false e emite o stderr", async () => {
  const events = [];
  const result = await pi.runAgent({
    apiKey: "k",
    systemPrompt: "S",
    message: "M",
    cwd: os.tmpdir(),
    onEvent: (e) => events.push(e),
    spawnImpl: fakeSpawn([], { code: 1, stderr: "provider recusou" }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 1);
  assert.ok(events.some((e) => e.kind === "error" && /provider recusou/.test(e.message)));
});

/* ------------------------------------------------------------------ *
 * session.mjs — o portao
 * ------------------------------------------------------------------ */

test("o portao recusa a segunda sessao em vez de enfileirar", () => {
  session.resetForTest();
  session.begin({ utterance: "primeira", source: "text" });
  assert.throws(() => session.begin({ utterance: "segunda", source: "text" }), /error.aiBusy/);
  session.resetForTest();
});

test("assertNotBusy so barra enquanto a sessao esta aberta", () => {
  session.resetForTest();
  assert.doesNotThrow(() => session.assertNotBusy());
  session.begin({ utterance: "x", source: "text" });
  assert.throws(
    () => session.assertNotBusy(),
    (err) => {
      assert.equal(err.message, "error.aiBusy");
      assert.equal(err.status, 409, "a interface precisa de 409 para mostrar o toast certo");
      return true;
    },
  );
  session.finish({ ok: true });
  assert.doesNotThrow(() => session.assertNotBusy(), "finish precisa liberar o portao");
  session.resetForTest();
});

test("abort sem sessao devolve false em vez de explodir", () => {
  session.resetForTest();
  assert.equal(session.abort(), false);
});

test("sessionInfo nao vaza o handle do processo filho", () => {
  session.resetForTest();
  session.begin({ utterance: "cria a branch", source: "voice" });
  session.attachChild({ kill: () => {} });
  const info = session.sessionInfo();
  assert.equal(info.utterance, "cria a branch");
  assert.equal(info.source, "voice");
  assert.equal(info.child, undefined);
  session.resetForTest();
});

/* ------------------------------------------------------------------ *
 * openrouter.mjs — com fetch injetado
 * ------------------------------------------------------------------ */

const okResponse = (payload) => ({
  ok: true,
  status: 200,
  json: async () => payload,
});

test("transcribe manda o audio em base64 e devolve texto, custo e duracao", async () => {
  let capturado = null;
  const out = await transcribe({
    apiKey: "sk-or-x",
    audio: "UklGRiQA",
    format: "webm",
    language: "pt",
    fetchImpl: async (url, init) => {
      capturado = { url, init };
      return okResponse({ text: "  cria a branch  ", usage: { cost: 0.004, seconds: 3.2 } });
    },
  });
  assert.equal(out.text, "cria a branch");
  assert.equal(out.cost, 0.004);
  assert.equal(out.seconds, 3.2);
  assert.match(capturado.url, /\/audio\/transcriptions$/);
  const body = JSON.parse(capturado.init.body);
  assert.equal(body.input_audio.data, "UklGRiQA");
  assert.equal(body.input_audio.format, "webm");
  assert.equal(body.language, "pt");
  assert.equal(capturado.init.headers.Authorization, "Bearer sk-or-x");
});

test("transcribe recusa formato que a OpenRouter nao aceita", async () => {
  await assert.rejects(
    () => transcribe({ apiKey: "k", audio: "AAA", format: "aiff" }),
    /error.aiAudioFormat/,
  );
});

/**
 * A regressao que deixou a transcricao morta: o modelo configurado tem de
 * aceitar TUDO que o gravador do navegador consegue produzir.
 *
 * `microsoft/mai-transcribe-1.5` so roda na Azure, que recusa webm com 400 —
 * e webm e o unico container que o Chrome grava. O par estava quebrado e nada
 * apontava para isso, porque o teste de cima mocka o `fetch` e so verifica que
 * o corpo enviado e o corpo que o codigo monta.
 *
 * Sem rede de proposito: a suite do backend nao pode depender de conexao.
 */
test("o modelo de transcricao aceita todo container que o gravador produz", () => {
  const accepted = MODEL_AUDIO_FORMATS[TRANSCRIBE_MODEL];
  assert.ok(accepted, `${TRANSCRIBE_MODEL} nao tem entrada em MODEL_AUDIO_FORMATS`);
  assert.deepEqual(accepted, AUDIO_FORMATS);
  for (const format of RECORDER_FORMATS) {
    assert.ok(
      accepted.includes(format),
      `${TRANSCRIBE_MODEL} nao aceita "${format}", que o navegador pode gravar`,
    );
  }
});

test("o contra-exemplo continua registrado: a mai-transcribe nao serve para webm", async () => {
  const mai = MODEL_AUDIO_FORMATS["microsoft/mai-transcribe-1.5"];
  assert.ok(mai, "o contra-exemplo sumiu do mapa e com ele a razao do bug");
  assert.equal(mai.includes("webm"), false);
  // E a validacao local tem de barrar antes de gastar a chamada.
  await assert.rejects(
    () =>
      transcribe({
        apiKey: "k",
        audio: "AAA",
        format: "webm",
        model: "microsoft/mai-transcribe-1.5",
      }),
    /error.aiAudioFormat/,
  );
});

test("transcribe sem chave e sem audio falha com a chave certa de i18n", async () => {
  await assert.rejects(() => transcribe({ apiKey: "", audio: "AAA" }), /error.aiKeyMissing/);
  await assert.rejects(() => transcribe({ apiKey: "k", audio: "" }), /error.aiAudioRequired/);
});

test("401 da OpenRouter vira error.aiKeyRejected, nao um 502 generico", async () => {
  await assert.rejects(
    () =>
      transcribe({
        apiKey: "k",
        audio: "AAA",
        fetchImpl: async () => ({ ok: false, status: 401 }),
      }),
    (err) => {
      assert.equal(err.message, "error.aiKeyRejected");
      assert.equal(err.status, 401);
      return true;
    },
  );
});

test("rede caida vira error.aiUnreachable com o motivo no detalhe", async () => {
  await assert.rejects(
    () =>
      transcribe({
        apiKey: "k",
        audio: "AAA",
        fetchImpl: async () => {
          throw new Error("ECONNREFUSED");
        },
      }),
    (err) => {
      assert.equal(err.message, "error.aiUnreachable");
      assert.match(err.detail, /ECONNREFUSED/);
      return true;
    },
  );
});

test("checkReachable classifica ok, nao autorizado e inalcancavel", async () => {
  assert.deepEqual(await checkReachable("", async () => okResponse({})), { kind: "unauthorized" });
  assert.deepEqual(await checkReachable("k", async () => okResponse({})), { kind: "ok" });
  assert.deepEqual(await checkReachable("k", async () => ({ ok: false, status: 403 })), {
    kind: "unauthorized",
  });
  const caiu = await checkReachable("k", async () => ({ ok: false, status: 500 }));
  assert.equal(caiu.kind, "unreachable");
});

/* ------------------------------------------------------------------ *
 * key.mjs — o cofre da chave
 * ------------------------------------------------------------------ */

test("a chave gravada ganha da variavel de ambiente", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "gitcraque-key-"));
  const xdg = process.env.XDG_CONFIG_HOME;
  const env = process.env.OPENROUTER_API_KEY;
  process.env.XDG_CONFIG_HOME = dir;
  process.env.OPENROUTER_API_KEY = "sk-or-do-ambiente";
  try {
    // Sem nada gravado, a variavel de ambiente responde.
    assert.deepEqual(await key.resolveKey(), {
      value: "sk-or-do-ambiente",
      source: "env",
    });

    // Gravada, ela passa a ganhar — a escolha explicita vence a ambiente, que
    // costuma estar velha num .zshrc esquecido.
    await key.saveStoredKey("sk-or-gravada");
    assert.deepEqual(await key.resolveKey(), { value: "sk-or-gravada", source: "stored" });

    // Apagada, a resolucao volta para o ambiente.
    assert.equal(await key.clearStoredKey(), true);
    assert.equal((await key.resolveKey()).source, "env");
  } finally {
    process.env.XDG_CONFIG_HOME = xdg;
    if (env === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = env;
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test("o arquivo da chave e gravado em 0600", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "gitcraque-key-"));
  const xdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = dir;
  try {
    await key.saveStoredKey("sk-or-segredo");
    const stat = await fsp.stat(path.join(dir, "gitcraque", key.KEY_FILE));
    assert.equal(stat.mode & 0o777, 0o600, "segredo em disco nao pode ser legivel por outros");
  } finally {
    process.env.XDG_CONFIG_HOME = xdg;
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test("gravar chave vazia e recusado, nao vira apagamento silencioso", async () => {
  await assert.rejects(() => key.saveStoredKey("   "), /error.aiKeyEmpty/);
});

test("maskKey distingue duas chaves sem permitir usar nenhuma", () => {
  const mascara = key.maskKey("sk-or-v1-abcdefghijklmnop");
  assert.match(mascara, /^sk-or-/);
  assert.match(mascara, /mnop$/);
  assert.ok(!mascara.includes("abcdefghij"), "o miolo tem de sumir");
  assert.equal(key.maskKey(""), "");
  assert.equal(key.maskKey("curta"), "••••");
});
