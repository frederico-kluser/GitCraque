/**
 * Exclusao de branch em cascata.
 *
 * Dois caminhos novos, ambos contra um repositorio de verdade:
 *
 *  - `POST /api/branch/delete-local` com `remote`: os dois lados sob um lock so;
 *  - `POST /api/branch/delete-all`: solta a worktree que prende a branch, joga
 *    fora o codigo nao commitado, apaga o local e apaga o remoto.
 *
 * O caso que mais importa e o quarto teste: a branch esta presa na worktree em
 * que o SERVIDOR esta. Ele precisa sair de la antes de remover o diretorio, ou
 * fica com o `process.cwd()` apontando para o que nao existe mais.
 *
 * Um servidor por arquivo: `runtime` e singleton de processo.
 */
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import fs from "node:fs";
import path from "node:path";

import { git, makeFixtureRepo } from "./helpers/repo.mjs";
import { bootServer } from "./helpers/server.mjs";

let fixture;
let api;
let origin;
const cwdOriginal = process.cwd();

/** As branches locais que o repositorio tem agora. */
const branchesLocais = () =>
  git(fixture.root, "for-each-ref", "--format=%(refname:short)", "refs/heads").split("\n").filter(Boolean);

/** As refs de rastreamento que sobraram. */
const branchesRemotas = () =>
  git(fixture.root, "for-each-ref", "--format=%(refname:short)", "refs/remotes").split("\n").filter(Boolean);

const caminhosDeWorktree = () =>
  git(fixture.root, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((linha) => linha.startsWith("worktree "))
    .map((linha) => linha.slice(9));

before(async () => {
  fixture = makeFixtureRepo("gitcraque-delete-all-");

  // Um "origin" de verdade: bare, no disco, para o push --delete ter alvo.
  origin = path.join(fixture.base, "origin.git");
  git(fixture.base, "init", "-q", "--bare", origin);
  git(fixture.root, "remote", "add", "origin", origin);

  // Porta so deste arquivo. `node --test` roda os arquivos em paralelo e o
  // `listen` cai para a porta seguinte quando a pedida esta ocupada — repetir
  // uma porta ja usada faz este servidor pousar em cima do de outro arquivo.
  api = await bootServer(fixture.root, { port: 5381 });
});

after(async () => {
  await api?.close();
  process.chdir(cwdOriginal);
  fixture?.cleanup();
});

test("delete-local com `remote` apaga os DOIS lados", async () => {
  git(fixture.root, "branch", "publicada", "main");
  git(fixture.root, "push", "-q", "origin", "publicada");
  assert.ok(branchesRemotas().includes("origin/publicada"), "a fixture precisa do lado remoto");

  const { status, json } = await api.post("/api/branch/delete-local", {
    name: "publicada",
    remote: "origin",
  });

  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.skippedRemote, undefined, "havia lado remoto: nada a pular");
  assert.ok(!branchesLocais().includes("publicada"));
  assert.ok(!branchesRemotas().includes("origin/publicada"));
  assert.equal(
    git(origin, "for-each-ref", "--format=%(refname:short)", "refs/heads/publicada"),
    "",
    "a branch tem de sumir do repositorio remoto, nao so da ref de rastreamento",
  );
});

test("sem branch no remoto, o push e PULADO e a operacao ainda e sucesso", async () => {
  git(fixture.root, "branch", "so-local", "main");

  const { status, json } = await api.post("/api/branch/delete-local", {
    name: "so-local",
    remote: "origin",
  });

  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.skippedRemote, true);
  assert.ok(!branchesLocais().includes("so-local"));
});

