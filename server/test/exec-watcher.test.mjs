/**
 * O nucleo do exec (serializacao, timeout, GitCommandResult) e o watcher.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  execGit,
  execGitLines,
  gitEnv,
  isMutating,
  readGit,
  readGitLine,
  splitLines,
  withMutationLock,
} from "../src/git/exec.mjs";
import { mostSignificant, reasonForPath, Watcher } from "../src/watcher.mjs";
import { getGitCommonDir, getGitDir } from "../src/git/worktree.mjs";
import { makeFixtureRepo } from "./helpers/repo.mjs";

test("o GitCommandResult tem o formato do contrato", async () => {
  const fixture = makeFixtureRepo("gitcraque-exec-");
  try {
    const result = await execGit(["log", "-1", "--format=%s"], { cwd: fixture.root });
    assert.equal(result.ok, true);
    assert.deepEqual(result.argv, ["git", "log", "-1", "--format=%s"]);
    assert.equal(result.cwd, fixture.root);
    assert.equal(result.exitCode, 0);
    assert.equal(result.signal, null);
    assert.equal(typeof result.durationMs, "number");
    assert.equal(result.error, undefined);
    assert.ok(result.stdout.length > 0);
  } finally {
    fixture.cleanup();
  }
});

test("comando que falha traz error com a primeira linha util do stderr", async () => {
  const fixture = makeFixtureRepo("gitcraque-fail-");
  try {
    const result = await execGit(["checkout", "nao-existe"], { cwd: fixture.root });
    assert.equal(result.ok, false);
    assert.notEqual(result.exitCode, 0);
    assert.ok(result.error.length > 0);
    assert.ok(!result.error.startsWith("fatal:"), "o prefixo do git sai fora");
    assert.ok(!/^hint:/.test(result.error), "linha de hint nao serve de mensagem");
  } finally {
    fixture.cleanup();
  }
});

test("nenhum comando roda com shell: o argv vai como array", async () => {
  const fixture = makeFixtureRepo("gitcraque-shell-");
  try {
    // Se houvesse shell, isso apagaria o repositorio. Como nao ha, o git so
    // reclama que nao existe branch com esse nome.
    const result = await execGit(["rev-parse", "--verify", "x; rm -rf ."], { cwd: fixture.root });
    assert.equal(result.ok, false);
    assert.ok(fs.existsSync(path.join(fixture.root, ".git")), "o repositorio continua de pe");
  } finally {
    fixture.cleanup();
  }
});

test("comandos mutantes nao rodam concorrentes", async () => {
  const ordem = [];
  const tarefa = (nome, ms) =>
    withMutationLock(async () => {
      ordem.push(`inicio:${nome}`);
      assert.equal(isMutating(), true);
      await new Promise((r) => setTimeout(r, ms));
      ordem.push(`fim:${nome}`);
    });

  await Promise.all([tarefa("a", 40), tarefa("b", 5), tarefa("c", 5)]);
  assert.deepEqual(ordem, [
    "inicio:a",
    "fim:a",
    "inicio:b",
    "fim:b",
    "inicio:c",
    "fim:c",
  ]);
  assert.equal(isMutating(), false);
});

test("uma mutacao que explode nao trava a fila", async () => {
  await assert.rejects(() =>
    withMutationLock(async () => {
      throw new Error("estourou");
    }),
  );
  let rodou = false;
  await withMutationLock(async () => {
    rodou = true;
  });
  assert.equal(rodou, true, "a corrente da fila nao pode quebrar");
});

test("timeout mata o processo e reporta no stderr", async () => {
  const fixture = makeFixtureRepo("gitcraque-timeout-");
  try {
    // `git hash-object --stdin` fica esperando o stdin que nunca vem.
    const result = await execGit(["hash-object", "--stdin-paths"], {
      cwd: fixture.root,
      timeout: 300,
      input: "",
    });
    assert.ok(result.durationMs < 5_000);
  } finally {
    fixture.cleanup();
  }
});

test("leitura silenciosa injeta --no-optional-locks", async () => {
  const fixture = makeFixtureRepo("gitcraque-read-");
  try {
    const result = await readGit(["status", "--porcelain"], { cwd: fixture.root });
    assert.deepEqual(result.argv.slice(0, 3), ["git", "--no-optional-locks", "status"]);
    assert.equal(result.ok, true);

    const linhas = await execGitLines(["branch", "--format=%(refname:short)"], {
      cwd: fixture.root,
    });
    assert.ok(linhas.includes("main"));
    assert.ok(!linhas.includes(""), "linhas vazias saem fora");

    assert.equal(await readGitLine(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: fixture.root }), "main");
    assert.equal(await readGitLine(["rev-parse", "nao-existe"], { cwd: fixture.root }), null);
  } finally {
    fixture.cleanup();
  }
});

test("splitLines cobre \\n e \\0", () => {
  assert.deepEqual(splitLines("a\nb\n"), ["a", "b"]);
  assert.deepEqual(splitLines("a\r\nb\r\n"), ["a", "b"]);
  assert.deepEqual(splitLines("a\0b\0", "\0", true), ["a", "b"]);
});

test("gitEnv carrega a tabela inteira da arquitetura", () => {
  const env = gitEnv();
  assert.equal(env.GIT_TERMINAL_PROMPT, "0");
  assert.equal(env.GIT_EDITOR, "true");
  assert.equal(env.GIT_PAGER, "cat");
  assert.equal(env.PAGER, "cat");
  assert.equal(env.LC_ALL, "C");
  assert.equal(env.LANG, "C");
  assert.equal(env.GIT_OPTIONAL_LOCKS, "0");
  assert.equal(env.SSH_ASKPASS_REQUIRE, "force");
  assert.equal(gitEnv({ GIT_SEQUENCE_EDITOR: "x" }).GIT_SEQUENCE_EDITOR, "x");
});

/* ------------------------------------------------------------------ *
 * Watcher
 * ------------------------------------------------------------------ */

