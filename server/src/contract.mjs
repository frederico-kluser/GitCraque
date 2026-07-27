/**
 * Espelho em runtime do contrato de `web/src/types/git.ts`.
 * Serve como tabela de rotas canonica: se uma rota nao esta aqui, ela nao existe.
 *
 * O backend REGISTRA exatamente estes pares (metodo, caminho). O cliente REST
 * tipado (`web/src/lib/api.ts`) chama exatamente estes mesmos caminhos.
 */

export const API_PREFIX = "/api";
export const WS_PATH = "/ws";

/** Porta padrao do backend. O Vite (5273) faz proxy de /api e /ws para ca. */
export const DEFAULT_PORT = 5271;

/**
 * O formato do log e MANDATORIO e imutavel — o parser depende dele campo a campo.
 * Campos: %H hash | %P pais | %an autor | %ae email | %s assunto | %ar data rel | %d decoracao
 */
export const LOG_PRETTY_FORMAT = "%H|%P|%an|%ae|%s|%ar|%d";
export const LOG_ARGS = ["log", `--pretty=format:${LOG_PRETTY_FORMAT}`, "--all", "--topo-order"];

/** Tabela de rotas: [metodo, padrao]. `:param` vira grupo nomeado no router. */
export const ROUTES = [
  ["GET", "/health"],
  ["GET", "/repo"],

  ["GET", "/log"],
  ["GET", "/commit/:hash"],
  ["GET", "/diff"],

  ["GET", "/refs"],
  ["GET", "/status"],

  ["GET", "/worktrees"],
  ["POST", "/worktrees/switch"],
  ["POST", "/worktrees/add"],
  ["POST", "/worktrees/remove"],
  ["POST", "/worktrees/prune"],

  ["POST", "/branch/create"],
  ["POST", "/branch/delete-local"],
  ["POST", "/branch/delete-remote"],
  ["POST", "/branch/rename"],
  ["POST", "/checkout"],

  ["GET", "/remotes"],
  ["POST", "/remotes/add"],
  ["POST", "/remotes/remove"],
  ["POST", "/remotes/set-url"],

  ["POST", "/net/fetch"],
  ["POST", "/net/pull"],
  ["POST", "/net/push"],

  ["POST", "/ops/cherry-pick"],
  ["POST", "/ops/merge"],
  ["POST", "/ops/rebase"],
  ["POST", "/ops/reset"],
  ["POST", "/ops/revert"],
  ["POST", "/ops/squash"],
  ["POST", "/ops/abort"],
  ["POST", "/ops/continue"],

  ["POST", "/stage"],
  ["POST", "/unstage"],
  ["POST", "/discard"],
  ["POST", "/commit"],

  ["POST", "/stash/push"],
  ["POST", "/stash/apply"],
  ["POST", "/stash/drop"],

  ["POST", "/tag/create"],
  ["POST", "/tag/delete"],

  ["GET", "/credentials"],
  ["POST", "/credentials"],
  ["DELETE", "/credentials/:host"],

  ["POST", "/raw"],
];

/** Tipos de evento que o servidor pode emitir no WebSocket. */
export const SERVER_EVENTS = /** @type {const} */ ([
  "hello",
  "cwd:changed",
  "repo:changed",
  "git:command",
  "op:progress",
  "credentials:needed",
  "credentials:resolved",
  "error",
  "pong",
]);

/** Tipos de evento que o cliente pode enviar. */
export const CLIENT_EVENTS = /** @type {const} */ ([
  "ping",
  "credentials:provide",
  "credentials:cancel",
  "refresh",
]);

/** Motivos de `repo:changed`. */
export const CHANGE_REASONS = /** @type {const} */ ([
  "refs",
  "head",
  "index",
  "worktree",
  "config",
  "rebase-state",
  "manual",
]);
