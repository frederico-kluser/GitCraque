/**
 * Autostash nas operacoes que reescrevem historico.
 *
 * A arvore suja (arquivo modificado + arquivo nao rastreado) e o estado NORMAL
 * de quem usa um cliente git graficamente: ninguem limpa a working tree antes
 * de clicar em "rebase". Sem `--autostash`, o git recusa com "cannot rebase:
 * You have unstaged changes" e a operacao simplesmente nao existe na pratica.
 *
 * E a armadilha dentro da armadilha: quando o POP do autostash conflita, o git
 * SAI COM 0 e diz "Successfully rebased" — deixando marcador de conflito no
 * arquivo do usuario. Reportar isso como sucesso seria o pior erro possivel
 * deste backend, entao ha um teste so para esse caso.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { detectAutostash, rebase, withAutostashState } from "../src/git/ops.mjs";
import { isConflict } from "../src/git/ops.mjs";

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Teste GitCraque",
  GIT_AUTHOR_EMAIL: "teste@gitcraque.dev",
  GIT_COMMITTER_NAME: "Teste GitCraque",
  GIT_COMMITTER_EMAIL: "teste@gitcraque.dev",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  LC_ALL: "C",
};

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, env: ENV, encoding: "utf8" }).trim();

function repoBase(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  git(root, "init", "-q", "-b", "main", ".");
  git(root, "config", "user.name", "Teste GitCraque");
  git(root, "config", "user.email", "teste@gitcraque.dev");
  return root;
}

const commit = (root, file, content, msg) => {
  fs.writeFileSync(path.join(root, file), content);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", msg);
};

/* ------------------------------------------------------------------ *
 * Rebase de branch em arvore suja
 * ------------------------------------------------------------------ */

