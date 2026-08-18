/**
 * CATALOGO MESTRE — portugues do Brasil.
 *
 * Este arquivo define o conjunto de chaves do app inteiro: `MessageKey` sai
 * daqui, entao `en`, `es` e `zh` sao obrigados pelo `tsc` a cobrir tudo.
 *
 * Convencoes:
 *  - chave e `<modulo>.<contexto>.<coisa>`, sempre em ingles;
 *  - `{nome}` interpola valor; `_one`/`_other` sao as variantes de plural;
 *  - nome de comando, flag e mensagem do proprio git ficam em ingles, como o
 *    git os emite — traduzir `--force-with-lease` seria mentir sobre o que a
 *    pessoa vai digitar no terminal;
 *  - sem acento em comentario de codigo; o TEXTO da interface leva acento
 *    normalmente, porque ele e conteudo, nao comentario.
 */
export const pt = {
  /* ---------------------------------------------------------------- */
  /* Comum                                                             */
  /* ---------------------------------------------------------------- */
  "common.cancel": "Cancelar",
  "common.close": "Fechar",
  "common.create": "Criar",
  "common.save": "Salvar",
  "common.add": "Adicionar",
  "common.remove": "Remover",
  "common.open": "Abrir",
  "common.retry": "tentar de novo",
  "common.done": "Pronto",
  "common.failed": "Falhou",
  "common.running": "Executando…",
  "common.error": "erro",
  "common.ok": "ok",
  "common.unknownError": "erro desconhecido",
  "common.optional": "opcional",
  "common.command": "Comando",
  "common.copyCommand": "Copiar comando",
  "common.commandCopied": "Comando copiado",
  "common.willRun": "Será executado",
  "common.holdToConfirm": "Segure o botão para confirmar. Solte antes do fim para cancelar.",
  "common.holdTo": "Segure para {action}",
  "common.dismiss": "Dispensar",
  "common.missingFromDisk": "sumiu do disco",
  "common.opened": "aberto",
  "common.binaryShort": "bin",
  "common.back": "Voltar",

  /* ---------------------------------------------------------------- */
  /* Idioma                                                            */
  /* ---------------------------------------------------------------- */
  "language.label": "Idioma",
  "language.change": "Trocar de idioma",
  "language.group": "Idioma",
  "language.switchTo": "Interface em {name}",
  "language.changed": "Idioma alterado",
  "language.changedTo": "A interface agora está em {name}.",

  /* ---------------------------------------------------------------- */
  /* Configurações — idioma, tema, rotina de fetch e chave de IA       */
  /* ---------------------------------------------------------------- */
  "settings.title": "Configurações",
  "settings.subtitle": "Suas preferências, válidas para qualquer repositório que você abrir.",
  "settings.open": "Configurações",
  "settings.close": "Fechar configurações",
  "settings.theme": "Tema",
  "settings.theme.light": "Claro",
  "settings.theme.dark": "Escuro",
  "settings.autoFetch": "Buscar do remoto automaticamente",
  "settings.autoFetch.hint":
    "Roda git fetch --all --prune de tempos em tempos, em silêncio. Nada é puxado: sua branch local só se move quando você mandar. O tique é pulado enquanto houver comando git em andamento ou a aba estiver escondida.",
  "settings.autoFetch.off": "Desligado",
  "settings.autoFetch.seconds_one": "A cada {count} segundo",
  "settings.autoFetch.seconds_other": "A cada {count} segundos",
  "settings.autoFetch.minutes_one": "A cada {count} minuto",
  "settings.autoFetch.minutes_other": "A cada {count} minutos",
  "settings.ai.title": "Funções de IA",
  "settings.ai.hint":
    "Uma única chave da OpenRouter paga o agente. Ela fica no servidor, em ~/.config/gitcraque/openrouter.json, e nunca volta para o navegador.",
  "settings.ai.envHint":
    "Esta chave veio do ambiente do servidor. Se você gravar uma aqui, ela passa a valer no lugar — a variável esquecida no shell costuma ser a antiga.",
  "settings.ai.absent": "nenhuma chave",
  "settings.ai.add": "Adicionar",
  "settings.ai.change": "Trocar",
  "settings.ai.remove": "Remover",
  "settings.ai.source.stored": "gravada",
  "settings.ai.source.env": "OPENROUTER_API_KEY",
  "settings.ai.source.envFile": "OPENROUTER_API_KEY_FILE",
  "settings.ai.source.none": "—",

  /* ---------------------------------------------------------------- */
  /* Shell — App.tsx                                                   */
  /* ---------------------------------------------------------------- */
  "app.fatal.title": "O GitCraque não conseguiu abrir o repositório",
  "app.fatal.hint": "Confira se o backend está no ar em {port} e se o diretório informado existe.",
  "app.emptyRepo.title": "Repositório sem commits",
  "app.emptyRepo.body":
    "O {command} não devolveu nada. Prepare arquivos no painel de alterações e faça o primeiro commit — a View Tree aparece na hora.",
  "app.picker.title": "Escolha um repositório",
  "app.picker.body":
    "O servidor está em {cwd}, e ali não há {dotgit}. Abra um dos seus repositórios abaixo — ou crie um novo com {init} pela aba Navegar.",
  "app.splitter.rail": "Largura do rail",
  "app.splitter.detail": "Largura do painel de detalhe",
  "app.reconnecting": "Reconectando ao servidor…",

  /* ---------------------------------------------------------------- */
  /* Recuperação — RecoveryBoundary.tsx                                */
  /* ---------------------------------------------------------------- */
  "recovery.title": "A interface parou de responder",
  "recovery.body":
    "Algo quebrou ao desenhar a tela. Recarregar devolve o app ao normal — nada foi feito no repositório.",
  "recovery.reloading": "Recarregando o GitCraque…",
  "recovery.reload": "Recarregar agora",

  /* ---------------------------------------------------------------- */
  /* Restos da paleta de comandos, ainda usados fora dela            */
  /* ---------------------------------------------------------------- */
  "commands.branch.checkout.pinned": "presa em {worktree}",
  "commands.remote.add": "Adicionar Origin",
  "commands.theme.light": "Tema claro",
  "commands.theme.dark": "Tema escuro",

  /* ---------------------------------------------------------------- */
  /* Paleta de comandos (⌘K) — o host em app/CommandPaletteHost.tsx   */
  /* ---------------------------------------------------------------- */
  "commands.group.repository": "Repositório",
  "commands.group.projects": "Projetos",
  "commands.project.open": "Abrir {name}",
  "commands.group.worktrees": "Worktrees",
  "commands.group.branches": "Branches",
  "commands.group.network": "Rede",
  "commands.group.appearance": "Aparência",
  "commands.worktree.switch": "Trocar para a worktree {label}",
  "commands.branch.checkout": "Checkout {name}",
  "palette.open": "Abrir a paleta de comandos",
  "palette.placeholder": "Digite um comando ou busca…",
  "palette.inputLabel": "Buscar comandos",
  "palette.dialogLabel": "Paleta de comandos",
  "palette.hint.navigate": "navegar",
  "palette.hint.run": "executar",
  "palette.hint.close": "fechar",
  "palette.empty": "Nenhum comando corresponde a “{query}”.",

  /* ---------------------------------------------------------------- */
  /* Toolbar                                                           */
  /* ---------------------------------------------------------------- */
  "toolbar.connection.open": "conectado",
  "toolbar.connection.connecting": "conectando",
  "toolbar.connection.reconnecting": "reconectando",
  "toolbar.connection.closed": "sem conexão",
  "toolbar.connection.title": "WebSocket {state}",
  "toolbar.project.trigger": "Trocar de projeto — favoritos, recentes ou abrir outra pasta",
  "toolbar.project.section": "Projetos",
  "toolbar.project.note":
    "Abrir outro projeto também é {chdir} no servidor: a View Tree inteira é recarregada do zero.",
  "toolbar.project.favorites": "Favoritos",
  "toolbar.project.recents": "Recentes",
  "toolbar.project.loading": "Lendo favoritos e recentes…",
  "toolbar.project.empty":
    "Nenhum favorito nem recente ainda. Abra uma pasta pelo seletor abaixo e ela aparece aqui na próxima vez.",
  "toolbar.project.openOther": "Abrir outro…",
  "toolbar.head.detached": "detached em {hash}",
  "toolbar.commit.label": "Abrir alterações e commitar",
  "toolbar.commit.clean": "Nada para commitar",
  "toolbar.worktree.trigger": "Trocar de worktree — o servidor faz process.chdir, sem checkout",
  "toolbar.worktree.none": "sem worktree",
  "toolbar.worktree.note":
    "Trocar de worktree executa {chdir} no servidor. Nenhum {checkout} acontece.",
  "toolbar.worktree.emptyList": "Nenhuma worktree listada.",
  "toolbar.activity.label": "Atividade: {count} commits nas últimas {weeks} semanas",
  "toolbar.activity.weeks": "/{weeks} sem",
  "toolbar.pending.step": "{step} de {total}",
  "toolbar.pending.inProgress": "em andamento",
  "toolbar.pending.banner": "{kind} em andamento, {step}",
  "toolbar.pending.conflicts_one": "{count} conflito",
  "toolbar.pending.conflicts_other": "{count} conflitos",
  "toolbar.pending.continue": "Continuar",
  "toolbar.pending.abort": "Abortar",
  "toolbar.action.open": "Abrir",
  "toolbar.action.open.title": "Abrir outro repositório da máquina (process.chdir, sem checkout)",
  "toolbar.action.branch": "Branch",
  "toolbar.action.stash": "Stash",
  "toolbar.action.refresh": "Recarregar",
  "toolbar.action.refresh.title": "Recarregar (⌘R)",
  "toolbar.progress.label": "Operação em curso",
  "toolbar.progress.running": "Executando comando git",

  /* ---------------------------------------------------------------- */
  /* Rail                                                              */
  /* ---------------------------------------------------------------- */
  "rail.label": "Referências do repositório",
  "rail.chip.main": "principal",
  "rail.chip.bare": "bare",
  "rail.chip.detached": "detached",
  "rail.chip.locked": "locked",
  "rail.chip.prunable": "prunable",
  "rail.chip.active": "ativa",
  "rail.chip.pinned": "presa",
  "rail.chip.pinnedTitle": "Checada em {worktree}",
  "rail.chip.annotated": "anotada",
  "rail.chip.lightweight": "leve",
  "rail.chip.ssh": "ssh",
  "rail.chip.askpass": "https · askpass",
  "rail.chip.askpassTitle": "Url https: usa o trampolim GIT_ASKPASS",

  "rail.worktrees.title": "Worktrees",
  "rail.worktrees.add": "Adicionar worktree",
  "rail.worktrees.prune": "Prune (limpar registros)",
  "rail.worktrees.removeThis": "Remover esta worktree",
  "rail.worktrees.actions": "Ações da worktree {label}",
  "rail.worktrees.empty.title": "Nenhuma worktree",
  "rail.worktrees.empty.body": "O servidor ainda não listou `git worktree list --porcelain`.",

  "rail.branches.title": "Branches locais",
  "rail.branches.new": "Nova branch",
  "rail.branches.actions": "Ações da branch {name}",
  "rail.branches.checkout": "Checkout",
  "rail.branches.pinnedIn": "Presa em {worktree}",
  "rail.branches.rename": "Renomear",
  "rail.branches.tagHere": "Criar tag aqui",
  "rail.branches.push": "Push desta branch",
  "rail.branches.deleteLocal": "Deletar Branch (Local)",
  "rail.branches.deleteBoth": "Deletar Branch (Local e {remote})",
  "rail.branches.deleteAll": "Deletar Tudo (worktree, alterações, local e remoto)",
  "rail.branches.deleteBoth.noRemote": "sem branch correspondente no remoto",
  "rail.branches.ahead": "{count} commits à frente do upstream",
  "rail.branches.behind": "{count} commits atrás do upstream",
  "rail.branches.empty.title": "Nenhuma branch local",
  "rail.branches.empty.body": "Repositório sem commits ou sem refs em refs/heads.",
  "rail.branches.empty.action": "Criar a primeira",

  "rail.remotes.title": "Remotos",
  "rail.remotes.actions": "Ações do remoto {name}",
  "rail.remotes.branchActions": "Ações de {name}",
  "rail.remotes.editUrl": "Editar url",
  "rail.remotes.push": "Push para este remoto",
  "rail.remotes.removeRemote": "Remover remoto",
  "rail.remotes.deleteRemote": "Deletar Branch (Origin)",
  "rail.remotes.noBranches": "Nenhuma branch remota conhecida.",
  "rail.remotes.empty.title": "Nenhum remoto",
  "rail.remotes.empty.body":
    "`git remote -v` não devolveu nada. Adicione um origin para poder dar fetch e push.",

  "rail.tags.title": "Tags",
  "rail.tags.create": "Criar tag",
  "rail.tags.actions": "Ações da tag {name}",
  "rail.tags.delete": "Deletar tag",
  "rail.tags.empty.title": "Nenhuma tag",
  "rail.tags.empty.body": "Marque uma versão a partir de um commit ou branch.",

  "rail.stashes.title": "Stashes",
  "rail.stashes.push": "Guardar alterações",
  "rail.stashes.pushTitle": "Guardar alterações (stash push)",
  "rail.stashes.actions": "Ações de {ref}",
  "rail.stashes.apply": "Aplicar (mantém na pilha)",
  "rail.stashes.pop": "Pop (aplica e remove)",
  "rail.stashes.drop": "Descartar",
  "rail.stashes.empty.title": "Pilha vazia",
  "rail.stashes.empty.body": "Nada guardado com `git stash`.",

  "parts.actions": "Ações",

  /* ---------------------------------------------------------------- */
  /* Status de arquivo                                                 */
  /* ---------------------------------------------------------------- */
  "status.added": "adicionado",
  "status.modified": "modificado",
  "status.deleted": "removido",
  "status.renamed": "renomeado",
  "status.copied": "copiado",
  "status.typechange": "tipo alterado",
  "status.unmerged": "conflito",
  "status.untracked": "não rastreado",
  "status.unknown": "desconhecido",

  /* ---------------------------------------------------------------- */
  /* Coluna direita                                                    */
  /* ---------------------------------------------------------------- */
  "side.label": "Detalhe do commit",

  /* ---------------------------------------------------------------- */
  /* View do arquivo                                                   */
  /* ---------------------------------------------------------------- */
  "view.label": "Arquivo aberto",
  "view.back.detail": "Detalhe",
  "view.back.changes": "Alterações",
  "view.back.blame": "Blame",

  /* ---------------------------------------------------------------- */
  /* Blame                                                            */
  /* ---------------------------------------------------------------- */
  "blame.label": "Blame de {path}",
  "blame.header.hash": "Commit",
  "blame.header.author": "Autor",
  "blame.header.date": "Data",
  "blame.header.line": "Linha",
  "blame.header.content": "Conteúdo",
  "blame.empty.title": "Arquivo vazio",
  "blame.empty.body": "O blame de um arquivo sem linhas não tem o que mostrar.",
  "blame.error.title": "Não foi possível fazer o blame",
  "blame.loading": "Carregando blame…",
  "blame.close": "Fechar blame e voltar",
  "blame.tooltip": "{hash} — {summary}\n{author} <{email}> em {date}",

  /* ---------------------------------------------------------------- */
  /* Alteracoes e commit                                               */
  /* ---------------------------------------------------------------- */
  "changes.label": "Alterações da árvore de trabalho",
  "changes.sheet.label": "Alterações e commit",
  "changes.sheet.title": "Alterações",
  "changes.sheet.close": "Fechar alterações",
  "changes.group.conflicted": "Conflitos",
  "changes.group.staged": "Preparados",
  "changes.group.untracked": "Não rastreados",
  "changes.group.modified": "Modificados",
  "changes.stage": "Preparar",
  "changes.unstage": "Despreparar",
  "changes.discard": "Descartar",
  "changes.stageFile": "Preparar {path}",
  "changes.unstageFile": "Despreparar {path}",
  "changes.discardFile": "Descartar {path}",
  "changes.stageAll": "Preparar tudo",
  "changes.unstageAll": "Despreparar tudo",
  "changes.viewFile": "Ver {path} no visualizador",
  "changes.hold": "segure",
  "changes.filesChanged_one": "{count} arquivo alterado",
  "changes.filesChanged_other": "{count} arquivos alterados",
  "changes.staged_one": "{count} arquivo preparado",
  "changes.staged_other": "{count} arquivos preparados",
  "changes.conflictsLeft_one": "{count} conflito por resolver",
  "changes.conflictsLeft_other": "{count} conflitos por resolver",
  "changes.clean.title": "Árvore de trabalho limpa",
  "changes.clean.body":
    "Nada para preparar. Altere um arquivo e ele aparece aqui assim que o watcher do .git avisar.",
  "commit.placeholder": "Mensagem do commit",
  "commit.placeholder.amend": "Nova mensagem (vazio mantém a original)",
  "commit.subjectCounter": "Primeira linha: {length} de {limit} caracteres recomendados",
  "commit.button": "Commit",
  "commit.button.loading": "Commitando…",
  "commit.button.ok": "Commitado",
  "commit.button.error": "Falhou",
  "commit.button.label": "Criar commit",

  /* ---------------------------------------------------------------- */
  /* Detalhe do commit                                                 */
  /* ---------------------------------------------------------------- */
  "detail.label": "Detalhe do commit",
  "detail.selectionLabel": "Resumo da seleção",
  "detail.empty.title": "Nenhum commit selecionado",
  "detail.empty.body":
    "Clique num commit da View Tree. Segure ⇧ para marcar um intervalo e liberar o squash.",
  "detail.error.title": "Não foi possível ler o commit",
  "detail.author": "autor",
  "detail.committer": "committer",
  "detail.parent": "pai",
  "detail.parents": "pais",
  "detail.goTo": "Ir para {hash}",
  "detail.copyHash": "Copiar o hash completo",
  "detail.hashCopied": "Hash copiado",
  "detail.files": "Arquivos",
  "detail.files.hint": "clique para ver o diff embaixo",
  "detail.files.empty.title": "Nenhum arquivo",
  "detail.files.empty.body": "O commit não alterou arquivos.",
  "detail.viewFile": "Ver {path} no visualizador",
  "detail.fileCount_one": "{count} arquivo",
  "detail.fileCount_other": "{count} arquivos",
  "detail.working.title": "Alterações em aberto",
  "detail.working.hint": "clique para ver o diff",
  "detail.working.stage": "Preparar e commitar",
  "detail.stash.label": "Conteúdo de {ref}",
  "detail.stash.back": "Fechar",
  "detail.stash.body": "Alterações guardadas neste stash. Clique para aplicar, ou use o menu para aplicar com pop.",
  "detail.stash.empty.title": "Stash vazio",
  "detail.stash.empty.body": "Este stash não contém alterações.",

  "selection.title": "Seleção",
  "selection.count_one": "{count} commit",
  "selection.count_other": "{count} commits",
  "selection.range": "Alcance",
  "selection.newest": "mais novo",
  "selection.oldest": "mais antigo",
  "selection.squash": "Squash",
  "selection.squash.body":
    "Junta os {count} commits num só com {command}, via {editor}. O mais antigo continua {pick}; os demais viram {squash}.",
  "selection.squash.button_one": "Squash de {count} commit",
  "selection.squash.button_other": "Squash de {count} commits",

  /* ---------------------------------------------------------------- */
  /* Grafo                                                             */
  /* ---------------------------------------------------------------- */
  "graph.label": "Histórico de commits",
  "graph.column.graph": "Grafo",
  "graph.column.description": "Descrição",
  "graph.column.author": "Autor",
  "graph.column.date": "Data",
  "graph.column.hash": "Hash",
  "graph.empty.title": "Nenhum commit para desenhar",
  "graph.empty.body":
    "Este repositório ainda não tem histórico. Faça o primeiro commit e a View Tree aparece aqui.",
  "graph.refChip.hint":
    "{ref} — duplo clique troca para esta branch; arraste para outra para mesclar ou rebasear",

  /* ---------------------------------------------------------------- */
  /* Visualizador de arquivo                                           */
  /* ---------------------------------------------------------------- */
  "viewer.label": "Visualizador de {path}",
  "viewer.mode.diff": "Diff",
  "viewer.mode.markdown": "Formatado",
  "viewer.mode.raw": "Cru",
  "viewer.mode.aria": "Modo de exibição do arquivo",
  "viewer.workingTree": "working tree",
  "viewer.workingTreeTitle": "arquivo da árvore de trabalho",
  "viewer.copyPath": "Copiar o caminho do arquivo",
  "viewer.pathCopied": "Caminho copiado",
  "viewer.close": "Fechar o visualizador",
  "viewer.empty.title": "Nenhum arquivo aberto",
  "viewer.empty.body":
    "Escolha um arquivo no detalhe do commit ou no painel de alterações. Ele aparece aqui em diff, formatado (quando for markdown) e cru.",
  "viewer.error.patch": "Não foi possível ler o patch",
  "viewer.error.file": "Não foi possível ler o arquivo",
  "viewer.summary.lines_one": "{count} linha · {size}",
  "viewer.summary.lines_other": "{count} linhas · {size}",

  "diff.noChanges.title": "Sem alterações neste commit",
  "diff.noChanges.body": "{path} não foi tocado aqui — o conteúdo está nas abas Cru e Formatado.",
  "diff.binary.title": "Arquivo binário",
  "diff.binary.body": "Git não gera patch de texto para {path}.",
  "diff.emptyPatch.title": "Patch vazio",
  "diff.emptyPatch.body":
    "Nenhum trecho alterado — o git registrou a mudança sem alterar conteúdo (modo, renomeação).",
  "diff.renamedFrom": "renomeado de {path}",

  "raw.binary.title": "Arquivo binário",
  "raw.binary.body": "{size} — nada a renderizar como texto.",
  "raw.truncated.title": "Arquivo cortado",
  "raw.truncated.body": "O backend enviou só o início do blob ({size} no total).",
  "raw.empty.title": "Arquivo vazio",
  "raw.empty.body": "Zero bytes.",

  "markdown.error.title": "Não foi possível renderizar com segurança",
  "markdown.truncated.title": "Documento cortado",
  "markdown.truncated.body":
    "O backend enviou só o início do arquivo — o fim do markdown não está aqui.",
  "markdown.empty.title": "Arquivo vazio",
  "markdown.empty.body": "Nada para formatar.",
  "markdown.linkRefused": "link recusado (esquema {scheme})",
  "markdown.relativeLink": "caminho relativo ao repositório — não resolvido: {href}",
  "markdown.unknownScheme": "desconhecido",
  "markdown.image": "imagem",
  "markdown.imageUnresolved": "· imagem não resolvida",
  "sanitize.noDom":
    "DOMPurify sem DOM disponível — o markdown não pode ser exibido com segurança",

  /* ---------------------------------------------------------------- */
  /* Busca de commits                                                  */
  /* ---------------------------------------------------------------- */
  "search.placeholder": "Buscar commits…",
  "search.aria": "Buscar commits no historico",
  "search.clear": "Limpar busca",
  "search.active_one": "{count} filtro ativo",
  "search.active_other": "{count} filtros ativos",
  "search.noResults.title": "Nenhum commit encontrado",
  "search.noResults.body": "Nenhum commit do repositorio casa com a busca.",
  "search.commandLabel": "Search Commits…",

  /* ---------------------------------------------------------------- */
  /* Rodape de diagnostico                                             */
  /* ---------------------------------------------------------------- */
  "footer.cwd": "process.cwd() do servidor",
  "footer.commits": "Commits carregados / alcançáveis por --all",
  "footer.commitsSuffix": "commits",

  /* ---------------------------------------------------------------- */
  /* Confirmacoes (ConfirmHost)                                        */
  /* ---------------------------------------------------------------- */
  "confirm.close": "Fechar",

  /* ---------------------------------------------------------------- */
  /* Acoes dos paineis (actions.ts)                                    */
  /* ---------------------------------------------------------------- */
  "action.fetch": "Fetch",
  "action.fetch.done": "Fetch concluído",
  "action.pull": "Pull",
  "action.pull.done": "Pull concluído",
  "action.pullRebase": "Pull --rebase",
  "action.pullRebase.done": "Pull --rebase concluído",

  "action.push.noRemote.title": "Nenhum remoto configurado",
  "action.push.noRemote.body": "Adicione um origin antes de dar push.",
  "action.push.title": "Push",
  "action.push.description": "Envia {branch} para o remoto escolhido.",
  "action.push.currentBranch": "a branch atual",
  "action.push.confirm": "Push",
  "action.push.done": "Push concluído",
  "action.push.field.remote": "Remoto",
  "action.push.field.branch": "Branch",
  "action.push.field.branch.placeholder": "branch a enviar",
  "action.push.field.setUpstream.hint": "grava o upstream da branch",
  "action.push.field.tags.hint": "envia também as tags",
  "action.push.field.force.hint": "reescreve o remoto; só use após rebase/squash",

  "action.branch.new": "Nova branch",
  "action.branch.new.from": "Cria uma branch a partir de {ref}.",
  "action.branch.new.fromHead": "Cria uma branch a partir do HEAD atual.",
  "action.branch.new.namePlaceholder": "feature/minha-branch",
  "action.branch.field.name": "Nome",
  "action.branch.field.startPoint": "Ponto de partida",
  "action.branch.field.checkout": "Fazer checkout depois",
  "action.branch.create": "Criar branch",
  "action.branch.created": "Branch {name} criada",
  "action.checkout": "Checkout",
  "action.checkout.done": "Em {ref}",
  "action.checkout.tracking": "Em {branch}, rastreando {remote}",
  "action.checkout.already": "Você já está em {name}",
  "action.checkout.inUse": "{name} está em uso",
  "action.checkout.inUse.body":
    "A branch está checada na worktree {worktree}. Clique nela em Worktrees para ir até lá — trocar de worktree não faz checkout.",

  "action.branch.rename.title": "Renomear {name}",
  "action.branch.rename.description":
    "Renomeia a branch local. O upstream continua apontando para o mesmo remoto.",
  "action.branch.rename.confirm": "Renomear",
  "action.branch.rename.field": "Novo nome",
  "action.branch.rename.op": "Renomear branch",

  "action.branch.deleteLocal.title": "Deletar Branch (Local)",
  "action.branch.deleteLocal.description":
    "Apaga a branch local {name}. Commits só alcançáveis por ela ficam órfãos.",
  "action.branch.deleteLocal.confirm": "Deletar local",
  "action.branch.deleteLocal.force": "-D (forçar mesmo sem merge)",
  "action.branch.deleteLocal.force.hint": "usa -D em vez de -d",
  "action.branch.deleteLocal.op": "Deletar branch local",
  "action.branch.deleteLocal.done": "Branch {name} apagada",

  "action.branch.deleteRemote.title": "Deletar Branch (Origin)",
  "action.branch.deleteRemote.description":
    "Apaga {name} em {remote}. A operação atinge quem mais usa o repositório.",
  "action.branch.deleteRemote.confirm": "Deletar em {remote}",
  "action.branch.deleteRemote.op": "Deletar branch remota",
  "action.branch.deleteRemote.done": "{remote}/{name} apagada",

  "action.branch.deleteBoth.title": "Deletar Branch (Local e {remote})",
  "action.branch.deleteBoth.description":
    "Apaga {name} aqui e em {remote}, na mesma operação. Se não houver nada em {remote}, só o lado local é apagado.",
  "action.branch.deleteBoth.confirm": "Deletar dos dois lados",
  "action.branch.deleteBoth.op": "Deletar branch local e remota",
  "action.branch.deleteBoth.done": "{name} apagada aqui e em {remote}",
  "action.branch.deleteBoth.doneLocalOnly": "{name} apagada — não havia nada em {remote}",

  "action.branch.deleteAll.title": "Deletar Tudo de {name}",
  "action.branch.deleteAll.description":
    "Remove a worktree que prende {name}, joga fora o código não commitado dela e apaga a branch local.",
  "action.branch.deleteAll.description.withRemote":
    "Remove a worktree que prende {name}, joga fora o código não commitado dela e apaga a branch local e em {remote}.",
  "action.branch.deleteAll.pinned": "A worktree {worktree} será removida do disco.",
  "action.branch.deleteAll.pinnedMain":
    "A branch está na worktree principal: ela não pode ser removida, então o HEAD é solto e as alterações não commitadas são descartadas.",
  "action.branch.deleteAll.confirm": "Deletar tudo",
  "action.branch.deleteAll.op": "Deletar branch, worktree e alterações",
  "action.branch.deleteAll.done": "{name} apagada com a worktree e as alterações",

  "action.tag.new": "Nova tag",
  "action.tag.new.at": "Cria uma tag em {ref}.",
  "action.tag.new.atHead": "Cria uma tag no HEAD atual.",
  "action.tag.confirm": "Criar tag",
  "action.tag.field.name": "Nome",
  "action.tag.field.target": "Alvo",
  "action.tag.field.message": "Mensagem (deixa a tag anotada)",
  "action.tag.op": "Criar tag",
  "action.tag.delete.title": "Deletar tag {name}",
  "action.tag.delete.description": "Apaga a tag local; opcionalmente também no remoto.",
  "action.tag.delete.confirm": "Deletar tag",
  "action.tag.delete.field": "Apagar também em",
  "action.tag.delete.localOnly": "só local",
  "action.tag.delete.op": "Deletar tag",

  "action.remote.add.title": "Adicionar Origin",
  "action.remote.add.description":
    "Registra um remoto novo. Url https usa o trampolim de credencial (GIT_ASKPASS).",
  "action.remote.add.confirm": "Adicionar",
  "action.remote.field.name": "Nome",
  "action.remote.field.url": "Url",
  "action.remote.add.op": "Adicionar remoto",
  "action.remote.url.title": "Url de {name}",
  "action.remote.url.description":
    "Troca a url do remoto. Marque para alterar apenas a url de push.",
  "action.remote.url.confirm": "Salvar url",
  "action.remote.url.pushOnly": "--push (só a url de push)",
  "action.remote.url.op": "Alterar url do remoto",
  "action.remote.remove.title": "Remover remoto {name}",
  "action.remote.remove.description":
    "Apaga o remoto e todas as refs remotas de {name} do repositório local.",
  "action.remote.remove.confirm": "Remover remoto",
  "action.remote.remove.op": "Remover remoto",

  "action.worktree.add.title": "Adicionar worktree",
  "action.worktree.add.description":
    "Cria um diretório de trabalho novo ligado a este repositório.",
  "action.worktree.add.confirm": "Adicionar",
  "action.worktree.field.path": "Caminho",
  "action.worktree.field.path.placeholder": "/caminho/para/nova-worktree",
  "action.worktree.field.newBranch": "Criar branch (-b)",
  "action.worktree.field.ref": "A partir de",
  "action.worktree.add.op": "Adicionar worktree",
  "action.worktree.remove.title": "Remover worktree {label}",
  "action.worktree.remove.description":
    "Desregistra {path}. O diretório sai do disco se o git conseguir removê-lo.",
  "action.worktree.remove.confirm": "Remover worktree",
  "action.worktree.remove.force.hint": "remove mesmo com alterações",
  "action.worktree.remove.op": "Remover worktree",
  "action.worktree.prune.title": "Prune de worktrees",
  "action.worktree.prune.description":
    "Remove o registro das worktrees cujo diretório não existe mais.",
  "action.worktree.prune.confirm": "Fazer prune",
  "action.worktree.prune.op": "Prune de worktrees",

  "action.stash.title": "Stash",
  "action.stash.description": "Guarda as alterações da árvore de trabalho numa pilha.",
  "action.stash.confirm": "Guardar",
  "action.stash.field.message": "Mensagem",
  "action.stash.field.untracked": "-u (incluir não rastreados)",
  "action.stash.apply.op": "Aplicar stash",
  "action.stash.pop.title": "Pop de {ref}",
  "action.stash.pop.description":
    "Aplica o stash e o remove da pilha. Se der conflito, o stash some mesmo assim.",
  "action.stash.pop.confirm": "Pop",
  "action.stash.pop.op": "Pop do stash",
  "action.stash.drop.title": "Descartar {ref}",
  "action.stash.drop.description": "Apaga o stash. Não há desfazer.",
  "action.stash.drop.confirm": "Descartar stash",
  "action.stash.drop.op": "Descartar stash",

  "action.stage.op": "Preparar",
  "action.stage.done": "Preparado",
  "action.unstage.op": "Despreparar",
  "action.unstage.done": "Despreparado",
  "action.discard.op": "Descartar alterações",
  "action.discard.done": "Alterações descartadas",
  "action.commit.op": "Commit",
  "action.commit.done": "Commit criado",

  "action.squash.needsTwo": "Squash precisa de dois ou mais commits",
  "action.squash.needsTwo.body": "Selecione um intervalo no grafo.",
  "action.squash.title": "Squash de {count} commits",
  "action.squash.description":
    "Reescreve o histórico com `git rebase -i` e GIT_SEQUENCE_EDITOR. O commit mais antigo permanece `pick`; os demais viram `squash`.",
  "action.squash.confirm": "Squash",
  "action.squash.field.message": "Mensagem final",
  "action.squash.field.message.placeholder": "vazio concatena as originais",
  "action.squash.field.fixup": "fixup (descarta as mensagens)",
  "action.squash.done": "Squash concluído",

  "action.continue.op": "Continuar {kind}",
  "action.abort.title": "Abortar {kind}",
  "action.abort.description":
    "Desfaz a operação em curso e volta o repositório ao estado anterior.",
  "action.abort.confirm": "Abortar",
  "action.abort.op": "Abortar {kind}",

  /* Desfazer/refazer. O {step} vem do reflog e chega em inglês, como o git o
   * escreveu — mesma regra que deixa o stderr do git passar intacto. */
  "action.undo": "Desfazer",
  "action.redo": "Refazer",
  "action.undo.step": "Desfazer: {step}",
  "action.redo.step": "Refazer: {step}",
  "action.undo.nothing": "Nada para desfazer",
  "action.redo.nothing": "Nada para refazer",
  "action.undo.blocked.pending": "Termine ou aborte a operação em andamento antes de desfazer",
  "action.undo.blocked.empty": "O repositório ainda não tem commits",
  "action.undo.op": "Desfazer",
  "action.redo.op": "Refazer",
  "action.undo.done": "Desfeito",
  "action.redo.done": "Refeito",

  /* ---------------------------------------------------------------- */
  /* Store — toasts e console                                          */
  /* ---------------------------------------------------------------- */
  "store.log.failed": "Falha ao ler o histórico",
  "store.refs.failed": "Falha ao ler as referências",
  "store.operation.failed": "{label} falhou",
  "store.worktree.switching": "Trocando para {path}",
  "store.worktree.failed": "Não foi possível trocar de worktree",
  "store.worktree.active": "Worktree ativa",
  "store.repo.opening": "Abrindo {path}",
  "store.repo.opened": "Repositório aberto",
  "store.repo.openFailed": "Não foi possível abrir o repositório",
  "store.repo.initializing": "git init em {path}",
  "store.repo.created": "Repositório criado",
  "store.repo.initFailed": "git init falhou",
  "store.repo.cloning": "Clonando {url}",
  "store.repo.cloned": "Repositório clonado",
  "store.repo.cloneFailed": "Clone falhou",
  "store.ws.connected": "conectado — gitcraque {version} (pid {pid}) em {cwd}",
  "store.ws.cwdChanged": "diretório do servidor agora é {cwd}",
  "store.lifecycle.resumed": "aba de volta — reconectando e recarregando o estado",
  "store.lifecycle.restored": "view restaurada depois de o navegador descartar a aba",

  /* ---------------------------------------------------------------- */
  /* Toasts                                                            */
  /* ---------------------------------------------------------------- */
  "toast.copyCommand": "Copiar o comando",
  "toast.commandCopied": "Comando copiado",

  /* ---------------------------------------------------------------- */
  /* Dialogos — pecas comuns                                           */
  /* ---------------------------------------------------------------- */
  "dialog.intent.for": "para",
  "dialog.intent.noOperation": "Nenhuma operação disponível.",
  "dialog.intent.rewritesHistory": "reescreve histórico",
  "dialog.intent.holdRebase": "Segure para rebasear",
  "dialog.intent.holdConfirm": "Segure para confirmar",

  /* ---------------------------------------------------------------- */
  /* Dialogo de squash                                                 */
  /* ---------------------------------------------------------------- */
  "squash.title": "Squash de {count} commits",
  "squash.description":
    "Junta os commits selecionados num só. Reescreve o histórico a partir do mais antigo deles.",
  "squash.hold": "Segure para juntar",
  "squash.needTwo": "Selecione ao menos dois commits no grafo para juntar. Selecionados agora: {count}.",
  "squash.warning":
    "Isto REESCREVE o histórico: os commits abaixo deixam de existir com os hashes atuais. Se algum já foi publicado, o próximo push vai exigir --force-with-lease.",
  "squash.plan": "Plano do rebase interativo",
  "squash.plan.hint": "Mesma ordem do git-rebase-todo: do mais antigo para o mais novo.",
  "squash.outOfLog": "(fora do log carregado)",
  "squash.mode": "O que fazer com as mensagens",
  "squash.mode.fixupHint": "fixup descarta as mensagens dos commits juntados.",
  "squash.mode.squashHint": "squash abre a lista de mensagens para o commit final.",
  "squash.mode.aria": "Ação das linhas juntadas",
  "squash.message": "Mensagem final",
  "squash.message.fixupPlaceholder": "fixup mantém a mensagem do commit mais antigo.",
  "squash.message.placeholder": "Deixe vazio para concatenar as mensagens originais.",
  "squash.message.fixupHint": "Indisponível com fixup.",
  "squash.message.hint":
    "Quando preenchida, o backend faz git commit --amend -m depois do rebase.",
  "squash.preview": "Será executado (com GIT_SEQUENCE_EDITOR)",
  "squash.op": "Squash",
  "squash.done_one": "Squash de {count} commit",
  "squash.done_other": "Squash de {count} commits",

  /* ---------------------------------------------------------------- */
  /* Dialogo de rebase interativo                                       */
  /* ---------------------------------------------------------------- */
  "rebaseInteractive.title": "Rebase interativo de {count} commits",
  "rebaseInteractive.description":
    "Define a acao de cada commit selecionado (pick, reword, squash, fixup, drop). O historico sera reescrito a partir da base.",
  "rebaseInteractive.hold": "Segure para executar",
  "rebaseInteractive.needTwo": "Selecione ao menos dois commits no grafo. Selecionados agora: {count}.",
  "rebaseInteractive.warning":
    "Isto REESCREVE o historico: os commits abaixo deixam de existir com os hashes atuais. Se algum ja foi publicado, o proximo push vai exigir --force-with-lease.",
  "rebaseInteractive.plan": "Acoes do rebase interativo",
  "rebaseInteractive.plan.hint": "Do mais antigo (topo) para o mais novo (fim). Use as setas para reordenar.",
  "rebaseInteractive.moveUp": "Mover para cima",
  "rebaseInteractive.moveDown": "Mover para baixo",
  "rebaseInteractive.actionFor": "Acao para",
  "rebaseInteractive.reword.placeholder": "Nova mensagem para este commit",
  "rebaseInteractive.reword.hint": "A mensagem antiga sera substituida por esta.",
  "rebaseInteractive.preview": "Sera executado (com GIT_SEQUENCE_EDITOR)",
  "rebaseInteractive.op": "Rebase interativo",
  "rebaseInteractive.done": "Rebase interativo concluido",

  /* ---------------------------------------------------------------- */
  /* Dialogo de push                                                   */
  /* ---------------------------------------------------------------- */
  "push.title": "Push",
  "push.description": "Envia os commits do ramo escolhido para o remoto.",
  "push.state.idle": "Enviar",
  "push.state.sending": "Enviando...",
  "push.state.ok": "Enviado",
  "push.state.error": "Falhou",
  "push.aria": "Enviar {branch} para {remote}",
  "push.aria.currentBranch": "ramo atual",
  "push.aria.remote": "remoto",
  "push.hold": "Segure para push --force-with-lease",
  "push.noRemotes": "Este repositório não tem nenhum remoto configurado, então não há para onde enviar.",
  "push.addRemote": "Adicionar remoto",
  "push.field.remote": "Remoto",
  "push.field.remote.aria": "Remoto de destino",
  "push.field.branch": "Ramo",
  "push.field.branch.noUpstream": "{name} (sem upstream)",
  "push.field.branch.hint": "{ahead} commits à frente, {behind} atrás do upstream.",
  "push.field.branch.hint.none": "Sem upstream configurado.",
  "push.field.setUpstream.hint": "Passa a acompanhar o ramo remoto depois deste push.",
  "push.field.tags.hint": "Envia junto todas as tags locais.",
  "push.field.force.hint":
    "Sobrescreve o ramo remoto, mas só se ele estiver onde você viu por último.",
  "push.force.warning":
    "O ramo {branch} será SOBRESCRITO em {remote}. Quem já tinha baixado os commits antigos vai precisar rebasear.",
  "push.force.currentBranch": "atual",
  "push.https.note":
    "{host} usa https: se o cofre não tiver a credencial, o GitCraque vai pedir usuário e token aqui mesmo, sem travar o git.",
  "push.https.theRemote": "O remoto",
  "push.op": "Push para {remote}",
  "push.done": "Push para {remote} concluído",

  /* ---------------------------------------------------------------- */
  /* Dialogo de conflito                                               */
  /* ---------------------------------------------------------------- */
  "conflict.kind.rebase": "rebase",
  "conflict.kind.rebaseInteractive": "rebase interativo",
  "conflict.kind.merge": "merge",
  "conflict.kind.cherryPick": "cherry-pick",
  "conflict.kind.revert": "revert",
  "conflict.kind.bisect": "bisect",
  "conflict.title": "{kind} em andamento{progress}",
  "conflict.progress": " — passo {step} de {total}",
  "conflict.description.conflicts":
    "O git parou com conflitos. Resolva os arquivos abaixo no editor e continue, ou aborte e volte ao estado anterior.",
  "conflict.description.clean":
    "O repositório está no meio de uma operação. Continue quando terminar de resolver, ou aborte.",
  "conflict.hold": "Segure para abortar",
  "conflict.continue": "Continuar",
  "conflict.ai.action": "Resolver com IA",
  "conflict.ai.utterance": "Resolver os conflitos e concluir a operação",
  "conflict.applying": "Aplicando o commit {hash}.",
  "conflict.files": "Arquivos em conflito ({count})",
  "conflict.files.hint": "Resolva no editor e faça stage; depois volte aqui e continue.",
  "conflict.noFiles":
    "Nenhum arquivo em conflito reportado. Se você já resolveu tudo, continuar deve terminar a operação.",
  "conflict.preview.continue": "Continuar executa",
  "conflict.preview.abort": "Abortar executa",
  "conflict.holdHint":
    "Abortar descarta o que a operação já aplicou e devolve o repositório ao estado anterior. Segure o botão para confirmar.",
  "conflict.unsupported":
    "{kind} não tem continuar nem abortar pela API do GitCraque. Resolva pelo terminal (git bisect reset).",
  "conflict.op.continue": "Continuar {kind}",
  "conflict.op.abort": "Abortar {kind}",
  "conflict.done.resumed": "Operação retomada",
  "conflict.done.aborted": "Operação abortada",
  "conflict.editor.title": "Resolver {path}",
  "conflict.editor.back": "Voltar à lista",
  "conflict.editor.ours": "Usar Nosso",
  "conflict.editor.theirs": "Usar Deles",
  "conflict.editor.both": "Ambos",
  "conflict.editor.regionLabel": "Região {index}",
  "conflict.editor.navigate_one": "{current} de {total} conflito",
  "conflict.editor.navigate_other": "{current} de {total} conflitos",
  "conflict.editor.previewOurs": "Nosso ({label})",
  "conflict.editor.previewTheirs": "Deles ({label})",
  "conflict.editor.saveResolve": "Salvar e fazer stage",
  "conflict.editor.allResolved": "Todos os conflitos deste arquivo foram resolvidos.",
  "conflict.editor.remaining_one": "{count} conflito restante",
  "conflict.editor.remaining_other": "{count} conflitos restantes",
  "conflict.editor.fileLabel": "Arquivo",
  "conflict.editor.selectFile": "Selecione um arquivo para resolver",
  "conflict.editor.resolved": "Arquivo resolvido e adicionado ao stage",
  "conflict.editor.resolveFailed": "Falha ao resolver o arquivo",

  /* ---------------------------------------------------------------- */
  /* Dialogos de criar ref                                             */
  /* ---------------------------------------------------------------- */
  "createRef.startHint": "Vazio usa o HEAD atual. Aceita hash, ramo ou tag.",
  "createBranch.title": "Criar ramo",
  "createBranch.description":
    "Cria uma referência local nova apontando para o ponto de partida.",
  "createBranch.name": "Nome do ramo",
  "createBranch.name.placeholder": "feature/nome-curto",
  "createBranch.name.invalid": "Nome de ref inválido.",
  "createBranch.start": "Ponto de partida (opcional)",
  "createBranch.checkout": "Trocar para o ramo novo",
  "createBranch.checkout.hint":
    "Faz checkout depois de criar. Não confundir com troca de worktree, que é process.chdir.",
  "createBranch.op": "Criar ramo",
  "createBranch.done": "Ramo {name} criado",

  "createTag.title": "Criar tag",
  "createTag.description": "Marca um commit com um nome fixo.",
  "createTag.name": "Nome da tag",
  "createTag.name.invalid": "Nome de tag inválido.",
  "createTag.commit": "Commit (opcional)",
  "createTag.message": "Mensagem (opcional)",
  "createTag.message.placeholder": "Versão 1.0.0",
  "createTag.message.hint": "Com mensagem a tag é anotada (-a -m); sem mensagem é leve.",
  "createTag.annotated":
    "Tag anotada guarda autor, data e mensagem como objeto próprio no repositório.",
  "createTag.op": "Criar tag",
  "createTag.done": "Tag {name} criada",

  /* ---------------------------------------------------------------- */
  /* Dialogos de apagar ramo                                           */
  /* ---------------------------------------------------------------- */
  "deleteLocal.title": "Apagar o ramo {name}",
  "deleteLocal.description": "Remove apenas a referência local. O remoto não é tocado.",
  "deleteLocal.hold": "Segure para apagar",
  "deleteLocal.holdForce": "Segure para forçar (-D)",
  "deleteLocal.upstream":
    "{name} acompanha {upstream} ({ahead} à frente, {behind} atrás). O ramo no servidor continua existindo.",
  "deleteLocal.notMerged":
    "O git recusou: {name} não está totalmente mesclado. Com -D os commits que só existem nele ficam inalcançáveis e somem no próximo gc.",
  "deleteLocal.safe":
    "Com -d o git só apaga se o ramo já estiver mesclado. Se recusar, a opção -D aparece aqui.",
  "deleteLocal.op": "Apagar ramo {name}",
  "deleteLocal.done": "Ramo {name} apagado",

  "deleteRemote.title": "Apagar {name} no servidor",
  "deleteRemote.description": "Isto é um push de deleção: o ramo deixa de existir no remoto.",
  "deleteRemote.hold": "Segure para apagar no servidor",
  "deleteRemote.warning":
    "Apaga {name} NO SERVIDOR {remote}. Todo mundo que usa esse remoto perde a referência, e nenhum comando local desfaz isso. A cópia local continua onde está.",
  "deleteRemote.noRemote": "(sem remoto)",
  "deleteRemote.field.remote": "Remoto",
  "deleteRemote.op": "Apagar {remote}/{name}",
  "deleteRemote.done": "{remote}/{name} apagado no servidor",

  /* ---------------------------------------------------------------- */
  /* Dialogo de adicionar remoto                                       */
  /* ---------------------------------------------------------------- */
  "addRemote.title": "Adicionar remoto",
  "addRemote.description": "Cadastra um destino de fetch e push neste repositório.",
  "addRemote.name": "Nome",
  "addRemote.name.hint": "Como o remoto vai aparecer em git remote -v.",
  "addRemote.name.invalid": "Nome inválido: use letras, números, ponto, hífen ou sublinhado.",
  "addRemote.name.duplicated": "Já existe um remoto chamado {name}.",
  "addRemote.url": "Url",
  "addRemote.url.hint": "https://host/org/repo.git, ssh://host/caminho ou git@host:org/repo.git",
  "addRemote.url.invalid":
    "Url inválida. Use https://host/org/repo.git ou git@host:org/repo.git.",
  "addRemote.https":
    "Url https: fetch e push passam pelo trampolim GIT_ASKPASS. Na primeira vez o GitCraque vai pedir usuário e token para {host} numa caixa própria — o git nunca fica travado num prompt.",
  "addRemote.https.thisHost": "este host",
  "addRemote.ssh":
    "Url ssh: a autenticação é do seu agente de chaves. Se a chave tiver passphrase, o pedido também chega pela caixa de credenciais.",
  "addRemote.op": "Adicionar remoto",
  "addRemote.done": "Remoto {name} adicionado",

  /* ---------------------------------------------------------------- */
  /* Dialogo de credenciais                                            */
  /* ---------------------------------------------------------------- */
  "credential.title.username": "Usuário para {host}",
  "credential.title.secret": "Senha ou token para {host}",
  "credential.description":
    "O git está esperando esta resposta para continuar. Nada é escrito em disco nem vai para a linha de comando.",
  "credential.expiresIn": "Expira em {seconds}s",
  "credential.expired": "Pedido expirado",
  "credential.send": "Enviar ao git",
  "credential.prompt": "O git pediu",
  "credential.host": "Host: {host}",
  "credential.field.username": "Usuário",
  "credential.field.username.placeholder": "seu-usuario",
  "credential.field.secret": "Senha ou token de acesso",
  "credential.remember": "Lembrar nesta sessão",
  "credential.remember.hint":
    "Guarda no cofre em memória do servidor até ele ser encerrado. Nunca vai para disco.",
  "credential.note":
    "O valor segue por um socket unix até o cofre e de lá para o stdout do askpass. Ele não entra no env do processo do git (que qualquer um lê em /proc) nem em argv.",

  /* ---------------------------------------------------------------- */
  /* Seletor de repositorios                                           */
  /* ---------------------------------------------------------------- */
  "picker.dialog.title": "Abrir repositório",
  "picker.dialog.description":
    "Trocar de repositório faz process.chdir() no servidor e recarrega a View Tree inteira. Nenhum checkout acontece.",
  "picker.search.placeholder": "Filtrar por nome, ou colar um caminho e apertar Enter",
  "picker.search.aria": "Filtrar repositórios ou digitar um caminho",
  "picker.search.clear": "Limpar filtro",
  "picker.enter.navigate": "Enter navega para {path}",
  "picker.enter.open": "Enter abre {path}",
  "picker.tabs.aria": "Onde procurar o repositório",
  "picker.tab.favorites": "Favoritos",
  "picker.tab.recents": "Recentes",
  "picker.tab.search": "Buscar",
  "picker.tab.scan": "Procurar",
  "picker.tab.browse": "Navegar",
  "picker.search.historyEmpty":
    "Nenhuma pasta git conhecida ainda. Use Procurar ou Navegar — tudo que aparecer por lá fica guardado aqui.",
  "picker.search.noMatch": "Nenhum repositório conhecido casa com a busca.",
  "picker.search.insideOf": "dentro de {name}",
  "picker.search.note_one": "Busca em {count} pasta git já vista, esteja ela onde estiver.",
  "picker.search.note_other": "Busca em {count} pastas git já vistas, estejam elas onde estiverem.",
  "picker.recents.empty": "Nenhum repositório aberto ainda. Use Procurar ou Navegar.",
  "picker.recents.noMatch": "Nenhum recente casa com o filtro.",
  "picker.recents.forget": "Esquecer {name}",
  "picker.recents.forgetTitle": "Remover dos recentes",
  "picker.scan.notStarted": "Varredura não iniciada.",
  "picker.scan.empty": "Nenhum repositório nas pastas conhecidas. Tente a aba Navegar.",
  "picker.scan.noMatch": "Nenhum resultado casa com o filtro.",
  "picker.scan.none.title": "Nenhum repositório encontrado",
  "picker.scan.none.body": "{scanned} pastas visitadas em {ms} ms — use a aba Navegar",
  "picker.scan.failed": "A varredura falhou",
  "picker.scan.again": "Varrer de novo",
  "picker.scan.running": "Varrendo…",
  "picker.scan.truncated": "A varredura parou no teto de tempo — nem tudo foi visitado.",
  "picker.scan.note":
    "Procura nas pastas conhecidas (pessoal, Projects, code, /opt, /srv), até 4 níveis.",
  "picker.browse.pickStart": "Escolha um ponto de partida.",
  "picker.browse.noSubfolders": "Nenhuma subpasta aqui.",
  "picker.browse.isRepo": "repositório git",
  "picker.browse.bare": "bare",
  "picker.browse.linkedWorktree": "worktree ligada",
  "picker.browse.tooMany":
    "A pasta tem mais subpastas do que o teto de listagem — refine com o filtro.",
  "picker.browse.gitInit": "git init em {name}",
  "picker.browse.openHere": "Abrir esta pasta",
  "picker.browse.open": "Abrir",
  "picker.browse.openRepo": "Abrir {name}",
  "picker.browse.openRepoTitle": "Abrir este repositório — o clique na linha só entra na pasta",
  "picker.favorites.note":
    "Arraste pela alça para ordenar, o lápis dá um apelido, a estrela desafixa. Ao contrário dos recentes, nada entra nem sai daqui sozinho.",
  "picker.favorites.unavailableNote":
    "Fixar projetos depende de uma rota que este servidor ainda não expõe.",
  "picker.footer.keys":
    "Setas navegam, Enter abre. Abrir um repositório faz {chdir} no servidor — não há checkout.",

  "favorites.unavailable": "Favoritos indisponíveis nesta versão do servidor.",
  "favorites.empty":
    "Nenhum projeto fixado. Clique na estrela de um repositório em Recentes, Procurar ou Navegar para fixá-lo aqui.",
  "favorites.noMatch": "Nenhum favorito casa com o filtro.",
  "favorites.pin": "Fixar {name} nos favoritos",
  "favorites.unpin": "Desafixar {name} dos favoritos",
  "favorites.pinTitle": "Fixar nos favoritos",
  "favorites.unpinTitle": "Remover dos favoritos",
  "favorites.reorder": "Reordenar {name}",
  "favorites.reorderTitle": "Arraste para reordenar (ou Alt + setas)",
  "favorites.rename": "Renomear {name}",
  "favorites.renameTitle": "Dar um apelido a este projeto",
  "favorites.remove": "Remover",
  "favorites.label": "Apelido do projeto",
  "favorites.editHint": "Enter salva · Esc desiste",
  "favorites.filterHint":
    "Limpe o filtro para reordenar — com a lista parcial não dá para saber a ordem inteira.",
  "favorites.error.unpin": "Não foi possível desafixar o projeto",
  "favorites.error.pin": "Não foi possível fixar o projeto",
  "favorites.error.rename": "Não foi possível renomear o favorito",
  "favorites.error.reorder": "Não foi possível reordenar os favoritos",
  "favorites.a11y.instructions":
    "Para reordenar com o teclado, foque a alça do projeto e pressione espaço ou Enter. Use as setas para escolher a nova posição e pressione espaço ou Enter de novo para soltar, ou Escape para cancelar. Alt com as setas move o projeto sem entrar no modo de arrasto.",
  "favorites.a11y.start": "Reordenando {name}, posição {index} de {total}.",
  "favorites.a11y.over": "Será solto na posição {index} de {total}.",
  "favorites.a11y.outside": "Fora da lista.",
  "favorites.a11y.end": "{name} foi para a posição {index}.",
  "favorites.a11y.unchanged": "A ordem não mudou.",
  "favorites.a11y.cancel": "Reordenação de {name} cancelada.",

  /* ---------------------------------------------------------------- */
  /* Dialogo de clone                                                  */
  /* ---------------------------------------------------------------- */
  "clone.title": "Clonar repositório",
  "clone.description": "Baixa um repositório remoto para uma pasta local. Ao terminar, o GitCraque já abre o repo clonado.",
  "clone.confirm": "Clonar",
  "clone.field.url": "Url",
  "clone.field.url.placeholder": "https://github.com/org/repo.git",
  "clone.field.url.hint": "https://..., git@..., ssh://... ou caminho local",
  "clone.field.path": "Pasta destino",
  "clone.field.path.placeholder": "~/code/meu-projeto",
  "clone.field.path.hint": "A pasta será criada pelo git clone — não pode existir antes.",
  "clone.field.branch": "Branch (opcional)",
  "clone.field.branch.placeholder": "main",
  "clone.op": "Clonar repositório",
  "clone.done": "Clone concluído",

  /* tempo relativo do seletor */
  "time.now": "agora",
  "time.minutesAgo": "{count} min atrás",
  "time.hoursAgo": "{count} h atrás",
  "time.yesterday": "ontem",
  "time.daysAgo": "{count} dias atrás",

  /* ---------------------------------------------------------------- */
  /* Execucao de intencoes (executors.ts)                              */
  /* ---------------------------------------------------------------- */
  "exec.cherryPick.done": "Cherry-pick aplicado",
  "exec.merge.done": "Merge concluído",
  "exec.rebase.done": "Rebase concluído",
  "exec.deleteLocal.done": "Ramo apagado",
  "exec.deleteRemote.done": "Ramo remoto apagado",
  "exec.unknownRoute": "Rota desconhecida",
  "exec.unknownRoute.body": "A intenção pediu {endpoint}, que não tem execução mapeada.",

  /* ---------------------------------------------------------------- */
  /* Motor de DND — anuncios de leitor de tela                         */
  /* ---------------------------------------------------------------- */
  "dnd.entity.commit": "o commit",
  "dnd.entity.branch": "o ramo",
  "dnd.entity.remoteBranch": "o ramo remoto",
  "dnd.entity.tag": "a tag",
  "dnd.entity.stash": "o stash",
  "dnd.entity.item": "o item",
  "dnd.zone.branch": "o ramo",
  "dnd.zone.remoteBranch": "o ramo remoto",
  "dnd.zone.commit": "o commit",
  "dnd.zone.tag": "a tag",
  "dnd.zone.trash": "a lixeira",
  "dnd.zone.target": "o alvo",
  "dnd.a11y.instructions":
    "Para arrastar com o teclado, pressione espaço ou Enter com o item focado. Use as setas para percorrer os alvos; a cada alvo o motor anuncia se a operação é aceita. Pressione espaço ou Enter de novo para soltar, ou Escape para cancelar. Soltar não executa nada: um diálogo pede a confirmação.",
  "dnd.a11y.dragging": "Arrastando {what}.",
  "dnd.a11y.outside": "{what} fora de qualquer alvo.",
  "dnd.a11y.overAccepts": "Sobre {where}. Aceita: {title}.",
  "dnd.a11y.overRejects": "Sobre {where}. Recusado: {reason}",
  "dnd.a11y.droppedOutside": "{what} solto fora de um alvo. Nada foi feito.",
  "dnd.a11y.dropped": "{what} solto sobre {where}. Confirme a operação no diálogo.",
  "dnd.a11y.refused": "Operação recusada: {reason}",
  "dnd.a11y.cancelled": "Arrasto de {what} cancelado.",
  "dnd.a11y.cancelledPlain": "Arrasto cancelado.",
  "dnd.chip.no": "não",
  // Dica proativa do DragOverlay no toque: mostra enquanto o dedo arrasta sem
  // nenhum alvo sob ele. Nao e bronca apos o gesto — e ajuda DURANTE.
  "dnd.drop.missed.title": "Arraste sobre um ramo",
  "dnd.drop.missed.body": "Solte sobre um chip de ramo para mesclar, rebasear ou aplicar um commit.",

  /* ---------------------------------------------------------------- */
  /* Motor de DND — intencoes (intents.ts)                             */
  /* ---------------------------------------------------------------- */
  "intent.invalid.title": "Movimento não permitido",
  "intent.sameRef.title": "Mesma referência",
  "intent.sameRef": "Origem e destino são a mesma referência ({label}).",
  "intent.tag.noDrag":
    "Tags não se movem por arrasto: mover a tag {label} exigiria recriá-la. Use o diálogo de tags.",
  "intent.stash.noDrag":
    "Stash não se aplica por arrasto. Use aplicar ou descartar em {label} no rail.",
  "intent.unknownSource": "Tipo de origem desconhecido para o motor de intenções.",
  "intent.unknownTarget.commit": "Alvo desconhecido para um commit.",
  "intent.unknownTarget.branch": "Alvo desconhecido para um ramo.",
  "intent.unknownTarget.remoteBranch": "Alvo desconhecido para um ramo remoto.",

  "intent.commit.toCommit":
    "Dois commits não formam operação. Arraste o commit para um ramo para fazer cherry-pick.",
  "intent.commit.toRemote":
    "Não se aplica commit direto num ramo remoto. Faça cherry-pick no ramo local e depois push para {label}.",
  "intent.commit.toTag":
    "Uma tag aponta para um commit, ela não recebe commits. Crie uma tag nova pelo diálogo de tags.",
  "intent.commit.toTrash":
    "Commit não se apaga por arrasto. Use reset ou revert pelo menu do commit.",

  "intent.branchBusy.title": "Ramo ocupado em outra worktree",
  "intent.cherryPick.busy":
    "O ramo {branch} está checado na worktree {worktree}. O cherry-pick precisa fazê-lo virar HEAD; troque de worktree antes.",
  "intent.cherryPick.onHead":
    "Aplica o commit {hash}{subject} sobre {branch}, que é o ramo atual. Cria um commit NOVO; nada é reescrito.",
  "intent.cherryPick.offHead":
    "Aplica o commit {hash}{subject} sobre {branch}. Como {branch} não é o ramo atual, o backend faz o checkout antes — e para isso que vai o campo \"onto\". Cria um commit NOVO; nada é reescrito.",
  "intent.cherryPick.label": "Cherry-pick em {branch}",
  "intent.cherryPick.title": "Cherry-pick em {branch}",

  "intent.branch.toRemote":
    "Arrastar um ramo local para um remoto seria um push, que precisa de remoto, upstream e force-with-lease. Use o diálogo de Push para enviar {label}.",
  "intent.branch.toCommit":
    "Mover {label} para outro commit é git reset, que descarta trabalho. Faça pelo menu do commit, não por arrasto.",
  "intent.branch.toTag": "Um ramo não vira tag por arrasto. Crie a tag pelo diálogo de tags.",

  "intent.integrate.busy":
    "O ramo {branch} está checado na worktree {worktree}. Merge e rebase precisam dele como HEAD; troque de worktree antes.",
  "intent.integrate.checkoutNote":
    " Como {into} não é o ramo atual, o backend faz o checkout antes — e para isso que vai o campo \"into\".",
  "intent.merge.label": "Merge de {from} em {into}",
  "intent.merge.description":
    "Traz os commits de {from} para {into}, criando um commit de merge. NENHUM histórico é reescrito.{checkoutNote}",
  "intent.rebase.label": "Rebase de {from} em cima de {into}",
  "intent.rebase.description":
    "REESCREVE {from}: os commits de {from} que ainda não estão em {into} são reaplicados um a um em cima de {into}. {into} não muda e não recebe nada.{upstreamNote}",
  "intent.rebase.upstreamNote":
    " {name} acompanha {upstream}{gap}: depois do rebase o push vai exigir --force-with-lease.",
  "intent.rebase.upstreamGap": " ({ahead} à frente, {behind} atrás)",
  "intent.integrate.title": "{from} para {into}",
  "intent.integrate.description":
    "Escolha como integrar {from} em {into}. Merge preserva o histórico dos dois; rebase reescreve {from}.{tail}",
  "intent.integrate.noRebaseRemote":
    " Rebase não entra na lista: {from} é um ramo remoto e não pode ser reescrito daqui — para reescrever {into} em cima dele, use Pull com rebase.",
  "intent.integrate.noRebaseBusy":
    " Rebase não entra na lista: {from} está checado na worktree {worktree} e teria de virar HEAD.",

  "intent.delete.currentBranch.title": "Ramo atual",
  "intent.delete.currentBranch":
    "{name} é o ramo atual e o git não apaga o ramo em que você está. Troque de ramo antes.",
  "intent.delete.busy":
    "{name} está checado na worktree {worktree}. O git não apaga um ramo checado em nenhuma worktree.",
  "intent.delete.local.description":
    "Remove o ramo LOCAL {name}. Commits que só existiam nele ficam inalcançáveis. O remoto não é tocado.",
  "intent.delete.local.title": "Apagar o ramo {name}",
  "intent.delete.local.label": "Apagar {name}",

  "intent.remote.toRemote":
    "Dois ramos remotos não formam operação local. Traga um deles para um ramo local primeiro.",
  "intent.remote.toCommit":
    "Ramo remoto não se move para um commit daqui: quem move um ref no servidor é o push.",
  "intent.remote.toTag":
    "Um ramo remoto não vira tag por arrasto. Crie a tag pelo diálogo de tags.",
  "intent.remote.noRemote":
    "Não dá para descobrir o remoto de {label}. Apague pelo diálogo de ramos remotos.",
  "intent.delete.remote.description":
    "Apaga o ramo {name} NO SERVIDOR {remote}. Todo mundo que usa esse remoto perde a referência; isso não se desfaz com um comando local.",
  "intent.delete.remote.title": "Apagar {remote}/{name} no servidor",
  "intent.delete.remote.label": "Apagar {remote}/{name}",

  /* ---------------------------------------------------------------- */
  /* Menus de contexto (`app/menus.ts`)                                */
  /* ---------------------------------------------------------------- */
  "menu.reveal": "Levar a View Tree até aqui",
  "menu.copyName": "Copiar nome",
  "menu.copyPath": "Copiar o caminho",
  "menu.copyFileName": "Copiar o nome do arquivo",

  "menu.hint.current": "atual",
  "menu.hint.isCurrent": "é a atual",
  "menu.hint.detached": "detached",
  "menu.hint.chdir": "process.chdir",

  "menu.commit.squashSelected": "Squash dos {count} commits",
  "menu.commit.cherryPickSelected": "Cherry-pick dos {count} na branch atual",
  "menu.commit.copyHashes": "Copiar os hashes",
  "menu.commit.clearSelection": "Limpar a seleção",
  "menu.commit.checkout": "Checkout deste commit",
  "menu.commit.createTag": "Criar tag aqui",
  "menu.commit.cherryPick": "Cherry-pick na branch atual",
  "menu.commit.revert": "Reverter",
  "menu.commit.reset": "Reset da branch atual até aqui",
  "menu.commit.copyHash": "Copiar hash",
  "menu.commit.copySubject": "Copiar assunto",

  "menu.branch.mergeInto": "Mesclar em {branch}",
  "menu.branch.rebaseOnto": "Rebasear {branch} sobre esta",
  "menu.branch.createFrom": "Criar branch a partir daqui",
  "menu.remoteBranch.checkoutExisting": "Checkout de {name}",
  "menu.remoteBranch.checkoutNew": "Checkout (cria a local rastreando)",

  "menu.remote.fetch": "Fetch --prune deste remoto",
  "menu.remote.copyFetchUrl": "Copiar url de fetch",
  "menu.remote.browse": "Abrir no navegador",
  "menu.stash.show": "Ver conteúdo",
  "menu.stash.copyMessage": "Copiar a mensagem",
  "menu.worktree.switch": "Trocar para esta worktree",

  "menu.file.view": "Ver no visualizador",
  "menu.commitFile.view": "Ver neste commit",
  "menu.commitFile.viewWorking": "Ver a versão da árvore de trabalho",
  "menu.commitFile.blame": "Blame — quem mexeu em cada linha",

  "menu.viewer.blame": "Blame — quem mexeu em cada linha",

  "menu.viewer.copySelection": "Copiar a seleção",
  "menu.viewer.nothingSelected": "nada marcado",
  "menu.viewer.chars": "{count} car.",
  "menu.viewer.copySourceHash": "Copiar o hash de origem",
  "menu.viewer.viewMode": "Ver em {mode}",
  "menu.viewer.openWorking": "Abrir a versão da árvore de trabalho",

  /* ---------------------------------------------------------------- */
  /* Copia para a area de transferencia                                */
  /* ---------------------------------------------------------------- */
  "copy.hash": "Hash copiado",
  "copy.hashes": "Hashes copiados",
  "copy.subject": "Assunto copiado",
  "copy.name": "Nome copiado",
  "copy.path": "Caminho copiado",
  "copy.url": "Url copiada",
  "copy.message": "Mensagem copiada",
  "copy.selection": "Seleção copiada",
  "copy.failed": "Não foi possível copiar: {label}",
  "copy.failed.body": "O navegador recusou o acesso à área de transferência.",

  /* ---------------------------------------------------------------- */
  /* Acoes que a main acrescentou                                      */
  /* ---------------------------------------------------------------- */
  "action.fetchRemote.op": "Fetch {remote}",
  "action.fetchRemote.done": "Fetch de {remote} concluído",

  "action.detached.title": "HEAD detached",
  "action.merge.detached.body":
    "Não há branch atual para receber o merge. Faça checkout de uma branch antes.",
  "action.merge.title": "Merge de {source} em {target}",
  "action.merge.description":
    "Traz os commits de {source} para {target}. NENHUM histórico é reescrito; se houver divergência, nasce um commit de merge.",
  "action.merge.confirm": "Merge",
  "action.merge.noFf.hint": "commit de merge mesmo quando daria fast-forward",
  "action.merge.squash.hint": "junta tudo no index sem commitar nem gravar o merge",
  "action.merge.op": "Merge",
  "action.merge.done": "{source} mesclado em {target}",

  "action.rebase.detached.body":
    "Rebase precisa de uma branch atual para reescrever. Faça checkout de uma branch antes.",
  "action.rebase.title": "Rebase de {branch} sobre {onto}",
  "action.rebase.description":
    "REESCREVE {branch}: os commits que ela tem e {onto} não tem são reaplicados um a um em cima de {onto}. {onto} não muda. Se {branch} já foi publicada, o próximo push vai exigir --force-with-lease.",
  "action.rebase.confirm": "Rebase",
  "action.rebase.op": "Rebase",
  "action.rebase.done": "{branch} rebaseada sobre {onto}",

  "action.checkoutCommit.title": "Checkout de {hash}",
  "action.checkoutCommit.description":
    "Leva a árvore de trabalho até {what} com o HEAD DETACHED: nenhuma branch acompanha o que você commitar daqui. Para voltar, faça checkout de uma branch; para ficar, crie uma branch neste ponto.",
  "action.checkoutCommit.done": "Detached em {hash}",

  "action.cherryPick.title_one": "Cherry-pick de {hash}",
  "action.cherryPick.title_other": "Cherry-pick de {count} commits",
  "action.cherryPick.description":
    "Aplica {what} sobre {target}. Cria commits NOVOS, com hashes novos; nada é reescrito. O backend reordena do mais antigo para o mais novo antes de aplicar.",
  "action.cherryPick.what_one": "{subject}",
  "action.cherryPick.what_other": "os {count} commits selecionados",
  "action.cherryPick.currentHead": "o HEAD atual",
  "action.cherryPick.confirm": "Cherry-pick",
  "action.cherryPick.noCommit.hint": "aplica no index e para, sem criar commit",
  "action.cherryPick.op": "Cherry-pick",
  "action.cherryPick.done": "Cherry-pick concluído",

  "action.revert.title": "Reverter {hash}",
  "action.revert.description":
    "Cria um commit NOVO que desfaz {what}. O commit original continua no histórico — nada é reescrito.",
  "action.revert.confirm": "Reverter",
  "action.revert.noCommit.hint": "desfaz no index e para, sem criar commit",
  "action.revert.op": "Revert",
  "action.revert.done": "{hash} revertido",

  "action.reset.title": "Reset de {branch} para {hash}",
  "action.reset.description":
    "Move {branch} para {hash}. Os commits que ficarem para trás deixam de ser alcançáveis por esta branch. Com --hard, as alterações da árvore de trabalho também vão embora e não há desfazer.",
  "action.reset.confirm": "Reset",
  "action.reset.field.mode": "Modo",
  "action.reset.mode.soft": "--soft — move a branch; index e árvore intactos",
  "action.reset.mode.mixed": "--mixed — move a branch e limpa o index; árvore intacta",
  "action.reset.mode.hard": "--hard — move tudo e DESCARTA a árvore de trabalho",
  "action.reset.op": "Reset",
  "action.reset.done": "Reset --{mode} para {hash}",
  "action.reset.head": "o HEAD",

  "action.discard.title_one": "Descartar {path}",
  "action.discard.title_other": "Descartar {count} arquivos",
  "action.discard.description_one":
    "Devolve o arquivo ao estado do último commit. O que não estava commitado se perde, e o git não guarda cópia disso.",
  "action.discard.description_other":
    "Devolve os arquivos ao estado do último commit. O que não estava commitado se perde, e o git não guarda cópia disso.",
  "action.discard.confirm": "Descartar",

  "graph.copyHash": "Copiar o hash completo",
  "graph.copyHash.aria": "Copiar o hash {hash}",
  "graph.copyHash.failed": "Não deu para copiar o hash",
  "graph.tooltip.files_one": "{count} arquivo alterado",
  "graph.tooltip.files_other": "{count} arquivos alterados",
  "argv.name": "<nome>",
  "argv.newName": "<novo-nome>",
  "argv.url": "<url>",
  "argv.path": "<caminho>",

  /* ---- agente por voz e por texto ---- */
  "agent.button.aria": "Falar um comando para o agente",
  "agent.state.idle": "Segure para falar",
  "agent.state.recording": "Ouvindo…",
  "agent.state.transcribing": "Transcrevendo…",
  "agent.state.running": "Trabalhando…",
  "agent.heard": "Você disse",
  "agent.typed": "Você pediu",
  "agent.placeholder": "Diga o que você quer fazer no repositório…",
  "agent.send": "Enviar",
  "agent.stop": "Parar",
  "agent.close": "Fechar",
  "agent.commands": "Comandos disparados",
  "agent.done": "Pronto",
  "agent.failed": "O agente parou",
  "agent.cost": "Custo desta sessão: US$ {cost}",
  "agent.empty": "Não entendi nada do áudio. Tente de novo.",
  "agent.busy": "O agente já está trabalhando.",
  "agent.micDenied": "O navegador não liberou o microfone.",
  "agent.micMissing": "Nenhum microfone disponível neste navegador.",
  "agent.noKey": "Falta a chave da OpenRouter.",
  "agent.noKey.hint": "Configure OPENROUTER_API_KEY ou grave a chave nas configurações.",
  "agent.piDownload": "O pi vai ser baixado na primeira execução — isso demora um pouco.",

  /* ---- área de IA trancada: falta a chave da OpenRouter ---- */
  "ai.locked.title": "Funções de IA bloqueadas",
  "ai.locked.body":
    "O servidor não encontrou nenhuma chave da OpenRouter. Cole uma aqui para liberar o agente.",
  "ai.locked.placeholder": "sk-or-v1-…",
  "ai.locked.unlock": "Desbloquear",
  "ai.locked.hint":
    "A chave vai direto para o servidor e fica só lá, com permissão 0600. O navegador nunca a recebe de volta.",

  /* ---------------------------------------------------------------- */
  /* Toque e tela estreita — celular, tablet e telas sensiveis ao toque */
  /*                                                                    */
  /* `mobile.*` e o que so existe quando a tela mostra UM painel por    */
  /* vez; `touch.*` e o vocabulario de gesto, que vale em qualquer      */
  /* tamanho de tela sem mouse. O resto entra no namespace do           */
  /* componente que ja existe.                                          */
  /* ---------------------------------------------------------------- */

  /* -- navegacao de painel unico -- */
  "mobile.nav.label": "Navegação entre painéis",
  "mobile.nav.repo": "Repo",
  "mobile.nav.history": "Histórico",
  "mobile.nav.detail": "Detalhe",
  "mobile.nav.changes": "Alterações",
  "mobile.nav.announce": "Painel {panel} em exibição.",
  "mobile.panel.close": "Fechar painel",
  "mobile.panel.close.title": "Fechar este painel e voltar ao histórico",

  /* -- orientacao do aparelho -- */
  "mobile.orientation.hint": "Gire o aparelho para o modo paisagem — o histórico ganha largura.",

  /* -- gestos de toque; nenhum texto aqui fala de mouse -- */
  "touch.longPress.menu": "Toque e segure para ver as opções",
  "touch.longPress.drag": "Toque e segure para arrastar",
  "touch.swipeDown.dismiss": "Arraste para baixo para fechar",
  "touch.swipe.panel": "Deslize para o lado para trocar de painel",
  "touch.grabber.label": "Alça — arraste para baixo para fechar",
  "touch.dnd.hint":
    "Neste aparelho o arrasto começa com um toque longo: segure o item até ele descolar da lista.",

  /* -- toolbar comprimida: o que nao coube vira menu -- */
  "toolbar.overflow.label": "Abrir as demais ações da barra",
  "toolbar.overflow.title": "Mais ações",
  "toolbar.network.label": "Ações de rede — fetch, pull e push",
  "toolbar.network.group": "Rede",

  /* -- busca de commits recolhida num botao -- */
  "search.open": "Abrir a busca de commits",
  "search.close": "Fechar a busca de commits",

  /* -- grafo em tela estreita: autor, data e hash somem -- */
  "graph.meta.reveal": "Mostrar autor, data e hash deste commit",
  "graph.meta.hide": "Esconder autor, data e hash deste commit",
  "graph.column.meta": "Detalhes",
  "graph.hint.horizontalScroll": "Com muitas linhas paralelas, o histórico rola também para o lado.",

  /* -- preferencia de layout, no modal de configuracoes -- */
  "settings.layout.title": "Layout",
  "settings.layout.mode": "Modo de exibição",
  "settings.layout.mode.auto": "Automático",
  "settings.layout.mode.compact": "Compacto",
  "settings.layout.mode.full": "Completo",
  "settings.layout.mode.hint":
    "Automático segue o tamanho da tela: uma coluna por vez no celular, as três no computador. Compacto e Completo cravam a escolha em qualquer tela.",
  "settings.layout.touchTargets": "Alvos de toque maiores",
  "settings.layout.touchTargets.hint":
    "Aumenta botões, linhas e áreas clicáveis mesmo quando há mouse. Útil em tela sensível ao toque de qualquer tamanho.",

  /* -- commit sem teclado fisico: o atalho nao serve de dica -- */
  "commit.button.touchTitle": "Toque para criar o commit com os arquivos preparados",

  /* ---------------------------------------------------------------- */
  /* Variantes de toque de texto que JA EXISTIA e ensina gesto de      */
  /* mouse. A chave original fica intacta — em ponteiro fino ela e     */
  /* mais precisa. O componente escolhe a irma `.touch` por `isTouch`. */
  /* Nenhuma delas pode citar mouse, clique ou botao direito.          */
  /* ---------------------------------------------------------------- */
  "detail.empty.body.touch":
    "Toque num commit da View Tree. Para um intervalo, ligue Selecionar vários: o primeiro e o último toque marcam as pontas e liberam o squash.",
  "detail.files.hint.touch": "toque para ver o diff embaixo",
  "detail.working.hint.touch": "toque para ver o diff",
  "detail.stash.body.touch":
    "Alterações guardadas neste stash. Toque para aplicar, ou use o menu para aplicar com pop.",
  "graph.refChip.hint.touch":
    "{ref} — toque duas vezes para trocar para esta branch; toque e segure para arrastar sobre outra e mesclar ou rebasear",
  "action.checkout.inUse.body.touch":
    "A branch está checada na worktree {worktree}. Toque nela em Worktrees para ir até lá — trocar de worktree não faz checkout.",
  "picker.favorites.note.touch":
    "Toque e segure na alça para arrastar e ordenar, o lápis dá um apelido, a estrela desafixa. Ao contrário dos recentes, nada entra nem sai daqui sozinho.",
  "favorites.reorderTitle.touch": "Toque e segure para arrastar e reordenar",

  /* ---------------------------------------------------------------- */
  /* Selecao de intervalo sem ⇧ — modo de selecao multipla por botao.  */
  /*                                                                   */
  /* A linha de commit JA e origem de arraste, e em toque o arraste    */
  /* comeca com toque longo (`touch.longPress.drag`). Por isso o       */
  /* intervalo NAO pode ser um toque longo: seria o mesmo gesto        */
  /* fisico no mesmo elemento. O caminho e um modo explicito, ligado   */
  /* por botao, em que o toque simples acumula — e enquanto ele estiver */
  /* ligado o arrasto fica suspenso.                                   */
  /* ---------------------------------------------------------------- */
  "selection.touch.enter": "Selecionar vários",
  "selection.touch.exit": "Concluir seleção",
  "selection.touch.hint":
    "Toque no primeiro commit e depois no último — o intervalo entre eles fica marcado. Enquanto o modo estiver ligado, o arrasto fica suspenso.",

  /* -- busca de commits promovida a folha de tela cheia -- */
  "search.sheet.title": "Busca de commits",

  /* -- rail como gaveta lateral, quando ele nao vira aba -- */
  "rail.drawer.open": "Abrir as referências do repositório",
  "rail.drawer.close": "Fechar as referências do repositório",

  /* -- faixa de IA: ela ocupa o lugar da barra de navegacao de baixo -- */
  "agent.collapse": "Recolher a faixa de IA",
  "agent.expand": "Abrir a faixa de IA",

  /* -- sem alvo de arraste de 4px, restaurar o padrao precisa de botao -- */
  "app.splitter.reset": "Restaurar as larguras padrão das colunas",
} as const;
