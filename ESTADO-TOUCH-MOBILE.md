# GitCraque — adaptação para touch e mobile

**Estado em 09/08/2026.** Trabalho **interrompido a pedido**, com a onda 2A
entregue mas **não integrada**. Este documento é o suficiente para retomar sem
reconstruir contexto.

Objetivo original: *"fazer esse projeto funcionar perfeitamente em telas touch e
responsivo para mobile com as melhores regras de UX possíveis"*.

---

## 1. Situação em uma tela

| | |
|---|---|
| Branch de integração | `main` |
| Commits integrados | **4** (onda 1 completa + subonda de testes) |
| Testes do repositório | **503 → 605** |
| Gate | verde em todos os merges (typecheck, build, 6 suítes, 9 regras) |
| Worktrees abertas | **2**, com trabalho pronto e **não mergeado** |
| Ondas restantes | 2B (7 sub-tarefas) e 3 (3 sub-tarefas) |
| Progresso estimado | **~35%** do escopo total |

A interface **ainda não mudou visualmente**. Tudo o que foi integrado é
fundação: mecanismo, tokens, estado, texto e testes. A onda que muda a tela de
verdade (2B) não foi iniciada.

---

## 2. O que está INTEGRADO em `main`

```
20a3e8fe  test-onda1-viewport-hook    91 testes  — 1ª suíte de web/src/hooks
ed33ef5b  test-onda1-i18n-parity      11 testes  — trava estrutural dos 4 idiomas
b1248e8f  onda1-i18n-touch-catalog    52 chaves × 4 idiomas
fce68f35  onda1-viewport-foundation   useViewport, safe-area, dvh, tap targets
```

### 2.1 `web/src/hooks/useViewport.ts` (novo)

Fonte única de verdade sobre a tela, separando **tamanho** de **natureza do
ponteiro** — um laptop com tela sensível é `isDesktop && isTouch`, não "mobile".

```ts
import { useViewport, useViewportValue, getViewport, BREAKPOINTS,
         selectIsMobile, selectIsTablet, selectIsDesktop,
         selectIsTouch, selectCoarsePointer, selectLandscape } from "@/hooks";
import type { Viewport } from "@/hooks";
```

`Viewport` = `{ width, height, isMobile (<768), isTablet (768–1279),
isDesktop (>=1280), coarsePointer, noHover, isTouch, landscape }`.

Motor: `useSyncExternalStore` + store de módulo, **um** listener global
(`resize` + `orientationchange` + 3 `matchMedia`), coalescing por
`requestAnimationFrame`, snapshot estável por identidade.

> **Prefira `useViewportValue(selectX)` a `useViewport()`.** O segundo
> re-renderiza a cada pixel de resize. O comparador é `Object.is`: o seletor tem
> de ser **constante de módulo** e devolver **primitivo** — um seletor que monta
> objeto novo re-renderiza para sempre.

### 2.2 `web/src/styles/theme.css` e `web/index.html`

- `height: 100dvh` na raiz (o `100%` media a viewport **com** a barra de
  endereço e a tela pulava quando ela se retraía).
- Tokens `--safe-top/right/bottom/left` de `env(safe-area-inset-*)` e
  `--tap-target: 44px`, publicados no `@theme inline`. Utilitários resultantes:
  `min-h-tap`, `min-w-tap`, `size-tap`, `h-tap`, `w-tap`, `p-tap`, `gap-tap`,
  `pt-safe-top`, `pb-safe-bottom`, `pl-safe-left`, `pr-safe-right` (+ famílias
  `m-`, `top-`, `bottom-`, `left-`, `right-`). **Todos verificados compilando.**
- `-webkit-tap-highlight-color: transparent` e `touch-action: manipulation` no
  que é interativo (mata o atraso de 300ms do duplo-toque **sem** desativar o
  zoom da página).
- **`font-size: max(16px, 1rem)` em `input, textarea, select` sob
  `(pointer: coarse)`, deliberadamente FORA de qualquer `@layer`** — ver §5.1.
- Barra de rolagem custom restrita a `(pointer: fine)`; no dedo volta a nativa.
- `viewport-fit=cover` (é o que faz `env(safe-area-inset-*)` valer alguma
  coisa), `theme-color` claro/escuro, metas de web app.
