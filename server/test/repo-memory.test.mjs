/**
 * A memoria de projetos em SQL — `db.mjs`, o historico `discovered` e
 * `GET /api/repos/search`.
 *
 * O que este arquivo tem de provar, alem do feliz caminho:
 *
 *  1. A migracao dos JSON antigos acontece UMA vez, na criacao do banco, e
 *     preserva a ordem manual dos favoritos — o dado mais caro de reconstruir.
 *  2. Navegar e varrer ALIMENTAM o historico. E disso que a busca vive: um git
 *     interno que so a navegacao revelou tem de ser encontravel depois.
 *  3. A busca le o INDICE, nao o disco, e nao mente sobre pasta que sumiu.
 *  4. `_` e `%` no termo sao literais, nao curingas do LIKE.
 *  5. Banco ilegivel degrada para lista vazia em vez de derrubar o seletor: o
 *     historico e efeito colateral, nao a razao de o app existir.
 *
 * `XDG_CONFIG_HOME` aponta para um temporario, e o banco e criado DEPOIS de
 * plantar os JSON: e a unica forma de exercitar a migracao.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

const CONFIG_TMP = fs.mkdtempSync(path.join(os.tmpdir(), "gitcraque-mem-config-"));
process.env.XDG_CONFIG_HOME = CONFIG_TMP;

/* Os JSON legados sao plantados ANTES do primeiro import de `db.mjs`: a
 * migracao so roda na criacao do banco, e depois disso nao ha o que testar. */
const LAB = fs.mkdtempSync(path.join(os.tmpdir(), "gitcraque-mem-lab-"));

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

function repo(rel) {
  const dir = path.join(LAB, rel);
  fs.mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(dir, "a.txt"), "x\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "inicial");
  return fs.realpathSync(dir);
}

const VELHO_RECENTE = repo("projeto-antigo");
const VELHO_FAV_A = repo("fav-a");
const VELHO_FAV_B = repo("fav-b");
const EXTERNO = repo("area-externa/servico-api");
const PAI = repo("guarda-chuva");
const INTERNO = repo("guarda-chuva/api_interna");

fs.mkdirSync(path.join(CONFIG_TMP, "gitcraque"), { recursive: true });
fs.writeFileSync(
  path.join(CONFIG_TMP, "gitcraque", "recent.json"),
  JSON.stringify({
    version: 1,
    entries: [{ path: VELHO_RECENTE, name: "projeto-antigo", branch: "main", lastOpenedAt: 111 }],
  }),
);
fs.writeFileSync(
  path.join(CONFIG_TMP, "gitcraque", "favorites.json"),
  JSON.stringify({
    version: 1,
    // De proposito fora de ordem no arquivo: a migracao tem de respeitar `order`.
    entries: [
      { path: VELHO_FAV_B, label: "segundo", name: "fav-b", branch: "main", order: 1, addedAt: 2 },
      { path: VELHO_FAV_A, label: "primeiro", name: "fav-a", branch: "main", order: 0, addedAt: 1 },
    ],
  }),
);

const { closeDb, db, dbFile } = await import("../src/git/db.mjs");
const { getRecentRepos, listDirectory, scanForRepos } = await import("../src/git/discover.mjs");
const { getFavorites } = await import("../src/git/favorites.mjs");
const { searchRepos } = await import("../src/git/search.mjs");
const { bootServer } = await import("./helpers/server.mjs");

let api;
const CWD_ORIGINAL = process.cwd();

before(async () => {
  api = await bootServer(PAI);
});

