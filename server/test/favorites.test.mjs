/**
 * Projetos favoritos — `GET/POST /api/repos/favorites*`.
 *
 * O que este arquivo tem de provar, alem do feliz caminho:
 *
 *  1. `add` usa a MESMA guarda de `openRepository`: pasta que nao e repositorio
 *     nao vira favorito. Sem isso, fixar `/etc` seria guardar um atalho para
 *     mandar o servidor para la depois.
 *  2. Favorito NAO e recente: repetir `add` nao duplica e nao embaralha a ordem
 *     manual, e a lista nao tem teto nem rotatividade.
 *  3. `exists` e recalculado a cada leitura — a pasta pode ter sumido.
 *  4. Arquivo corrompido na configuracao nao derruba nada.
 *
 * `XDG_CONFIG_HOME` aponta para um temporario: teste nao mexe nos favoritos de
 * verdade de quem esta rodando a suite.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { translate } from "../src/i18n.mjs";

const CONFIG_TMP = fs.mkdtempSync(path.join(os.tmpdir(), "gitcraque-fav-config-"));
process.env.XDG_CONFIG_HOME = CONFIG_TMP;

const { addFavorite, favoritesFile, getFavorites, removeFavorite, reorderFavorites } =
  await import("../src/git/favorites.mjs");
const { getRecentRepos } = await import("../src/git/discover.mjs");
const { bootServer } = await import("./helpers/server.mjs");

/* ------------------------------------------------------------------ */

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Teste",
  GIT_AUTHOR_EMAIL: "t@e.dev",
  GIT_COMMITTER_NAME: "Teste",
  GIT_COMMITTER_EMAIL: "t@e.dev",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  LC_ALL: "C",
};
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" }).trim();

let LAB = "";
let api;
const CWD_ORIGINAL = process.cwd();
const P = (nome) => path.join(LAB, nome);
/** Os caminhos gravados sao os que o git reporta como raiz (ja em espaco real). */
const R = (nome) => fs.realpathSync(P(nome));

/** Zera a lista entre um teste e outro: cada um comeca do mesmo lugar. */
async function limpar() {
  const { entries } = await getFavorites();
  for (const entry of entries) await removeFavorite(entry.path);
}