- **Nunca** `user-scalable=no` nem `maximum-scale` — bloquear zoom é falha de
  acessibilidade e está proibido nesta tarefa.

### 2.3 Catálogo i18n — 52 chaves novas × 4 idiomas (1057 por locale)

Dois namespaces: **`mobile.*`** (só existe quando a tela mostra um painel por
vez) e **`touch.*`** (vocabulário de gesto, vale em qualquer tela sem mouse).

Mais **8 variantes `.touch`** de chaves preexistentes que ensinavam gesto de
mouse justamente nas telas que viram aba de celular — `detail.empty.body`
(*"Clique num commit. Segure ⇧ para marcar um intervalo"*),
`graph.refChip.hint` (*"duplo clique troca para esta branch"*),
`favorites.reorderTitle` (*"Arraste para reordenar (ou Alt + setas)"*) etc.
As originais **não** foram alteradas: em mouse elas estão certas e são mais
precisas.

### 2.4 Suítes novas

| Suíte | Testes | Cobre |
|---|---|---|
| `npm run test:hooks` | 91 | fronteiras 767/768/769 e 1279/1280/1281, estabilidade de referência do snapshot, ciclo de vida do listener (inclusive StrictMode), coalescing por rAF, guardas de ambiente |
| `npm run test:i18n` | 11 | paridade exata dos 4 conjuntos, placeholders por conjunto, plurais, chave duplicada, higiene de *type stripping*, vocabulário de gesto |

Ambas registradas no `package.json` e encadeadas no `npm test`.
As 11 invariantes de i18n foram **provadas por mutação**: 15 quebras
deliberadas, todas pegas.

---

## 3. O que está nas WORKTREES ABERTAS (pronto, **não** integrado)

Duas worktrees seguem vivas, com trabalho **completo e commitado** pelos
agentes. Ambas **mergeiam limpo** (testado a seco com `git merge-tree`).

### 3.1 `onda2a-touch-primitives`

```
Worktree : /home/ondokai/Projects/GitCraque-worktrees/20260809-150700-2457459/onda2a-touch-primitives
Branch   : do/GitCraque/20260809-150700-2457459/onda2a-touch-primitives
Commit   : a9e1d1f7
Diff     : 5 arquivos, +736 −2
```

| Arquivo | O que traz |
|---|---|
| `web/src/hooks/useLongPress.ts` (novo, 423 linhas) | toque longo abrindo o mesmo menu que o botão direito |
| `web/src/hooks/useLayoutMode.ts` (novo, 80 linhas) | `useLayoutMode(): "compact" \| "full"` |
| `web/src/hooks/useShellStore.ts` | `longPressMenu`, tempos, preferências, modo de seleção |
| `web/src/hooks/index.ts` | exports |
| `web/src/types/modules.ts` | **contrato congelado** — `GraphViewProps.density?` |

**Evidência que o agente produziu:** 15/15 testes sintéticos + **5/5 em Chrome
headless real** (dirigido por CDP sobre o `ws` já instalado, sem dependência
nova). Um bug foi **encontrado e corrigido no processo**: o menu abria duas
vezes quando o `contextmenu` sintético do Android chegava depois do toque longo
(o teste falhou com `2 !== 1` antes da correção).

**Suítes rodadas pelo agente:** typecheck, build, graph, dnd, viewer, server,
regras — todas verdes.

### 3.2 `onda2a-shared-parts`

```
Worktree : /home/ondokai/Projects/GitCraque-worktrees/20260809-150700-2457459/onda2a-shared-parts
Branch   : do/GitCraque/20260809-150700-2457459/onda2a-shared-parts
Commits  : ebd4ea6b, aab89c2c
Diff     : 3 arquivos, +216 −11
```

| Arquivo | O que traz |
|---|---|
| `web/src/styles/theme.css` | variante `touch:`, utilitárias `longpress-menu` e `selectable`, exclusão dos nós de dnd do `touch-action` |
| `web/src/panels/parts.tsx` | `ToolButton`, gatilho do `ActionMenu`, `MENU_ITEM_CLASS` a ≥44px sob toque |
| `web/src/dialogs/parts.tsx` | `Button`, campos a ≥44px; `DialogShell` vira **bottom sheet** abaixo de 768px; `85vh` → `85dvh` |

