/**
 * A memoria de projetos do gitcraque — `~/.config/gitcraque/gitcraque.db`.
 *
 * Substitui os dois arquivos JSON que moravam em `store.mjs` e acrescenta uma
 * terceira lista que nao existia:
 *
 *   recents     historico automatico de repositorios abertos, rotativo
 *   favorites   escolha explicita, permanente, com ordem manual
 *   discovered  TODA pasta git que a varredura ou a navegacao ja viu
 *
 * Por que SQL, e nao mais um JSON. A lista `discovered` cresce sem teto e e
 * consultada por texto ("ache tudo que tenha 'api' no nome ou no caminho"),
 * inclusive por caminhos que ninguem abriu nunca. Fazer isso relendo e
 * refiltrando um JSON inteiro a cada tecla e a receita para o seletor travar
 * numa maquina com centenas de repositorios. Um `LIKE` com indice nao trava.
 *
 * `node:sqlite` e EMBUTIDO no Node (>= 22.5). Isto NAO viola a regra de uma
 * dependencia so (`ws`): nada foi instalado. Em troca, o `engines` do
 * package.json subiu para `>=22.5.0`.
 *
 * TRES INVARIANTES QUE O CODIGO ABAIXO PROTEGE:
 *
 *  1. `XDG_CONFIG_HOME` e lido a CADA chamada, nunca no carregamento do modulo,
 *     e a conexao e guardada com o caminho que a abriu. A suite aponta a
 *     variavel para um temporario no meio da execucao; uma conexao cacheada sem
 *     essa chave escreveria na configuracao real de quem roda os testes.
 *  2. O arquivo nasce 0600, como os JSON nasciam. Os caminhos dos repositorios
 *     de alguem nao sao assunto dos outros usuarios da maquina — e o sqlite
 *     cria com a umask, que costuma ser 0644.
 *  3. Falhar em gravar NUNCA derruba uma operacao de git. Os recentes e os
 *     descobertos sao efeito colateral: `quieto()` engole. Os favoritos sao a
 *     operacao que a pessoa pediu, entao esses propagam o erro — a UI precisa
 *     saber, senao mostra como salvo o que nao foi.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { readStoreSync, storePath } from "./store.mjs";

/** Versao do schema. Sobe quando as tabelas mudarem de forma. */
const SCHEMA_VERSION = 1;

/** `~/.config/gitcraque/gitcraque.db` (respeita XDG_CONFIG_HOME). */
export function dbFile() {
  return storePath("gitcraque.db");
}

/* ------------------------------------------------------------------ *
 * Conexao
 * ------------------------------------------------------------------ */

