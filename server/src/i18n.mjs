/**
 * I18N DO BACKEND — as mensagens de erro que a UI mostra em toast.
 *
 * O front-end tem catalogo proprio (`web/src/i18n`); este cobre o que NASCE
 * aqui: validacao de rota, guarda de caminho, recusa de squash. Sem ele, um
 * app inteiro em chines devolveria "path e obrigatorio" no primeiro erro.
 *
 * ── Como funciona ────────────────────────────────────────────────────
 * O erro carrega uma CHAVE no lugar da frase (`error.pathRequired`), e a
 * traducao acontece so na borda, em `sendError`, com o idioma daquela
 * requisicao. Duas consequencias que valem o desenho:
 *
 *  - a saida do PROPRIO git passa intacta. `commandResult` lanca com
 *    `result.error`, que nao e chave de catalogo nenhum — `translate` devolve
 *    `undefined` e a borda usa a string como veio. A regra do projeto (mensagem
 *    do git fica em ingles, como o git a emite) continua valendo de graca;
 *  - o servidor nao guarda idioma. Ele e um processo local que pode ter varias
 *    abas abertas; o idioma e da REQUISICAO, nunca do processo.
 *
 * ── De onde vem o idioma ─────────────────────────────────────────────
 *  1. `x-gitcraque-lang` — o que a pessoa escolheu no seletor da interface;
 *  2. `accept-language`  — o que o navegador pede, se a escolha nao veio;
 *  3. ingles.
 */

export const LOCALES = ["en", "pt", "es", "zh"];
export const DEFAULT_LOCALE = "en";

/** Cabecalho que o cliente usa para impor a escolha do seletor. */
export const LOCALE_HEADER = "x-gitcraque-lang";

/* ------------------------------------------------------------------ */
/* Catalogos                                                           */
/* ------------------------------------------------------------------ */

/**
 * Uma chave por mensagem, o mesmo conjunto nos quatro idiomas.
 * `{nome}` interpola.
 */
