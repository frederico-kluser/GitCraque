# Pesquisa: commits fantasma no grafo (refs que vazam em `git log --all`)

Relatório de pesquisa web + verificação empírica local, produzido na onda
`onda1-pesquisa-ghosts` do GitCraque. Valida a correção já implementada
(`--exclude` antes de `--all`) e cobre as refs especiais que vazam na seleção.

Data: 2026-08-18. Git local usado nos testes empíricos: 2.43.0 (a versão que o
repo do projeto fixa nos testes).

---

## 1. Resumo executivo

- **O sintoma é comportamento documentado do git, não bug.** `--all` significa
  "todas as refs sob `refs/`, mais `HEAD`" — logo `refs/stash` e
  `refs/do-archive/*` (namespace custom) entram na seleção e seus commits
  aparecem no grafo como nós soltos.
- **A correção proposta está correta e é a prática canônica.** O SO 9437182
  recomenda `git log --exclude refs/stash --all` para esconder stash
  (resposta não aceita, Mikhail Burshteyn); a ordem (exclude **antes** de
  `--all`) é exigida pela própria doc do git ("the next `--all`,
  `--branches`, ...") e foi confirmada empiricamente nesta máquina (ordem
  errada não exclui nada).
- **Falha encontrada no código atual:** `getLog` (log.mjs:177) e `countCommits`
  (log.mjs:233) excluíam apenas `refs/do-archive/*`; faltava
  `--exclude=refs/stash` nos dois pontos (o log exibia os 2 commits do stash; o
  total divergia). **Corrigida na onda 1 (squash 69527ab9):** os dois pontos
  excluem stash e do-archive; a onda 2 consolidou os padrões em
  `EXCLUDED_REF_PATTERNS` e adicionou `refs/original/*` e `refs/rewritten/*`.
- **`*` cruza `/` no glob de exclusão** no git 2.43.0 (verificado: um glob
  `refs/do-archive/*` excluiu refs aninhadas `refs/do-archive/teste/xxx`) — o
  padrão atual está correto; não precisa virar `**`.
- **Apagar refs é a resposta errada aqui.** `git gc` preserva tudo que é
  alcançável de "qualquer coisa no namespace refs/*"; `refs/stash` guarda WIP
  legítimo do usuário e `refs/do-archive/*` pertence à ferramenta de
  orquestração. O certo é excluir da **seleção**, não deletar.
- GUIs (GitKraken, GitLens, Git Extensions, lazygit) tratam stash/refs de
  ferramenta como elementos separados do grafo ou os escondem — nunca como
  lixo a apagar.

---

## 2. O que o git faz

### 2.1 `--all` inclui TODAS as refs sob `refs/` — stash e namespaces custom incluídos

Doc oficial de `git-log` e `git-rev-list`:

> `--all` — "Pretend as if all the refs in `refs/`, along with `HEAD`, are
> listed on the command line as _<commit>_."

Isso cobre `refs/heads`, `refs/remotes`, `refs/tags` **e também** `refs/stash`,
`refs/original/*`, `refs/rewritten/*`, `refs/notes/*`, `refs/bisect/*` e
qualquer namespace custom como `refs/do-archive/*` ou `refs/jj/*`. A doc do
`--decorate` lista explicitamente `refs/stash/` entre os namespaces de
decoração por padrão:

> "If none of these options or config settings are given, then references are
> used as decoration if they match `HEAD`, `refs/heads/`, `refs/remotes/`,
> `refs/stash/`, or `refs/tags/`."

### 2.2 Por que o stash vira "2 commits soltos"

`git-stash` documenta a estrutura: o stash mais novo vive em `refs/stash` e os
antigos no reflog dessa ref (`stash@{n}`); cada entrada é um **commit merge**:

> "A stash entry is represented as a commit whose tree records the state of the
> working directory, and its first parent is the commit at `HEAD` when the entry
> was created. The tree of the second parent records the state of the index ..."
>
> "The latest stash you created is stored in `refs/stash`; older stashes are
> found in the reflog of this reference..."

Ou seja: **dois** commits ficam alcançáveis só por `refs/stash` — o `W`
(working tree, merge) e o `I` ("index on main: ..."). É exatamente o sintoma do
usuário: 2 commits "soltos e abandonados". Verificado empiricamente nesta
máquina (git 2.43.0): `git rev-list --all --count` = 5 num repo com main +
1 ref `refs/do-archive/*` + 1 stash; as linhas extras eram `refs/stash` W e I.

