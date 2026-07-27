/**
 * Squash via GIT_SEQUENCE_EDITOR — ponta a ponta, sem emulador de terminal.
 *
 * O proxy-editor e executado PELO GIT. O que se prova aqui:
 *  - 3 commits viram 1 de verdade (o `git log` e a testemunha);
 *  - o PRIMEIRO selecionado continua `pick` (sem isso o git aborta com
 *    "cannot squash without a previous commit");
 *  - `fixup` descarta as mensagens e `squash` as concatena;
 *  - selecao nao contigua, merge commit e commit fora do HEAD sao recusados;
 *  - o commit raiz cai no caminho do `--root`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
  PROXY_EDITOR_PATH,
  parseTodo,
  sequenceEditorCommand,
  shellQuote,
  squash,
} from "../src/git/squash.mjs";
import { ENV_SQUASH_AUDIT, ENV_SQUASH_HASHES, ENV_SQUASH_MODE } from "../src/contract.mjs";
import { detectAutostash } from "../src/git/ops.mjs";
import { git, makeFixtureRepo } from "./helpers/repo.mjs";

/* ------------------------------------------------------------------ *
 * O proxy-editor isolado — como o git o executa
 * ------------------------------------------------------------------ */

function runProxyEditor(todo, hashes, mode = "squash") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitcraque-proxy-"));
  const todoPath = path.join(dir, "git-rebase-todo");
  const auditPath = path.join(dir, "audit.json");
  fs.writeFileSync(todoPath, todo);

  let status = 0;
  let stderr = "";
  try {
    execFileSync(process.execPath, [PROXY_EDITOR_PATH, todoPath], {
      env: {
        ...process.env,
        [ENV_SQUASH_HASHES]: hashes.join(","),
        [ENV_SQUASH_MODE]: mode,
        [ENV_SQUASH_AUDIT]: auditPath,
      },
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
    audit: fs.existsSync(auditPath) ? JSON.parse(fs.readFileSync(auditPath, "utf8")) : null,
  };
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

const H = {
  um: "1111111111111111111111111111111111111111",
  dois: "2222222222222222222222222222222222222222",
  tres: "3333333333333333333333333333333333333333",
  outro: "4444444444444444444444444444444444444444",
};

test("proxy-editor: o PRIMEIRO selecionado continua pick", () => {
  const todo = [
    "pick 1111111 wip: parte 1",
    "pick 2222222 wip: parte 2",
    "pick 3333333 wip: parte 3",
    "",
    "# Rebase abc..def onto abc",
    "",
  ].join("\n");

  const { status, rewritten } = runProxyEditor(todo, [H.um, H.dois, H.tres]);
  assert.equal(status, 0);
  const linhas = rewritten.split("\n");
  assert.equal(linhas[0], "pick 1111111 wip: parte 1", "sem isso o rebase aborta");
  assert.equal(linhas[1], "squash 2222222 wip: parte 2");
  assert.equal(linhas[2], "squash 3333333 wip: parte 3");
  assert.equal(linhas[4], "# Rebase abc..def onto abc", "comentarios ficam intactos");
});

test("proxy-editor: modo fixup", () => {
  const todo = ["pick 1111111 um", "pick 2222222 dois", ""].join("\n");
  const { rewritten } = runProxyEditor(todo, [H.um, H.dois], "fixup");
  assert.deepEqual(rewritten.split("\n").slice(0, 2), ["pick 1111111 um", "fixup 2222222 dois"]);
});

test("proxy-editor: casa hash ABREVIADO contra o hash completo", () => {
  const todo = ["pick 1111111 um", "pick 2222222 dois", ""].join("\n");
  const { status, audit } = runProxyEditor(todo, [H.um, H.dois]);
  assert.equal(status, 0);
  assert.equal(audit.matched, 2, "o todo traz 7 caracteres; o cofre guarda 40");
});

test("proxy-editor: linhas nao selecionadas nao sao tocadas", () => {
  const todo = [
    "pick 9999999 nao selecionado",
    "pick 1111111 um",
    "pick 2222222 dois",
    "",
  ].join("\n");
  const { rewritten } = runProxyEditor(todo, [H.um, H.dois]);
  assert.deepEqual(rewritten.split("\n").slice(0, 3), [
    "pick 9999999 nao selecionado",
    "pick 1111111 um",
    "squash 2222222 dois",
  ]);
});

test("proxy-editor: todo que nao bate com o plano ABORTA o rebase", () => {
  const todo = ["pick 1111111 um", ""].join("\n");
  const { status, stderr } = runProxyEditor(todo, [H.um, H.dois, H.outro]);
  assert.equal(status, 1, "sair com != 0 faz o git cancelar o rebase inteiro");
  assert.match(stderr, /esperava 3 commits/);
});

test("proxy-editor: sem hashes no ambiente, sai com erro", () => {
  const todo = "pick 1111111 um\n";
  const { status } = runProxyEditor(todo, []);
  assert.equal(status, 1);
});

/* ------------------------------------------------------------------ *
 * Montagem do GIT_SEQUENCE_EDITOR
 * ------------------------------------------------------------------ */

test("o valor de GIT_SEQUENCE_EDITOR aguenta caminho com espaco", () => {
  const comando = sequenceEditorCommand("/caminho com espaco/proxy-editor.mjs", "/usr/bin/node");
  assert.equal(comando, "/usr/bin/node '/caminho com espaco/proxy-editor.mjs'");
  assert.equal(shellQuote("/sem/espaco/x.mjs"), "/sem/espaco/x.mjs");
  assert.equal(shellQuote("/com 'aspas'/x.mjs"), `'/com '\\''aspas'\\''/x.mjs'`);
});

test("parseTodo marca quais linhas foram reescritas", () => {
  const original = ["pick aaa1111 um", "pick bbb2222 dois", "# comentario", ""].join("\n");
  const reescrito = ["pick aaa1111 um", "squash bbb2222 dois", "# comentario", ""].join("\n");
  const plano = parseTodo(reescrito, original);
  assert.equal(plano.length, 2, "comentarios nao entram no plano");
  assert.deepEqual(plano[0], {
    action: "pick",
    hash: "aaa1111",
    subject: "um",
    rewritten: false,
  });
  assert.deepEqual(plano[1], {
    action: "squash",
    hash: "bbb2222",
    subject: "dois",
    rewritten: true,
  });
});

/* ------------------------------------------------------------------ *
 * Ponta a ponta num repositorio de verdade
 * ------------------------------------------------------------------ */

test("3 commits viram 1 no branch descartavel", async () => {
  const fixture = makeFixtureRepo("gitcraque-squash-");
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    git(fixture.root, "checkout", "-q", "squash-me");

    const antesDoSquash = git(fixture.root, "log", "--format=%s", "-n", "5").split("\n");
    assert.deepEqual(antesDoSquash.slice(0, 3), [
      "wip: parte 3",
      "wip: parte 2",
      "wip: parte 1",
    ]);
    const baseAntes = git(fixture.root, "rev-parse", "HEAD~3");

    const resultado = await squash({
      // Ordem embaralhada de proposito: quem ordena e o backend.
      commits: [fixture.hashes.s3, fixture.hashes.s1, fixture.hashes.s2],
      message: "feat: tudo junto num commit so",
    });

    assert.equal(resultado.ok, true, resultado.stderr);
    assert.equal(resultado.pending, null);

    const depois = git(fixture.root, "log", "--format=%s", "-n", "2").split("\n");
    assert.equal(depois[0], "feat: tudo junto num commit so");
    assert.notEqual(depois[1], "wip: parte 2", "os tres viraram um so");
    assert.equal(
      git(fixture.root, "rev-parse", "HEAD~1"),
      baseAntes,
      "o pai do commit resultante e a base do rebase",
    );

    // O conteudo dos tres commits sobreviveu.
    assert.equal(fs.readFileSync(path.join(fixture.root, "squash.txt"), "utf8"), "um\ndois\ntres\n");

    // Auditoria: o plano mostra pick + squash + squash.
    assert.deepEqual(
      resultado.plan.map((l) => l.action),
      ["pick", "squash", "squash"],
    );
    assert.equal(resultado.plan[0].rewritten, false);
    assert.equal(resultado.plan[1].rewritten, true);
    assert.match(resultado.originalTodo, /^pick /m);
    assert.match(resultado.rewrittenTodo, /^squash /m);
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});

test("fixup descarta as mensagens dos commits absorvidos", async () => {
  const fixture = makeFixtureRepo("gitcraque-fixup-");
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    git(fixture.root, "checkout", "-q", "squash-me");

    const resultado = await squash({
      commits: [fixture.hashes.s1, fixture.hashes.s2, fixture.hashes.s3],
      fixup: true,
    });
    assert.equal(resultado.ok, true, resultado.stderr);
    assert.deepEqual(
      resultado.plan.map((l) => l.action),
      ["pick", "fixup", "fixup"],
    );

    const mensagem = git(fixture.root, "log", "-1", "--format=%B").trim();
    assert.equal(mensagem, "wip: parte 1", "fixup fica so com a mensagem do primeiro");
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});

test("sem message, o squash concatena as mensagens originais", async () => {
  const fixture = makeFixtureRepo("gitcraque-concat-");
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    git(fixture.root, "checkout", "-q", "squash-me");

    const resultado = await squash({ commits: [fixture.hashes.s1, fixture.hashes.s2] });
    assert.equal(resultado.ok, true, resultado.stderr);

    // Squash das partes 1 e 2: a parte 3 e replicada por cima, entao o commit
    // resultante e o HEAD~1. Sem `message`, o git concatena as duas mensagens.
    assert.equal(git(fixture.root, "log", "-1", "--format=%s"), "wip: parte 3");
    const mensagem = git(fixture.root, "log", "-1", "--format=%B", "HEAD~1");
    assert.match(mensagem, /wip: parte 1/);
    assert.match(mensagem, /wip: parte 2/);
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});

test("commit raiz cai no caminho do --root", async () => {
  const fixture = makeFixtureRepo("gitcraque-root-");
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    // Branch com so os dois primeiros commits, sendo o primeiro a raiz.
    git(fixture.root, "checkout", "-q", "-b", "so-o-comeco", fixture.hashes.pipe);

    const resultado = await squash({
      commits: [fixture.hashes.primeiro, fixture.hashes.pipe],
      message: "chore: historia inteira num commit",
    });
    assert.equal(resultado.ok, true, resultado.stderr);
    assert.equal(resultado.base, "--root");

    const log = git(fixture.root, "log", "--format=%s").split("\n");
    assert.deepEqual(log, ["chore: historia inteira num commit"], "sobrou um commit so");
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});

test("selecao nao contigua e recusada com mensagem clara", async () => {
  const fixture = makeFixtureRepo("gitcraque-gap-");
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    git(fixture.root, "checkout", "-q", "squash-me");

    await assert.rejects(
      () => squash({ commits: [fixture.hashes.s1, fixture.hashes.s3] }),
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /nao sao contiguos/);
        return true;
      },
    );
    // O repositorio nao pode ter ficado no meio de um rebase.
    assert.equal(git(fixture.root, "rev-parse", "--abbrev-ref", "HEAD"), "squash-me");
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});