after(async () => {
  process.chdir(CWD_ORIGINAL);
  await api?.close();
  closeDb();
  fs.rmSync(LAB, { recursive: true, force: true });
  fs.rmSync(CONFIG_TMP, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ *
 * Migracao
 * ------------------------------------------------------------------ */

test("o banco nasce em ~/.config/gitcraque e so o dono le", () => {
  db();
  assert.equal(dbFile(), path.join(CONFIG_TMP, "gitcraque", "gitcraque.db"));
  assert.equal(fs.statSync(dbFile()).mode & 0o777, 0o600, "os caminhos dos repos de alguem nao sao assunto dos outros usuarios");
});

test("a migracao traz os recentes do JSON antigo", async () => {
  const { entries } = await getRecentRepos();
  const antigo = entries.find((e) => e.path === VELHO_RECENTE);
  assert.ok(antigo, `o recente do JSON nao migrou: ${entries.map((e) => e.path).join(", ")}`);
  assert.equal(antigo.exists, true);
});

test("a migracao preserva a ORDEM MANUAL dos favoritos, nao a do arquivo", async () => {
  const { entries } = await getFavorites();
  const so = entries.filter((e) => e.path === VELHO_FAV_A || e.path === VELHO_FAV_B);
  assert.equal(so.length, 2);
  assert.equal(so[0].path, VELHO_FAV_A, "order:0 tem de vir primeiro, apesar de estar por ultimo no arquivo");
  assert.equal(so[0].label, "primeiro");
  assert.equal(so[1].path, VELHO_FAV_B);
});

test("os JSON antigos continuam no disco como backup", () => {
  assert.ok(fs.existsSync(path.join(CONFIG_TMP, "gitcraque", "recent.json")));
  assert.ok(fs.existsSync(path.join(CONFIG_TMP, "gitcraque", "favorites.json")));
});

/* ------------------------------------------------------------------ *
 * O historico de descobertas
 * ------------------------------------------------------------------ */

test("navegar registra no historico os repositorios avistados", async () => {
  await listDirectory(path.join(LAB, "area-externa"));
  const { entries } = await searchRepos({ q: "servico-api" });
  const achado = entries.find((e) => e.path === EXTERNO);
  assert.ok(achado, "o repositorio visto na navegacao tem de ficar no historico");
  assert.equal(achado.source, "browse");
});

test("navegar dentro de um repo marca os internos como aninhados", async () => {
  await listDirectory(PAI);
  const { entries } = await searchRepos({ q: "api_interna" });
  const achado = entries.find((e) => e.path === INTERNO);
  assert.ok(achado, "o git interno tem de entrar no historico");
  assert.equal(achado.nested, true);
  assert.equal(achado.parentRepo, PAI);
});

test("o proprio .git NAO entra no historico", async () => {
  // `.git` tem HEAD, objects e refs, entao a deteccao de bare o reconhece como
  // repositorio e a listagem o mostra assim. Registra-lo daria uma entrada
  // inutil por projeto na busca.
  await listDirectory(PAI);
  const { entries } = await searchRepos({ q: ".git" });
  assert.deepEqual(
    entries.filter((e) => e.path.endsWith(`${path.sep}.git`)),
    [],
    "o .git de um projeto nao e um projeto",
  );
});

test("a varredura tambem alimenta o historico, com ramo", async () => {
  await scanForRepos({ roots: [LAB], depth: 5 });
  const { entries } = await searchRepos({ q: "guarda-chuva" });
  const pai = entries.find((e) => e.path === PAI);
  assert.ok(pai);
  assert.equal(pai.branch, "main", "a varredura sabe o ramo e o historico tem de guardar");
});

test("a navegacao NAO apaga o ramo que a varredura ja descobriu", async () => {
  // A navegacao registra sem ramo; sobrescrever com null seria perder dado.
  await listDirectory(LAB);
  const { entries } = await searchRepos({ q: "guarda-chuva" });
  assert.equal(entries.find((e) => e.path === PAI)?.branch, "main");
});

/* ------------------------------------------------------------------ *
 * A busca
 * ------------------------------------------------------------------ */

test("a busca acha por pedaco do nome e por pedaco do caminho", async () => {
  const porNome = await searchRepos({ q: "servico" });
  assert.ok(porNome.entries.some((e) => e.path === EXTERNO));

  const porCaminho = await searchRepos({ q: "area-externa" });
  assert.ok(porCaminho.entries.some((e) => e.path === EXTERNO));
});

test("a busca poe na frente o nome que COMECA com o termo", async () => {
  const { entries } = await searchRepos({ q: "fav" });
  assert.ok(entries.length >= 2);
  assert.ok(
    entries[0].name.toLowerCase().startsWith("fav"),
    `esperava um nome comecando por "fav" no topo, veio ${entries[0].name}`,
  );
});

test("termo vazio devolve os ultimos vistos, para a lista abrir util", async () => {
  const { entries, query } = await searchRepos({ q: "  " });
  assert.equal(query, "");
  assert.ok(entries.length > 0);
});

test("`_` e `%` sao literais no termo, nao curingas do LIKE", async () => {
  // `api_interna` existe; `api%interna` nao. Sem escapar, o `_` casaria com
  // qualquer caractere e os dois trariam o mesmo resultado.
  const comUnderscore = await searchRepos({ q: "api_interna" });
  assert.ok(comUnderscore.entries.some((e) => e.path === INTERNO));

  const comPorcento = await searchRepos({ q: "api%interna" });
  assert.equal(comPorcento.entries.length, 0, "% nao pode virar curinga");
});

test("a busca nao mente sobre pasta que sumiu", async () => {
  const efemero = repo("some-logo");
  await listDirectory(LAB);
  fs.rmSync(efemero, { recursive: true, force: true });

  const { entries } = await searchRepos({ q: "some-logo" });
  const achado = entries.find((e) => e.path === efemero);
  assert.ok(achado, "continua no historico");
  assert.equal(achado.exists, false, "mas marcado como ausente do disco");
});

/* ------------------------------------------------------------------ *
 * A rota
 * ------------------------------------------------------------------ */

test("GET /api/repos/search responde com o payload da busca", async () => {
  const res = await api.get("/api/repos/search?q=servico-api");
  assert.equal(res.status, 200);
  assert.equal(res.json.query, "servico-api");
  assert.ok(res.json.entries.some((e) => e.path === EXTERNO));
  assert.ok(typeof res.json.total === "number");
});

test("GET /api/repos/search sem termo nao e erro", async () => {
  const res = await api.get("/api/repos/search");
  assert.equal(res.status, 200);
  assert.equal(res.json.query, "");
});

/* ------------------------------------------------------------------ *
 * Degradacao
 * ------------------------------------------------------------------ */

test("banco corrompido nao derruba o seletor, e o backup JSON salva os recentes", async () => {
  closeDb();
  fs.writeFileSync(dbFile(), "isto nao e um banco sqlite");

  // Nenhuma das duas leituras pode estourar.
  const { entries } = await getRecentRepos();
  const busca = await searchRepos({ q: "guarda-chuva" });

  // E aqui aparece o motivo de os JSON antigos NAO serem apagados na migracao:
  // o banco novo os reimporta, entao um arquivo corrompido nao leva junto o
  // historico de projetos de quem estava usando o app.
  assert.ok(
    entries.some((e) => e.path === VELHO_RECENTE),
    "o recente do backup JSON tem de voltar no banco recriado",
  );

  // `discovered` nao tem backup: e tabela nova, entao essa parte comeca do zero
  // e volta a se encher na primeira navegacao ou varredura.
  assert.deepEqual(busca.entries, [], "o historico de descobertas recomeca vazio");

  const postos = fs
    .readdirSync(path.join(CONFIG_TMP, "gitcraque"))
    .filter((n) => n.includes(".corrompido-"));
  assert.ok(postos.length > 0, "o banco ilegivel fica de lado, recuperavel, nao apagado");
});
