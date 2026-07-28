# GitCraque — arquitetura

Cliente Git de desktop **sem Electron**: um backend Node.js puro que orquestra o
binario do `git` por `child_process`, e uma SPA React servida por ele. Sobe pelo
terminal com `gitcraque` e abre no navegador.

```
terminal ──► server/bin/gitcraque.mjs
                │
                ├─ node:http  ── REST /api/*        ─┐
                ├─ ws         ── WebSocket /ws       ├──► web/dist (SPA React)
                ├─ child_process ── git ...          │
                └─ fs.watch(.git) ── repo:changed   ─┘
```

## Regras que nao se negociam

1. **Nenhuma biblioteca de gitgraph.** O layout do grafo e algoritmo proprio, em
   JS, no front-end. `@gitgraph/react` e `gitgraph.js` estao proibidos.
2. **O historico sai de um comando exato**, nao de plumbing alternativo:
   `git log --pretty=format:"%H|%P|%an|%ae|%s|%ar|%d" --all --topo-order`.
3. **Trocar de worktree nunca faz `git checkout`.** O backend chama
   `process.chdir(<path>)` e emite `cwd:changed` pelo WebSocket.
4. **Drag-and-drop e `@dnd-kit/core`**, com regras de intercepcao estritas.
5. **Squash nao usa emulador de terminal.** Usa
   `GIT_SEQUENCE_EDITOR="node proxy-editor.mjs" git rebase -i <base>`.
6. **Push/fetch nunca travam pedindo senha.** Trampolim `GIT_ASKPASS`.
7. **UI vem do Motion UI antes de qualquer CSS proprio** (ver `docs/UI.md`).

## Modulos e donos

| Diretorio | Responsabilidade | Fronteira publica |
|---|---|---|
| `server/**` | tudo do backend | `server/src/contract.mjs` (tabela de rotas) |
| `web/src/graph/**` | layout X/Y, SVG, virtualizacao | `web/src/graph/index.ts` |
| `web/src/dnd/**` + `web/src/dialogs/**` | motor semantico e confirmacoes | `index.ts` de cada um |
| `web/src/app/**` + `web/src/panels/**` | shell, rail, paineis, Motion UI | `web/src/panels/index.ts` |

**Contratos que ninguem altera sozinho:**

- `web/src/types/git.ts` — payloads REST e eventos WS.
- `web/src/types/modules.ts` — assinaturas entre modulos.
- `web/src/lib/api.ts` — cliente REST tipado (rota que nao esta aqui nao existe).
- `web/src/lib/ws.ts` — cliente WebSocket.
- `web/src/state/store.ts` — estado central. Todo modulo le e escreve aqui.
- `server/src/contract.mjs` — espelho em runtime da tabela de rotas.

## 1. Backend — `server/`

```
server/
  bin/gitcraque.mjs          CLI: --port --repo --open --dev
  src/
    contract.mjs             tabela de rotas + LOG_ARGS (ja escrito)
    server.mjs               node:http + estaticos + upgrade do WebSocket
    router.mjs               roteador minimo (metodo + padrao com :param)
    routes/*.mjs             handlers agrupados por dominio
    git/
      exec.mjs               O NUCLEO: spawn do git com env injetado
      log.mjs                parser do formato mandatorio
      refs.mjs               for-each-ref, HEAD, ahead/behind
      status.mjs             porcelain v2 + diff
      worktree.mjs           list --porcelain + process.chdir
      remotes.mjs            remote -v, add/remove, push/fetch/pull
      ops.mjs                cherry-pick, merge, rebase, reset, revert
      squash.mjs             GIT_SEQUENCE_EDITOR
    trampoline/
      askpass.mjs            executado PELO GIT, nao pelo servidor
      proxy-editor.mjs       executado PELO GIT, nao pelo servidor
      vault.mjs              cofre em memoria + socket IPC do askpass
    ws/hub.mjs               broadcast tipado
    watcher.mjs              fs.watch no .git → repo:changed
```

### `git/exec.mjs` — o nucleo

Toda invocacao do git passa por aqui. Nao existe `exec` com string de shell em
lugar nenhum do projeto: sempre `spawn(gitBin, argvArray)`, sem `shell: true`.