**Evidência que o agente produziu:** mediu os componentes **reais** contra o CSS
do **build real** em Chromium headless, e rodou o mesmo probe contra `main` para
provar não-regressão item a item:

| alvo | desktop antes | desktop depois | sob toque |
|---|---|---|---|
| ToolButton sm / md | 26×24 / 30×32 | **idêntico** | 44×44 |
| gatilho `ActionMenu` | 24×24 | **idêntico** | caixa 24, área clicável 44 |
| `MENU_ITEM_CLASS` | altura 28 | **idêntico** | altura 44 |
| `Button` de diálogo | 51×36 | **idêntico** | altura 44 |
| campo de texto | 406×38 | **idêntico** | altura 44,84 |
| painel do diálogo | 448 larg., raio 10px | **idêntico** | 390 larg., ancorado embaixo, raio topo 18px |

### 3.3 ⚠️ O QUE FALTOU FAZER NESSAS DUAS WORKTREES

O trabalho dos agentes está **completo**. O que faltou é a **etapa do
orquestrador**, interrompida a pedido:

| # | Etapa pendente | Estado |
|---|---|---|
| 1 | **Revisão adversarial** dos dois diffs | **interrompida no meio** — dois revisores foram disparados e parados antes de concluir |
| 2 | **Squash-merge** em `main`, um a um | não feito |
| 3 | **Gate** após cada merge (typecheck + build + 6 suítes + regras) | não rodado sobre o resultado integrado |
| 4 | **Limpeza** (`do-wt.sh remove` + `drop-branch`) | não feita — por isso as worktrees seguem abertas |

**As perguntas que a revisão adversarial ia responder e ficaram em aberto.**
Elas não são teóricas: as três revisões anteriores desta execução acharam três
bloqueadores reais. Retome por aqui:

*Sobre `onda2a-touch-primitives`:*
1. O estado do gesto é **de módulo**, não por componente. Dois nós tocados por
   dois dedos ao mesmo tempo abrem o menu do nó errado? `pointerdown` no nó A e
   `pointerup` no nó B?
2. A janela de clique fantasma (`GHOST_WINDOW_MS = 900`) engole **quantos**
   cliques, e **em que alvo**? Se engolir clique em qualquer lugar do
   documento, o usuário fecha o menu e o próximo toque na tela não faz nada.
3. A classe `touch-ui` é escrita no escopo do módulo, antes do primeiro render.
   Tem guarda `typeof document === "undefined"`? Se `useShellStore.ts` for
   alcançado pela cadeia de import dos `*.domtest.ts` do grafo (que renderizam
   com `react-dom/server`), a suíte do grafo explode.
4. **A mais importante:** o agente concluiu que *"num nó arrastável com menu, o
   arraste vence sempre (250 < 500), então o menu precisa do botão ⋯"*. Isso
   vira regra para sete agentes. **Confira a mecânica no @dnd-kit**: com
   ativador por atraso, segurar o dedo **parado** por 250ms já inicia o
   arraste — ou o arraste só começa com **movimento** após o atraso? Se for a
   segunda, segurar parado por 500ms ainda abriria o menu e a conclusão está
   errada.

*Sobre `onda2a-shared-parts`:*
5. O `::after` estica a área clicável do "⋯" de 24px para 44px — ou seja,
   **transborda ~10px para cada lado**. O que existe nesses 10px? Se cobrir a
   própria linha (que tem `onClick` de seleção), tocar ao lado do "⋯" abriria o
   menu em vez de selecionar. **Medir, não ler.**
6. `MENU_ITEM_CLASS` foi de 28px para 44px. Um menu de contexto de commit tem
   ~14 itens → **616px**. Cabe em 844px de um iPhone? O `MENU_POPUP_CLASS` tem
   `max-height` e `overflow`? Se não tiver, os últimos itens ficam
   inalcançáveis — seria um bloqueador de usabilidade **criado** por esta
   mudança.
7. `ToolButton` cresce a caixa para 44×44 e a toolbar tem ~10 deles em
   `flex-wrap`. Em 390px de largura, **quantas linhas** a toolbar passa a
   ocupar? Se comer metade da tela, a onda 2B precisa saber antes de começar.

### 3.4 Como retomar essas worktrees