### 2.3 `--exclude=<glob-pattern>`: semântica e ordenação

Doc oficial (`git-log` / `git-rev-list`):

> "Do not include refs matching _<glob-pattern>_ that the **next** `--all`,
> `--branches`, `--tags`, `--remotes`, or `--glob` would otherwise consider.
> Repetitions of this option accumulate exclusion patterns up to the next
> `--all`, `--branches`, `--tags`, `--remotes`, or `--glob` option (**other
> options or arguments do not clear accumulated patterns**)."
>
> "The patterns given should not begin with `refs/heads`, `refs/tags`, or
> `refs/remotes` when applied to `--branches`, `--tags`, or `--remotes`,
> respectively, and they must begin with `refs/` when applied to `--glob` or
> `--all`. If a trailing _/\*_ is intended, it must be given explicitly."

Três consequências, todas verificadas empiricamente nesta máquina (git 2.43.0):

1. **A ordem é obrigatória.** O `--exclude` só afeta o seletor de refs que vem
   **depois** dele. `git rev-list --all --exclude=refs/do-archive/* --count`
   devolveu 5 (não excluiu NADA — o padrão ficou sem seletor à frente);
   `git rev-list --exclude=refs/do-archive/* --all --count` devolveu 4.
   Opções no meio (como `--pretty=format:...` entre o exclude e o `--all`) não
   limpam o padrão acumulado — a doc diz explicitamente que "other options or
   arguments do not clear accumulated patterns".