test("merge commit na selecao e recusado", async () => {
  const fixture = makeFixtureRepo("gitcraque-merge-");
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    await assert.rejects(
      () => squash({ commits: [fixture.hashes.merge, fixture.hashes.mainExtra] }),
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /merge commit/);
        return true;
      },
    );
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});

test("commit fora do HEAD atual e recusado", async () => {
  const fixture = makeFixtureRepo("gitcraque-fora-");
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    git(fixture.root, "checkout", "-q", "main");
    await assert.rejects(
      () => squash({ commits: [fixture.hashes.s1, fixture.hashes.s2] }),
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /nao estao no HEAD atual/);
        return true;
      },
    );
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});

test("menos de dois commits e recusado", async () => {
  const fixture = makeFixtureRepo("gitcraque-um-");
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    await assert.rejects(
      () => squash({ commits: [fixture.hashes.s1] }),
      /pelo menos 2 hashes/,
    );
    await assert.rejects(() => squash({}), /pelo menos 2 hashes/);
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});

/* ------------------------------------------------------------------ *
 * Arvore suja — o estado NORMAL de quem usa um cliente git graficamente
 * ------------------------------------------------------------------ */

test("squash numa ARVORE SUJA: colapsa os commits E devolve as alteracoes", async () => {
  const fixture = makeFixtureRepo("gitcraque-sujo-");
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    git(fixture.root, "checkout", "-q", "squash-me");

    // Ninguem limpa a working tree antes de clicar em "squash": um arquivo
    // rastreado modificado e um arquivo novo sem rastreio.
    const readme = path.join(fixture.root, "README.md");
    const sujo = "# fixture\n\nalteracao pendente que NAO pode se perder\n";
    fs.writeFileSync(readme, sujo);
    fs.writeFileSync(path.join(fixture.root, "rascunho.txt"), "arquivo novo, sem rastreio\n");

    const sujoAntes = git(fixture.root, "status", "--porcelain");
    // o helper `git()` faz trim, entao o ^ nao ancora no espaco do porcelain
    assert.match(sujoAntes, /M README\.md/);
    assert.match(sujoAntes, /\?\? rascunho\.txt/);
    const commitsAntes = Number(git(fixture.root, "rev-list", "--count", "HEAD"));

    const resultado = await squash({
      commits: [fixture.hashes.s1, fixture.hashes.s2, fixture.hashes.s3],
      message: "feat: tudo junto, com a arvore suja",
    });

    // 1. o squash aconteceu
    assert.equal(resultado.ok, true, resultado.error ?? resultado.stderr);
    assert.equal(resultado.pending, null);
    assert.equal(
      Number(git(fixture.root, "rev-list", "--count", "HEAD")),
      commitsAntes - 2,
      "os 3 commits tinham de virar 1",
    );
    assert.equal(git(fixture.root, "log", "-1", "--format=%s"), "feat: tudo junto, com a arvore suja");
    assert.deepEqual(
      resultado.plan.map((l) => l.action),
      ["pick", "squash", "squash"],
    );

    // 2. o backend avisa que mexeu no stash
    assert.equal(resultado.autostashed, true, "a UI precisa saber que houve autostash");

    // 3. e as alteracoes pendentes voltaram INTACTAS
    assert.equal(fs.readFileSync(readme, "utf8"), sujo, "a modificacao pendente tem de voltar igual");
    assert.equal(
      fs.readFileSync(path.join(fixture.root, "rascunho.txt"), "utf8"),
      "arquivo novo, sem rastreio\n",
      "o arquivo nao rastreado nao pode sumir",
    );
    const sujoDepois = git(fixture.root, "status", "--porcelain");
    assert.match(sujoDepois, /M README\.md/);
    assert.match(sujoDepois, /\?\? rascunho\.txt/);

    // 4. nada ficou preso no stash
    assert.equal(git(fixture.root, "stash", "list"), "", "o autostash tem de ter sido devolvido");
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});