Ambiente injetado em toda chamada:

| Variavel | Valor | Por que |
|---|---|---|
| `GIT_TERMINAL_PROMPT` | `0` | proibe o git de abrir prompt no tty herdado |
| `GIT_ASKPASS` | trampolim | e por onde a credencial entra |
| `SSH_ASKPASS` / `SSH_ASKPASS_REQUIRE` | trampolim / `force` | idem para SSH |
| `GIT_EDITOR` | `true` | nenhum comando pode abrir editor |
| `GIT_PAGER` / `PAGER` | `cat` | nenhum comando pode paginar |
| `LC_ALL` / `LANG` | `C` | saida estavel para o parser |
| `GIT_OPTIONAL_LOCKS` | `0` | leitura nao mexe no index |

Todo comando emite `git:command` (start → stdout/stderr → exit) e devolve
`GitCommandResult`. Timeout padrao 120 s, buffer maximo 64 MB.

### Parsing do `git log` — a armadilha do separador

O formato e mandatorio e `%s` (assunto) pode conter `|`. O parser divide os
**quatro primeiros** campos pela esquerda e os **dois ultimos** pela direita; o
que sobra no meio e o assunto. Sem isso, todo commit com `|` na mensagem
desalinha.

### Worktrees

`git worktree list --porcelain` emite registros separados por linha em branco:
`worktree <path>`, `HEAD <sha>`, `branch refs/heads/x`, e as flags `bare`,
`detached`, `locked [motivo]`, `prunable [motivo]`.

`POST /api/worktrees/switch` valida o path contra a lista, chama
`process.chdir(path)` e faz broadcast de `cwd:changed`. Nao ha `git checkout`.

### Squash — `GIT_SEQUENCE_EDITOR`

1. A UI manda `{ commits: string[], message?, fixup? }`.
2. O backend ordena os hashes pela ordem topologica real e deriva a base
   (`<primeiro>^`, ou `--root` quando o mais antigo e commit raiz).
3. Escreve o plano num arquivo temporario que o proxy-editor le.
4. Executa `git rebase -i <base>` com
   `GIT_SEQUENCE_EDITOR="node <abs>/proxy-editor.mjs"`.
5. O proxy-editor recebe o caminho do `git-rebase-todo` em `argv[2]`, troca
   `pick` por `squash`/`fixup` nas linhas dos hashes marcados (**preservando** a
   primeira, que continua `pick`), grava e sai com `0`.
6. `GIT_EDITOR=true` garante que a mensagem final nao abra editor; quando ha
   `message`, o backend usa `git commit --amend -m` depois.

O resultado devolve `plan`, `originalTodo` e `rewrittenTodo` para auditoria.

**`--autostash` e obrigatorio aqui.** Numa GUI a arvore de trabalho quase nunca
esta limpa: arquivo modificado e arquivo nao rastreado sao o estado normal de
quem trabalha. Sem autostash, o `git rebase` recusa com *"cannot rebase: You
have unstaged changes"* e o usuario e obrigado a limpar a arvore na mao antes de
clicar em "squash" — o que nenhum cliente grafico decente exige. O mesmo vale
para o rebase de ramo. Quando o `stash pop` do fim conflita, isso **nao** e
silencioso: a resposta volta com `ok: false` e `pending` preenchido.

### Seletor de repositorios — `git/discover.mjs`

Sem ele, subir o `gitcraque` fora de um repositorio era um beco sem saida: a
interface so sabia dizer "este diretorio nao e um repositorio git" e mandar a
pessoa voltar ao terminal. A CLI tambem recusava subir; hoje ela sobe e a
interface mostra o seletor.

Tres capacidades e uma guarda diferente para cada uma:

| Rota | O que faz | Guarda |
|---|---|---|
| `GET /fs/list` | subpastas de um caminho, marcando quais sao repos | devolve **so nomes de diretorio**; nunca arquivo, nunca conteudo |
| `POST /repos/scan` | varre as raizes conhecidas procurando `.git` | tetos de profundidade, de resultados e de tempo; realpath contra ciclo de symlink |
| `POST /repos/open` | troca o repositorio ativo | so aceita diretorio que o `git rev-parse --git-dir` reconhece |