before(async () => {
  LAB = fs.mkdtempSync(path.join(os.tmpdir(), "gitcraque-fav-lab-"));
  for (const nome of ["alpha", "beta", "gama"]) {
    const dir = P(nome);
    fs.mkdirSync(dir, { recursive: true });
    git(dir, "init", "-q", "-b", "main");
    fs.writeFileSync(path.join(dir, "a.txt"), "x\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "commit inicial");
  }
  fs.mkdirSync(P("so-uma-pasta"), { recursive: true });
  fs.writeFileSync(P("um-arquivo.txt"), "nao sou pasta\n");
  fs.mkdirSync(path.join(P("alpha"), "src", "deep"), { recursive: true });

  api = await bootServer(P("alpha"), { port: 5398 });
});

after(async () => {
  await api?.close();
  process.chdir(CWD_ORIGINAL);
  fs.rmSync(LAB, { recursive: true, force: true });
  fs.rmSync(CONFIG_TMP, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ *
 * A guarda
 * ------------------------------------------------------------------ */

test("addFavorite RECUSA pasta que nao e repositorio git", async () => {
  await limpar();
  await assert.rejects(
    () => addFavorite({ path: P("so-uma-pasta") }),
    (err) => err.status === 400 && err.message === "error.notARepository",
  );
  const { entries } = await getFavorites();
  assert.equal(entries.length, 0, "nada pode ter sido gravado");
});

test("addFavorite recusa caminho inexistente (404), arquivo (400) e vazio (400)", async () => {
  await assert.rejects(
    () => addFavorite({ path: P("nao-existe") }),
    (err) => err.status === 404,
  );
  await assert.rejects(
    () => addFavorite({ path: P("um-arquivo.txt") }),
    (err) => err.status === 400,
  );
  for (const ruim of ["", "   ", null, undefined, 42]) {
    await assert.rejects(
      () => addFavorite({ path: ruim }),
      (err) => err.status === 400,
    );
  }
});

/* ------------------------------------------------------------------ *
 * Adicionar
 * ------------------------------------------------------------------ */

test("addFavorite guarda o repositorio com nome, ramo e rotulo", async () => {
  await limpar();
  const { entries, file } = await addFavorite({ path: P("alpha"), label: "  Projeto Alfa  " });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].path, R("alpha"));
  assert.equal(entries[0].name, "alpha");
  assert.equal(entries[0].label, "Projeto Alfa", "o rotulo entra aparado");
  assert.equal(entries[0].branch, "main");
  assert.equal(entries[0].exists, true);
  assert.equal(entries[0].order, 0);
  assert.ok(entries[0].addedAt > 0);
  assert.equal(file, favoritesFile());
  assert.equal(path.dirname(file), path.join(CONFIG_TMP, "gitcraque"));
});

test("favoritar por uma SUBPASTA guarda a raiz do repositorio", async () => {
  await limpar();
  const { entries } = await addFavorite({ path: path.join(P("alpha"), "src", "deep") });
  assert.equal(entries[0].path, R("alpha"), "guardar a subpasta duplicaria o mesmo repo depois");
});

test("repetir o add NAO duplica: atualiza o rotulo e mantem a posicao", async () => {
  await limpar();
  await addFavorite({ path: P("alpha"), label: "Alfa" });
  await addFavorite({ path: P("beta") });
  await addFavorite({ path: P("gama") });

  const depois = await addFavorite({ path: P("alpha"), label: "Alfa renomeado" });
  const caminhos = depois.entries.map((e) => e.path);

  assert.equal(caminhos.length, 3, "repetir nao pode criar uma segunda entrada");
  assert.deepEqual(caminhos, [R("alpha"), R("beta"), R("gama")], "a ordem manual fica de pe");
  assert.equal(depois.entries[0].label, "Alfa renomeado");

  // Sem rotulo novo, o antigo sobrevive.
  const semRotulo = await addFavorite({ path: P("alpha") });
  assert.equal(semRotulo.entries[0].label, "Alfa renomeado");
});

test("favorito novo entra no FIM — nao empurra a lista que a pessoa arrumou", async () => {
  await limpar();
  await addFavorite({ path: P("alpha") });
  await addFavorite({ path: P("beta") });
  const { entries } = await addFavorite({ path: P("gama") });
  assert.deepEqual(
    entries.map((e) => [e.name, e.order]),
    [
      ["alpha", 0],
      ["beta", 1],
      ["gama", 2],
    ],
  );
});

test("favorito nao e recente: fixar nao mexe no historico de recentes", async () => {
  await limpar();
  const antes = await getRecentRepos();
  await addFavorite({ path: P("gama") });
  const depois = await getRecentRepos();
  assert.equal(depois.entries.length, antes.entries.length, "as duas listas sao independentes");
});

test("addFavorite recusa label que nao e texto", async () => {
  await assert.rejects(
    () => addFavorite({ path: P("alpha"), label: 42 }),
    (err) => err.status === 400,
  );
});

/* ------------------------------------------------------------------ *
 * Remover e reordenar
 * ------------------------------------------------------------------ */

test("removeFavorite tira so o pedido e redensifica a ordem", async () => {
  await limpar();
  await addFavorite({ path: P("alpha") });
  await addFavorite({ path: P("beta") });
  await addFavorite({ path: P("gama") });

  const { entries } = await removeFavorite(P("beta"));
  assert.deepEqual(
    entries.map((e) => [e.name, e.order]),
    [
      ["alpha", 0],
      ["gama", 1],
    ],
  );
});

test("removeFavorite exige path e ignora caminho que nao esta na lista", async () => {
  await limpar();
  await addFavorite({ path: P("alpha") });
  const igual = await removeFavorite(P("beta"));
  assert.equal(igual.entries.length, 1, "remover o que nao esta la nao e erro nem apaga nada");

  await assert.rejects(
    () => removeFavorite(""),
    (err) => err.status === 400,
  );
});

test("reorderFavorites reescreve order na ordem recebida", async () => {
  await limpar();
  await addFavorite({ path: P("alpha") });
  await addFavorite({ path: P("beta") });
  await addFavorite({ path: P("gama") });

  const { entries } = await reorderFavorites([R("gama"), R("alpha"), R("beta")]);
  assert.deepEqual(
    entries.map((e) => [e.name, e.order]),
    [
      ["gama", 0],
      ["alpha", 1],
      ["beta", 2],
    ],
  );

  // E a ordem sobrevive a uma releitura do disco.
  const relido = await getFavorites();
  assert.deepEqual(relido.entries.map((e) => e.name), ["gama", "alpha", "beta"]);
});

test("reorder ignora caminho desconhecido e poe o ausente no fim, na ordem relativa", async () => {
  await limpar();
  await addFavorite({ path: P("alpha") });
  await addFavorite({ path: P("beta") });
  await addFavorite({ path: P("gama") });

  const { entries } = await reorderFavorites([P("/nem/existe"), R("gama")]);
  assert.deepEqual(
    entries.map((e) => e.name),
    ["gama", "alpha", "beta"],
    "gama foi citado; alpha e beta caem no fim mantendo a ordem que tinham",
  );
});

test("reorderFavorites recusa corpo que nao e lista de strings", async () => {
  for (const ruim of [undefined, null, "alpha", 42, [1, 2], [null]]) {
    await assert.rejects(
      () => reorderFavorites(ruim),
      (err) => err.status === 400,
    );
  }
});

/* ------------------------------------------------------------------ *
 * Persistencia
 * ------------------------------------------------------------------ */

test("favorito cuja pasta sumiu vem com exists:false em vez de estourar", async () => {
  await limpar();
  const efemero = P("efemero");
  fs.mkdirSync(efemero, { recursive: true });
  git(efemero, "init", "-q", "-b", "principal");
  await addFavorite({ path: efemero, label: "Vai sumir" });
  fs.rmSync(efemero, { recursive: true, force: true });

  const { entries } = await getFavorites();
  const sumido = entries.find((e) => e.name === "efemero");
  assert.equal(sumido.exists, false);
  assert.equal(sumido.label, "Vai sumir", "o favorito continua na lista: e escolha, nao historico");
  assert.equal(sumido.branch, "principal", "mantem o ultimo ramo conhecido");
});

test("o arquivo e gravado com permissao 0600 e formato versionado", async () => {
  await limpar();
  await addFavorite({ path: P("alpha") });

  const file = favoritesFile();
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const bruto = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(bruto.version, 1);
  assert.equal(bruto.entries.length, 1);
  assert.equal(bruto.entries[0].path, R("alpha"));

  // Nao sobra temporario da gravacao atomica.
  const sobras = fs.readdirSync(path.dirname(file)).filter((n) => n.endsWith(".tmp"));
  assert.deepEqual(sobras, []);
});

test("arquivo corrompido nao derruba nada: a lista volta vazia", async () => {
  fs.writeFileSync(favoritesFile(), "{ isto nao e json valido");
  const { entries } = await getFavorites();
  assert.deepEqual(entries, []);

  // E gravar por cima conserta o arquivo.
  await addFavorite({ path: P("beta") });
  const depois = await getFavorites();
  assert.equal(depois.entries.length, 1);
});

test("entrada editada na mao e saneada: ordem esparsa, campo faltando, duplicata", async () => {
  fs.writeFileSync(
    favoritesFile(),
    JSON.stringify({
      version: 1,
      entries: [
        { path: R("gama"), order: 90 },
        { path: R("alpha"), order: 10, label: "Alfa" },
        { path: R("alpha"), order: 11 },
        { path: "   ", order: 1 },
        "lixo",
      ],
    }),
  );

  const { entries } = await getFavorites();
  assert.deepEqual(entries.map((e) => e.name), ["alpha", "gama"], "ordem esparsa vira ordem densa");
  assert.deepEqual(entries.map((e) => e.order), [0, 1]);
  assert.equal(entries[0].label, "Alfa");
  assert.equal(entries[0].branch, "main", "branch ausente no disco e recalculado");
});

/* ------------------------------------------------------------------ *
 * Pela porta
 * ------------------------------------------------------------------ */

test("as quatro rotas de favoritos respondem pelo HTTP", async () => {
  await limpar();

  const vazio = await api.get("/api/repos/favorites");
  assert.equal(vazio.status, 200);
  assert.deepEqual(vazio.json.entries, []);
  assert.equal(vazio.json.file, favoritesFile());

  const add = await api.post("/api/repos/favorites/add", { path: P("beta"), label: "Beta" });
  assert.equal(add.status, 200);
  assert.equal(add.json.entries[0].label, "Beta");
  await api.post("/api/repos/favorites/add", { path: P("alpha") });

  const reordenado = await api.post("/api/repos/favorites/reorder", {
    paths: [R("alpha"), R("beta")],
  });
  assert.deepEqual(reordenado.json.entries.map((e) => e.name), ["alpha", "beta"]);

  const removido = await api.post("/api/repos/favorites/remove", { path: R("alpha") });
  assert.deepEqual(removido.json.entries.map((e) => e.name), ["beta"]);

  // A guarda tambem vale pela porta.
  const recusado = await api.post("/api/repos/favorites/add", { path: P("so-uma-pasta") });
  assert.equal(recusado.status, 400);
  assert.equal(recusado.json.error, translate("pt", "error.notARepository"));
});

test("corpo invalido nas rotas de favoritos e 400, nunca 500", async () => {
  const semPath = await api.post("/api/repos/favorites/add", {});
  assert.equal(semPath.status, 400);

  const semPaths = await api.post("/api/repos/favorites/reorder", {});
  assert.equal(semPaths.status, 400);

  const removeSemPath = await api.post("/api/repos/favorites/remove", {});
  assert.equal(removeSemPath.status, 400);
});
