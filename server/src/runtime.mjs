/**
 * Singletons compartilhados do processo.
 *
 * Existe para quebrar ciclos de import: `git/exec.mjs` precisa falar com o hub
 * do WebSocket e com o watcher, mas os dois precisam do exec. Quem monta o
 * servidor preenche este objeto no boot; os modulos leem por referencia.
 *
 * INVARIANTE: UM SERVIDOR POR PROCESSO. `createServer()` sobrescreve estes
 * campos, entao subir um segundo servidor no mesmo processo sequestra o hub, o
 * watcher e o cofre do primeiro — que passa a nao emitir mais nada pelo
 * WebSocket, silenciosamente. Em producao isso nunca acontece (um `gitcraque`,
 * um processo); em teste, cada arquivo que precise de mais de um servidor tem
 * de ser um arquivo separado, porque o `node --test` da um processo por arquivo.
 * Ver `test/static-serving.test.mjs`.
 */
export const runtime = {
  /** @type {import("./ws/hub.mjs").Hub | null} */
  hub: null,
  /** @type {import("./watcher.mjs").Watcher | null} */
  watcher: null,
  /** @type {import("./trampoline/vault.mjs").Vault | null} */
  vault: null,
  /** Variaveis de ambiente do trampolim, injetadas em todo comando git. */
  trampolineEnv: /** @type {Record<string, string>} */ ({}),
  /** Versao do git detectada no boot ("2.43.0"). */
  gitVersion: "",
  /** Versao do proprio gitcraque. */
  version: "0.0.0",
  /** true quando o servidor nao serve estaticos (o Vite serve). */
  dev: false,
};
