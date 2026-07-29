<p align="center">
  <img src="https://raw.githubusercontent.com/frederico-kluser/GitCraque/main/docs/logo.png" alt="GitCraque" width="640">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/frederico-kluser/GitCraque/main/docs/logo.svg" alt="GitCraque" width="340">
</p>

<p align="center">
  <strong>O Fenômeno de 2002 aprendeu a programar.</strong><br>
  Cliente Git de desktop com grafo de histórico, drag-and-drop semântico e<br>
  automação de rebase interativo — e <em>zero</em> Electron no elenco.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D22.13-brightgreen" alt="Node >= 22.13">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
  <img src="https://img.shields.io/badge/plataforma-linux%20%7C%20macos-lightgrey" alt="Linux | macOS">
  <img src="https://img.shields.io/badge/backend-1%20depend%C3%AAncia-success" alt="Backend com uma dependência">
  <img src="https://img.shields.io/badge/electron-n%C3%A3o%20convocado-critical" alt="Electron não convocado">
</p>

<p align="center">
  <a href="README.en.md">🇬🇧 Read this in English</a>
</p>

---

## Por que "GitCraque"?

A gente olhou para o **GitKraken** e admirou de verdade. Só que um kraken é um
polvo gigante: oito braços, solta tinta preta quando se assusta, mora no fundo do
mar e não ganhou Copa nenhuma. Oito braços e zero títulos é um aproveitamento
ruim para qualquer elenco.

Aí olhamos para o outro lado e vimos um sujeito com o corte de cabelo mais
indefensável da história do futebol, dois gols na final e o apelido de
**Fenômeno**.

A escolha se fez sozinha. Trocamos o `K` pelo `C`, o cefalópode pelo camisa 9, e
saiu o **GitCraque** — porque resolver conflito de merge muita gente resolve, mas
marcar duas vezes na final da Copa não é para qualquer branch.

> Sim, é homenagem. Sim, é trocadilho. Não, não vamos parar.
>
> E antes que perguntem: aquele corte de cabelo foi decisão técnica, igual a este
> README. Ninguém entendeu na época e mesmo assim deu certo.

---

## Escalação

Time enxuto, sem elenco inflado e sem folha salarial em `node_modules`:

| Posição | Jogador | O que faz em campo |
|---|---|---|
| **Goleiro** | Node.js puro (`node:http`) | Segura a API sem framework nenhum na frente |
| **Zagueiro** | `child_process` | Marca o binário do `git` em cima, sempre com argv em array |
| **Lateral** | `ws` | A **única** dependência do backend. Uma. Inteira. |
| **Meio-campo** | React 19 + Vite | Distribui o jogo para a SPA |
| **Armador** | Tailwind + Motion UI | Toque de bola e a parte bonita |
| **Ponta** | `@dnd-kit/core` | Arrasta commit e dá o drible curto |
| **Camisa 9** | SVG escrito à mão | Desenha o grafo. Sem biblioteca. Sozinho. |

**O backend tem exatamente uma dependência.** Não é minimalismo por estética: é
que time dependendo de vinte contratados não sai jogando de trás.

---

## Como funciona

Um backend Node.js puro orquestra o binário do `git` por `child_process` e serve
uma SPA React. Você sobe pelo terminal, ele abre no navegador, e o **processo do
servidor** é quem "está" no repositório: trocar de worktree é um
`process.chdir()`, não um `git checkout`.

É mudar de posição em campo sem pedir substituição ao quarto árbitro.

```bash
npx gitcraque                     # no diretório do repositório
npx gitcraque ~/code/projeto      # ou aponte o caminho, como o `git -C`
npx gitcraque --repo ~ --port 5271
npx gitcraque --no-open           # sem abrir o navegador
```

Subiu dentro de um repositório? Ele abre já escalado nele — e entra na sua lista
de recentes. Subiu fora? A tela é o seletor, não um aviso de erro.

O navegador abre sozinho. Se a 5271 estiver ocupada, ele testa as dez seguintes
e diz no banner em qual subiu — dá para deixar mais de um repositório aberto ao
mesmo tempo sem escolher porta na mão.

---

## Galeria de troféus

### 🏆 Grafo de histórico — *a visão de jogo*

> Ele enxerga a linha de passe antes de você.

O backend executa `git log --all --topo-order` e entrega os dados crus. O
front-end calcula a matriz `(X, Y)` de cada commit com algoritmo próprio: `Y` é a
ordem topológica, `X` sai de uma heurística que separa *filhos de ramificação* de
*filhos de mesclagem* para traçar rotas que não se sobrepõem.

O desenho é **SVG escrito à mão** — `<circle>` para commits, `<path>` com Bézier
cúbica para ramificações e merges — com virtualização de janela. Um repositório
de dezenas de milhares de commits rola liso.

**Nenhuma biblioteca de gitgraph está envolvida.** O drible é todo nosso.

### 🏆 Seletor de repositórios — *o olheiro*

> Chegou sem contrato assinado? Senta que a gente resolve.

Subiu fora de um repositório? A tela não é um aviso, é o seletor: repositórios
abertos recentemente, varredura das pastas conhecidas da máquina (`Projects`,
`code`, `/opt`, `/srv`) e um navegador de pastas com migalhas de pão.

Colar um caminho e apertar Enter também funciona, e há um `git init` para a pasta
em que você estiver. Trocar de repositório depois disso é o botão **Abrir** na
barra, ou `⌘K`.

