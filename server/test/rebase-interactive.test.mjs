/**
 * Rebase interativo visual — ponta a ponta, sem emulador de terminal.
 *
 * O proxy-editor e executado PELO GIT. O que se prova aqui:
 *  - 3 commits viram um com acoes diferentes (pick, squash, reword);
 *  - reword troca a mensagem do commit;
 *  - validacao: menos de dois commits recusado;
 *  - validacao: acao invalida recusada.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { PROXY_EDITOR_PATH } from "../src/git/squash.mjs";
import { rebaseInteractive } from "../src/git/rebase-interactive.mjs";
import {
  ENV_REBASE_ACTIONS,
  ENV_REBASE_AUDIT,
  ENV_REBASE_HASHES,
  ENV_REWORD_MESSAGE,
} from "../src/contract.mjs";
import { git, makeFixtureRepo } from "./helpers/repo.mjs";

/* ------------------------------------------------------------------ *
 * O proxy-editor isolado — modo rebase-interactive
 * ------------------------------------------------------------------ */

function runRebaseProxyEditor(todo, hashes, actions, rewordMessages) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitcraque-rebase-proxy-"));
  const todoPath = path.join(dir, "git-rebase-todo");
  const auditPath = path.join(dir, "audit.json");
  fs.writeFileSync(todoPath, todo);

  /** @type {Record<string, string>} */
  const env = {
    ...process.env,
    [ENV_REBASE_HASHES]: hashes.join(","),
    [ENV_REBASE_ACTIONS]: JSON.stringify(actions),
    [ENV_REBASE_AUDIT]: auditPath,
  };
  if (rewordMessages) {
    env[ENV_REWORD_MESSAGE] = JSON.stringify(rewordMessages);
  }

  let status = 0;
  let stderr = "";
  try {
    execFileSync(process.execPath, [PROXY_EDITOR_PATH, todoPath], {
      env,
      encoding: "utf8",
    });
  } catch (err) {
    status = err.status ?? 1;
    stderr = String(err.stderr ?? "");
  }

  const result = {
    status,
    stderr,
    rewritten: fs.readFileSync(todoPath, "utf8"),
  };

  // Cleanup
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  return result;
}

/* ------------------------------------------------------------------ *
 * Proxy-editor unit
 * ------------------------------------------------------------------ */

test("proxy-editor modo rebase: acoes pick+reword+squash", () => {
  const hashes = ["aaa111122223333444455556666777788889999", "bbb222233334444555566667777888899990000", "ccc333344445555666677778888999900001111"];
  const actions = [
    { hash: "aaa111122223333444455556666777788889999", action: "pick" },
    { hash: "bbb222233334444555566667777888899990000", action: "reword" },
    { hash: "ccc333344445555666677778888999900001111", action: "squash" },
  ];
  const todo = [
    "pick aaa1111 commit um",
    "pick bbb2222 commit dois",
    "pick ccc3333 commit tres",
  ].join("\n");

  const r = runRebaseProxyEditor(todo, hashes, actions, {
    bbb222233334444555566667777888899990000: "nova mensagem",
  });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.rewritten.includes("pick aaa1111"), "primeiro continua pick");
  // reword agora injeta "exec git commit --amend -m ..." em vez de trocar
  // a linha para "reword". A linha do commit continua "pick".
  assert.ok(r.rewritten.includes("pick bbb2222"), "segundo continua pick (reword gera exec)");
  assert.ok(r.rewritten.includes("exec git commit --amend"), "exec injetado para reword");
  assert.ok(r.rewritten.includes("squash ccc3333"), "terceiro vira squash");
});

test("proxy-editor modo rebase: drop remove commit do todo", () => {
  const hashes = ["aaa111122223333444455556666777788889999", "bbb222233334444555566667777888899990000"];
  const actions = [
    { hash: "aaa111122223333444455556666777788889999", action: "pick" },
    { hash: "bbb222233334444555566667777888899990000", action: "drop" },
  ];
  const todo = [
    "pick aaa1111 commit um",
    "pick bbb2222 commit dois",
  ].join("\n");

  const r = runRebaseProxyEditor(todo, hashes, actions, undefined);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.rewritten.includes("pick aaa1111"), "primeiro pick");
  assert.ok(r.rewritten.includes("drop bbb2222"), "segundo drop");
});

test("proxy-editor modo rebase: hash nao encontrado no todo aborta", () => {
  const hashes = ["aaa111122223333444455556666777788889999"];
  const actions = [{ hash: "aaa111122223333444455556666777788889999", action: "fixup" }];
  // O todo tem hash diferente — o proxy nao vai encontrar.
  const todo = "pick ddd9999 outro commit\n";

  const r = runRebaseProxyEditor(todo, hashes, actions);
  assert.notEqual(r.status, 0, "deve abortar quando nao encontra todos os hashes");
});