/** A conexao viva, com o caminho que a abriu — ver invariante 1 no cabecalho. */
let aberto = { file: "", db: null };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS recents (
  path            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  branch          TEXT,
  last_opened_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  path      TEXT PRIMARY KEY,
  label     TEXT NOT NULL DEFAULT '',
  name      TEXT NOT NULL,
  branch    TEXT,
  position  INTEGER NOT NULL,
  added_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS discovered (
  path           TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  branch         TEXT,
  bare           INTEGER NOT NULL DEFAULT 0,
  linked_worktree INTEGER NOT NULL DEFAULT 0,
  nested         INTEGER NOT NULL DEFAULT 0,
  parent_repo    TEXT,
  source         TEXT NOT NULL,
  first_seen_at  INTEGER NOT NULL,
  last_seen_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS discovered_by_name ON discovered(name);
CREATE INDEX IF NOT EXISTS discovered_by_seen ON discovered(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS favorites_by_position ON favorites(position);
CREATE INDEX IF NOT EXISTS recents_by_opened ON recents(last_opened_at DESC);
`;

/**
 * A conexao com o banco, criando arquivo e schema na primeira vez.
 *
 * Sincrona de proposito: `DatabaseSync` e sincrono, e uma camada de promises em
 * volta de operacoes que ja bloqueiam so daria a impressao falsa de que ha
 * concorrencia a considerar aqui.
 */
export function db() {
  const file = dbFile();
  if (aberto.db && aberto.file === file) return aberto.db;

  // Trocou de XDG no meio da execucao (a suite faz isso): fecha a antiga em vez
  // de vazar o descritor.
  if (aberto.db) {
    try {
      aberto.db.close();
    } catch {
      /* ja fechada */
    }
    aberto = { file: "", db: null };
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });

  let conexao;
  try {
    conexao = abrir(file);
  } catch (err) {
    // Arquivo que nao e um banco. Herdamos a postura dos JSON: "configuracao
    // corrompida nao pode impedir o app de subir". So que aqui ela precisa de
    // um passo a mais — um JSON quebrado era simplesmente sobrescrito na
    // proxima gravacao, um sqlite quebrado faz TODA operacao falhar para
    // sempre. Entao poe de lado e comeca limpo.
    //
    // Renomeia em vez de apagar: se o arquivo era recuperavel, quem quiser
    // ainda tem por onde tentar. Se nem renomear der certo, o erro sobe — ai
    // e disco ou permissao, e nao ha o que contornar.
    if (!ehBancoInvalido(err)) throw err;
    fs.renameSync(file, `${file}.corrompido-${process.pid}`);
    for (const sufixo of ["-wal", "-shm"]) {
      try {
        fs.rmSync(`${file}${sufixo}`, { force: true });
      } catch {
        /* pode nem existir */
      }
    }
    conexao = abrir(file);
  }

  aberto = { file, db: conexao };
  return conexao;
}

/** O erro diz que o arquivo nao e um banco sqlite? */
const ehBancoInvalido = (err) =>
  /not a database|file is encrypted|malformed|SQLITE_NOTADB|SQLITE_CORRUPT/i.test(
    String(err?.message ?? ""),
  );

/** Abre, aplica o schema, migra na primeira vez e crava a permissao. */
function abrir(file) {
  const novo = !fs.existsSync(file);
  const conexao = new DatabaseSync(file);
  // WAL: a leitura da busca nao espera a escrita do historico de descobertas.
  conexao.exec("PRAGMA journal_mode = WAL");
  conexao.exec("PRAGMA synchronous = NORMAL");
  conexao.exec(SCHEMA);

  const versao = conexao.prepare("PRAGMA user_version").get()?.user_version ?? 0;
  if (versao < SCHEMA_VERSION) {
    if (versao === 0 && novo) importarJson(conexao);
    conexao.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }

  // Invariante 2: o sqlite cria com a umask, os JSON nasciam 0600.
  for (const sufixo of ["", "-wal", "-shm"]) {
    try {
      fs.chmodSync(`${file}${sufixo}`, 0o600);
    } catch {
      /* o -wal/-shm pode ainda nao existir */
    }
  }
  return conexao;
}

/** Fecha a conexao. So a suite precisa disto; o servidor vive com ela aberta. */
export function closeDb() {
  if (!aberto.db) return;
  try {
    aberto.db.close();
  } catch {
    /* ja fechada */
  }
  aberto = { file: "", db: null };
}

/* ------------------------------------------------------------------ *
 * Migracao dos JSON
 * ------------------------------------------------------------------ */

/**
 * Traz `recent.json` e `favorites.json` para dentro do banco, UMA vez, na
 * criacao dele.
 *
 * Os arquivos NAO sao apagados: viram backup. Custam alguns kB e sao a unica
 * saida de quem precisar voltar atras — apagar o historico de projetos de
 * alguem para economizar disco seria uma troca pessima.
 * @param {DatabaseSync} conexao
 */
function importarJson(conexao) {
  const recentes = readStoreSync(storePath("recent.json"));
  const favoritos = readStoreSync(storePath("favorites.json"));
  if (!recentes.length && !favoritos.length) return;

  const agora = Date.now();
  const porRecente = conexao.prepare(
    `INSERT OR IGNORE INTO recents (path, name, branch, last_opened_at)
     VALUES (?, ?, ?, ?)`,
  );
  const porFavorito = conexao.prepare(
    `INSERT OR IGNORE INTO favorites (path, label, name, branch, position, added_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  conexao.exec("BEGIN");
  try {
    for (const e of recentes) {
      if (!e || typeof e.path !== "string" || !e.path.trim()) continue;
      const resolvido = path.resolve(e.path);
      porRecente.run(
        resolvido,
        texto(e.name) || path.basename(resolvido) || resolvido,
        texto(e.branch) || null,
        numero(e.lastOpenedAt, agora),
      );
    }
    // A ordem manual dos favoritos e o dado mais caro de reconstruir: preserva
    // `order` como veio, so densificando.
    favoritos
      .filter((e) => e && typeof e.path === "string" && e.path.trim())
      .sort((a, b) => numero(a.order, 0) - numero(b.order, 0))
      .forEach((e, i) => {
        const resolvido = path.resolve(e.path);
        porFavorito.run(
          resolvido,
          texto(e.label),
          texto(e.name) || path.basename(resolvido) || resolvido,
          texto(e.branch) || null,
          i,
          numero(e.addedAt, agora),
        );
      });
    conexao.exec("COMMIT");
  } catch {
    conexao.exec("ROLLBACK");
    // JSON quebrado na configuracao nao pode impedir o app de subir — mesma
    // postura tolerante que `readStore` sempre teve.
  }
}

const texto = (v) => (typeof v === "string" ? v : "");
const numero = (v, padrao) => (Number.isFinite(Number(v)) ? Number(v) : padrao);

/* ------------------------------------------------------------------ *
 * Escrita que nao pode derrubar nada
 * ------------------------------------------------------------------ */

/**
 * Roda `fn` engolindo qualquer falha de banco. Para historico e descobertas —
 * ver invariante 3 no cabecalho.
 * @template T
 * @param {() => T} fn
 * @returns {T | undefined}
 */
export function quieto(fn) {
  try {
    return fn();
  } catch (e) {
    console.error("[gitcraque] db write:", e.message);
    return undefined;
  }
}