2. **O `*` cruza `/`** (no contexto de `--exclude`): um único padrão
   `refs/do-archive/*` excluiu **tanto** `refs/do-archive/simples` quanto a ref
   aninhada `refs/do-archive/teste/xxx`. A doc não especifica o comportamento de
   cruzamento (git-for-each-ref só diz que padrões casam "using `fnmatch`(3) or
   literally, in the latter case matching completely or from the beginning up
   to a slash"), mas o teste local é decisivo na versão em questão — e o teste
   de regressão do projeto (`server/test/log-exclude-archive.test.mjs`) fixa o
   caso aninhado (`refs/do-archive/teste/xxx`). Não é preciso `**` aqui.
3. **Um `/` final não basta**: "if a trailing `/*` is intended, it must be
   given explicitly" — `--exclude=refs/do-archive/` sozinho não excluiria nada.
   O código atual escreve `refs/do-archive/*`, com a estrela. Correto.

Contraste útil (doc git-log 2.24.0): `--branches`, `--tags`, `--remotes` e
`--glob` **implicam** `/*` no fim quando o padrão não tem `?`, `*` ou `[` —
mas `--exclude` **não** tem essa implicação; a estrela precisa ser explícita.

### 2.4 Decoração `%d`: o chip de ref

- `refs/stash` está no conjunto de decoração padrão — um commit alcançável por
  `refs/stash` ganha o chip `(refs/stash)` no `%d` (verificado empiricamente:
  `537b29d  (refs/stash) On main: meu wip legitimo`).
- Namespaces não-padrão (`refs/do-archive/*`, `refs/original/*`,
  `refs/rewritten/*`, `refs/notes/*`) **não** estão no conjunto padrão — o
  commit "wip" alcançável só por `refs/do-archive/teste/xxx` apareceu **sem**
  decoração nenhuma no `%d`.
- Com `--exclude=refs/stash`, os commits do stash saem da **seleção**, então a
  pergunta do chip nem chega a ocorrer. Se no futuro um commit de stash fosse
  alcançável por outro caminho, o git-log oferece `--decorate-refs-exclude`
  (opção documentada; a doc do `--clear-decorations` a referencia: "clears all
  previous `--decorate-refs` or `--decorate-refs-exclude` options") — mas a
  exclusão na seleção já resolve o caso.

---

## 3. Validação da correção proposta

**Veredito: CONFIRMADA com fontes e empiricamente.** A combinação
`git log --exclude=refs/do-archive/* --exclude=refs/stash --all` é:

| Aspecto | Veredito | Evidência |
|---|---|---|
| `--exclude` antes de `--all` | Correto e obrigatório | Doc git-log/rev-list: "the **next** `--all`..." (seção 2.3); empírico: ordem errada não exclui nada |
| Padrão `refs/do-archive/*` | Correto; `*` cruza `/` no 2.43.0 | Empírico: excluiu `refs/do-archive/teste/xxx` aninhada; teste de regressão do projeto fixa o caso |
| Excluir `refs/stash` | Correto e canônico | SO 9437182 (resposta não aceita, Mikhail Burshteyn): `--all --exclude=refs/stash` ainda incluiria o stash; `--exclude=refs/stash --all` o excluiria corretamente; alias popular `log --oneline --decorate --graph --exclude=refs/stash` |
| Bate com `--branches --remotes --tags` | Empírico: 190→166 no repo do usuário; neste lab: 5 → 2, idêntico ao `--branches --remotes --tags` (2) | Verificação local |

**Cuidado documentado pela resposta aceita do SO 9437182:** a resposta aceita
(Andrew Marshall) recomenda `git log --branches --remotes --tags --graph
--oneline --decorate` e adverte que filtragem pós-hoc do resultado pode ser
perigosa — "it can actually filter out the entire branch from the log" (o
alerta é sobre filtrar o output depois da seleção, em geral; o `--exclude`
filtra a seleção de refs na origem, que é o caminho seguro recomendado aqui).

**Falha encontrada e já corrigida:** a pesquisa encontrou que só existia
`--exclude=refs/do-archive/*` em `getLog` (server/src/git/log.mjs:177) e em
`countCommits` (server/src/git/log.mjs:233), sem `--exclude=refs/stash` nos
**dois** lugares (o teste log-exclude-archive.test.mjs não criava stash, por
isso não pegou). **Implementado na onda 1 (squash 69527ab9):**
`--exclude=refs/stash` entrou nos dois pontos; o splice
(`[...LOG_ARGS.slice(0,1), "--exclude=...", ...LOG_ARGS.slice(1)]`) já
colocava os excludes na posição correta — bastou adicionar o segundo padrão na
mesma lista, e o teste ganhou um case de stash no fixture. **Na onda 2** os
padrões foram consolidados na constante `EXCLUDED_REF_PATTERNS`
(server/src/git/log.mjs), consumida por `getLog` e `countCommits`, com
`refs/original/*` e `refs/rewritten/*` acrescentados. O `LOG_ARGS` congelado
(`server/src/contract.mjs:20`) não muda; a exclusão é um acréscimo fora dele,
exatamente como a regra de produto permite.

---

## 4. Outras refs especiais que vazam em `--all`

Pela definição de `--all` (seção 2.1), **qualquer** ref sob `refs/` entra.
Mapeamento das refs especiais comuns:

| Namespace | Quem cria | Vaza no `--all`? | Recomendação |
|---|---|---|---|
| `refs/stash` | `git stash` | Sim (W + I por stash) | **Excluir da seleção** (nunca apagar: é dado do usuário). É o caso do usuário |
| `refs/do-archive/*` | Ferramenta de orquestração (namespace custom) | Sim | **Excluir da seleção** (a ferramenta gerencia; o app não pode apagar). É o caso do usuário (34 refs) |
| `refs/original/*` | `git filter-branch` (backup dos originais) | Sim | Doc do filter-branch: "The original refs, if different from the rewritten ones, will be stored in the namespace `refs/original/`". A própria doc manda deletá-los ao fim: `git for-each-ref --format="%(refname)" refs/original/ \| xargs -n 1 git update-ref -d`. Pro Git: são eles que "still do [keep the old commits alive], so you have to remove them and then repack". Recomendação: excluir da seleção de forma defensiva **e** documentar a limpeza pós-rewrite ao usuário |
| `refs/rewritten/*` | `git rebase` (labels do sequencer) | Só se o rebase for interrompido | Doc do rebase: "These labels are created as worktree-local refs (`refs/rewritten/<label>`) that **will be deleted when the rebase finishes**". Transitório; excluir é barato e defensivo |
| `refs/notes/*` | `git notes` | Sim (o commit de notas é um commit de verdade) | Doc: "By default, notes are saved to and read from `refs/notes/commits`"; "Every notes change creates a **new commit** at the specified notes ref". Se o repo usar notes, aparece um nó solto por ref de notas. Excluir só se o app não exibir notas; hoje o app não usa notes |
| `refs/bisect/*` | `git bisect` interrompido | Sim, enquanto durar | Doc do git-log (`--bisect`): "Pretend as if the bad bisection ref `refs/bisect/bad` was listed and as if it was followed by `--not` and the good bisection refs `refs/bisect/good-*`" — prova de que são refs reais sob `refs/`. Transitório e iniciado pelo usuário; o `git bisect reset` limpa. Sem exclusão obrigatória |
| `refs/replace/*` | `git replace` | Potencial (refs sob `refs/`) | Caso raro; sem fonte direta consultada sobre exibição no grafo — a regra geral (`--all` = tudo sob `refs/`) já cobre a defesa. Menção de cunho preventivo |

Princípio: o `--all` é um "guarda-chuva"; o app precisa de uma lista pequena e
explícita de namespaces de ferramenta a esconder. O lazygit tem o mesmo
problema e a mesma solução — o issue 5332 pede exatamente `--exclude refs/jj/*`
para o `git log --all` da visão "all commits" (refs criadas pelo Jujutsu
"spam the view").

---

## 5. Limpeza de refs: apagar vs excluir da seleção

**Regra de ouro: enquanto a ref existir, o `gc` nunca remove o commit.**

Doc do `git-gc` (NOTES):

> "git gc tries very hard not to delete objects that are referenced anywhere
> in your repository. In particular, it will keep not only objects referenced
> by your current set of branches and tags, but also objects referenced by the
> index, remote-tracking branches, reflogs ..., **and anything else in the
> refs/\* namespace**."

Consequência prática: rodar `git gc`/`git maintenance` **não** resolve o
sintoma do usuário — os commits dos 34 refs `do-archive` e do stash continuam
alcançáveis e aparecem no `--all`. O fix é de seleção, não de limpeza.

**Quando é seguro apagar:**

- `refs/original/*` — a doc do filter-branch manda apagar depois da reescrita
  (comando na seção 4); Pro Git confirma que é o passo do "shrink".
- `refs/rewritten/*` — transitórios; podem ser apagados se um rebase morreu no
  meio e os labels sobraram.
- `refs/bisect/*` — `git bisect reset` limpa; apagar à mão só em bisect
  abandonado.
- Stashes **dropados** (`git stash drop`/`clear`) viram unreachable e "will
  then be subject to pruning, and may be impossible to recover" (doc
  git-stash). Ou seja: o git já cuida; o app não deve "limpar" stash.

**Quando NUNCA apagar:**

- `refs/stash` — `git update-ref -d refs/stash` destrói o stash mais novo
  (e o `git stash drop` existe justamente para isso com segurança). O usuário
  tem WIP legítimo. O certo é excluir da seleção.
- `refs/do-archive/*` — gerida pela ferramenta de orquestração; apagar por fora
  corrompe o estado dela. O certo é excluir da seleção.

**Como o git expira o resto (segurança embutida):**

- `git reflog expire`: "Entries older than `expire` time, or entries older than
  `expire-unreachable` time and not reachable from the current tip, are removed
  from the reflog. This is typically not used directly by end users — instead,
  see git-gc". Defaults: `gc.reflogExpire` = 90 dias; `gc.reflogExpireUnreachable`
  = 30 dias; configuração pode ser por padrão de ref: "With '<pattern>'
  (e.g. 'refs/stash') in the middle the setting applies only to the refs that
  match the pattern" (`gc.refs/stash.reflogExpire = never` protege o stash).
- `git prune` só remove objetos unreachable (soltos): "Prune all unreachable
  objects ... In most cases, users should run _git gc_, which calls _git prune_".
- `git maintenance` (recomendado pela doc como o front-end moderno do gc):
  a tarefa `gc` "cleans up unnecessary files and optimize[s] the local
  repository", a tarefa `reflog-expire` apaga entradas antigas.
- Pro Git, capítulo "Maintenance and Data Recovery": o reflog segura commits
  "perdidos" vivos; para purgar de verdade: remover refs de backup
  (`.git/refs/original`), remover `.git/logs`, `git gc` e `git prune --expire now`
  — com o aviso: "Be warned: this technique is destructive to your commit
  history".

**Resumo da decisão:** limpeza destrutiva é para refs de **backup/transitórias**
após a operação que as criou (filter-branch, rebase morto, bisect abandonado).
Para refs **vivas** (stash, archive de ferramenta), a resposta é excluir da
seleção do log — que é o que o GitCraque já faz: `do-archive` e `stash` desde
a onda 1, e `refs/original/*` e `refs/rewritten/*` desde a onda 2, via
`EXCLUDED_REF_PATTERNS`.

---

## 6. Recomendações acionáveis para o código do GitCraque

1. **Adicionar `--exclude=refs/stash` nos dois pontos** — **implementado na
   onda 1 (squash 69527ab9)**, mantendo a posição (entre o subcomando e o
   `--all` do `LOG_ARGS`):
   - `server/src/git/log.mjs` (`getLog`): a lista de excludes virou
     `["--exclude=refs/do-archive/*", "--exclude=refs/stash"]` (e depois os
     dois padrões novos da onda 2, abaixo).
   - `server/src/git/log.mjs` (`countCommits`): o mesmo segundo exclude —
     senão o total volta a divergir das linhas (o teste
     `log-exclude-archive.test.mjs` garante `total === commits.length` e ganhou
     um case de stash no fixture para cobrir o caso).
   - `LOG_ARGS` (contract.mjs:20) permanece byte-congelado; a exclusão é um
     acréscimo fora dele, como já é hoje.
2. **Centralizar os padrões de exclusão** num único array
   (`EXCLUDED_REF_PATTERNS` no server/src/git/log.mjs) consumido por `getLog`
   e `countCommits` — **implementado na onda 2**, já com os 4 padrões
   (do-archive, stash, original, rewritten); a simetria log/total é o
   invariante que o teste paga, e o comentário em português junto à constante
   explica a regra de ouro da ordem ("the next --all...").
3. **Não mexer no padrão `refs/do-archive/*`**: o `*` cruza `/` no git 2.43.0
   (verificado) e o teste de regressão fixa o caso aninhado. Se um dia o app
   suportar uma faixa mais ampla de versões de git, um teste do glob aninhado
   por versão é o guarda-corpo (a doc não especifica o cruzamento; o `**` é a
   forma documentada de cruzar em padrões do for-each-ref).
4. **Decoração (`%d`)**: com o stash excluído da seleção, o chip "stash" não
   aparece (o commit nem entra). `refs/do-archive/*` já não decora por padrão
   (fora do conjunto HEAD/heads/remotes/stash/tags). Caso um dia se queira
   mostrar o chip de uma ref excluída, a opção é `--decorate-refs-exclude` —
   desnecessária hoje.
5. **Não oferecer limpeza destrutiva de refs na GUI.** Sem botão de apagar
   stash/do-archive: `refs/stash` é dado do usuário e `refs/do-archive/*` é
   posse da ferramenta. Se o usuário perguntar pelos "commits soltos", a
   resposta é esta exclusão — e, opcionalmente no futuro, um toggle de
   "mostrar commits arquivados/stash" no estilo do GitKraken ("Stashes can be
   hidden from the graph without being deleted") e do GitLens (filtro do commit
   graph para stashes), nunca um delete.
6. **Extensão (implementado na onda 2):** `refs/original/*` e
   `refs/rewritten/*` entraram na lista de exclusão, centralizada na constante
   `EXCLUDED_REF_PATTERNS` (server/src/git/log.mjs) consumida por `getLog` e
   `countCommits` — cobre repos que passaram por filter-branch/rebase
   interrompido sem quebrar rebase ativo (a exclusão é da seleção do log, não
   do git; os labels morrem no fim do rebase). `refs/notes/*` e
   `refs/bisect/*` só se o app passar a exibir esses dados.
7. **Não trocar `--all` por `--branches --remotes --tags` no comando canônico**
   (regra de produto, LOG_ARGS byte-frozen): a equivalência com a seleção
   excluída foi verificada (5 → 2 = `--branches --remotes --tags` no lab; e
   190 → 166 no repo do usuário), mas a troca quebraria o contrato congelado.
   A exclusão é aditiva e segura.

---

## 7. Fontes

Primárias (git-scm.com / kernel.org / Pro Git / docs das ferramentas):

1. https://git-scm.com/docs/git-log — `--all`, `--exclude=<glob-pattern>`,
   `--decorate` e o conjunto padrão de decoração (inclui `refs/stash/`)
2. https://git-scm.com/docs/git-rev-list — `--exclude` ("the next `--all`,
   `--branches`, ..."), regra do `refs/` obrigatório e do `/*` explícito
3. https://git-scm.com/docs/git-log/2.24.0 — `--branches/--tags/--remotes/--glob`
   implicam `/*` no fim; `--exclude` não
4. https://git-scm.com/docs/git-for-each-ref — padrões casam "using
   `fnmatch`(3) or literally"
5. https://git-scm.com/docs/git-stash — refs/stash + reflog; estrutura W/I do
   stash; drop/clear → sujeito a pruning
6. https://git-scm.com/docs/git-gc — gc preserva "anything else in the
   refs/* namespace"; `gc.reflogExpire[Unreachable]` com padrão por ref
7. https://git-scm.com/docs/git-reflog — `expire`, `--expire-unreachable`,
   `--all`, defaults 90/30 dias
8. https://git-scm.com/docs/git-prune — só objetos unreachable; "users should
   run git gc, which calls git prune"
9. https://git-scm.com/docs/git-maintenance — tarefas `gc` e `reflog-expire`
10. https://git-scm.com/docs/git-filter-branch — refs/original como backup e o
    comando de limpeza documentado
11. https://git-scm.com/docs/git-rebase — refs/rewritten transitórias
    ("deleted when the rebase finishes")
12. https://git-scm.com/docs/git-notes — refs/notes/commits; "Every notes
    change creates a new commit at the specified notes ref"
13. https://git-scm.com/book/en/v2/Git-Internals-Maintenance-and-Data-Recovery
    — reflog mantém commits vivos; receita destrutiva de purga
    (refs/original + logs + gc + prune --expire now)
14. https://git-scm.com/docs/git-log/2.52.0 e
    https://www.kernel.org/pub/software/scm/git/docs/git-log.html — menção de
    `--decorate-refs`/`--decorate-refs-exclude` (parágrafo do
    `--clear-decorations`); man page espelhada no kernel.org

Comunidade e GUIs:

15. https://stackoverflow.com/questions/9437182/git-show-all-branches-but-not-stashes-in-log
    — resposta aceita (Andrew Marshall): `git log --branches --remotes --tags
    --graph --oneline --decorate`, com o alerta de que filtragem pós-hoc "can
    actually filter out the entire branch from the log"; a recomendação
    `--exclude=refs/stash --all` (exclude antes de `--all`) está numa resposta
    não aceita (Mikhail Burshteyn) (conteúdo obtido por snippet de busca;
    WebFetch bloqueado no domínio)
16. https://stackoverflow.com/questions/78779395/git-log-all-show-multiple-stashes
    — não verificável (fonte indisponível); a alegação sobre Git Extensions
    mostrar stashes no grafo com "show unrelated histories" não pôde ser
    confirmada
17. https://github.com/desktop/desktop/issues/7254 — GitHub Desktop lia o stash
    via `git log -g refs/stash` e migrou para `git stash list --pretty` (stash
    tratado como lista separada, não como ramo do grafo)
18. https://github.com/jesseduffield/lazygit/issues/5332 — lazygit: `git log
    --all` inclui refs de ferramenta (`refs/jj/*` "spam the view"); pedido do
    `--exclude refs/jj/*` (mesmo padrão do nosso caso)
19. https://help.gitkraken.com/gitkraken-desktop/stashing — "Your stash will
    appear in the Commit Graph" como nó WIP/stash; "Stashes can be hidden from
    the graph without being deleted"; lista própria no Left Panel
20. https://help.gitkraken.com/gitlens/gl-commit-graph — grafo mostra
    "remotes, branches, and tags" + marcadores de stash (minimap); filtro para
    esconder stashes
21. https://community.atlassian.com/forums/Sourcetree-questions/Content-of-stash-is-not-shown/qaq-p/2532658
    — SourceTree: stashes exibidos no painel esquerdo, fora do grafo
22. https://github.com/fork-dev/TrackerWin/issues/2073 — Fork: lista de stashes
    é uma seção própria da UI

Verificação empírica local (git 2.43.0, repo descartável em /tmp — não
relacionada a nenhum repo do projeto): contagens e decoração documentadas nas
seções 2 e 3.

**Itens sem fonte encontrada:** o comportamento de `*` cruzar `/` **não é
documentado explicitamente** na man page do `--exclude` (só verificado
empiricamente no 2.43.0 e coberto pela doc do for-each-ref apenas como
"fnmatch(3) or literally"); não encontrei documentação oficial descrevendo
`refs/do-archive` como convenção (é namespace custom da ferramenta de
orquestração — a regra geral do `--all` cobre o vazamento).