`POST /repos/open` e irma de `POST /worktrees/switch`: as duas fazem
`process.chdir()` e emitem `cwd:changed`, e nenhuma faz `git checkout`. O que
muda e quem autoriza o caminho — a de worktree confere contra
`git worktree list`, esta exige que o destino seja mesmo um repositorio. Abrir
por uma subpasta entra pela raiz da worktree (`--show-toplevel`), senao o status
e o log sairiam parciais.

Os recentes ficam em `~/.config/gitcraque/recent.json` (respeita
`XDG_CONFIG_HOME`), gravados por arquivo temporario + rename para nunca ficarem
pela metade, com `exists` recalculado a cada leitura.

**Nao estar num repositorio deixou de ser erro.** `GET /log` e `GET /status`
devolvem payload vazio em vez de 500 quando o git responde *"not a git
repository"* — antes, a tela do seletor nascia com um toast vermelho carregando
um stack trace.

### Trampolim de askpass

`askpass.mjs` roda como processo **filho do git**, nao do servidor. Ele nao tem
acesso ao estado do servidor — a ponte e um socket unix (`GITCRAQUE_ASKPASS_SOCK`)
mais um nonce de uso unico (`GITCRAQUE_ASKPASS_NONCE`):

```
git push ──spawn──► askpass.mjs ──unix socket + nonce──► vault.mjs
                         │                                   │
                         │◄────── segredo em texto ──────────┤
                         ▼                             (se nao tiver,
                    stdout → git                        pergunta na UI
                                                        por WebSocket)
```

O segredo **nunca** vai no `env` do processo do git (visivel em `/proc`), nunca
vai em argv, e nunca e escrito em disco. Se o cofre nao tem a credencial, o
servidor emite `credentials:needed`, a UI pergunta, e a resposta volta por
`credentials:provide`. Timeout de 120 s: expirado, o askpass sai com `1` e o git
falha limpo em vez de travar.

## 2. Grafo — `web/src/graph/`

### Coordenadas

- **Y = ordem topologica.** O indice do array que veio do backend, sem reordenar.
  `y = row * rowHeight + rowHeight / 2`.
- **X = lane**, alocada pela heuristica abaixo.
  `x = paddingLeft + lane * laneWidth`.

### Heuristica de lanes (filhos de ramificacao x filhos de mesclagem)

Percorre os commits **de cima para baixo** (do mais novo para o mais antigo,
que e a ordem do `--topo-order`) mantendo um vetor de lanes ativas, onde cada
lane guarda o hash que ela esta "esperando" encontrar.

Para cada commit:

1. **Reivindicacao.** Se alguma lane ativa espera este hash, o commit assume a
   lane de menor indice entre elas; todas as outras que o esperavam sao
   liberadas (elas convergiram aqui). Se nenhuma espera, o commit e uma ponta:
   ocupa a primeira lane livre.
2. **Classificacao dos filhos.** Cada filho ja processado e:
   - *filho de ramificacao* quando este commit e seu **primeiro** pai — a linha
     de desenvolvimento continua na lane do filho;
   - *filho de mesclagem* quando este commit e o **segundo ou posterior** pai —
     o filho apenas absorveu esta linha.
   Um commit que tem ao menos um filho de ramificacao herda a lane dele
   (continuidade visual da branch). Um commit que so tem filhos de mesclagem
   ganha lane propria, o mais a esquerda possivel sem cruzar linhas vivas.
3. **Propagacao para os pais.** O primeiro pai herda a lane do commit; os demais
   pais recebem, cada um, a primeira lane livre a direita — e a origem das
   curvas de merge.
4. **Liberacao.** Lane cujo hash esperado nao existe mais no conjunto carregado
   e liberada, para o grafo nao crescer indefinidamente em repos grandes.

Estabilidade: como a alocacao so olha o passado (commits ja processados), o
resultado e deterministico e nao muda ao paginar.

### Arestas e Bezier cubica

Uma aresta liga o commit filho (linha menor) ao pai (linha maior).

- Mesma lane → reta vertical (`M x y1 L x y2`), mais barato e mais limpo.
- Lanes diferentes → **cubica** com pontos de controle verticais, para a curva
  sair e chegar na vertical e nao formar bico:

