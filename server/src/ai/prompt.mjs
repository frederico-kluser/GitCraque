/**
 * O modelo de prompt — onde a fala do usuario vira instrucao para o agente.
 *
 * Funcao PURA de proposito: recebe o retrato do repositorio ja lido por quem
 * chamou e devolve texto. Nao roda git, nao toca rede, nao le disco. E o que
 * torna esta parte — a que mais vai mudar com o uso — testavel sem fixture.
 *
 * ── Por que o retrato do repositorio vai junto ───────────────────────
 * A transcricao erra nome proprio, e nome de branch e nome proprio. "feature
 * barra pagamento pics" e o que o microfone ouve; `feature/pagamento-pix` e o
 * que existe. O modelo de transcricao escolhido nao aceita vocabulario de
 * dominio pela OpenRouter (ver `openrouter.mjs`), entao a correcao acontece
 * AQUI: a lista real de refs vai no prompt e o agente — que tem 1M de contexto
 * e sabe raciocinar — faz a ligacao. Sai melhor do que sairia no STT, porque o
 * agente tambem sabe qual branch faz sentido para o que foi pedido.
 */

/** Quantas refs de cada tipo cabem no retrato antes de virar ruido. */
export const MAX_BRANCHES = 200;
export const MAX_REMOTE_BRANCHES = 100;
export const MAX_TAGS = 100;

/**
 * Corta uma lista e diz o que ficou de fora. Truncar em silencio faria o agente
 * concluir que a branch nao existe quando ela so nao coube.
 * @param {string[]} names
 * @param {number} cap
 * @returns {string}
 */
function listOf(names, cap) {
  const all = names.filter(Boolean);
  if (all.length === 0) return "(nenhuma)";
  const shown = all.slice(0, cap);
  const rest = all.length - shown.length;
  const suffix = rest > 0 ? `, ... e mais ${rest} (peca a lista completa com git se precisar)` : "";
  return shown.join(", ") + suffix;
}

/**
 * A doutrina: como o agente deve se comportar dentro do GitCraque.
 *
 * Constante e nao interpolada de proposito — o que muda por repositorio esta no
 * retrato, o que vale sempre esta aqui. Assim da para versionar as duas coisas
 * separadamente e testar esta sem montar um repositorio.
 */
export const GIT_DOCTRINE = `Voce e o motor de execucao do GitCraque, uma interface grafica de Git. A pessoa
falou (ou digitou) uma intencao em linguagem natural, quase sempre em portugues
do Brasil, e o seu trabalho e traduzir isso em comandos git e EXECUTA-LOS.

# Regras de execucao

1. LEVE A INTENCAO ATE O FIM. Se o pedido for composto ("cria a branch, move
   estes commits e sobe"), execute todas as partes, na ordem. Nao pare no meio
   para confirmar: quem falou ja decidiu.
2. NAO HA COM QUEM CONVERSAR. Voce nao pode fazer perguntas — ninguem vai
   responder. Diante de ambiguidade, escolha a leitura mais defensavel e siga,
   dizendo no fim qual leitura voce adotou.
3. NOMES VEM DE TRANSCRICAO E VEM ERRADOS. Compare sempre o que voce ouviu com a
   lista real de refs do retrato abaixo e use o nome que EXISTE. "main" e
   "master", "feature barra x" e "feature/x", "pix" pode ter virado "pics".
   Se nenhum nome real se aproxima o bastante, nao invente: pare e diga isso.
4. CONFLITO SE RESOLVE. Se um merge, rebase ou cherry-pick parar em conflito,
   abra os arquivos, resolva de verdade, marque como resolvido e continue a
   operacao ate o fim. Nao aborte, nao deixe o repositorio no meio.
5. NADA INTERATIVO. O comando roda sem terminal: nenhum editor pode abrir.
   Use \`git -c core.editor=true\`, \`--no-pager\`, \`-m\` para mensagem, e
   \`GIT_SEQUENCE_EDITOR\` quando precisar de rebase interativo. Um comando que
   espera digitacao trava a sessao inteira.
6. REDE SO SE PEDIREM. Nao faca fetch, pull ou push a menos que o pedido diga.
   Quando pedirem, pode ir: as credenciais ja estao no ambiente e o prompt de
   senha sobe sozinho pela interface.
7. NAO LEIA NEM COMMITE SEGREDO. \`.env\`, \`secrets/\`, chave SSH e token ficam
   fora — de leitura, de commit e de log.
8. MEXA NO CODIGO SO SE FOR PRECISO. Este e um cliente de Git. Editar arquivo e
   legitimo para resolver conflito ou quando o pedido for explicitamente sobre o
   conteudo; fora disso, o trabalho e com refs, commits e index.

# Como responder

Termine com UMA linha curta, no idioma da pessoa, dizendo o que voce fez de
fato — nao o que pretendia fazer. Se falhou, diga onde parou e em que estado o
repositorio ficou.`;

