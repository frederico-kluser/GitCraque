/**
 * Trampolim de askpass.
 *
 * O `askpass.mjs` roda como filho do GIT, sem acesso nenhum ao estado do
 * servidor: a unica ponte e o socket unix mais o nonce. O que se prova aqui:
 *  - com credencial no cofre, ele imprime o segredo no STDOUT e sai 0;
 *  - sem credencial e sem UI conectada, ele sai 1 (o git falha limpo em vez de
 *    travar num prompt que ninguem le);
 *  - com nonce errado, nao sai nada;
 *  - o token nunca vai para o `env` do processo do git nem para argv;
 *  - o pedido sobe na UI por `credentials:needed` e volta por
 *    `credentials:provide`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { ENV_ASKPASS_NONCE, ENV_ASKPASS_SOCK } from "../src/contract.mjs";
import { runtime } from "../src/runtime.mjs";
import { ASKPASS_SCRIPT, Vault, parsePrompt } from "../src/trampoline/vault.mjs";
import { gitEnv } from "../src/git/exec.mjs";

const execFileAsync = promisify(execFile);

/** Chama o askpass.mjs exatamente como o git chamaria: prompt em argv[2]. */
async function callAskpass(env, prompt) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [ASKPASS_SCRIPT, prompt], {
      env: { ...process.env, ...env },
      encoding: "utf8",
    });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.code ?? 1, stdout: String(err.stdout ?? ""), stderr: String(err.stderr ?? "") };
  }
}

test("parsePrompt deduz host e tipo do prompt cru do git", () => {
  assert.deepEqual(parsePrompt("Username for 'https://github.com': "), {
    host: "github.com",
    kind: "username",
  });
  assert.deepEqual(parsePrompt("Password for 'https://fulano@github.com': "), {
    host: "github.com",
    kind: "password",
    username: "fulano",
  });
  assert.equal(parsePrompt("Password for 'https://gitlab.example.org': ").host, "gitlab.example.org");

  const ssh = parsePrompt("Enter passphrase for key '/home/u/.ssh/id_ed25519': ");
  assert.equal(ssh.kind, "password");
  assert.equal(ssh.host, "ssh:/home/u/.ssh/id_ed25519");

  assert.equal(parsePrompt("").host, "");
});

test("com credencial no cofre, o askpass imprime o token no stdout e sai 0", async () => {
  const vault = new Vault();
  const env = await vault.start();
  try {
    vault.save({ host: "github.com", username: "fulano", token: "ghp_token_de_teste_123" });

    const senha = await callAskpass(env, "Password for 'https://fulano@github.com': ");
    assert.equal(senha.code, 0);
    assert.equal(senha.stdout.trim(), "ghp_token_de_teste_123");

    const usuario = await callAskpass(env, "Username for 'https://github.com': ");
    assert.equal(usuario.code, 0);
    assert.equal(usuario.stdout.trim(), "fulano");
  } finally {
    await vault.close();
  }
});

test("sem credencial e sem UI, o askpass sai 1 (o git falha limpo)", async () => {
  const vault = new Vault();
  const env = await vault.start();
  const hubAntes = runtime.hub;
  runtime.hub = null; // nenhuma UI conectada
  try {
    const resultado = await callAskpass(env, "Password for 'https://nao-tenho.com': ");
    assert.equal(resultado.code, 1, "sair 1 faz o git desistir em vez de travar");
    assert.equal(resultado.stdout.trim(), "");
  } finally {
    runtime.hub = hubAntes;
    await vault.close();
  }
});

test("nonce errado nao devolve segredo nenhum", async () => {
  const vault = new Vault();
  const env = await vault.start();
  try {
    vault.save({ host: "github.com", username: "fulano", token: "segredo" });
    const resultado = await callAskpass(
      { ...env, [ENV_ASKPASS_NONCE]: "nonce-forjado" },
      "Password for 'https://fulano@github.com': ",
    );
    assert.equal(resultado.code, 1);
    assert.equal(resultado.stdout.trim(), "");
  } finally {
    await vault.close();
  }
});

test("sem socket no ambiente, o askpass sai 1 na hora", async () => {
  const resultado = await callAskpass(
    { [ENV_ASKPASS_SOCK]: "", [ENV_ASKPASS_NONCE]: "" },
    "Password for 'https://x.com': ",
  );
  assert.equal(resultado.code, 1);
});

test("o socket do cofre e 0600 e o shim e executavel", async () => {
  const vault = new Vault();
  const env = await vault.start();
  try {
    if (process.platform !== "win32") {
      const modoSocket = fs.statSync(vault.socketPath).mode & 0o777;
      assert.equal(modoSocket, 0o600, "so o dono fala com o cofre");
      const modoDir = fs.statSync(vault.dir).mode & 0o777;
      assert.equal(modoDir, 0o700);
      // O ssh executa o SSH_ASKPASS direto, sem shell: tem de ser executavel.
      assert.equal(fs.statSync(env.GIT_ASKPASS).mode & 0o100, 0o100);
    }
    assert.equal(env.SSH_ASKPASS, env.GIT_ASKPASS);
    assert.equal(env.SSH_ASKPASS_REQUIRE, "force");
    assert.equal(env[ENV_ASKPASS_SOCK], vault.socketPath);
    assert.equal(env[ENV_ASKPASS_NONCE].length, 48, "nonce de 24 bytes em hex");
  } finally {
    await vault.close();
  }
});