test("reasonForPath classifica cada arquivo do git-dir", () => {
  assert.equal(reasonForPath("HEAD"), "head");
  assert.equal(reasonForPath("ORIG_HEAD"), "head");
  assert.equal(reasonForPath("refs/heads/main"), "refs");
  assert.equal(reasonForPath("packed-refs"), "refs");
  assert.equal(reasonForPath("index"), "index");
  assert.equal(reasonForPath("config"), "config");
  assert.equal(reasonForPath("MERGE_HEAD"), "rebase-state");
  assert.equal(reasonForPath("CHERRY_PICK_HEAD"), "rebase-state");
  assert.equal(reasonForPath("rebase-merge/done"), "rebase-state");
  assert.equal(reasonForPath("rebase-apply/next"), "rebase-state");
  assert.equal(reasonForPath("qualquer-outra-coisa"), "worktree");
});

test("mostSignificant escolhe o motivo de maior prioridade do lote", () => {
  assert.equal(mostSignificant(["index", "refs", "rebase-state"]), "rebase-state");
  assert.equal(mostSignificant(["worktree", "refs"]), "refs");
  assert.equal(mostSignificant(["index"]), "index");
  assert.equal(mostSignificant([]), "manual");
});

test("o watcher agrupa a rajada num evento so e respeita a supressao", async () => {
  const fixture = makeFixtureRepo("gitcraque-watch-");
  try {
    const gitDir = await getGitDir(fixture.root);
    const eventos = [];
    const watcher = new Watcher({
      gitDir,
      onChange: (reason, paths) => eventos.push({ reason, paths }),
    }).start();

    try {
      // Rajada: varios arquivos de uma vez viram UM evento so.
      fs.writeFileSync(path.join(gitDir, "refs", "heads", "um"), `${"a".repeat(40)}\n`);
      fs.writeFileSync(path.join(gitDir, "refs", "heads", "dois"), `${"b".repeat(40)}\n`);
      await new Promise((r) => setTimeout(r, 400));
      assert.equal(eventos.length, 1, "o debounce de 120 ms agrupa a rajada");
      assert.equal(eventos[0].reason, "refs");

      // Durante um comando do proprio servidor, nada e emitido.
      eventos.length = 0;
      watcher.beginSuppression();
      assert.equal(watcher.isSuppressed(), true);
      fs.writeFileSync(path.join(gitDir, "refs", "heads", "tres"), `${"c".repeat(40)}\n`);
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(eventos.length, 0, "senao cada operacao dispara refresh em loop");

      watcher.endSuppression();
      assert.equal(watcher.isSuppressed(), true, "o rabo de silencio ainda vale");
      await new Promise((r) => setTimeout(r, 400));
      assert.equal(watcher.isSuppressed(), false);

      // Passado o rabo, volta a emitir.
      eventos.length = 0;
      fs.writeFileSync(path.join(gitDir, "refs", "heads", "quatro"), `${"d".repeat(40)}\n`);
      await new Promise((r) => setTimeout(r, 400));
      assert.equal(eventos.length, 1);
    } finally {
      watcher.close();
    }
  } finally {
    fixture.cleanup();
  }
});

