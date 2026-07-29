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
8. **Nenhum texto de interface cravado no codigo.** Quatro idiomas
   (en, pt, es, zh), catalogo em `web/src/i18n` e `server/src/i18n.mjs`.

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

### Favoritos — `git/favorites.mjs`

Irmaos dos recentes e com semantica DELIBERADAMENTE oposta. A tabela e o
projeto inteiro:

| | recentes | favoritos |
|---|---|---|
| origem | automatica (abriu, entrou) | explicita (o usuario fixou) |
| ordem | cronologica, o ultimo no topo | manual, so muda em `reorder` |
| teto | `RECENT_LIMIT`, rotativo | nenhum |
| sumir | cai sozinho da lista | so sai em `remove` |

Dai o que parece detalhe e nao e: **`add` repetido nao reordena** (so atualiza o
rotulo) e **favorito novo entra no fim**. Mexer na posicao por causa de um
clique repetido jogaria fora o arranjo que a pessoa montou na mao — que e
justamente o que diferencia favorito de recente. `add` passa pela mesma guarda
de `POST /repos/open` (`resolveRepoDir`) e guarda a RAIZ da worktree, nunca a
subpasta digitada; `remove` nao valida repositorio nenhum, porque a pasta pode
ter sumido e e ai que remover mais importa. `reorder` e tolerante nas duas
pontas: caminho desconhecido e ignorado e favorito nao citado mantem a ordem
relativa, no fim — a lista do cliente pode estar velha, e nada pode sumir por
causa de um reorder.

A **gravacao atomica** (temporario + rename, 0600, leitura tolerante a arquivo
corrompido) e uma so, em `git/store.mjs`, usada pelos dois arquivos. Duas copias
dela seria a receita para uma envelhecer mais fraca que a outra. A diferenca e
a urgencia: falha ao gravar os recentes e engolida (o historico e efeito
colateral e nao pode derrubar uma operacao de git), falha ao gravar os favoritos
sobe como erro — la a escrita e a propria operacao pedida.

### Conteudo de arquivo — `git/file.mjs`

`GET /file` alimenta o visualizador (markdown renderizado, codigo cru, o lado
"depois" do diff). Com `hash` sai de `git show <hash>:<caminho>`; sem `hash`, do
disco.

**Esta e a unica rota do backend que le arquivo do disco por caminho vindo do
cliente**, e sem guarda ela nao seria o visualizador: seria leitura arbitraria
da maquina por HTTP — `../../../../etc/shadow`, `~/.ssh/id_rsa`,
`/proc/self/environ` (que carrega os segredos do processo). A regra vale igual
para as duas origens:

1. o caminho tem de ser **relativo** — absoluto e `~` sao recusados de saida;
2. normalizado (`a/../b`), nao pode comecar com `..`;
3. resolvido contra a raiz da worktree, tem de continuar **dentro** dela;
4. na leitura de disco, passa por `realpath` e a checagem 3 e **refeita** — sem
   isso, um symlink apontando para fora escapa. Nao basta olhar a folha com
   `lstat`: em `pasta-que-e-symlink/arquivo` quem escapa e a pasta do meio.

Fuga e 400, nunca 403 com o erro do sistema de arquivos: a resposta nao confirma
se o alvo existe la fora. Alem da guarda: binario (byte NUL nos primeiros 8 KB)
volta `content: ""`, acima de 1 MB volta o inicio com `truncated: true` e `size`
real (o corte respeita fronteira de caractere UTF-8, senao o fim do trecho vira
um losango de erro), e arquivo ausente naquele commit e 404 — nao 500.

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

### Menu de contexto — `app/menus.ts` + `app/ContextMenuHost.tsx`

O botao direito e uma porta do produto, nao um acidente do navegador. A regra
tem duas metades e as duas valem sempre:

1. **Onde ha acao, ha o NOSSO menu.** Commit, chip de ref, linha do rail
   (worktree, branch, remota, remoto, tag, stash), arquivo do commit, arquivo
   alterado e visualizador.
2. **Onde nao ha, nao ha menu nenhum.** Toolbar, rodape, divisorias, fundo do
   grafo e estados vazios nao devolvem o menu do navegador — ele e barrado por
   um listener no `window`. A UNICA excecao e campo de texto (`input`,
   `textarea`, `select`, `contenteditable`), onde o menu nativo faz o que nos
   nao fazemos: colar, desfazer e corretor ortografico.

