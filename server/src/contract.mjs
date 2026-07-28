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
  ["POST", "/branch/delete-all"],
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

  // Seletor de repositorios da maquina. Sem estas rotas, subir o gitcraque
  // fora de um repositorio e um beco sem saida.
  ["GET", "/fs/roots"],
  ["GET", "/fs/list"],
  ["GET", "/repos/recent"],
  // O caminho vai no CORPO, nao na url: caminho absoluto tem barra e nao cabe
  // num :param sem virar um festival de encoding.
  ["POST", "/repos/recent/remove"],
  ["POST", "/repos/scan"],
  // Busca no historico de descobertas: le o banco, nao o disco. A varredura
  // continua sendo a rota acima, explicita e com orcamento.
  ["GET", "/repos/search"],
  ["POST", "/repos/open"],
  ["POST", "/repos/init"],

  // Projetos favoritos: escolha explicita e permanente, ao contrario dos
  // recentes, que sao historico automatico e rotativo.
  ["GET", "/repos/favorites"],
  ["POST", "/repos/favorites/add"],
  ["POST", "/repos/favorites/remove"],
  ["POST", "/repos/favorites/reorder"],

  // Conteudo de um arquivo, para o visualizador (markdown renderizado e cru).
  ["GET", "/file"],

  ["POST", "/raw"],

  // Agente: microfone -> transcricao -> pi coding agent.
  // A chave da OpenRouter e UMA so e paga as duas pernas (transcricao e agente).
  ["GET", "/ai/status"],
  ["POST", "/ai/key"],
  ["DELETE", "/ai/key"],
  ["POST", "/ai/transcribe"],
  ["POST", "/ai/run"],
  ["POST", "/ai/abort"],
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
  // Passo do agente (comando disparado, texto, erro), o veredito e a falha.
  "ai:event",
  "ai:done",
  "ai:error",
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

/* ------------------------------------------------------------------ *
 * Acrescimos do backend (aditivos — nada acima foi removido/renomeado)
 * ------------------------------------------------------------------ */

/** Endereco padrao de escuta. NUNCA 0.0.0.0: o servidor executa git na maquina. */
export const DEFAULT_HOST = "127.0.0.1";

/** Quantas portas seguintes tentar quando a padrao esta ocupada. */
export const PORT_FALLBACK_TRIES = 10;

/** Limite do corpo JSON aceito pelo roteador. */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Timeout padrao de um comando git e teto de buffer capturado. */
export const GIT_TIMEOUT_MS = 120_000;
export const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

/** Debounce do watcher do git-dir. */
export const WATCH_DEBOUNCE_MS = 120;

/** Janela extra de supressao do watcher depois que um comando mutante termina. */
export const WATCH_SUPPRESS_TAIL_MS = 250;

/** Quanto o trampolim espera a UI responder `credentials:provide`. */
export const ASKPASS_TIMEOUT_MS = 120_000;

/** Nomes das variaveis de ambiente da ponte askpass <-> cofre. */
export const ENV_ASKPASS_SOCK = "GITCRAQUE_ASKPASS_SOCK";
export const ENV_ASKPASS_NONCE = "GITCRAQUE_ASKPASS_NONCE";

/** Nomes das variaveis de ambiente do proxy-editor do squash. */
export const ENV_SQUASH_HASHES = "GITCRAQUE_SQUASH_HASHES";
export const ENV_SQUASH_MODE = "GITCRAQUE_SQUASH_MODE";
export const ENV_SQUASH_AUDIT = "GITCRAQUE_SQUASH_AUDIT";

/**
 * Prioridade dos motivos de `repo:changed` quando o debounce agrupa varios.
 * Indice menor ganha.
 */
export const CHANGE_REASON_PRIORITY = /** @type {const} */ ([
  "rebase-state",
  "head",
  "refs",
  "index",
  "config",
  "worktree",
  "manual",
]);

/**
 * Campos que o backend ACRESCENTA aos payloads de `web/src/types/git.ts`.
 *
 * Nada aqui remove ou renomeia campo do contrato: sao extras que o front-end
 * pode ignorar sem prejuizo. Estao listados para que a proxima pessoa que
 * mexer nos tipos saiba que eles ja existem no JSON.
 */
export const EXTRA_RESPONSE_FIELDS = {
  /** SquashResult ganha o rastro do plano executado. */
  "SquashResult.base": "commit-base usado no `git rebase -i`, ou a string --root",
  "SquashResult.mode": '"squash" ou "fixup"',
  "SquashResult.commits": "hashes completos ja em ordem topologica (mais antigo primeiro)",
  /**
   * true quando o git guardou alteracoes pendentes antes de reescrever o
   * historico e as devolveu depois. Sai em toda resposta de comando que usa
   * `--autostash` (POST /ops/squash e POST /ops/rebase).
   */
  "GitCommandResult.autostashed": "houve `git stash` automatico durante a operacao",
  "SquashResult.autostashed": "idem, no resultado do squash",
  /** Worktree ganha o motivo da poda, irmao de `lockReason`. */
  "Worktree.pruneReason": "motivo que o git deu na flag `prunable`",
  /** CredentialEntry ja preve `masked`; o backend sempre o preenche. */
  "CredentialsPayload.entries[].masked": "ultimos 4 caracteres do token, o resto em asterisco",
};

/**
 * Comandos que reescrevem historico rodam com `--autostash` por padrao.
 *
 * Numa GUI a working tree quase nunca esta limpa — arquivo modificado e
 * arquivo nao rastreado sao o estado normal de quem trabalha. Sem isso, o
 * `git rebase` recusa com "cannot rebase: You have unstaged changes" e o
 * usuario e obrigado a limpar a arvore na mao antes de clicar em "squash".
 * `POST /ops/rebase` aceita `autostash: false` para voltar ao git cru.
 */
export const AUTOSTASH_BY_DEFAULT = true;