test("o token NUNCA entra no env do processo do git", async () => {
  const vault = new Vault();
  const trampolim = await vault.start();
  const antes = runtime.trampolineEnv;
  runtime.trampolineEnv = trampolim;
  try {
    vault.save({ host: "github.com", username: "fulano", token: "ghp_nao_pode_vazar" });

    const env = gitEnv();
    const serializado = JSON.stringify(env);
    assert.ok(
      !serializado.includes("ghp_nao_pode_vazar"),
      "qualquer processo do usuario le /proc/<pid>/environ",
    );
    assert.equal(env.GIT_TERMINAL_PROMPT, "0", "o git nao pode abrir prompt no tty herdado");
    assert.equal(env.GIT_EDITOR, "true");
    assert.equal(env.GIT_PAGER, "cat");
    assert.equal(env.PAGER, "cat");
    assert.equal(env.LC_ALL, "C");
    assert.equal(env.LANG, "C");
    assert.equal(env.GIT_OPTIONAL_LOCKS, "0");
    assert.equal(env.SSH_ASKPASS_REQUIRE, "force");
    assert.ok(env.GIT_ASKPASS, "o trampolim tem de estar ligado");
  } finally {
    runtime.trampolineEnv = antes;
    await vault.close();
  }
});

test("sem credencial, o cofre pergunta na UI e responde o que ela mandar", async () => {
  const vault = new Vault();
  const env = await vault.start();
  const hubAntes = runtime.hub;

  /** Hub falso: registra o `credentials:needed` e responde na hora. */
  const emitidos = [];
  runtime.hub = {
    clientCount: 1,
    broadcast: (evento) => {
      emitidos.push(evento);
      if (evento.type === "credentials:needed") {
        setImmediate(() =>
          vault.provide({
            requestId: evento.prompt.requestId,
            value: "token_vindo_da_ui",
            remember: true,
          }),
        );
      }
    },
  };

  try {
    const resultado = await callAskpass(env, "Password for 'https://github.com': ");
    assert.equal(resultado.code, 0);
    assert.equal(resultado.stdout.trim(), "token_vindo_da_ui");

    const pedido = emitidos.find((e) => e.type === "credentials:needed");
    assert.ok(pedido, "a UI tem de receber credentials:needed");
    assert.equal(pedido.prompt.host, "github.com");
    assert.equal(pedido.prompt.kind, "password");
    assert.ok(pedido.prompt.expiresAt > Date.now());
    assert.ok(emitidos.some((e) => e.type === "credentials:resolved" && e.ok === true));

    // Com `remember`, a segunda chamada ja sai do cofre, sem perguntar de novo.
    emitidos.length = 0;
    const segunda = await callAskpass(env, "Password for 'https://github.com': ");
    assert.equal(segunda.stdout.trim(), "token_vindo_da_ui");
    assert.equal(emitidos.length, 0, "nao pergunta duas vezes o que ja foi lembrado");
  } finally {
    runtime.hub = hubAntes;
    await vault.close();
  }
});

test("cancelar na UI faz o askpass sair 1", async () => {
  const vault = new Vault();
  const env = await vault.start();
  const hubAntes = runtime.hub;
  runtime.hub = {
    clientCount: 1,
    broadcast: (evento) => {
      if (evento.type === "credentials:needed") {
        setImmediate(() => vault.cancel({ requestId: evento.prompt.requestId }));
      }
    },
  };
  try {
    const resultado = await callAskpass(env, "Password for 'https://github.com': ");
    assert.equal(resultado.code, 1);
    assert.equal(resultado.stdout.trim(), "");
  } finally {
    runtime.hub = hubAntes;
    await vault.close();
  }
});

test("o pedido expira e o askpass desiste", async () => {
  const vault = new Vault();
  const env = await vault.start();
  vault.timeoutMs = 200; // em producao sao 120 s
  const hubAntes = runtime.hub;
  runtime.hub = { clientCount: 1, broadcast: () => {} };
  try {
    const resultado = await callAskpass(env, "Password for 'https://github.com': ");
    assert.equal(resultado.code, 1);
  } finally {
    runtime.hub = hubAntes;
    await vault.close();
  }
});

test("a listagem do cofre nunca inclui o token", async () => {
  const vault = new Vault();
  try {
    vault.save({ host: "github.com", username: "fulano", token: "ghp_segredo_absoluto" });
    const listagem = JSON.stringify(vault.list());
    assert.ok(!listagem.includes("ghp_segredo_absoluto"));
    assert.match(listagem, /github\.com/);
    assert.match(listagem, /fulano/);
  } finally {
    await vault.close();
  }
});

test("um push de verdade contra host inexistente falha SEM travar", async (t) => {
  const { execFile: raw } = await import("node:child_process");
  const vault = new Vault();
  const trampolim = await vault.start();
  const antes = runtime.trampolineEnv;
  const hubAntes = runtime.hub;
  runtime.trampolineEnv = trampolim;
  runtime.hub = null; // sem UI: o askpass sai 1 e o git desiste

  const { makeFixtureRepo } = await import("./helpers/repo.mjs");
  const fixture = makeFixtureRepo("gitcraque-push-");
  const cwdAntes = process.cwd();
  try {
    process.chdir(fixture.root);
    const { execGit } = await import("../src/git/exec.mjs");
    await execGit(["remote", "add", "origin", "https://127.0.0.1:1/nao/existe.git"]);

    const inicio = Date.now();
    const resultado = await execGit(["push", "origin", "main"], { timeout: 20_000 });
    const duracao = Date.now() - inicio;

    assert.equal(resultado.ok, false, "o push tem de falhar");
    assert.ok(duracao < 20_000, `travou por ${duracao} ms — o trampolim nao funcionou`);
    assert.ok(resultado.exitCode !== null, "terminou por exit code, nao por SIGKILL de timeout");
    t.diagnostic(`push falhou em ${duracao} ms: ${resultado.error}`);
  } finally {
    process.chdir(cwdAntes);
    fixture.cleanup();
    runtime.trampolineEnv = antes;
    runtime.hub = hubAntes;
    await vault.close();
    void raw;
  }
});