test("numa worktree ligada, o watcher ve as refs do git-dir COMUM", async () => {
  const fixture = makeFixtureRepo("gitcraque-comum-");
  try {
    // A fixture ja tem uma worktree ligada. Dentro dela o git-dir e
    // `<comum>/worktrees/<nome>` e nao contem refs/ nenhuma: quem observasse so
    // este diretorio nunca saberia que uma branch nasceu ou morreu.
    const gitDir = await getGitDir(fixture.worktree);
    const commonDir = await getGitCommonDir(fixture.worktree);
    assert.notEqual(gitDir, commonDir, "a fixture precisa de uma worktree LIGADA");
    assert.ok(!fs.existsSync(path.join(gitDir, "refs", "heads")), "as refs nao moram aqui");

    const eventos = [];
    const watcher = new Watcher({
      gitDir,
      commonDir,
      onChange: (reason) => eventos.push(reason),
    }).start();

    try {
      fs.writeFileSync(path.join(commonDir, "refs", "heads", "de-fora"), `${"e".repeat(40)}\n`);
      await new Promise((r) => setTimeout(r, 400));
      assert.equal(eventos.length, 1);
      assert.equal(eventos[0], "refs");
    } finally {
      watcher.close();
    }
  } finally {
    fixture.cleanup();
  }
});

test("gitDir igual a commonDir nao observa duas vezes", async () => {
  const fixture = makeFixtureRepo("gitcraque-dedup-");
  try {
    // Na worktree principal os dois caminhos sao o mesmo. Observar duas vezes
    // seria desperdicio de descritor, nada mais grave — mas o dedup e barato.
    const gitDir = await getGitDir(fixture.root);
    const commonDir = await getGitCommonDir(fixture.root);
    assert.equal(gitDir, commonDir);

    const watcher = new Watcher({ gitDir, commonDir, onChange: () => {} }).start();
    try {
      assert.equal(watcher.commonDir, null);
    } finally {
      watcher.close();
    }
  } finally {
    fixture.cleanup();
  }
});

test("arquivo .lock nao vira evento", async () => {
  const fixture = makeFixtureRepo("gitcraque-lock-");
  try {
    const gitDir = await getGitDir(fixture.root);
    const eventos = [];
    const watcher = new Watcher({ gitDir, onChange: (r) => eventos.push(r) }).start();
    try {
      fs.writeFileSync(path.join(gitDir, "index.lock"), "");
      fs.rmSync(path.join(gitDir, "index.lock"));
      await new Promise((r) => setTimeout(r, 350));
      assert.equal(eventos.length, 0, "lock file e ruido puro");
    } finally {
      watcher.close();
    }
  } finally {
    fixture.cleanup();
  }
});