### 🏆 Worktrees sem checkout — *jogo sem substituição*

> O banco de reservas inteiro em campo ao mesmo tempo, e ninguém sai.

`git worktree list --porcelain` alimenta o rail. Ao clicar num rótulo de
worktree, o servidor executa `process.chdir()` para o caminho absoluto dela e
emite um sinal por WebSocket; a interface descarta a View Tree e recarrega a
partir do novo diretório.

Nenhum `git checkout` acontece — a árvore de trabalho de ninguém é mexida.

### 🏆 Drag-and-drop com intenção — *a pedalada*

> Arrasta, olha pro lado, e o commit já está na outra branch.

Sobre `@dnd-kit/core`. Arrastar um **commit** sobre o rótulo de uma **branch**
propõe um `cherry-pick`. Arrastar uma **branch** sobre outra abre a escolha entre
`merge` e `rebase`.

O comando cru aparece antes de executar, e o que reescreve histórico exige
**confirmação por pressão contínua** — o botão só cede se você segurar. É a
diferença entre finalizar e chutar pra fora: dá tempo de pensar.

### 🏆 Squash gráfico — *o chapéu*

> Três commits entram, um sai. E ninguém viu como.

Selecione os commits no grafo e o backend automatiza o rebase interativo com um
interceptor: injeta `GIT_SEQUENCE_EDITOR="node proxy-editor.mjs"` e o script lê o
`git-rebase-todo` que o git gerou, troca `pick` por `squash` nas linhas certas
(mantendo a primeira como `pick`) e sai com `0`. O git aplica a reescrita como se
um humano tivesse editado o arquivo.

**Zero emulação de terminal.** Nada de abrir o `vim` na sua cara.

### 🏆 Push que não trava — *cobrança sem barreira*

> O goleiro nem viu a bola sair.

Modelo de trampolim: o Node injeta `GIT_ASKPASS` apontando para um script
próprio, que responde ao git pelo `stdout` com o token capturado na interface. O
segredo viaja por um socket unix com nonce de uso único — **nunca** pelo ambiente
do processo do git, nunca por argv, nunca em disco.

Se o cofre não tem a credencial, a interface pergunta na hora, e o git recebe a
resposta sem nunca abrir um prompt de terminal invisível.

### 🏆 Volta por cima — *a temporada 2002*

> Ele já se recuperou de coisa muito pior que uma aba descartada.

O Chrome tem dois jeitos de economizar recurso numa aba de fundo, e os dois
machucam de formas diferentes: **congelar** (as filas de tarefa param e o
WebSocket volta meio-aberto — `readyState === OPEN` com a conexão morta do outro
lado) e **descartar** (a página é apagada da memória e volta do zero).

O GitCraque trata os três caminhos de retorno — `visibilitychange`, `resume` e
`pageshow` com `persisted` — e grava o retrato da view quando a aba **esconde**,
nunca na saída: `beforeunload` e `unload` simplesmente não disparam quando o
navegador descarta a aba.

Um boundary de raiz segura o render que estourar, e a recarga automática tem
orçamento, porque laço de recarga é pior que tela quebrada — nem dá tempo de
abrir o devtools.

Joelho reconstruído, artilharia da Copa. Funciona.

---

## Pré-temporada

Contrata pelo npm e escala no terminal:

```bash
npm install -g gitcraque
cd ~/code/projeto && gitcraque
```

Ou sem assinar contrato — o `npx` baixa, roda e devolve:

```bash
npx gitcraque
```

**Requisitos:** Node >= 22.13 e `git` no PATH. Chuteira é opcional.

> O piso de Node não é chute: a memória de projetos usa o `node:sqlite`, que só
> dispensa a flag `--experimental-sqlite` a partir do 22.13.

### Para contribuir

```bash
git clone https://github.com/frederico-kluser/GitCraque.git
cd GitCraque
npm install
npm run build
npm start
```

Instalar por `npm i github:frederico-kluser/GitCraque` **não funciona**: o
pacote publicado leva a SPA já compilada, e o build só roda no `npm pack`. Do
código-fonte, é clone e `npm run build`.

---

## Treino

```bash
npm run dev          # backend --watch em :5271 + vite em :5273 (proxy /api e /ws)
npm run typecheck    # tsc --noEmit
npm run build        # vite build → web/dist

npm test             # server + graph + dnd + viewer (472 testes)
npm run test:server  # 319 testes
npm run test:graph   # 51 testes
npm run test:dnd     # 20 testes
npm run test:viewer  # 82 testes
npm run test:e2e     # 39 verificações (não incluso no npm test)
```

**Rode um comando de cada vez.** A suíte do grafo afere razão de tempo de
relógio; rodando ao lado de outro trabalho pesado ela acusa falta que não
existiu — e aqui não tem VAR.

Leia [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) para a arquitetura completa,
módulo por módulo. Regras de interface em [`docs/UI.md`](docs/UI.md).

---

## Cartão vermelho

O servidor executa comandos `git` na sua máquina. Ele escuta só em `127.0.0.1`,
recusa requisições com `Host`/`Origin` de outra origem, e **não deve ser exposto
na rede**.

Craque joga melhor em casa. Este aqui joga *só* em casa.

---

## Licença

MIT © [Frederico Kluser](https://github.com/frederico-kluser)

<p align="center">
  <sub>Não somos afiliados ao GitKraken, à FIFA, nem ao Ronaldo.<br>
  Somos afiliados apenas ao trocadilho.</sub>
</p>
