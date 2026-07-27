/**
 * Helpers compartilhados pelos handlers.
 */
import { isConflict } from "../git/ops.mjs";
import { HttpError } from "../router.mjs";

/**
 * Normaliza a resposta de um comando git.
 *
 * A regra do produto: conflito NAO e erro de servidor. Um merge que parou em
 * conflito fez exatamente o que devia — a rota responde 200 com `ok: false` e
 * `pending` preenchido, e a UI oferece continuar/abortar. Falha de verdade
 * (branch inexistente, working tree suja) vira 409 com o envelope ApiError
 * carregando o comando inteiro.
 *
 * @param {import("../types.mjs").GitCommandResult} result
 */
export function commandResult(result) {
  if (result.ok || isConflict(result)) return result;
  const error = new HttpError(409, result.error || "o comando git falhou");
  error.command = result;
  throw error;
}

/** Query string -> booleano tolerante ("1", "true", "" presente). */
export function boolParam(value) {
  if (value === undefined || value === null) return false;
  if (value === "") return true;
  return value === "true" || value === "1" || value === true;
}

/** Query string -> inteiro, ou undefined. */
export function intParam(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Garante que o corpo veio como objeto. */
export function bodyOf(ctx) {
  const body = ctx.body;
  if (body && typeof body === "object" && !Array.isArray(body)) return body;
  throw new HttpError(400, "o corpo precisa ser um objeto JSON");
}