test("arvore limpa nao marca autostashed", async () => {
  const fixture = makeFixtureRepo("gitcraque-limpo-");
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    git(fixture.root, "checkout", "-q", "squash-me");
    const resultado = await squash({
      commits: [fixture.hashes.s1, fixture.hashes.s2],
      message: "chore: arvore limpa",
    });
    assert.equal(resultado.ok, true, resultado.error);
    assert.equal(resultado.autostashed, false, "sem nada pendente, o git nao cria stash");
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});

test("detectAutostash le os DOIS streams do git", () => {
  // "Created autostash" sai no stdout; o resultado do pop sai no stderr.
  assert.deepEqual(
    detectAutostash({ stdout: "Created autostash: bf845e2\n", stderr: "Applied autostash.\n" }),
    { autostashed: true, popConflict: false },
  );
  assert.deepEqual(
    detectAutostash({
      stdout: "Created autostash: bf845e2\n",
      stderr: "Applying autostash resulted in conflicts.\nYour changes are safe in the stash.\n",
    }),
    { autostashed: true, popConflict: true },
  );
  assert.deepEqual(detectAutostash({ stdout: "", stderr: "Successfully rebased.\n" }), {
    autostashed: false,
    popConflict: false,
  });
  assert.deepEqual(detectAutostash({}), { autostashed: false, popConflict: false });
});

test("hash abreviado e aceito e resolvido", async () => {
  const fixture = makeFixtureRepo("gitcraque-abrev-");
  const antes = process.cwd();
  try {
    process.chdir(fixture.root);
    git(fixture.root, "checkout", "-q", "squash-me");

    const resultado = await squash({
      commits: [fixture.hashes.s2.slice(0, 8), fixture.hashes.s3.slice(0, 8)],
      message: "chore: abreviados tambem valem",
    });
    assert.equal(resultado.ok, true, resultado.stderr);
    assert.equal(git(fixture.root, "log", "-1", "--format=%s"), "chore: abreviados tambem valem");
  } finally {
    process.chdir(antes);
    fixture.cleanup();
  }
});
