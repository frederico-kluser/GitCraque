/**
 * Desfazer/refazer sobre o reflog.
 *
 * O teste que justifica o arquivo inteiro e "dois desfazer seguidos NAO
 * oscilam". A implementacao obvia — `git reset --hard HEAD@{1}` — passa no
 * primeiro desfazer e falha no segundo, porque o proprio reset entra no reflog
 * e o `HEAD@{1}` passa a apontar para o lugar de onde acabamos de vir. O HEAD
 * fica pulando entre dois commits e a pessoa nunca chega no terceiro.
 *
 * O segundo teste que carrega peso e o do stash amarrado: o desfazer usa
 * `reset --hard`, entao sem o stash o trabalho nao commitado sumiria e o
 * refazer seria uma mentira. O teste compara o conteudo dos arquivos byte a
 * byte depois do refazer, inclusive o arquivo nao rastreado.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { redo, resetUndoCursors, undo, undoState } from "../src/git/undo.mjs";

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Teste GitCraque",
  GIT_AUTHOR_EMAIL: "teste@gitcraque.dev",
  GIT_COMMITTER_NAME: "Teste GitCraque",
  GIT_COMMITTER_EMAIL: "teste@gitcraque.dev",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  LC_ALL: "C",
  LANG: "C",
};

const git = (cwd, ...args) => execFileSync("git", args, { cwd, env: ENV, encoding: "utf8" }).trim();

function emptyRepo(prefix = "gitcraque-undo-") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  git(root, "init", "-q", "-b", "main", ".");
  git(root, "config", "user.name", "Teste GitCraque");
  git(root, "config", "user.email", "teste@gitcraque.dev");
  git(root, "config", "commit.gpgsign", "false");
  resetUndoCursors();
  return root;
}

/** Repositorio com tres commits que mexem no mesmo arquivo. */
function repoComTresCommits() {
  const root = emptyRepo();
  const hashes = {};
  for (const [n, nome] of [
    ["1", "primeiro"],
    ["2", "segundo"],
    ["3", "terceiro"],
  ]) {
    fs.writeFileSync(path.join(root, "a.txt"), `${n}\n`);
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", nome);
    hashes[nome] = git(root, "rev-parse", "HEAD");
  }
  return { root, hashes };
}

const head = (root) => git(root, "rev-parse", "HEAD");
const leia = (root, arquivo) => fs.readFileSync(path.join(root, arquivo), "utf8");

test("o estado sai do reflog: da para desfazer o ultimo commit, nao ha o que refazer", async () => {
  const { root } = repoComTresCommits();
  const estado = await undoState(root);

  assert.equal(estado.canUndo, true);
  assert.equal(estado.canRedo, false);
  assert.equal(estado.undoLabel, "commit: terceiro", "o rotulo e a acao que sera desfeita");
  assert.equal(estado.blocked, null);
});

test("dois desfazer seguidos ANDAM para tras — nao oscilam entre dois commits", async () => {
  const { root, hashes } = repoComTresCommits();

  const primeiro = await undo({ cwd: root });
  assert.equal(primeiro.ok, true);
  assert.equal(head(root), hashes.segundo);

  const segundo = await undo({ cwd: root });
  assert.equal(segundo.ok, true);
  assert.equal(
    head(root),
    hashes.primeiro,
    "com HEAD@{1} cru o segundo desfazer voltaria para 'terceiro'",
  );

  const estado = await undoState(root);
  assert.equal(estado.canUndo, false, "acabaram os passos: o reflog so tem tres entradas");
  assert.equal(estado.canRedo, true);
});

test("o refazer devolve o HEAD passo a passo, na ordem inversa", async () => {
  const { root, hashes } = repoComTresCommits();

  await undo({ cwd: root });
  await undo({ cwd: root });
  assert.equal(head(root), hashes.primeiro);

  assert.equal((await redo({ cwd: root })).ok, true);
  assert.equal(head(root), hashes.segundo);

  assert.equal((await redo({ cwd: root })).ok, true);
  assert.equal(head(root), hashes.terceiro);

  const estado = await undoState(root);
  assert.equal(estado.canRedo, false);
  assert.equal(estado.canUndo, true, "voltando ao topo, os passos de desfazer existem de novo");
});