Um popup so, no `ContextMenuHost`, ancorado num retangulo VIRTUAL de tamanho
zero no ponto do clique — a View Tree e virtualizada e um `Menu.Root` por linha
visivel seria caro a toa. O host tambem guarda uma copia do pedido enquanto o
menu fecha, senao o popup esvaziaria no meio da animacao de saida.

Cada alvo monta a lista **no clique**, por `app/menus.ts`, e o mesmo
`MenuItemSpec[]` alimenta o menu de reticencias da linha. Dai duas consequencias
de projeto:

- as duas portas nunca divergem, e "Checkout" sabe dizer `presa em ../outra`
  em vez de so falhar;
- **lista vazia = menu nenhum**. Um chip de HEAD solto ou de stash devolve `[]`,
  o chip nao consome o clique e quem responde e a linha do commit — que era o
  alvo real.

Nada executa a partir do menu: todo item cai em `app/actions.ts`, que confirma
por `askConfirm` antes de tocar o repositorio, com `HoldToConfirmButton` no que
for destrutivo. Teclado tem a mesma porta: `ContextMenu`/`Shift+F10` sobre a
linha focada da View Tree abre o mesmo menu.

### Duas rotinas de tempo, com alvos diferentes

`useRepoPoll` e `useAutoFetch` parecem irmaos e nao sao: um le disco, o outro
fala com a rede.

| | `useRepoPoll` | `useAutoFetch` |
|---|---|---|
| cobre | arquivo editado fora do app, que nao toca no `.git` e nao gera evento | commit empurrado por outra pessoa, que nao gera evento em maquina nenhuma daqui |
| roda | `status` + `worktrees` | `git fetch --all --prune` |
| intervalo | 500 ms, fixo | configuravel; padrao 1 min, `0` desliga |
| custo | duas leituras locais | uma ida a rede e o lock serial do backend |

As duas usam `setTimeout` encadeado, nunca `setInterval`: o intervalo so comeca
a contar depois que a resposta chega, entao uma chamada lenta afasta a proxima
em vez de empilhar pedidos em cima de si mesma.

O fetch automatico e **mudo por decisao de produto**. Ele nao passa por
`runOperation` — aquele envelope emite toast em toda saida e acende
`loading.operation` — e o store ignora o `op:progress` que o backend emite
enquanto ele esta em voo (`gitFetch` roda com `progressOp: "fetch"` e nao sabe
quem pediu). O argv continua indo para o console de auditoria: mudo e sobre
toast e indicador, nunca sobre esconder comando.

E `fetch`, nunca `pull`. So `refs/remotes/**` se move; a branch local nao anda,
nao nasce commit de merge e nao ha conflito possivel com trabalho em andamento.
O contador de "atras" no rail e que conta a novidade, e puxar continua sendo
decisao explicita.

### Voz — desligada da interface, inteira no codigo

A area de IA (`app/AiBar.tsx`) ja gravou audio pelo microfone: `MediaRecorder`
no navegador → base64 → `POST /ai/transcribe` → texto → o mesmo agente. Em
2026-07-29 ela virou uma faixa larga **so de texto**, e o caminho de voz foi
desligado da UI **sem ser removido do projeto**.

O que continua no lugar, intacto e testado:

- `web/src/hooks/useVoiceRecorder.ts` — o hook inteiro, ainda exportado por
  `hooks/index.ts`, sem nenhum consumidor;
- `POST /ai/transcribe`, `api.transcribe` e `TranscriptionPayload` — contrato
  congelado, remocao proibida;
- `server/src/ai/openrouter.mjs` e o teste que garante o par modelo/formato de
  audio (`server/test/ai.test.mjs`);
- as fases `recording` e `transcribing` de `AgentPhase`, e as acoes
  `agentRecordingStarted`/`agentTranscribing`/`agentCancelled` do store;
- as chaves `agent.state.*`, `agent.heard`, `agent.micDenied`, `agent.micMissing`
  nos quatro idiomas.

**Para religar, tres passos**, todos dentro de `app/AiBar.tsx`:

1. `const recorder = useVoiceRecorder()` e um botao de microfone ao lado do
   input, alternando `recorder.start()` e `recorder.stop()`;
2. no `stop`, `agentTranscribing()` → `api.transcribe({ audio, format,
   language: getLocale() })` → `runAgent(result.text, "voice", result.cost)`;
3. no `Escape`, `recorder.cancel()` antes de `agentClosed()` — sem isso o
   indicador de gravacao do navegador fica aceso.

