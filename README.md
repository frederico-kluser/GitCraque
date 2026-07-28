# GitCraque

Cliente Git de desktop com grafo de historico, drag-and-drop semantico e
automacao de rebase interativo — **sem Electron**.

Um backend Node.js puro orquestra o binario do `git` por `child_process` e serve
uma SPA React. Voce sobe pelo terminal, ele abre no navegador, e o processo do
servidor e quem "esta" no repositorio: trocar de worktree e um `process.chdir()`,
nao um `git checkout`.

```bash
npm install
npm run build
npx gitcraque                 # no diretorio do repositorio que voce quer abrir
npx gitcraque --repo ~/code/projeto --port 5271
npx gitcraque --repo ~        # fora de um repo: abre o seletor
```

## O que ele faz

**Grafo de historico de verdade.** O backend le
`git log --pretty=format:"%H|%P|%an|%ae|%s|%ar|%d" --all --topo-order` e o
front-end calcula a matriz `(X, Y)` de cada commit com um algoritmo proprio:
`Y` e a ordem topologica, `X` sai de uma heuristica que separa *filhos de
ramificacao* de *filhos de mesclagem* para tracar rotas que nao se sobrepoem. O
desenho e SVG escrito a mao — `<circle>` para commits, `<path>` com Bezier
cubica para ramificacoes e merges — com virtualizacao de janela, entao um
repositorio de dezenas de milhares de commits rola liso. Nenhuma biblioteca de
gitgraph esta envolvida.

**Seletor de repositorios.** Subiu fora de um repositorio? A tela nao e um
aviso, e o seletor: os repositorios abertos recentemente, uma varredura das
pastas conhecidas da maquina (pessoal, `Projects`, `code`, `/opt`, `/srv`) e um
navegador de pastas com migalhas de pao. Colar um caminho e apertar Enter
tambem funciona, e ha um `git init` para a pasta em que voce estiver. Trocar de
repositorio depois disso e o botao **Abrir** na barra, ou ⌘K.

**Worktrees sem checkout.** `git worktree list --porcelain` alimenta o rail. Ao
clicar num rotulo de worktree, o servidor executa `process.chdir()` para o
caminho absoluto dela e emite um sinal por WebSocket; a interface descarta a
View Tree e recarrega a partir do novo diretorio. Nenhum `git checkout` acontece,
entao a arvore de trabalho de ninguem e mexida.

**Drag-and-drop com intencao.** Sobre `@dnd-kit/core`. Arrastar um **commit**
sobre o rotulo de uma **branch** propoe um `cherry-pick`. Arrastar uma **branch**
sobre outra abre a escolha entre `merge` e `rebase`. O comando cru aparece antes
de executar, e o que reescreve historico exige confirmacao por pressao contínua.

**Squash grafico, sem emular terminal.** Selecione os commits no grafo e o
backend automatiza o rebase interativo com um interceptor: injeta
`GIT_SEQUENCE_EDITOR="node proxy-editor.mjs"` e o script le o `git-rebase-todo`
que o git gerou, troca `pick` por `squash` nas linhas certas (mantendo a primeira
como `pick`) e sai com `0`. O git aplica a reescrita como se um humano tivesse
editado o arquivo.

**Push que nao trava pedindo senha.** O modelo de trampolim: o Node injeta
`GIT_ASKPASS` apontando para um script proprio, que responde ao git pelo
`stdout` com o token capturado na interface. O segredo viaja por um socket unix
com nonce de uso unico — nunca pelo ambiente do processo do git, nunca por argv,
nunca em disco. Se o cofre nao tem a credencial, a interface pergunta na hora, e
o git recebe a resposta sem nunca abrir um prompt de terminal invisivel.

## Requisitos

Node >= 20.11 e `git` no PATH.

## Desenvolvimento

```bash
npm run dev          # backend --watch em 5271 + vite em 5273 (proxy /api e /ws)
npm run typecheck    # tsc --noEmit
npm run build        # vite build -> web/dist
```

Arquitetura completa em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Regras de interface em [`docs/UI.md`](docs/UI.md).

## Aviso

O servidor executa comandos `git` na sua maquina. Ele escuta so em `127.0.0.1`,
recusa requisicoes com `Host`/`Origin` de outra origem, e nao deve ser exposto na
rede.
