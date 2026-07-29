<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo.svg">
    <img src="docs/logo.svg" alt="GitCraque" width="500">
  </picture>
</p>

<p align="center">
  <strong>Cliente Git de desktop com grafo de histórico, drag-and-drop semântico e<br>automação de rebase interativo — zero dependências de Electron.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D20.11-brightgreen" alt="Node >= 20.11">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
  <img src="https://img.shields.io/badge/plataforma-linux%20%7C%20macos-lightgrey" alt="Linux | macOS">
  <img src="https://img.shields.io/badge/backend-zero%20deps-success" alt="Backend zero deps">
</p>

---

## Como funciona

Um backend Node.js puro orquestra o binário do `git` por `child_process` e serve
uma SPA React. Você sobe pelo terminal, ele abre no navegador, e o **processo do
servidor** é quem "está" no repositório: trocar de worktree é um
`process.chdir()`, não um `git checkout`.

```bash
npm install
npm run build
npx gitcraque                     # no diretório do repositório
npx gitcraque --repo ~/code/projeto --port 5271
npx gitcraque --repo ~            # fora de um repo: abre o seletor
```

## Funcionalidades

### Grafo de histórico

O backend executa `git log --all --topo-order` e entrega os dados crus. O
front-end calcula a matriz `(X, Y)` de cada commit com algoritmo próprio:
`Y` é a ordem topológica, `X` sai de uma heurística que separa *filhos de
ramificação* de *filhos de mesclagem* para traçar rotas que não se sobrepõem.
O desenho é **SVG escrito a mão** — `<circle>` para commits, `<path>` com Bézier
cúbica para ramificações e merges — com virtualização de janela. Um repositório
de dezenas de milhares de commits rola liso. **Nenhuma biblioteca de gitgraph
está envolvida.**

### Seletor de repositórios

Subiu fora de um repositório? A tela não é um aviso, é o seletor: repositórios
abertos recentemente, varredura das pastas conhecidas da máquina (`Projects`,
`code`, `/opt`, `/srv`) e um navegador de pastas com migalhas de pão.

Colar um caminho e apertar Enter também funciona, e há um `git init` para a
pasta em que você estiver. Trocar de repositório depois disso é o botão
**Abrir** na barra, ou `⌘K`.

### Worktrees sem checkout

`git worktree list --porcelain` alimenta o rail. Ao clicar num rótulo de
worktree, o servidor executa `process.chdir()` para o caminho absoluto dela e
emite um sinal por WebSocket; a interface descarta a View Tree e recarrega a
partir do novo diretório. Nenhum `git checkout` acontece — a árvore de trabalho
de ninguém é mexida.

### Drag-and-drop com intenção

Sobre `@dnd-kit/core`. Arrastar um **commit** sobre o rótulo de uma **branch**
propõe um `cherry-pick`. Arrastar uma **branch** sobre outra abre a escolha
entre `merge` e `rebase`. O comando cru aparece antes de executar, e o que
reescreve histórico exige **confirmação por pressão contínua**.

### Squash gráfico

Selecione os commits no grafo e o backend automatiza o rebase interativo com um
interceptor: injeta `GIT_SEQUENCE_EDITOR="node proxy-editor.mjs"` e o script lê
o `git-rebase-todo` que o git gerou, troca `pick` por `squash` nas linhas certas
(mantendo a primeira como `pick`) e sai com `0`. O git aplica a reescrita como
se um humano tivesse editado o arquivo. **Zero emulação de terminal.**

### Push que não trava

Modelo de trampolim: o Node injeta `GIT_ASKPASS` apontando para um script
próprio, que responde ao git pelo `stdout` com o token capturado na interface.
O segredo viaja por um socket unix com nonce de uso único — **nunca** pelo
ambiente do processo do git, nunca por argv, nunca em disco.

Se o cofre não tem a credencial, a interface pergunta na hora, e o git recebe a
resposta sem nunca abrir um prompt de terminal invisível.

## Instalação

```bash
git clone https://github.com/frederico-kluser/GitCraque.git
cd GitCraque
npm install
npm run build
npm start                        # ou npx gitcraque no diretório do repo
```

**Requisitos:** Node >= 20.11 e `git` no PATH.

## Desenvolvimento

```bash
npm run dev          # backend --watch em :5271 + vite em :5273 (proxy /api e /ws)
npm run typecheck    # tsc --noEmit
npm run build        # vite build → web/dist

npm test             # server + graph + dnd + viewer (454 testes)
npm run test:server  # 310 testes
npm run test:graph   # 42 testes
npm run test:dnd     # 20 testes
npm run test:viewer  # 82 testes
npm run test:e2e     # 39 verificações (não incluso no npm test)
```

Leia [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) para a arquitetura completa,
módulo por módulo. Regras de interface em [`docs/UI.md`](docs/UI.md).

## Aviso

O servidor executa comandos `git` na sua máquina. Ele escuta só em `127.0.0.1`,
recusa requisições com `Host`/`Origin` de outra origem, e **não deve ser exposto
na rede**.

## Licença

MIT © [Frederico Kluser](https://github.com/frederico-kluser)