```bash
# o estado da execução está em .deep-orchestrator/run-20260809-150700-2457459/
#   env         -> variáveis e helpers (source antes de qualquer comando)
#   owned.tsv   -> a ÚNICA fonte de alvos de limpeza
#   TASK_PLAN.md -> o plano completo, com o replan já aplicado

. /home/ondokai/Projects/GitCraque/.deep-orchestrator/run-20260809-150700-2457459/env

"$DO_WT" status                      # o que ainda é desta execução
"$DO_WT" merge onda2a-touch-primitives "<mensagem>"
# gate: typecheck, build, test:server, test:graph (ISOLADO), test:dnd,
#       test:viewer, test:i18n, test:hooks, check-project-rules
"$DO_WT" remove onda2a-touch-primitives && "$DO_WT" drop-branch onda2a-touch-primitives
# repetir para onda2a-shared-parts
```

> **Se preferir descartar:** os branches ficam arquivados em
> `refs/do-archive/20260809-150700-2457459/` mesmo depois de apagados. Nada se
> perde.

> **Nota sobre `git diff main..branch`:** ele mostra os arquivos de teste como
> **deleções**. É artefato do diff de dois pontos — `main` avançou depois que os
> branches foram cortados. Use três pontos (`main...branch`) ou a merge-base.
> O merge é limpo; nada será apagado.

---

## 4. O que FALTA fazer

### ONDA 2B — a onda que muda a tela (7 sub-tarefas, paralelas)

Arquivos disjuntos; ordem de merge da esquerda para a direita.

| # | Worktree | Arquivos que possui | Entrega |
|---|---|---|---|
| 1 | `onda2b-graph-touch` | `web/src/graph/**` (inclui `__tests__`) | colapso de colunas em tela estreita, densidade compacta, toque longo nas linhas, destino do conteúdo do tooltip |
| 2 | `onda2b-dnd-touch` | `web/src/dnd/**` + `dnd/__tests__/sensors.test.mjs` (novo) | sensor por atraso, `cancelLongPress` no `onDragStart` |
| 3 | `onda2b-dialogs-touch` | `web/src/dialogs/**` menos `parts.tsx` | 14 diálogos como bottom sheet, gesto de arrastar para fechar |
| 4 | `onda2b-viewer-touch` | `web/src/viewer/**` | diff e markdown em tela estreita |
| 5 | `onda2b-shell-controls` | `panels/{Toolbar,RailPanels,CommitSearch,UndoRedo}.tsx` | toolbar comprimida com overflow, busca em folha, rail tocável |
| 6 | `onda2b-shell-panels` | `panels/{DetailPanel,StatusPanel,BlamePanel,FileViewPanel}.tsx`, `app/{ConfirmHost,SettingsDialog}.tsx` | painéis tocáveis, seção "Layout" nas configurações |
| 7 | `onda2b-shell-layout` | `app/{App,MobileNav(novo),Splitter,AiBar,StatusFooter,ContextMenuHost,Toasts}.tsx`, `panels/{SidePanel,ChangesSheet,index}` | **coluna única + barra de navegação inferior** — o coração da entrega |

### ONDA 3

| Worktree | Entrega |
|---|---|
| `onda3-swipe-panes` | deslizar horizontalmente entre painéis. **Só é seguro depois** que o sensor virar por atraso: swipe rápido não passa do atraso; press-and-drag passa. Aceitação: swipe de 250px/200ms troca de painel e **não** inicia arraste |
| `onda3-touch-audit` | `scripts/verify-touch.mjs` + `web/src/__audit__/touch-targets.domtest.ts` — falha se algum `<button>`/`[role=button]`/`Menu.Item` no markup emitido não carregar utilitário de toque nem `data-tap-exempt` |
| `onda3-keyboard-parity` | `Esc` (limpar seleção) e `⌘K` (paleta) são os **únicos** atalhos sem porta tocável; `⌘R` e `⌘Enter` já têm botão |

### Dívidas registradas

- **`AGENTS.md` está duas vezes desatualizado**: diz `472 tests` e
  `test:server # 319`. O real já era 350/503 **antes** desta execução; agora é
  **605**. A tabela de `.agents/skills/verifying-changes` tem o mesmo erro.
- **Documentar as duas suítes novas** (`test:hooks`, `test:i18n`) no `AGENTS.md`.
- **Passo `<evolution>` do project-router não rodado** — o aprendizado durável é
  o contrato `longPressMenu`/`withLongPress` em `composing-shell-interface`.