/* ------------------------------------------------------------------ *
 * Rebase interativo de verdade
 * ------------------------------------------------------------------ */

test("rebase interativo: 3 commits com pick+reword+squash", async () => {
  const fixture = makeFixtureRepo("gitcraque-rebase-");
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    git(fixture.root, "checkout", "-q", "squash-me");

    // Antes: wip: parte 1, wip: parte 2, wip: parte 3
    const s1 = git(fixture.root, "rev-parse", fixture.hashes.s1);
    const s2 = git(fixture.root, "rev-parse", fixture.hashes.s2);
    const s3 = git(fixture.root, "rev-parse", fixture.hashes.s3);

    const baseAntes = git(fixture.root, "rev-parse", "HEAD~3");

    const resultado = await rebaseInteractive({
      actions: [
        { hash: s1, action: "reword", newMessage: "feat: commit um (renomeado)" },
        { hash: s2, action: "pick" },
        { hash: s3, action: "squash" },
      ],
    });

    assert.equal(resultado.ok, true, `stderr: ${resultado.stderr}\nstdout: ${resultado.stdout}`);
    assert.equal(resultado.pending, null);
    assert.equal(resultado.rewordsApplied, 1, `rewordsApplied=${resultado.rewordsApplied} stderr=${resultado.stderr}`);

    // O historico foi reescrito: o HEAD agora tem 2 commits (pick + reword),
    // com o squash do s3 absorvido no s2.
    const mensagens = git(fixture.root, "log", "--format=%s", "-n", "3").split("\n").filter(Boolean);
    assert.equal(mensagens[0], "wip: parte 2", "o squash junta s3 no s2 — s2 vira o HEAD");
    assert.equal(mensagens[1], "feat: commit um (renomeado)", "reword renomeou o s1");

    // O pai do reword e a base do rebase
    assert.equal(
      git(fixture.root, "rev-parse", "HEAD~2"),
      baseAntes,
      "a base do rebase nao mudou",
    );

    // Auditoria
    assert.ok(resultado.plan.length > 0, "o plano existe");
    const planActions = resultado.plan.map((l) => l.action);
    // O plano mostra as linhas de commit (pick/squash etc.). O reword foi
    // implementado via exec apos pick, entao o plano mostra "pick".
    assert.ok(planActions.includes("pick"), "plano inclui pick (reword via exec)");
    assert.ok(planActions.includes("squash"), "plano inclui squash");
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});

test("rebase interativo: drop remove um commit do historico", async () => {
  const fixture = makeFixtureRepo("gitcraque-rebase-drop-");
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    git(fixture.root, "checkout", "-q", "squash-me");

    const s1 = git(fixture.root, "rev-parse", fixture.hashes.s1);
    const s2 = git(fixture.root, "rev-parse", fixture.hashes.s2);
    const s3 = git(fixture.root, "rev-parse", fixture.hashes.s3);
    // s3 depende de s2 — drop de s2 causa conflito ao aplicar s3.
    // Testamos que o rebase detecta o conflito corretamente.

    const resultado = await rebaseInteractive({
      actions: [
        { hash: s1, action: "pick" },
        { hash: s2, action: "drop" },
        { hash: s3, action: "pick" },
      ],
    });

    // Drop de s2 gera conflito ao aplicar s3 (conflito legitimo do git).
    assert.equal(resultado.ok, false, "conflito esperado apos drop");
    assert.notEqual(resultado.pending, null, "estado pendente apos conflito");
    assert.ok(["rebase", "rebase-interactive"].includes(resultado.pending.kind), `kind=${resultado.pending.kind}`);
    assert.ok(resultado.pending.conflicts.length > 0, "arquivos em conflito");

    // Aborta o rebase para limpar o fixture
    git(fixture.root, "rebase", "--abort");
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});

test("rebase interativo: menos de dois commits recusado", async () => {
  const res = await rebaseInteractive({
    actions: [{ hash: "abc123", action: "pick" }],
  }).catch((e) => e);

  assert.equal(res.status, 400);
  assert.match(res.message, /error\.rebaseInteractiveNeedsTwo/);
});

test("rebase interativo: acao invalida recusada", async () => {
  const res = await rebaseInteractive({
    actions: [
      { hash: "abc123", action: "inventada" },
      { hash: "def456", action: "pick" },
    ],
  }).catch((e) => e);

  assert.equal(res.status, 400);
  assert.match(res.message, /error\.rebaseInteractiveInvalidAction/);
});

test("rebase interativo: reword sem newMessage recusado", async () => {
  const res = await rebaseInteractive({
    actions: [
      { hash: "abc123", action: "reword" },
      { hash: "def456", action: "pick" },
    ],
  }).catch((e) => e);

  assert.equal(res.status, 400);
  assert.match(res.message, /error\.rebaseInteractiveRewordNeedsMessage/);
});