O que **nao** voltar a ser: "segurar para falar". A escolha de produto e um
clique para comecar e outro para mandar; o `MultiStateButton` do catalogo ja
cobre os estados, e o `HoldToConfirmButton` existe para operacao destrutiva, nao
para captura de audio.

Uma armadilha para nao repetir: o formato gravado e `webm/opus` porque e o que
Chrome e Firefox produzem sem transcodificar, e **nem todo modelo de
transcricao aceita webm**. Quem garante o par e `MODEL_AUDIO_FORMATS` em
`server/src/ai/openrouter.mjs`. Trocar o modelo sem olhar aquela tabela quebra a
voz com um erro do provedor, nao da API.

## 5. Idioma — `web/src/i18n/`, `server/src/i18n.mjs`

Quatro idiomas: **ingles (padrao), portugues, espanhol e chines**. O idioma sai
do navegador (`navigator.languages`, primeira subtag reconhecida); nao
reconhecendo nenhum, ingles. A escolha manual do seletor ganha da deteccao e
mora no `localStorage`.

### Um catalogo mestre, tres obrigados a acompanhar

`locales/pt.ts` e o unico arquivo que DEFINE chave: `MessageKey` sai dele, e
`en`/`es`/`zh` sao tipados como `Messages`. Esquecer uma chave nao compila —
nao ha catalogo envelhecendo em silencio. Plural e o par `_one`/`_other`,
escolhido por `count`; chines repete o mesmo texto nos dois de proposito.

### `t` e singleton de modulo, nao contexto React

Metade do texto do app nasce FORA de componente: `app/actions.ts` monta os
dialogos, `state/store.ts` emite os toasts, `dialogs/executors.ts` reporta o
resultado. Um `useTranslation()` obrigaria a passar `t` por parametro em toda
essa cadeia. Com o singleton, qualquer modulo faz `t("chave")`.

O preco disso e que um componente que so chama `t()` nao sabe quando
re-renderizar. O `<LocaleBoundary>` de `main.tsx` resolve pelo bruto: troca a
`key` da arvore e remonta tudo. Trocar de idioma e raro e deliberado — garantir
que NADA fica com texto velho vale mais que preservar estado local. O estado do
repositorio nao se perde: ele mora em modulo, fora do React.

### O motor de DND recebe o tradutor pelo contexto

`dnd/intents.ts` nao tem um unico import de runtime — e o que o torna carregavel
pelo `node --test` com type stripping, sem bundler. Um `import { t }` ali
quebraria isso, entao o tradutor entra em `DragIntentContext.t` e o provider
passa. Mesmo motivo em `viewer/markdown.ts` e `viewer/sanitize.ts`, que sao
carregados pelo `node --test` sem alias: os dois importam
`../i18n/store.ts` por caminho relativo, com extensao explicita.

### O backend traduz por REQUISICAO

O erro carrega uma CHAVE (`error.pathRequired`) e a traducao acontece so na
borda, em `sendError`, com o idioma daquela requisicao — `x-gitcraque-lang`
(a escolha do seletor) e, na falta dele, `accept-language`.

Duas consequencias que valem o desenho:

- **a saida do proprio git passa intacta.** `commandResult` lanca com
  `result.error`, que nao casa com chave nenhuma; `translate` devolve
  `undefined` e a borda usa a string como veio. A regra "mensagem do git fica em
  ingles, como o git a emite" continua valendo de graca;
- **o servidor nao guarda idioma.** E um processo local que pode ter varias abas
  abertas, cada uma na sua lingua.

### Os menus de contexto tambem saem do catalogo

`app/menus.ts` monta a lista NO CLIQUE, entao `t()` e chamado ali dentro, a cada
abertura — nao ha `MenuItemSpec[]` congelado em constante de modulo. E o que faz
o mesmo arquivo servir o botao direito e o "⋯" da linha nos quatro idiomas sem
nenhuma cerimonia a mais.

### O que NAO e traduzido

Nome de comando git, flag (`--force-with-lease`), `HEAD`, `origin`, saida do
git e o `%ar` do log — que chega sempre em ingles porque o backend fixa
`LC_ALL=C`, e e disso que `useCommitActivity` depende para montar o sparkline.
O `%ar` e reescrito **so na exibicao**, por `formatGitRelativeDate`; o payload
continua intacto.

## Fluxo de eventos

```
usuario ─► REST ─► exec(git) ─► fs muda ─► watcher ─► repo:changed ─► store ─► UI
                       └──────────► git:command (start/stdout/stderr/exit) ─► console
```

`cwd:changed` e o unico evento que descarta o estado inteiro antes de recarregar.