test("delete-all destrava a branch presa numa worktree ligada, com arquivo sujo", async () => {
  const presa = path.join(fixture.base, "wt-presa");
  git(fixture.root, "worktree", "add", "-q", "-b", "presa", presa);
  // Um arquivo rastreado modificado E um nao rastreado: e o que faz o
  // `git worktree remove` sem --force recusar.
  fs.writeFileSync(path.join(presa, "README.md"), "sujo\n");
  fs.writeFileSync(path.join(presa, "nao-rastreado.txt"), "lixo\n");
  assert.ok(caminhosDeWorktree().includes(presa));

  const { status, json } = await api.post("/api/branch/delete-all", { name: "presa" });

  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.cwdChanged, undefined, "o servidor nao estava dentro dela");
  assert.ok(!fs.existsSync(presa), "o diretorio da worktree tem de sumir do disco");
  assert.ok(!caminhosDeWorktree().includes(presa));
  assert.ok(!branchesLocais().includes("presa"));
});

test("delete-all na worktree ATIVA tira o servidor de la e anuncia cwd:changed", async () => {
  const ativa = path.join(fixture.base, "wt-ativa");
  git(fixture.root, "worktree", "add", "-q", "-b", "ativa", ativa);
  fs.writeFileSync(path.join(ativa, "pendente.txt"), "nao commitado\n");

  // Entra nela pelo caminho do produto: process.chdir, nunca checkout.
  const trocou = await api.post("/api/worktrees/switch", { path: ativa });
  assert.equal(trocou.status, 200);
  assert.equal(process.cwd(), ativa, "o servidor tem de estar DENTRO da worktree");

  const ws = api.connectWs();
  await ws.open();
  await ws.waitFor("hello");

  try {
    const { status, json } = await api.post("/api/branch/delete-all", { name: "ativa" });

    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.cwdChanged, fixture.root, "voltou para a worktree principal");
    assert.equal(process.cwd(), fixture.root);

    const evento = await ws.waitFor("cwd:changed");
    assert.equal(evento.cwd, fixture.root);

    assert.ok(!fs.existsSync(ativa));
    assert.ok(!branchesLocais().includes("ativa"));
  } finally {
    await ws.close();
  }
});

test("delete-all apaga tambem o lado remoto quando ele existe", async () => {
  git(fixture.root, "branch", "dos-dois-lados", "main");
  git(fixture.root, "push", "-q", "origin", "dos-dois-lados");

  const { status, json } = await api.post("/api/branch/delete-all", {
    name: "dos-dois-lados",
    remote: "origin",
  });

  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.skippedRemote, undefined);
  assert.ok(!branchesLocais().includes("dos-dois-lados"));
  assert.equal(git(origin, "for-each-ref", "--format=%(refname:short)", "refs/heads/dos-dois-lados"), "");
});

test("ref que comeca com `-` e recusada antes de virar argv", async () => {
  const { status, json } = await api.post("/api/branch/delete-all", { name: "--upload-pack=curl" });
  assert.equal(status, 400);
  assert.ok(json.error.length > 0);
});

/*
 * Ultimo de proposito: deixa a worktree principal em HEAD solto, e nao ha o que
 * rodar depois disso.
 */
test("delete-all na worktree PRINCIPAL solta o HEAD e descarta o nao commitado", async () => {
  git(fixture.root, "checkout", "-q", "-b", "na-principal");
  fs.writeFileSync(path.join(fixture.root, "README.md"), "modificado e nao commitado\n");
  fs.writeFileSync(path.join(fixture.root, "sobra.txt"), "nao rastreado\n");

  const { status, json } = await api.post("/api/branch/delete-all", { name: "na-principal" });

  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.ok(fs.existsSync(fixture.root), "a worktree principal NAO pode ser removida");
  assert.ok(!branchesLocais().includes("na-principal"));

  // HEAD solto e arvore limpa: o "cancele o codigo nao commitado" aconteceu.
  assert.equal(git(fixture.root, "rev-parse", "--abbrev-ref", "HEAD"), "HEAD");
  assert.equal(git(fixture.root, "status", "--porcelain"), "");
  assert.ok(!fs.existsSync(path.join(fixture.root, "sobra.txt")), "o clean -fd leva o nao rastreado");
});