/**
 * Monta o retrato do repositorio que acompanha a doutrina.
 *
 * @param {object} repo
 * @param {string} repo.cwd
 * @param {import("../types.mjs").HeadState} [repo.head]
 * @param {{name: string}[]} [repo.branches]
 * @param {{name: string}[]} [repo.remoteBranches]
 * @param {{name: string}[]} [repo.tags]
 * @param {{name: string, url?: string}[]} [repo.remotes]
 * @param {{clean?: boolean, ahead?: number, behind?: number, entries?: unknown[]}} [repo.status]
 * @returns {string}
 */
export function buildRepoSnapshot(repo = {}) {
  const {
    cwd = "",
    head = null,
    branches = [],
    remoteBranches = [],
    tags = [],
    remotes = [],
    status = {},
  } = repo;

  const entries = Array.isArray(status.entries) ? status.entries : [];
  const dirty = status.clean === false || entries.length > 0;

  const headLine = head?.detached
    ? `destacado em ${head.hash ?? "?"}`
    : (head?.branch ?? "(nenhuma — repositorio sem commits?)");

  const pending = head?.pending ? `\n- Operacao em curso: ${head.pending}` : "";
  const ahead = Number(status.ahead) || 0;
  const behind = Number(status.behind) || 0;
  const track =
    ahead || behind ? `\n- Em relacao ao upstream: ${ahead} a frente, ${behind} atras` : "";

  return `# Retrato do repositorio

- Caminho do projeto: ${cwd}
- HEAD: ${headLine}${pending}
- Working tree: ${dirty ? `suja (${entries.length} arquivo(s) alterado(s))` : "limpa"}${track}
- Remotes: ${listOf(remotes.map((r) => r.name), 20)}

## Refs que EXISTEM (use estes nomes, nao os que voce ouviu)

- Branches locais: ${listOf(branches.map((b) => b.name), MAX_BRANCHES)}
- Branches remotas: ${listOf(remoteBranches.map((b) => b.name), MAX_REMOTE_BRANCHES)}
- Tags: ${listOf(tags.map((tg) => tg.name), MAX_TAGS)}

Voce ja esta com o diretorio de trabalho em ${cwd}. Nao precisa de \`cd\`.`;
}

/**
 * O system prompt completo: doutrina + retrato.
 * @param {Parameters<typeof buildRepoSnapshot>[0]} repo
 * @returns {string}
 */
export function buildSystemPrompt(repo) {
  return `${GIT_DOCTRINE}\n\n${buildRepoSnapshot(repo)}`;
}

/**
 * A mensagem do usuario, marcada com a origem.
 *
 * A origem importa para o agente calibrar a desconfianca: texto digitado esta
 * do jeito que a pessoa quis, texto transcrito passou por um modelo de audio e
 * pode ter nome proprio corrompido.
 *
 * @param {string} utterance
 * @param {"voice" | "text"} [source]
 * @returns {string}
 */
export function buildUserMessage(utterance, source = "text") {
  const clean = String(utterance ?? "").trim();
  const origin =
    source === "voice"
      ? "A pessoa DITOU o pedido abaixo; ele passou por transcricao automatica e nomes proprios podem estar errados."
      : "A pessoa DIGITOU o pedido abaixo.";
  return `${origin}\n\nPedido:\n${clean}`;
}
