/**
 * Estado do usuario em disco — `~/.config/gitcraque/*.json`.
 *
 * Dois arquivos irmaos moram aqui, com semantica OPOSTA de proposito:
 *
 *   recent.json     historico automatico, rotativo, com teto (RECENT_LIMIT)
 *   favorites.json  escolha explicita, permanente, sem teto, ordem manual
 *
 * O que os dois compartilham e a GRAVACAO, e ela nao pode ser duplicada:
 *
 *  - temporario + rename: o arquivo nunca fica pela metade, nem para quem le no
 *    meio da escrita. Escrever por cima e ser interrompido perderia a lista;
 *  - permissao 0600: os caminhos dos repositorios de alguem nao sao assunto dos
 *    outros usuarios da maquina;
 *  - leitura tolerante: arquivo ausente ou corrompido volta lista vazia. Um JSON
 *    quebrado na pasta de configuracao nao pode impedir o app de subir.
 *
 * `XDG_CONFIG_HOME` e lido a CADA chamada, nunca no carregamento do modulo: a
 * suite de testes aponta a variavel para um temporario e nao pode depender da
 * ordem de import para nao mexer na configuracao real de quem roda os testes.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Versao do formato gravado. Sobe quando o formato mudar de verdade. */
export const STORE_VERSION = 1;

/** Raiz da configuracao: `$XDG_CONFIG_HOME` ou `~/.config`. */
export function configHome() {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg && xdg.trim() ? xdg.trim() : path.join(os.homedir(), ".config");
}

/**
 * Caminho absoluto de um arquivo de estado.
 * @param {string} name por exemplo "recent.json"
 */
export function storePath(name) {
  return path.join(configHome(), "gitcraque", name);
}

/**
 * Le a lista de um arquivo de estado. Ausente ou corrompido => lista vazia.
 * @param {string} file
 * @returns {Promise<object[]>}
 */
export async function readStore(file) {
  try {
    const parsed = JSON.parse(await fsp.readFile(file, "utf8"));
    return Array.isArray(parsed?.entries) ? parsed.entries : [];
  } catch {
    return []; // arquivo ausente ou corrompido: comeca do zero, sem barulho
  }
}

/**
 * A MESMA leitura, sincrona. Existe para um unico chamador: a migracao dos
 * arquivos JSON para o banco em `db.mjs`, que roda dentro da abertura sincrona
 * do `DatabaseSync`. Duplicar a tolerancia a arquivo corrompido em outro lugar
 * era garantir que uma das duas copias ia envelhecer mais fraca.
 * @param {string} file
 * @returns {object[]}
 */
export function readStoreSync(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed?.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

/**
 * Grava a lista de forma atomica.
 *
 * `swallowErrors` existe porque os dois arquivos tem urgencia diferente: nao
 * conseguir gravar os RECENTES nunca pode derrubar uma operacao de git (o
 * historico e um efeito colateral), mas nao conseguir gravar os FAVORITOS e a
 * falha da propria operacao pedida — a UI precisa saber, senao mostra como
 * salvo o que nao foi.
 *
 * @param {string} file
 * @param {object[]} entries
 * @param {{swallowErrors?: boolean}} [options]
 */
export async function writeStore(file, entries, options = {}) {
  const payload = `${JSON.stringify({ version: STORE_VERSION, entries }, null, 2)}\n`;
  // pid no nome: duas instancias do gitcraque nao brigam pelo mesmo temporario
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(tmp, payload, { mode: 0o600 });
    await fsp.rename(tmp, file);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    if (options.swallowErrors) return;
    const error = new Error(`nao foi possivel gravar ${path.basename(file)}`);
    error.status = 500;
    error.detail = `${file}: ${err.code ?? err.message}`;
    throw error;
  }
}