- `docs/UI.md:44` afirma que `swipe-actions` serve "linhas de arquivo no
  staging". **Está envelhecido**: o componente está instalado e **sem uso**. É a
  mecânica pronta para stage/descartar por arrasto, e a cascata do `docs/UI.md`
  obriga a considerá-lo antes de escrever gesto novo.

---

## 5. Armadilhas descobertas — leia antes de continuar

Cada uma custou uma revisão adversarial ou um agente inteiro para aparecer.

### 5.1 A regra dos 16px precisa ficar FORA de `@layer`

O Safari do iPhone dá zoom sozinho ao focar qualquer campo com fonte abaixo de
16px, e o zoom **não volta**. A regra que corrige isso foi escrita em
`@layer base` e era **morta**: `.text-xs`/`.text-sm` saem em `@layer utilities`,
que vem depois, e **camada posterior vence independentemente de especificidade e
de media query**. Todos os 8 campos do app continuavam zoomando.

A correção é a regra **fora de qualquer `@layer`** (declaração não-camada vence
toda camada, sem `!important`). Provado em Chromium com `getComputedStyle` **e
com controle negativo** — o CSS pré-correção foi reconstruído e o mesmo teste
falhou.

> Não mova essa regra para dentro de uma camada. Há um comentário no arquivo.

### 5.2 O grafo **não pode** ler `useViewport`

`getServerSnapshot` devolve **desktop**, e `web/src/graph/__tests__/*.domtest.ts`
renderiza com `renderToStaticMarkup`. Um hook faria o caminho móvel **nunca** ser
exercitado, e a suíte reportaria verde para sempre sem provar nada.

Provado: com janela de 375px, ponteiro grosseiro e `maxTouchPoints: 5`, o store
do cliente diz `isMobile: true` e o render de servidor devolve
`isMobile: false, isDesktop: true`.

**A densidade entra por prop.** `GraphViewProps.metrics?: Partial<GraphMetrics>`
já existe e já é desestruturado campo a campo em `GraphView.tsx:141-157`;
`density?: "comfortable" | "compact"` foi acrescentado ao contrato.

### 5.3 No iOS **não existe** evento `contextmenu`

Toque longo no iOS Safari dispara o *callout* nativo (Copiar / Consultar) por
cima do nosso menu, e **nenhum JavaScript intercepta** — não há em quê pegar.
A única porta é CSS: `-webkit-touch-callout: none` + `user-select: none`.

Mas **não aplique largo**: num cliente Git, hash, mensagem de commit e conteúdo
de diff **precisam** continuar selecionáveis. Por isso a utilitária
`longpress-menu` é **opt-in** e traz o recorte de toque dentro dela, com
`selectable` como válvula de escape para descendentes.
Hoje ela tem **zero call sites** — a onda 2B precisa aplicá-la.

### 5.4 Arraste e menu disputam o mesmo gesto

`DND_DELAY_MS = 250` e `LONG_PRESS_MS = 500`. Em nó arrastável com menu, o
arraste tende a vencer. Afeta linha de commit, chip de ref, linha do rail e
linha de favoritos. **A porta alternativa do menu é o botão "⋯"**, que já serve
o mesmo `MenuItemSpec[]`.
→ **Confirme a mecânica** antes de tratar como regra (§3.3, pergunta 4).

Pior ainda: **três** gestos de pressão contínua convivem no app —
`common.holdTo` (confirmação destrutiva), `touch.longPress.drag` (arraste) e
`agent.state.idle` = *"Segure para falar"* (microfone da AiBar). Em espanhol as
duas primeiras frases são quase idênticas. Nenhum par pode coexistir no mesmo
elemento.

### 5.5 O componente `sheet` do catálogo é armadilha

Parece a solução pronta para bottom sheet. Não é:

| Evidência | Consequência |
|---|---|
| `touchAction: "none"` no painel **inteiro** | o conteúdo não rola no dedo — e a gaveta hospeda a lista de arquivos alterados |
| `drag="y"` no painel inteiro | qualquer arrasto vertical arrasta a gaveta |
| `className` concatenado por string crua, sem `cn()` | sobrepor `max-w-md` não é confiável |
| `dialog.showModal()` | põe a gaveta na **top layer**, acima de qualquer `z-index` — nosso menu de contexto (z-80) renderizaria **por baixo** dela, quebrando a regra de produto *"onde há ação, há o nosso menu"* |