test("worktree suja: o desfazer guarda o trabalho num stash e o refazer devolve tudo", async () => {
  const { root, hashes } = repoComTresCommits();

  fs.writeFileSync(path.join(root, "a.txt"), "rascunho\n");
  fs.writeFileSync(path.join(root, "novo.txt"), "arquivo nao rastreado\n");

  const desfeito = await undo({ cwd: root });
  assert.equal(desfeito.ok, true);
  assert.equal(head(root), hashes.segundo);
  assert.equal(leia(root, "a.txt"), "2\n", "o reset --hard levou o arquivo ao estado do commit");
  assert.equal(
    fs.existsSync(path.join(root, "novo.txt")),
    false,
    "o -u do stash tambem levou o arquivo nao rastreado",
  );

  const refeito = await redo({ cwd: root });
  assert.equal(refeito.ok, true);
  assert.equal(head(root), hashes.terceiro);
  assert.equal(leia(root, "a.txt"), "rascunho\n", "o trabalho pendente voltou identico");
  assert.equal(leia(root, "novo.txt"), "arquivo nao rastreado\n", "o nao rastreado voltou tambem");
});

test("o stash e amarrado pelo SHA: um stash novo por cima nao confunde o refazer", async () => {
  const { root } = repoComTresCommits();

  fs.writeFileSync(path.join(root, "a.txt"), "rascunho do desfazer\n");
  await undo({ cwd: root });

  // Alguem empilha outro stash: o do desfazer deixa de ser o stash@{0}.
  fs.writeFileSync(path.join(root, "a.txt"), "outra coisa qualquer\n");
  git(root, "stash", "push", "-q", "-m", "stash de outra pessoa");

  const refeito = await redo({ cwd: root });
  assert.equal(refeito.ok, true);
  assert.equal(leia(root, "a.txt"), "rascunho do desfazer\n", "voltou o stash certo, nao o de cima");
});

test("HEAD mexido por fora (git no terminal) mata o refazer", async () => {
  const { root, hashes } = repoComTresCommits();

  await undo({ cwd: root });
  assert.equal((await undoState(root)).canRedo, true);

  git(root, "reset", "--hard", "-q", hashes.primeiro);

  const estado = await undoState(root);
  assert.equal(estado.canRedo, false, "o cursor foi invalidado: refazer levaria para onde ninguem pediu");
  assert.equal(estado.canUndo, true, "e o desfazer ressemeia do reflog novo");
});

test("entrada de reflog que nao moveu o HEAD nao vira passo", async () => {
  const { root, hashes } = repoComTresCommits();

  // `reset --hard HEAD` entra no reflog apontando para o mesmo commit.
  git(root, "reset", "--hard", "-q", "HEAD");

  await undo({ cwd: root });
  assert.equal(head(root), hashes.segundo, "o passo pulou a entrada parada e foi ao commit anterior");
});

test("repositorio sem commit nenhum: nada a desfazer, e a recusa e 400", async () => {
  const root = emptyRepo();

  const estado = await undoState(root);
  assert.equal(estado.canUndo, false);
  assert.equal(estado.blocked, "empty");

  await assert.rejects(
    () => undo({ cwd: root }),
    (erro) => erro.message === "error.undoEmptyRepo" && erro.status === 400,
  );
});

test("um unico commit: o reflog nao oferece passo anterior", async () => {
  const root = emptyRepo();
  fs.writeFileSync(path.join(root, "a.txt"), "1\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "unico");

  assert.equal((await undoState(root)).canUndo, false);
  await assert.rejects(
    () => undo({ cwd: root }),
    (erro) => erro.message === "error.undoNothing" && erro.status === 400,
  );
});

test("refazer sem ter desfeito e recusado", async () => {
  const { root } = repoComTresCommits();
  await assert.rejects(
    () => redo({ cwd: root }),
    (erro) => erro.message === "error.redoNothing" && erro.status === 400,
  );
});

test("operacao pendente bloqueia os dois botoes ate abortar ou continuar", async () => {
  const root = emptyRepo();
  fs.writeFileSync(path.join(root, "a.txt"), "base\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");

  git(root, "checkout", "-q", "-b", "outra");
  fs.writeFileSync(path.join(root, "a.txt"), "vinda da outra\n");
  git(root, "commit", "-qam", "outra ponta");

  git(root, "checkout", "-q", "main");
  fs.writeFileSync(path.join(root, "a.txt"), "vinda da main\n");
  git(root, "commit", "-qam", "ponta da main");

  // Merge que para em conflito: o repositorio fica com MERGE_HEAD.
  try {
    git(root, "merge", "outra");
  } catch {
    /* o conflito e o objetivo */
  }

  const estado = await undoState(root);
  assert.equal(estado.blocked, "pending");
  assert.equal(estado.canUndo, false);
  assert.equal(estado.canRedo, false);

  await assert.rejects(
    () => undo({ cwd: root }),
    (erro) => erro.message === "error.undoPending" && erro.status === 409,
  );
});
