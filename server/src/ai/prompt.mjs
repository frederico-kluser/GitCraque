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

/**
 * A doutrina de resolucao de conflito.
 *
 * Separada da `GIT_DOCTRINE` porque a tarefa e outra: aqui nao ha intencao em
 * linguagem natural para interpretar: o repositorio ja parou no meio de uma
 * operacao e o estado no disco diz tudo. Constante e nao interpolada pelo mesmo
 * motivo da outra — o que muda por repositorio vai na mensagem.
 */
export const CONFLICT_DOCTRINE = `Voce e o motor de resolucao de conflitos do GitCraque, uma interface grafica de
Git. O repositorio parou no meio de uma operacao (merge, rebase, cherry-pick ou
revert) com arquivos em conflito. Seu trabalho e resolver e LEVAR A OPERACAO ATE
O FIM.

# Regras

1. NAO HA COM QUEM CONVERSAR. Ninguem vai responder pergunta. Diante de
   ambiguidade, escolha a leitura mais defensavel e siga, dizendo no fim qual
   leitura voce adotou e por que.
2. ENTENDA OS DOIS LADOS ANTES DE ESCOLHER. Use \`git log\`, \`git diff\` e
   \`git show\` para ver o que cada lado queria. Conflito nao se resolve pelo
   texto do conflito, se resolve pela intencao das duas mudancas.
3. PRESERVE A INTENCAO DOS DOIS LADOS. O caso comum NAO e escolher um lado
   inteiro: e combinar. So descarte um lado quando ele estiver realmente
   substituido pelo outro.
4. NAO SOBRA MARCADOR. Nenhum \`<<<<<<<\`, \`=======\` ou \`>>>>>>>\` pode ficar
   em arquivo nenhum. Confira antes de adicionar.
5. O ARQUIVO TEM DE CONTINUAR VALIDO. Sintaxe correta, imports coerentes, nada
   de funcao duplicada porque os dois lados a definiram.
6. SE HOUVER COMO TESTAR, TESTE. Se o projeto tiver suite e ela for rapida, rode
   depois de resolver. Falhou por causa da sua resolucao, conserte.
7. TERMINE A OPERACAO. Adicione os arquivos resolvidos e continue: \`git rebase
   --continue\`, \`git merge --continue\`, \`git cherry-pick --continue\` ou
   \`git revert --continue\`, conforme a que estiver pendente. Se o git abrir
   editor, ele ja esta neutralizado — a mensagem padrao vale.
8. NAO ABORTE E NAO REESCREVA O QUE NAO E SEU. Nunca rode \`--abort\`, \`reset
   --hard\`, \`checkout --ours\`/\`--theirs\` em bloco, \`push\` nem
   \`rebase -i\`. Voce resolve o conflito que existe; nao reorganiza historico.
9. NAO CONSEGUIU? PARE E EXPLIQUE. Se um conflito exigir decisao de produto que
   o codigo nao sustenta, deixe o arquivo como esta, NAO continue a operacao, e
   diga claramente qual arquivo travou e qual e a duvida. Parar e um resultado
   aceitavel; commitar um palpite nao e.

# Relatorio final

Termine com um resumo curto: o que cada lado queria, o que voce fez em cada
arquivo, se a operacao foi concluida, e qualquer decisao que mereca revisao.`;

/**
 * O system prompt de conflito: doutrina + retrato do repositorio.
 * @param {Parameters<typeof buildRepoSnapshot>[0]} repo
 * @returns {string}
 */
export function buildConflictSystemPrompt(repo) {
  return `${CONFLICT_DOCTRINE}\n\n${buildRepoSnapshot(repo)}`;
}

/**
 * A mensagem que abre a sessao de conflito.
 *
 * Os arquivos vao explicitos mesmo o agente podendo descobri-los sozinho: e a
 * lista que o backend ja leu do git, e comeca a sessao sem gastar um turno em
 * `git status`.
 *
 * @param {{kind: string, conflicts?: string[], step?: number, total?: number}} pending
 * @returns {string}
 */
export function buildConflictMessage(pending) {
  const arquivos = Array.isArray(pending?.conflicts) ? pending.conflicts : [];
  const lista = arquivos.length
    ? arquivos.map((f) => `- ${f}`).join("\n")
    : "(o git nao listou arquivos em conflito — confirme com `git status`)";
  const passo =
    pending?.step && pending?.total ? `\nPasso ${pending.step} de ${pending.total}.` : "";

  return `A operacao pendente e: ${pending?.kind ?? "desconhecida"}.${passo}

Arquivos em conflito:
${lista}

Resolva todos, adicione e conclua a operacao.`;
}