const MESSAGES = {
  en: {
    "error.internal": "internal error",
    "error.gitFailed": "the git command failed",
    "error.bodyMustBeObject": "the body must be a JSON object",
    "error.bodyTooLarge": "body too large",
    "error.bodyLimit": "limit of {bytes} bytes",
    "error.bodyRead": "failed reading the body",
    "error.contentType": "unsupported content-type",
    "error.contentTypeDetail": "/api routes only accept application/json",
    "error.invalidJson": "invalid json",
    "error.vaultDown": "the credential vault did not start",
    "error.aiKeyEmpty": "the key is empty",
    "error.aiKeyMissing": "no OpenRouter key is set",
    "error.aiKeyRejected": "OpenRouter rejected the key",
    "error.aiUnreachable": "could not reach OpenRouter",
    "error.aiFailed": "the transcription failed",
    "error.aiAudioRequired": "no audio was sent",
    "error.aiAudioFormat": "unsupported audio format",
    "error.aiUtteranceRequired": "say or type something first",
    "error.aiBusy": "the agent is working — wait for it to finish",
    "error.originRefused": "origin refused",
    "error.originDetail": "{denial}. gitcraque only accepts requests from localhost.",
    "error.useWebSocket": "use WebSocket on /ws",
    "error.methodOutsideApi": "method not allowed outside /api",
    "error.devStatics": "--dev mode: the static files are served by Vite",
    "error.devStaticsDetail": "open http://127.0.0.1:5273",
    "error.methodMissing": "method {method} does not exist on {path}",
    "error.routeMissing": "route {method} {path} does not exist",

    "error.pathRequired": "path is required",
    "error.pathsRequired": "paths is required and only accepts strings",
    "error.pathsNotEmpty": "paths is required and cannot be empty",
    "error.pathsStrings": "paths only accepts non-empty strings",
    "error.messageRequired": "message is required",
    "error.labelText": "label must be text",

    "error.notAWorktree": "the path is not a worktree of this repository",
    "error.notInList": "{path} does not show up in 'git worktree list'",
    "error.bareWorktree": "cannot enter a bare worktree",
    "error.worktreeGone": "the worktree exists in git but is gone from disk",
    "error.worktreeGoneDetail": "{path} does not exist (run worktree prune)",
    "error.removeCurrentWorktree": "cannot remove the worktree the server is in",
    "error.removeCurrentWorktreeDetail": "switch worktrees before removing this one",

    "error.squashNeedsTwo": "commits needs at least 2 hashes",
    "error.squashNeedsTwoDetail": "squashing a single commit does nothing",
    "error.squashSameCommit": "the given hashes point at the same commit",
    "error.squashNoHistory": "could not list the history of HEAD",
    "error.squashNotOnHead": "some selected commits are not on the current HEAD",
    "error.squashMergeCommit": "cannot squash a merge commit",
    "error.squashNotMainline": "the selected commits are not all on the mainline",
    "error.squashNotMainlineDetail": "squash only works on the first-parent chain of HEAD",
    "error.squashNotContiguous": "the selected commits are not contiguous",
    "error.squashNotContiguousDetail": "select neighbouring commits on the same graph line",

    "error.pathMissing": "the path does not exist",
    "error.pathUnreadable": "the path does not exist or cannot be read",
    "error.notADirectory": "the path is not a directory",
    "error.dirNoPermission": "no permission to list this directory",
    "error.notARepository": "the directory is not a git repository",
    "error.alreadyRepository": "there is already a git repository in this folder",
    "error.fileNoPermission": "no permission to read this file",
    "error.fileMissing": "the file {path} does not exist in the working tree",

    "error.resetMode": "mode must be soft, mixed or hard",
    "error.opKind": "kind must be rebase, merge, cherry-pick or revert",
    "error.argsRequired": "args is required and cannot be empty",
    "error.argsStrings": "args only accepts strings",
    "error.argsDash": "{field} cannot start with \"-\"",
    "error.argsDashDetail": "git would read the value as a command-line option",
    "error.opInteractive": "it opens its own interface and would hang the server",
  },

  pt: {
    "error.internal": "erro interno",
    "error.gitFailed": "o comando git falhou",
    "error.bodyMustBeObject": "o corpo precisa ser um objeto JSON",
    "error.bodyTooLarge": "corpo grande demais",
    "error.bodyLimit": "limite de {bytes} bytes",
    "error.bodyRead": "falha lendo o corpo",
    "error.contentType": "content-type não suportado",
    "error.contentTypeDetail": "as rotas de /api só aceitam application/json",
    "error.invalidJson": "json inválido",
    "error.vaultDown": "o cofre de credenciais não subiu",
    "error.aiKeyEmpty": "a chave está vazia",
    "error.aiKeyMissing": "nenhuma chave da OpenRouter configurada",
    "error.aiKeyRejected": "a OpenRouter recusou a chave",
    "error.aiUnreachable": "não foi possível falar com a OpenRouter",
    "error.aiFailed": "a transcrição falhou",
    "error.aiAudioRequired": "nenhum áudio foi enviado",
    "error.aiAudioFormat": "formato de áudio não suportado",
    "error.aiUtteranceRequired": "fale ou digite alguma coisa primeiro",
    "error.aiBusy": "o agente está trabalhando — espere ele terminar",
    "error.originRefused": "origem recusada",
    "error.originDetail": "{denial}. O gitcraque só aceita requisições de localhost.",
    "error.useWebSocket": "use WebSocket em /ws",
    "error.methodOutsideApi": "método não permitido fora de /api",
    "error.devStatics": "modo --dev: os estáticos são servidos pelo Vite",
    "error.devStaticsDetail": "abra http://127.0.0.1:5273",
    "error.methodMissing": "método {method} não existe em {path}",
    "error.routeMissing": "rota {method} {path} não existe",

    "error.pathRequired": "path é obrigatório",
    "error.pathsRequired": "paths é obrigatório e só aceita strings",
    "error.pathsNotEmpty": "paths é obrigatório e não pode ser vazio",
    "error.pathsStrings": "paths só aceita strings não vazias",
    "error.messageRequired": "message é obrigatório",
    "error.labelText": "label tem de ser texto",

    "error.notAWorktree": "caminho não é uma worktree deste repositório",
    "error.notInList": "{path} não aparece em 'git worktree list'",
    "error.bareWorktree": "não dá para entrar numa worktree bare",
    "error.worktreeGone": "a worktree existe no git mas sumiu do disco",
    "error.worktreeGoneDetail": "{path} não existe (rode worktree prune)",
    "error.removeCurrentWorktree": "não dá para remover a worktree em que o servidor está",
    "error.removeCurrentWorktreeDetail": "troque de worktree antes de remover esta",

    "error.squashNeedsTwo": "commits precisa de pelo menos 2 hashes",
    "error.squashNeedsTwoDetail": "squash de um commit só não faz nada",
    "error.squashSameCommit": "os hashes informados apontam para o mesmo commit",
    "error.squashNoHistory": "não consegui listar o histórico do HEAD",
    "error.squashNotOnHead": "há commits selecionados que não estão no HEAD atual",
    "error.squashMergeCommit": "não dá para fazer squash de merge commit",
    "error.squashNotMainline": "os commits selecionados não estão todos na linha principal",
    "error.squashNotMainlineDetail":
      "só dá para fazer squash na cadeia de primeiro-pai do HEAD",
    "error.squashNotContiguous": "os commits selecionados não são contíguos",
    "error.squashNotContiguousDetail": "selecione commits vizinhos na mesma linha do grafo",

    "error.pathMissing": "caminho não existe",
    "error.pathUnreadable": "caminho não existe ou não pode ser lido",
    "error.notADirectory": "o caminho não é um diretório",
    "error.dirNoPermission": "sem permissão para listar este diretório",
    "error.notARepository": "o diretório não é um repositório git",
    "error.alreadyRepository": "já existe um repositório git nesta pasta",
    "error.fileNoPermission": "sem permissão para ler este arquivo",
    "error.fileMissing": "o arquivo {path} não existe na working tree",

    "error.resetMode": "mode deve ser soft, mixed ou hard",
    "error.opKind": "kind deve ser rebase, merge, cherry-pick ou revert",
    "error.argsRequired": "args é obrigatório e não pode ser vazio",
    "error.argsStrings": "args só aceita strings",
    "error.argsDash": "{field} não pode começar com \"-\"",
    "error.argsDashDetail": "o git leria o valor como opção de linha de comando",
    "error.opInteractive": "abre interface própria e travaria o servidor",
  },

  es: {
    "error.internal": "error interno",
    "error.gitFailed": "el comando git falló",
    "error.bodyMustBeObject": "el cuerpo tiene que ser un objeto JSON",
    "error.bodyTooLarge": "cuerpo demasiado grande",
    "error.bodyLimit": "límite de {bytes} bytes",
    "error.bodyRead": "fallo al leer el cuerpo",
    "error.contentType": "content-type no soportado",
    "error.contentTypeDetail": "las rutas de /api solo aceptan application/json",
    "error.invalidJson": "json inválido",
    "error.vaultDown": "la bóveda de credenciales no arrancó",
    "error.aiKeyEmpty": "la clave está vacía",
    "error.aiKeyMissing": "no hay ninguna clave de OpenRouter configurada",
    "error.aiKeyRejected": "OpenRouter rechazó la clave",
    "error.aiUnreachable": "no se pudo contactar con OpenRouter",
    "error.aiFailed": "la transcripción falló",
    "error.aiAudioRequired": "no se envió ningún audio",
    "error.aiAudioFormat": "formato de audio no admitido",
    "error.aiUtteranceRequired": "di o escribe algo primero",
    "error.aiBusy": "el agente está trabajando — espera a que termine",
    "error.originRefused": "origen rechazado",
    "error.originDetail": "{denial}. gitcraque solo acepta peticiones desde localhost.",
    "error.useWebSocket": "usa WebSocket en /ws",
    "error.methodOutsideApi": "método no permitido fuera de /api",
    "error.devStatics": "modo --dev: los estáticos los sirve Vite",
    "error.devStaticsDetail": "abre http://127.0.0.1:5273",
    "error.methodMissing": "el método {method} no existe en {path}",
    "error.routeMissing": "la ruta {method} {path} no existe",

    "error.pathRequired": "path es obligatorio",
    "error.pathsRequired": "paths es obligatorio y solo acepta strings",
    "error.pathsNotEmpty": "paths es obligatorio y no puede estar vacío",
    "error.pathsStrings": "paths solo acepta strings no vacías",
    "error.messageRequired": "message es obligatorio",
    "error.labelText": "label tiene que ser texto",

    "error.notAWorktree": "la ruta no es un worktree de este repositorio",
    "error.notInList": "{path} no aparece en 'git worktree list'",
    "error.bareWorktree": "no se puede entrar en un worktree bare",
    "error.worktreeGone": "el worktree existe en git pero desapareció del disco",
    "error.worktreeGoneDetail": "{path} no existe (ejecuta worktree prune)",
    "error.removeCurrentWorktree": "no se puede quitar el worktree en el que está el servidor",
    "error.removeCurrentWorktreeDetail": "cambia de worktree antes de quitar este",

    "error.squashNeedsTwo": "commits necesita al menos 2 hashes",
    "error.squashNeedsTwoDetail": "hacer squash de un solo commit no hace nada",
    "error.squashSameCommit": "los hashes indicados apuntan al mismo commit",
    "error.squashNoHistory": "no pude listar el historial de HEAD",
    "error.squashNotOnHead": "hay commits seleccionados que no están en el HEAD actual",
    "error.squashMergeCommit": "no se puede hacer squash de un merge commit",
    "error.squashNotMainline": "los commits seleccionados no están todos en la línea principal",
    "error.squashNotMainlineDetail":
      "solo se puede hacer squash en la cadena de primer padre de HEAD",
    "error.squashNotContiguous": "los commits seleccionados no son contiguos",
    "error.squashNotContiguousDetail": "selecciona commits vecinos en la misma línea del grafo",

    "error.pathMissing": "la ruta no existe",
    "error.pathUnreadable": "la ruta no existe o no se puede leer",
    "error.notADirectory": "la ruta no es un directorio",
    "error.dirNoPermission": "sin permiso para listar este directorio",
    "error.notARepository": "el directorio no es un repositorio git",
    "error.alreadyRepository": "ya existe un repositorio git en esta carpeta",
    "error.fileNoPermission": "sin permiso para leer este archivo",
    "error.fileMissing": "el archivo {path} no existe en el working tree",

    "error.resetMode": "mode tiene que ser soft, mixed o hard",
    "error.opKind": "kind tiene que ser rebase, merge, cherry-pick o revert",
    "error.argsRequired": "args es obligatorio y no puede estar vacío",
    "error.argsStrings": "args solo acepta strings",
    "error.argsDash": "{field} no puede empezar por \"-\"",
    "error.argsDashDetail": "git leería el valor como una opción de línea de comandos",
    "error.opInteractive": "abre su propia interfaz y bloquearía el servidor",
  },

  zh: {
    "error.internal": "内部错误",
    "error.gitFailed": "git 命令执行失败",
    "error.bodyMustBeObject": "请求体必须是一个 JSON 对象",
    "error.bodyTooLarge": "请求体过大",
    "error.bodyLimit": "上限为 {bytes} 字节",
    "error.bodyRead": "读取请求体失败",
    "error.contentType": "不支持的 content-type",
    "error.contentTypeDetail": "/api 路由只接受 application/json",
    "error.invalidJson": "无效的 json",
    "error.vaultDown": "凭据保险库未能启动",
    "error.aiKeyEmpty": "密钥为空",
    "error.aiKeyMissing": "尚未设置 OpenRouter 密钥",
    "error.aiKeyRejected": "OpenRouter 拒绝了该密钥",
    "error.aiUnreachable": "无法连接 OpenRouter",
    "error.aiFailed": "转写失败",
    "error.aiAudioRequired": "没有发送音频",
    "error.aiAudioFormat": "不支持的音频格式",
    "error.aiUtteranceRequired": "请先说话或输入内容",
    "error.aiBusy": "智能体正在工作 — 请等待它完成",
    "error.originRefused": "来源被拒绝",
    "error.originDetail": "{denial}。gitcraque 只接受来自 localhost 的请求。",
    "error.useWebSocket": "请在 /ws 上使用 WebSocket",
    "error.methodOutsideApi": "/api 之外不允许该方法",
    "error.devStatics": "--dev 模式：静态文件由 Vite 提供",
    "error.devStaticsDetail": "请打开 http://127.0.0.1:5273",
    "error.methodMissing": "{path} 上不存在 {method} 方法",
    "error.routeMissing": "路由 {method} {path} 不存在",

    "error.pathRequired": "path 是必填项",
    "error.pathsRequired": "paths 是必填项，且只接受字符串",
    "error.pathsNotEmpty": "paths 是必填项，且不能为空",
    "error.pathsStrings": "paths 只接受非空字符串",
    "error.messageRequired": "message 是必填项",
    "error.labelText": "label 必须是文本",

    "error.notAWorktree": "该路径不是此仓库的工作树",
    "error.notInList": "{path} 没有出现在 'git worktree list' 中",
    "error.bareWorktree": "无法进入裸工作树",
    "error.worktreeGone": "该工作树在 git 中存在，但已从磁盘上消失",
    "error.worktreeGoneDetail": "{path} 不存在（请运行 worktree prune）",
    "error.removeCurrentWorktree": "无法移除服务器当前所在的工作树",
    "error.removeCurrentWorktreeDetail": "请先切换工作树，再移除这一个",

    "error.squashNeedsTwo": "commits 至少需要 2 个哈希",
    "error.squashNeedsTwoDetail": "只压缩一个提交没有任何效果",
    "error.squashSameCommit": "给出的哈希指向同一个提交",
    "error.squashNoHistory": "无法列出 HEAD 的历史",
    "error.squashNotOnHead": "有些选中的提交不在当前 HEAD 上",
    "error.squashMergeCommit": "无法压缩合并提交",
    "error.squashNotMainline": "选中的提交并非都在主线上",
    "error.squashNotMainlineDetail": "只能在 HEAD 的第一父提交链上执行压缩",
    "error.squashNotContiguous": "选中的提交不连续",
    "error.squashNotContiguousDetail": "请在图的同一条线上选择相邻的提交",

    "error.pathMissing": "该路径不存在",
    "error.pathUnreadable": "该路径不存在或无法读取",
    "error.notADirectory": "该路径不是一个目录",
    "error.dirNoPermission": "没有权限列出该目录",
    "error.notARepository": "该目录不是一个 git 仓库",
    "error.alreadyRepository": "此文件夹中已经有一个 git 仓库",
    "error.fileNoPermission": "没有权限读取该文件",
    "error.fileMissing": "文件 {path} 不在工作区中",

    "error.resetMode": "mode 必须是 soft、mixed 或 hard",
    "error.opKind": "kind 必须是 rebase、merge、cherry-pick 或 revert",
    "error.argsRequired": "args 是必填项，且不能为空",
    "error.argsStrings": "args 只接受字符串",
    "error.argsDash": "{field} 不能以 \"-\" 开头",
    "error.argsDashDetail": "git 会把该值当作命令行选项来读取",
    "error.opInteractive": "它会打开自己的界面，从而卡住服务器",
  },
};