```
M x1 y1
C x1 (y1 + k)   x2 (y2 - k)   x2 y2      onde k ≈ rowHeight * 0.75
```

`kind: "branch"` herda a cor da lane do filho; `kind: "merge"` herda a do pai.

### Virtualizacao

`react-window` (`FixedSizeList`, `rowHeight` constante) sobre a lista de commits.
Apenas as linhas visiveis (+ overscan) vao ao DOM. Cada linha renderiza seu
proprio `<svg>` com altura `rowHeight`, contendo os segmentos de aresta que
cruzam aquela faixa e, quando for o caso, o `<circle>` do commit. Um SVG unico
gigante e proibido: e exatamente o que trava em repositorios grandes.

Para saber quais arestas cruzam a linha `r`, o layout pre-calcula um indice
`row → GraphEdge[]`, montado uma vez.

### Reveal — "leve-me ate este commit"

Clicar numa branch ou tag no rail chama `selectRef`, que resolve o alvo e poe um
`RevealRequest` no store; o shell repassa em `GraphViewProps.reveal` e o grafo
atende. A decisao inteira e pura, em `graph/reveal.ts` (`planReveal` +
`applyRevealPlan`), fora do React — e por isso testavel sem DOM.

As quatro regras que a implementacao existe para cumprir:

1. **Observa o `nonce`, nao o hash.** Clicar duas vezes na mesma branch tem de
   rolar de novo; so o hash nao mudaria nada na segunda vez.
2. **A linha sai de `layout.index` em O(1)** e a lista centraliza nela com
   `scrollToItem(row, "center")` — a menos que ela ja esteja *confortavelmente*
   visivel (folga de duas linhas ate a borda), porque rolar a toa desorienta.
3. **Realce temporario de ~2 s**, com contorno proprio para nao se confundir com
   a selecao — o commit revelado tambem fica selecionado. Anima so `opacity` e
   `transform`; em modo reduzido aparece e some estatico.
4. **Hash fora do log carregado** (paginado fora, ou ref para objeto que o
   `--all` nao alcanca) nao rola para lugar nenhum, mas `onRevealed()` e chamado
   assim mesmo — senao o pedido fica preso no store.

O laco `reveal muda → rola → onRevealed limpa → re-render` e cortado por uma ref
com o ultimo nonce atendido. O foco de teclado acompanha: depois do reveal, as
setas continuam da linha revelada.

## 3. Motor semantico de DND — `web/src/dnd/`

`@dnd-kit/core`, ids estaveis `${type}:${key}`.

| Origem | Alvo | Intencao |
|---|---|---|
| `commit` | `branch` | **cherry-pick** — confirmacao simples |
| `branch` | `branch` | **merge** ou **rebase** — dialogo de escolha |
| qualquer | ele mesmo | invalida |
| `commit` | `commit` | invalida |

Cada opcao carrega o `preview` (argv que sera executado), o `endpoint` e o
`body`. Operacao que reescreve historico marca `destructive: true`, e a UI exige
`HoldToConfirmButton` em vez de clique.

O `onDragEnd` **nao executa nada**: resolve a intencao e joga no store. Quem
executa e o dialogo, apos confirmacao.

## 4. Shell e paineis — `web/src/app/`, `web/src/panels/`

Grid de tres colunas com toolbar e rodape. Rail esquerdo em `Accordion` do
Motion UI: **Worktrees**, Branches locais, Remotos, Tags, Stashes.

O rotulo de worktree e um alvo de clique que chama `switchWorktree()` — que bate
em `process.chdir` no servidor, nunca em checkout.

Botoes obrigatorios de remotos: *Deletar Branch (Local)*, *Deletar Branch
(Origin)*, *Adicionar Origin*, e push com escolha do destino a partir de
`git remote -v`.

## Fluxo de eventos

```
usuario ─► REST ─► exec(git) ─► fs muda ─► watcher ─► repo:changed ─► store ─► UI
                       └──────────► git:command (start/stdout/stderr/exit) ─► console
```

`cwd:changed` e o unico evento que descarta o estado inteiro antes de recarregar.