**Caminho certo:** manter `Backdrop` + `useFocusTrap` + `useScrollLock` e trocar
só a geometria; `drag="y"` **apenas no cabeçalho/puxador**, nunca no corpo
rolável — que é exatamente o erro do componente do catálogo.

### 5.6 `touch-action: manipulation` **não** quebrou o arraste

Duas leituras se contradisseram; a especificação resolve: `manipulation` é
**subconjunto estrito** de `auto` (tira só o duplo-toque para zoom). Os dois
deixam o navegador roubar o toque. A causa real do arraste não funcionar era
`activationConstraint: { distance: 6 }` em `dnd/GitDndProvider.tsx:208` — o
navegador vence o pan antes dos 6px.

A exclusão dos nós de dnd foi feita mesmo assim, por ser defesa barata.
**Não acrescente `touch-action: none`**: o ativador por atraso dispensa, e
`none` num `<div role="row">` de lista virtualizada mataria a rolagem vertical
do histórico inteiro.

### 5.7 Restrições do repositório que mordem

- **`test:graph` tem flake documentado** (`perf.test.ts:70-76`, razão de tempo
  de parede): vermelho dentro do `npm test` encadeado, verde isolado.
  **Rode a suíte do grafo sozinha, sempre.** Confirmado três vezes.
- **`node --test` com glob que não casa nada sai 0**, não erro. Registrar script
  de suíte antes de a suíte existir é seguro.
- **Type stripping é load-bearing.** `web/src/i18n/**`, `graph/{layout,bezier,
  reveal}.ts`, `dnd/{intents,ids}.ts` e `viewer/*.ts` são carregados direto pelo
  Node. Nada de `@/` em runtime, `.ts` explícito em import relativo, sem `enum`
  nem `namespace`. Uma violação **passa no `tsc`** e derruba a suíte inteira no
  carregamento.
- **`npm run test:e2e` não dá para estender** para UI: `verify-e2e.mjs` é 100%
  servidor (`fetch` + WebSocket contra `127.0.0.1`), sem navegador e sem DOM.
  O que **dá** para estender é `web/src/graph/__tests__/run.mjs` — esbuild (já
  vem com o Vite) + `react-dom/server` com os `paths` do `tsconfig`. É o molde
  da auditoria de alvo de toque da onda 3.
- **`web/src/components/motion-ui/**` é do CLI do shadcn** e é sobrescrito no
  próximo `add`. Customização vai em wrapper. Em particular, o
  `command-palette` destaca a linha por `onMouseEnter` — sem caminho de toque —
  e precisa de wrapper.

---

## 6. Premissas assumidas (não foram confirmadas com ninguém)

1. **"Mobile" = navegador móvel apontando para o servidor local.** O bind
   `127.0.0.1` e a checagem de `Host`/`Origin` **não foram tocados** — é regra
   de segurança do `AGENTS.md` e ficou fora de escopo.
2. Escopo é `web/**` + `web/index.html`. Nenhuma mudança em `server/**`, nenhuma
   rota nova.
3. Breakpoints **768 / 1280**. Tablet decide por orientação: retrato →
   `compact`, paisagem → `full` (na prática só decide entre 1024 e 1279px).
4. **Nenhuma dependência npm nova.** Nem para testar: as medições em navegador
   usaram um cliente CDP escrito à mão sobre o `ws` que já existia.
5. Nenhum PWA instalável com service worker — o app depende do git local.
6. Contratos congelados só recebem **acréscimo**; `web/src/state/store.ts` não
   foi tocado (estado de viewport é da casca, mora em `hooks/useShellStore.ts`).

---

## 7. Limpeza pendente

- **2 worktrees** e **2 branches** desta execução seguem vivos (§3).
- `.deep-orchestrator/run-20260809-150700-2457459/` guarda `env`, `owned.tsv` e
  `TASK_PLAN.md`. **Não apague antes de fechar as worktrees** — `owned.tsv` é a
  única fonte segura de alvos de limpeza. Ele não é rastreado pelo git.
- Branches já integrados ficam arquivados em
  `refs/do-archive/20260809-150700-2457459/`.