/* ------------------------------------------------------------------ */
/* Traducao                                                            */
/* ------------------------------------------------------------------ */

const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

const interpolate = (template, params) =>
  params
    ? template.replace(PLACEHOLDER, (whole, name) =>
        params[name] === undefined ? whole : String(params[name]),
      )
    : template;

/**
 * Traduz uma CHAVE. Devolve `undefined` quando a string nao e chave nenhuma —
 * e o que deixa a saida crua do git passar sem ser tocada.
 *
 * @param {string} locale
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string | undefined}
 */
export function translate(locale, key, params) {
  if (typeof key !== "string") return undefined;
  const table = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  const template = table[key] ?? MESSAGES[DEFAULT_LOCALE][key];
  return template === undefined ? undefined : interpolate(template, params);
}

/** `pt-BR` → `pt`; idioma que o servidor nao fala → null. */
function normalize(tag) {
  if (typeof tag !== "string") return null;
  const primary = tag.toLowerCase().replace("_", "-").split("-")[0].trim();
  return LOCALES.includes(primary) ? primary : null;
}

/**
 * O idioma DESTA requisicao. Nao ha estado global de idioma no servidor: um
 * processo local pode ter varias abas abertas, cada uma na sua lingua.
 *
 * @param {import("node:http").IncomingMessage} req
 */
export function pickLocale(req) {
  const headers = req?.headers ?? {};

  const explicit = normalize(headers[LOCALE_HEADER]);
  if (explicit) return explicit;

  // accept-language: "pt-BR,pt;q=0.9,en;q=0.8" — respeita a ordem de q.
  const accept = headers["accept-language"];
  if (typeof accept === "string") {
    const ranked = accept
      .split(",")
      .map((part) => {
        const [tag, ...rest] = part.trim().split(";");
        const q = rest.find((r) => r.trim().startsWith("q="));
        return { tag, q: q ? Number.parseFloat(q.split("=")[1]) : 1 };
      })
      .filter((entry) => Number.isFinite(entry.q))
      .sort((a, b) => b.q - a.q);
    for (const entry of ranked) {
      const locale = normalize(entry.tag);
      if (locale) return locale;
    }
  }

  return DEFAULT_LOCALE;
}
