/**
 * A chave da OpenRouter — uma so, para as duas pernas.
 *
 * A MESMA chave paga a transcricao do microfone e roda o pi coding agent. Nao
 * ha duas credenciais para conciliar, e e por isso que este modulo existe
 * separado: quem resolve a chave nao precisa saber para que ela vai servir.
 *
 * ── Ordem de resolucao (a ESCOLHA EXPLICITA ganha da AMBIENTE) ────────
 *   1. o que a pessoa gravou pela interface (`~/.config/gitcraque/openrouter.json`)
 *   2. `OPENROUTER_API_KEY_FILE` — caminho de um arquivo com o valor
 *   3. `OPENROUTER_API_KEY` — a variavel de ambiente crua
 *
 * Portado de `huu/src/lib/api-key.ts`, com a inversao que aquele projeto ja
 * tinha aprendido na pratica: a variavel de ambiente esquecida num `.zshrc`
 * costuma estar VELHA, e quando ela ganhava da chave gravada o sintoma era um
 * 401 que ninguem conseguia explicar. O que a pessoa gravou agora vale mais.
 *
 * A gravacao reaproveita o `writeStore` do `git/store.mjs` — temporario +
 * rename, modo 0600 — em vez de abrir um segundo jeito de escrever segredo em
 * disco no mesmo projeto.
 */
import fsp from "node:fs/promises";

import { readStore, storePath, writeStore } from "../git/store.mjs";

/** Nome do arquivo de estado. Irmao de `recent.json` e `favorites.json`. */
export const KEY_FILE = "openrouter.json";

/** Variaveis de ambiente lidas, na ordem em que aparecem na resolucao. */
export const ENV_KEY_FILE = "OPENROUTER_API_KEY_FILE";
export const ENV_KEY = "OPENROUTER_API_KEY";

/** @typedef {"stored" | "env-file" | "env" | "none"} KeySource */

/**
 * Le o valor de um arquivo apontado por variavel de ambiente.
 *
 * Silencio proposital no erro: o caminho de um arquivo de segredo nao entra em
 * log. Ausente, ilegivel ou vazio contam todos como "nao forneceu".
 * @param {string | undefined} file
 * @returns {Promise<string>}
 */
async function readKeyFile(file) {
  if (!file) return "";
  try {
    return (await fsp.readFile(file, "utf8")).trim();
  } catch {
    return "";
  }
}

/**
 * A chave gravada pela interface. Vazio quando nao ha nenhuma.
 * @returns {Promise<string>}
 */
export async function loadStoredKey() {
  const entries = await readStore(storePath(KEY_FILE));
  const found = entries.find((e) => e && e.provider === "openrouter");
  return typeof found?.key === "string" ? found.key.trim() : "";
}

/**
 * Grava a chave. Recusa valor vazio — apagar e trabalho do `clearStoredKey`,
 * e as duas intencoes nao podem compartilhar a mesma chamada sem virar um
 * apagamento acidental por campo em branco.
 * @param {string} value
 */
export async function saveStoredKey(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    const error = new Error("error.aiKeyEmpty");
    error.status = 400;
    throw error;
  }
  await writeStore(storePath(KEY_FILE), [{ provider: "openrouter", key: trimmed }]);
}

/**
 * Apaga a chave gravada, devolvendo a resolucao para as camadas de ambiente.
 * @returns {Promise<boolean>} true quando havia algo para apagar
 */
export async function clearStoredKey() {
  const had = (await loadStoredKey()) !== "";
  await writeStore(storePath(KEY_FILE), []);
  return had;
}

/**
 * Resolve a chave e diz QUAL camada venceu — sem a origem, um 401 vira
 * adivinhacao sobre qual das tres credenciais o processo usou.
 * @returns {Promise<{value: string, source: KeySource}>}
 */
export async function resolveKey() {
  const stored = await loadStoredKey();
  if (stored) return { value: stored, source: "stored" };

  const fromFile = await readKeyFile(process.env[ENV_KEY_FILE]);
  if (fromFile) return { value: fromFile, source: "env-file" };

  const fromEnv = (process.env[ENV_KEY] ?? "").trim();
  if (fromEnv) return { value: fromEnv, source: "env" };

  return { value: "", source: "none" };
}

/**
 * Impressao digital exibivel: da para distinguir duas chaves, nao da para usar
 * nenhuma. E o unico formato em que a chave pode aparecer numa resposta HTTP.
 * @param {string} value
 */
export function maskKey(value) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (v.length <= 8) return "••••";
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}