test("rebase de branch em ARVORE SUJA funciona e devolve as alteracoes", async () => {
  const root = repoBase("gitcraque-reb-sujo-");
  const antes = process.cwd();
  try {
    process.chdir(root);
    commit(root, "base.txt", "base\n", "base");
    git(root, "checkout", "-q", "-b", "topico");
    commit(root, "topico.txt", "t\n", "commit do topico");
    git(root, "checkout", "-q", "main");
    commit(root, "main.txt", "m\n", "commit da main");
    git(root, "checkout", "-q", "topico");

    // Arvore suja: rastreado modificado + nao rastreado.
    const sujo = "base\nalteracao pendente\n";
    fs.writeFileSync(path.join(root, "base.txt"), sujo);
    fs.writeFileSync(path.join(root, "rascunho.txt"), "sem rastreio\n");

    const resultado = await rebase({ source: "topico", onto: "main" });

    assert.equal(resultado.ok, true, resultado.error ?? resultado.stderr);
    assert.equal(resultado.autostashed, true);
    assert.equal(resultado.pending, null);
    assert.ok(resultado.argv.includes("--autostash"), "o default numa GUI e autostash ligado");

    // O rebase aconteceu de verdade: topico agora descende da main.
    assert.equal(
      git(root, "rev-list", "--count", "main..topico"),
      "1",
      "o commit do topico foi replicado em cima da main",
    );
    assert.ok(git(root, "log", "--format=%s").includes("commit da main"));

    // E as alteracoes pendentes voltaram intactas.
    assert.equal(fs.readFileSync(path.join(root, "base.txt"), "utf8"), sujo);
    assert.equal(fs.readFileSync(path.join(root, "rascunho.txt"), "utf8"), "sem rastreio\n");
    assert.equal(git(root, "stash", "list"), "", "nada pode ficar preso no stash");
  } finally {
    process.chdir(antes);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("autostash: false devolve o comportamento cru do git", async () => {
  const root = repoBase("gitcraque-reb-cru-");
  const antes = process.cwd();
  try {
    process.chdir(root);
    commit(root, "base.txt", "base\n", "base");
    git(root, "checkout", "-q", "-b", "topico");
    commit(root, "topico.txt", "t\n", "commit do topico");
    git(root, "checkout", "-q", "main");
    commit(root, "main.txt", "m\n", "commit da main");
    git(root, "checkout", "-q", "topico");
    fs.writeFileSync(path.join(root, "base.txt"), "base\nsujo\n");

    const resultado = await rebase({ source: "topico", onto: "main", autostash: false });
    assert.equal(resultado.ok, false);
    assert.ok(!resultado.argv.includes("--autostash"));
    assert.match(resultado.error, /unstaged changes/i);
  } finally {
    process.chdir(antes);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * O pop conflitado — o git sai 0 e mente
 * ------------------------------------------------------------------ */

test("pop do autostash em conflito NAO passa por sucesso", async () => {
  const root = repoBase("gitcraque-pop-");
  const antes = process.cwd();
  try {
    process.chdir(root);
    // f.txt so muda na main; g.txt so muda no topico. O rebase aplica limpo,
    // mas a alteracao pendente em f.txt colide com o que a main escreveu.
    fs.writeFileSync(path.join(root, "f.txt"), "a\n");
    fs.writeFileSync(path.join(root, "g.txt"), "g\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "base");

    git(root, "checkout", "-q", "-b", "topico");
    commit(root, "g.txt", "g2\n", "topico mexe so em g.txt");
    git(root, "checkout", "-q", "main");
    commit(root, "f.txt", "MAIN REESCREVEU\n", "main mexe so em f.txt");
    git(root, "checkout", "-q", "topico");

    fs.writeFileSync(path.join(root, "f.txt"), "MINHA EDICAO PENDENTE\n");

    const resultado = await rebase({ source: "topico", onto: "main" });

    // O git saiu com 0 e disse "Successfully rebased"...
    assert.equal(resultado.exitCode, 0, "o proprio git considera isso sucesso");
    // ...mas o backend nao repassa a mentira.
    assert.equal(resultado.ok, false, "conflito no pop nao pode virar sucesso silencioso");
    assert.equal(resultado.autostashed, true);
    assert.match(resultado.error, /autostash/i);
    assert.ok(resultado.pending, "a UI precisa do pending para avisar");
    assert.deepEqual(resultado.pending.conflicts, ["f.txt"]);

    // As alteracoes do usuario continuam salvas — nada foi perdido.
    assert.match(git(root, "stash", "list"), /autostash/);
    assert.match(fs.readFileSync(path.join(root, "f.txt"), "utf8"), /<<<<<<</);

    // E o roteador responde 200 (estado a resolver), nao 409 (erro de servidor).
    assert.equal(isConflict(resultado), true);
  } finally {
    process.chdir(antes);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("conflito DURANTE o rebase mantem o pending de rebase", async () => {
  const root = repoBase("gitcraque-durante-");
  const antes = process.cwd();
  try {
    process.chdir(root);
    commit(root, "f.txt", "linha original\n", "base");
    git(root, "checkout", "-q", "-b", "topico");
    commit(root, "f.txt", "linha original\ntopico\n", "commit do topico");
    git(root, "checkout", "-q", "main");
    commit(root, "f.txt", "MAIN REESCREVEU A LINHA\n", "main mexe na mesma linha");
    git(root, "checkout", "-q", "topico");
    fs.writeFileSync(path.join(root, "pendente.txt"), "sujo\n");
    git(root, "add", "pendente.txt");

    const resultado = await rebase({ source: "topico", onto: "main" });
    assert.equal(resultado.ok, false);
    assert.equal(resultado.autostashed, true);
    assert.ok(["rebase", "rebase-interactive"].includes(resultado.pending.kind));
    assert.deepEqual(resultado.pending.conflicts, ["f.txt"]);

    // Com o rebase parado, o autostash ainda nao voltou: ele fica guardado em
    // `rebase-merge/autostash` (nao em `git stash list`, que so recebe a
    // entrada se o pop falhar) e e devolvido no --continue ou no --abort.
    const gitDir = git(root, "rev-parse", "--absolute-git-dir");
    assert.ok(
      fs.existsSync(path.join(gitDir, "rebase-merge", "autostash")),
      "as alteracoes pendentes tem de estar guardadas em algum lugar",
    );

    git(root, "rebase", "--abort");
    assert.match(
      git(root, "status", "--porcelain"),
      /pendente\.txt/,
      "o --abort devolve as alteracoes que o autostash guardou",
    );
  } finally {
    process.chdir(antes);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * Deteccao pura
 * ------------------------------------------------------------------ */

test("detectAutostash separa criacao (stdout) de pop conflitado (stderr)", () => {
  assert.deepEqual(detectAutostash({ stdout: "Created autostash: abc1234\n", stderr: "" }), {
    autostashed: true,
    popConflict: false,
  });
  assert.deepEqual(
    detectAutostash({ stdout: "", stderr: "Applying autostash resulted in conflicts.\n" }),
    { autostashed: false, popConflict: true },
  );
  assert.deepEqual(detectAutostash({ stdout: "", stderr: "" }), {
    autostashed: false,
    popConflict: false,
  });
});

test("withAutostashState so mexe no ok quando o pop conflitou", async () => {
  const root = repoBase("gitcraque-puro-");
  const antes = process.cwd();
  try {
    process.chdir(root);
    commit(root, "a.txt", "a\n", "base");

    const limpo = await withAutostashState({
      ok: true,
      stdout: "",
      stderr: "Successfully rebased.\n",
    });
    assert.equal(limpo.ok, true);
    assert.equal(limpo.autostashed, false);

    const comStash = await withAutostashState({
      ok: true,
      stdout: "Created autostash: abc1234\n",
      stderr: "Applied autostash.\n",
    });
    assert.equal(comStash.ok, true);
    assert.equal(comStash.autostashed, true);

    const conflitado = await withAutostashState({
      ok: true,
      stdout: "Created autostash: abc1234\n",
      stderr: "Applying autostash resulted in conflicts.\n",
    });
    assert.equal(conflitado.ok, false, "o git diz 0; nos dizemos a verdade");
    assert.equal(conflitado.autostashed, true);
    assert.ok(conflitado.pending);
  } finally {
    process.chdir(antes);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
