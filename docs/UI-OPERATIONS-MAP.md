# UI-OPERATIONS-MAP — mapa de fluxos de UI das operacoes de git

**Contrato de testes da onda 2** — fonte unica de seletores e gestos para os
specs Playwright (mouse e touch) das operacoes **pull, push, merge, rebase,
squash/rebase interativo e cherry-pick**, em **MOUSE** e **TOUCH**.

Leitura obrigatoria junto com: `docs/UI.md` (regras de UI), `docs/ARCHITECTURE.md`
(arquitetura). Todos os caminhos sao relativos a raiz do repo. **Nao ha
`data-testid` em lugar nenhum do app** (verificado por grep — nenhuma ocorrencia
em `web/src`); todo seletor de teste e por ROLE + TEXTO visivel/aria-label, em
locale **pt**.

Regras de ouro do app que os specs devem respeitar:

- **O app nao tem teste automatico de UI** — `web/src/app`, `panels` e `hooks`
  nao tem suite nenhuma; o sinal e `tsc` + rule checker
  (`docs/ARCHITECTURE.md`, skill composing-shell-interface).
- **Toda mutacao passa por `runOperation`** do store, que liga a barra de
  progresso da toolbar, emite o toast (sucesso ou erro com argv) e faz o refresh
  (`web/src/state/store.ts:641-679`).
- **O argv cru e mostrado antes de executar** em todo dialogo (`<pre>` no
  ConfirmHost, `CommandPreview` nos dialogos de DnD) — o produto inteiro se
  apoia nisso.
- **Destrutivo = hold-to-confirm**, nunca clique. A chave dessa troca e a flag
  `destructive` (`web/src/app/ConfirmHost.tsx:264-277`, `web/src/dnd/intents.ts`,
  skill resolving-drag-intents).
- **Pull nao tem menu de contexto nem drag**: so toolbar/overflow/⌘K.

---

## 1. Vocabulario de gestos e tempos (vale para tudo)

| Gesto | Ponteiro fino (mouse) | Toque (dedo) | Evidencia |
|---|---|---|---|
| Clique / tap | `click` | `tap` (clique emulado) | |
| Selecao de commit | clique simples = substitui; Shift+clique = intervalo; Ctrl/⌘+clique = alterna | tap = substitui; intervalo so no modo "Selecionar varios" | `web/src/graph/CommitRow.tsx:251-255`; `web/src/i18n/locales/pt.ts:1466-1469` (`selection.touch.*`) |
| Duplo clique em chip de branch | troca para a branch (checkout) | "toque duas vezes" — mesmo gesto | `web/src/graph/RefChip.tsx:183-193`; `pt.ts:403-404` (`graph.refChip.hint`) e `pt.ts:1448-1449` (`graph.refChip.hint.touch`) |
| Menu de contexto | botao direito (`contextmenu`) | toque longo **500 ms** (`LONG_PRESS_MS`), tolerancia de movimento **10 px**; janela fantasma de 900 ms engole o `contextmenu` sintetico do Android e o clique fantasma | `web/src/hooks/useShellStore.ts:215`; `web/src/hooks/useLongPress.ts:125,137,200`; `web/src/hooks/useShellStore.ts:548-553` |
| Drag (DnD) | `PointerSensor` com `{distance: 6}` px — clique simples nunca vira arrasto | `TouchSensor` com `{delay: 250, tolerance: 5}` — dedo parado 250 ms acorda o arrasto MESMO sem movimento; derivar mais de 5 px antes dos 250 ms cancela e vira rolagem; o `touchmove` nao-passivo do sensor trava o pan SO depois da ativacao | `web/src/dnd/sensors.ts:56-59,74-78`; `web/src/dnd/GitDndProvider.tsx:232` |
| Regra do dedo parado | — | **Arrasto sempre vence o menu de toque longo**: `DND_DELAY_MS` (250) < `LONG_PRESS_MS` (500), e o `onDragStart` chama `cancelLongPress()` | `web/src/hooks/useShellStore.ts:215-240`; `web/src/dnd/GitDndProvider.tsx:254-262`; `web/src/hooks/useLongPress.ts:191-203` |
| Hold-to-confirm | segurar o botao pressionado (ou **tecla Space** segura; Enter NAO confirma destrutivo) | segurar o dedo no botao; **soltar antes do fim cancela** (a progressao volta a zero com a transicao "snap" e nada executa) | componente `web/src/components/motion-ui/hold-to-confirm/index.tsx:101-107,115-135`; default `holdSeconds = 2` em `:68,185` |
| Swipe entre paineis (mobile) | nao existe (so dedo; o wrapper e inerte com mouse) | 80 px OU 40% da largura, com velocidade > 300 px/s, dominante horizontal; desabilitado durante DnD e com menu aberto | `web/src/app/PaneSwipe.tsx:45-51,67-90`; `web/src/app/App.tsx:310-314` |
| Teclado (paleta ⌘K) | ⌘K abre a paleta com todos os comandos, incluindo pull/push/fetch | o botao `⌘` da toolbar abre a paleta (porta tocavel) | `web/src/app/CommandPaletteHost.tsx`; `web/src/panels/Toolbar.tsx:487-497`; `web/src/app/commands.ts:176-202` |

**Duracao do hold por superficie** (o numero que importa para o spec):

| Superficie | holdSeconds | Evidencia |
|---|---|---|
| `ConfirmHost` (acoes dos paineis: rebase, squash, abort, delete, etc.) | **1.4 s** | `web/src/app/ConfirmHost.tsx:265-277` (`holdSeconds={1.4}`) |
| `IntentDialog` (opcoes do drag: rebase destrutivo) | **2 s** (default do componente) | `web/src/dialogs/IntentDialog.tsx:91-101`; `hold-to-confirm/index.tsx:185` |
| `PushDialog` (force — componente nao alcancavel, ver 4.2) | **2 s** (default) | `web/src/dialogs/PushDialog.tsx:154-162` |
| `SquashDialog` / `InteractiveRebaseDialog` (nao alcancaveis, ver 4.5) | **2 s** (default) | `web/src/dialogs/SquashDialog.tsx:78-82`; `InteractiveRebaseDialog.tsx:146-150` |
| `ConflictDialog` (abortar) | **2 s** (default) | `web/src/dialogs/ConflictDialog.tsx:360-367` |

O que acontece em cada fase do hold (`hold-to-confirm/index.tsx:44-107`):
1. `pointerdown` captura o ponteiro e comeca a rampa `progress 0→1` (easeOut,
   duracao = holdSeconds);
2. a UI avanca por um preenchimento destrutivo da esquerda para a direita
   (`clip-path` wipe, `:250-256`) com leve escala;
3. **progresso chega a 1 → `onConfirm()` dispara UMA vez**;
4. **soltar/`pointerleave`/`pointercancel` antes de 1 → `cancelHold()`**: para a
   rampa, anima `progress` de volta a 0 com a transicao "snap" e **nada executa**.
   Botao volta ao estado de repouso e pode ser segurado de novo.

---

## 2. Infraestrutura de DOM — o que os seletores encontram

### 2.1 Toolbar — botoes de rede (fetch / pull / push)

`web/src/panels/Toolbar.tsx`:

- `NetButton` (linha 98-141): um `MultiStateButton` com `aria-label={label}`
  (linha 132) e `announce={label}: {state}` (linha 131). O rotulo visivel fica
  num `<span className="touch:hidden">` (136-138) — **no toque so o icone fica**.
  Estados: `idle | loading | ok | error`; depois de ok/erro volta ao idle em
  1.8 s (681-685). `disabled={busy}` enquanto QUALQUER operacao roda.
- **Layout completo (desktop/tablet)**: tres botoes seguidos — Fetch (833-839),
  **Pull (840-846)**, **Push (847-853)**.
- **Layout compacto (celular)**: fetch vira botao na linha 2 (763-769);
  **pull e push saem da toolbar e vao para o menu de estouro "⋯"** (717-744),
  itens com texto `action.pull` ("Pull") e `action.push.title` ("Push").
- Barra de progresso da operacao em curso (900-920): `ProgressBar` com
  `aria-label={operationLabel ?? toolbar.progress.label}`.
- `PendingBanner` (620-658): `role="status"` (636), visivel quando existe
  operacao pendente no `.git`; botoes `toolbar.pending.continue` ("Continuar",
  650-652) e `toolbar.pending.abort` ("Abortar", 653-655).

Seletores Playwright:

```
getByRole("button", { name: "Pull" })      // aria-label fixo; texto muda com o estado
getByRole("button", { name: "Push" })      // abre o dialogo
getByRole("button", { name: "Fetch" })
getByRole("button", { name: "Abrir as demais ações da barra" })  // "⋯" compacto (pt.ts:1406)
```

### 2.2 Menu de estouro e menus de linha ("⋯" — `ActionMenu`)

`web/src/panels/parts.tsx:219-311`: gatilho `<button>` com `aria-label` = o
`label` passado (linha 263); popup Base UI portalado com `z-50` (302) e a
moldura unica `MENU_POPUP_CLASS` (182-183); itens com `role=menuitem` e o
texto do item (192-217). O mesmo `MenuItemSpec[]` alimenta o "⋯" e o menu de
contexto — os rotulos sao identicos nas duas portas.

### 2.3 Menu de contexto (`ContextMenuHost`)

`web/src/app/ContextMenuHost.tsx`: um unico popup para a tela toda, ancorado
no ponto do clique, `z-[80]` (117), `aria-label` = rotulo do alvo (120),
rolavel com `max-h-[min(60dvh,32rem)]` (131). O menu nativo do navegador e
suprimido globalmente, exceto em campo de texto (44-66). **Lista vazia =
nenhum menu** (`useShellStore.ts:499-505`).

### 2.4 Grafo (View Tree)

`web/src/graph/GraphView.tsx`:
- container `role="grid"` com `aria-label={t("graph.label")}` = "Histórico de
  commits" (514-516), `tabIndex={0}`, `aria-colcount` 5 (confortavel) / 3
  (compacto) (520).
- linha: `role="row"` com `id={rowDomId(hash)}` = `graph-row-<hash>`
  (`CommitRow.tsx:306`; `shell.ts:103`), `aria-selected` (310), `aria-rowindex`
  (309). **A linha inteira e origem de arrasto de `type: "commit"`**
  (`CommitRow.tsx:232-238`).
- chip de ref: `<span>` com o texto do nome da ref e `title` com a dica
  (`RefChip.tsx:213-249`). Branch local/remota sao origem E alvo de soltura
  (123-126); `data-drop={feedback.state}` (211) e `data-dragging` (212) sao
  atributos de estado para a spec. Durante o arrasto: alvo que aceita fica
  `ring-2 ring-success/70 brightness-125` (231); recusado fica
  `opacity-50 ring-2 ring-destructive/60` (232).
- no compacto cada linha tem um "⋯" `ActionMenu` na coluna Detalhes
  (`CommitRow.tsx:528-532`) com `aria-label` = `Commit <hash curto>`
  (`CommitRow.tsx:530`).
- hint de rolagem lateral: pill `role="status"` com o texto
  `graph.hint.horizontalScroll` (636-653).

### 2.5 Rail (painel esquerdo)

`web/src/panels/RailPanels.tsx`: secoes em Accordion (`AccordionItem`), ordem
Worktrees, Branches locais, Remotos, Tags, Stashes (664-675; somente worktrees
e branches nascem abertos, 668). Linha do rail (`RailRow`, 131-196):
`role="button"` quando clicavel (170), `touch:min-h-tap` (44 px no toque, 185).
Linha de branch (294-366): **origem de arrasto E alvo de soltura no escopo
"rail"** (297-303); clique = reveal (`selectRef`, 328); "⋯" com `aria-label`
`rail.branches.actions` ("Ações da branch {name}", 363); chip `HEAD` na
branch atual (346); chip "presa" quando checada em outra worktree (348-356);
setinhas ↑↓ de ahead/behind (274-292). Linha de remote branch (411-425) e bloco
de remoto (427-488) com os mesmos menus.

### 2.6 Dialogos

- `DialogShell` (`web/src/dialogs/parts.tsx:63-228`): `role="dialog"`,
  `aria-modal="true"`, `aria-labelledby`/`aria-describedby` (138-141),
  `z-50` (129), fechamento por Escape e clique no backdrop, Enter confirma
  quando `onEnter` e passado (99-107 — nunca em destrutivo). **Abaixo de
  768 px vira bottom sheet** colado embaixo, com alca de arrasto
  `role="img"` + `aria-label={t("touch.grabber.label")}` (190-196) e fecho por
  arrastar para baixo (30% da altura ou 500 px/s, 176-188).
- `ConfirmHost` (`web/src/app/ConfirmHost.tsx`): `role="dialog"` com
  `aria-modal="true"` (207-209), `z-[60]` (188), titulo `<h2>` com
  `action.title`, descricao, **`<pre>` com o argv cru** (242-244), campos de
  formulario (246-257), rodape com "Cancelar" (`common.cancel`) e o botao de
  confirmar (259-292). Destrutivo → `HoldToConfirmButton` (264-277) com o
  texto `common.holdTo` = "Segure para {acao}" (pt.ts:40); nao destrutivo →
  `MultiStateButton` com `confirmLabel` (279-291). Sucesso fecha o dialogo em
  420 ms (163-167). Fecha pelo X com `aria-label` `confirm.close` (232-238).
- `IntentDialog` (`web/src/dialogs/IntentDialog.tsx`): `DialogShell` com
  titulo `intent.title`; rodape mostra `<RefChip>{source.label}</RefChip>
  "para" (dialog.intent.for, pt.ts:713) <RefChip>{target.label}</RefChip>`
  (41-45); cada opcao e um `OptionCard` (65-110) com `<h3>` = `option.label`,
  badge "reescreve histórico" (`dialog.intent.rewritesHistory`, 79-83) quando
  destrutivo, `CommandPreview` do argv (88), e botao: destrutivo →
  `HoldToConfirmButton` com `dialog.intent.holdRebase` ("Segure para rebasear")
  so para a opcao rebase, senao `dialog.intent.holdConfirm` ("Segure para
  confirmar") (91-101); nao destrutivo → `Button variant="primary"` com o
  proprio `option.label` (103-105).

### 2.7 Toasts

`web/src/app/Toasts.tsx`: `ToastStack` no canto inferior direito (96-111);
toast de sucesso tem titulo = `successMessage`; toast de erro traz o argv
copiavel (`toast.copyCommand`, 45-61); botao de fechar com `aria-label`
`common.dismiss` (63-71). **Push bem-sucedido dispara confete**: o efeito
procura toast `tone === "success" && argv[0] === "push"` (84-89).

---

## 3. As seis operacoes

### 3.1 PULL

| Modo | Caminho | Evidencia |
|---|---|---|
| MOUSE | Toolbar (layout completo): botao **"Pull"** (icon `ArrowDownToLine`) | `web/src/panels/Toolbar.tsx:840-846` |
| MOUSE | ⌘K → item **"Pull"** do grupo Rede | `web/src/app/commands.ts:187-193` |
| TOUCH | Toolbar compacta: botao **"⋯"** → item **"Pull"** | `web/src/panels/Toolbar.tsx:717-744` |
| TOUCH | ⌘K via botao `⌘` da toolbar → "Pull" | `Toolbar.tsx:487-497`, `commands.ts:187-193` |

**Nao existe pull no menu de contexto nem no drag.** A acao e
`doPull(rebase=false)` → `api.pull({rebase:false})` (`web/src/app/actions.ts:123-126`).

- Chave i18n do botao: `action.pull` = **"Pull"** (`pt.ts:489`); toast de
  sucesso: `action.pull.done` = **"Pull concluído"** (`pt.ts:490`). As chaves
  irmas `action.pullRebase` ("Pull --rebase", `pt.ts:491`) e
  `action.pullRebase.done` (`pt.ts:492`) existem mas **nao tem porta na UI
  atual** (`doPull(true)` nao tem caller — grep so encontra `doPull()`).
- **Gesto**: MOUSE = um clique (sem hold — pull nao e destrutivo). TOUCH =
  tap no item do menu de estouro.
- **DOM**: botao `getByRole("button", { name: "Pull" })`; apos o clique o
  texto vira "ok"/"erro" (`common.ok`/`common.error`) e o `aria-label` vira
  "Pull: ok"/"Pull: erro" por 1.8 s (681-685). No compacto, o item do menu tem
  o texto "Pull".
- **Feedback**: barra de progresso da toolbar com label "Pull" (store
  `runOperation`, 641-679); toast de sucesso "Pull concluído"; refresh
  padrao "all"; o grafo se atualiza sozinho. Falha → toast
  `store.operation.failed` = "{label} falhou" (`pt.ts:686`) com o argv.
  Conflito no meio do pull → `ConflictDialog` (ver secao 6).
- **Mobile**: no toque o botao nao tem rotulo visivel (so icone); o caminho
  confiavel e o menu "⋯" por texto.

### 3.2 PUSH

**Caminho real (todas as portas convergem para `openPushDialog` →
`askConfirm` → `ConfirmHost`):**

| Modo | Caminho | Evidencia |
|---|---|---|
| MOUSE | Toolbar: botao **"Push"** | `web/src/panels/Toolbar.tsx:847-853` |
| MOUSE | ⌘K → item **"Push"** (grupo Rede) | `web/src/app/commands.ts:195-201` |
| MOUSE | Menu de contexto / "⋯" da branch: **"Push desta branch"** (`rail.branches.push`) | `web/src/app/menus.ts:250-254`; `pt.ts:221` |
| MOUSE | Menu de contexto / "⋯" do remoto: **"Push para este remoto"** (`rail.remotes.push`) | `web/src/app/menus.ts:423-426`; `pt.ts:236` |
| TOUCH | Toolbar compacta: "⋯" → **"Push"** | `web/src/panels/Toolbar.tsx:737-742` |
| TOUCH | Toque longo / "⋯" na linha da branch no rail → "Push desta branch" | `RailPanels.tsx:329,363`; `useShellStore.ts:548-553` |

- **Dialogo**: `openPushDialog` (`actions.ts:133-193`):
  - titulo `action.push.title` = **"Push"** (`pt.ts:496`); descricao
    `action.push.description` = "Envia {branch} para o remoto escolhido."
    (`pt.ts:497`);
  - preview: `git push <remote> <branch>` (`actions.ts:146`);
  - campos (`actions.ts:148-178`): `select` Remoto (`action.push.field.remote`,
    `pt.ts:501`), `text` Branch (`action.push.field.branch`, `pt.ts:502`),
    toggles `--set-upstream`, `--tags`, `--force-with-lease` (`pt.ts:504-506`);
  - **botao de confirmar: `MultiStateButton` com `confirmLabel` = "Push"
    (`action.push.confirm`, `pt.ts:499`) — CLIQUE, SEM HOLD, mesmo com
    `--force-with-lease` armado** (defeito conhecido e documentado na skill
    composing-shell-interface: `openPushDialog` nunca seta `destructive: true`);
  - sucesso: toast `action.push.done` = **"Push concluído"** (`pt.ts:500`) +
    **confete** (`Toasts.tsx:84-89`, que procura `argv[0] === "push"`).
- **Gesto**: MOUSE = clique no botao "Push" do dialogo. TOUCH = tap (mesmo
  caminho; o dialogo vira bottom sheet < 768 px).
- **DOM do dialogo**: `getByRole("dialog")` com heading "Push"; o `<pre>` do
  argv `git push …`; botao `getByRole("button", { name: "Push" })` — atencao:
  ha DOIS botões "Push" quando o titulo e "Push": o do rodape e o unico
  clicavel com o preview ao lado; o seletor pode restringir por
  `{ name: "Push", exact: true }` dentro do `role="dialog"`.
- **Caminho alternativo (componente `PushDialog`, NAO alcancavel hoje)**: o
  spec pode usar `web/src/dialogs/PushDialog.tsx` como referencia de layout,
  mas **nenhum codigo abre `openDialog({kind:"push"})`** (grep dos call-sites:
  so repo-picker, clone e add-remote). Se a onda 2 quiser o fluxo "bonito"
  (titulo "Push", `push.title` `pt.ts:771`; estado do botao
  `push.state.idle/sending/ok/error` = "Enviar"/"Enviando..."/"Enviado"/"Falhou"
  `pt.ts:773-776`; **hold correto para force**: `push.hold` = "Segure para push
  --force-with-lease" `pt.ts:780`, hold de 2 s em `PushDialog.tsx:154-162`;
  confete proprio `:124`; toast `push.done` "Push para {remote} concluído"
  `pt.ts:800`), ele precisa ser re-ligado no `DialogHost`/`openPushDialog`
  primeiro — documentar como **deps pendentes** para a onda 2 se decidir.

### 3.3 MERGE

Duas portas, ambas confirmam antes de executar:

**Porta A — drag (motor de intencoes):**

| Modo | Gesto | Evidencia |
|---|---|---|
| MOUSE | Arrastar **branch local** (chip no grafo OU linha no rail) e soltar sobre **outra branch** (chip ou linha) | `web/src/dnd/intents.ts:318-387`; `RefChip.tsx:123-126`; `RailPanels.tsx:297-303` |
| MOUSE | Arrastar **remote branch** sobre branch local → **SO merge** (rebase nao existe para remota) | `intents.ts:352-356,443-465` |
| TOUCH | Toque e segure **250 ms no chip/linha da branch** (origem) e arraste; soltar sobre o chip/linha da branch alvo (o chip escala `touch:scale-150` durante o arrasto) | `sensors.ts:56-59`; `RefChip.tsx:245` |
| ambos | Drop fora de alvo = cancelamento **silencioso** (sem toast) | `GitDndProvider.tsx:268-273` |
| ambos | Drop invalido (ex.: branch em si mesma, commit→commit) = toast `warning` com `intent.invalid.title` ("Movimento não permitido", `pt.ts:1110`) e o motivo, SEM dialogo | `GitDndProvider.tsx:276-280` |

- Resultado: `IntentDialog` com titulo `intent.integrate.title` = "{from} para
  {into}" (`pt.ts:1160`) e **duas opcoes** (branch→branch local):
  - **"Merge de {from} em {into}"** (`intent.merge.label`, `pt.ts:1151`),
    preview `git merge <from>` (`intents.ts:344`), **nao destrutivo** → botao
    de clique com o proprio label (`IntentDialog.tsx:103-105`);
  - "Rebase de {from} em cima de {into}" (ver 3.4).
- Sucesso: toast `exec.merge.done` = **"Merge concluído"** (`pt.ts:1068`) —
  atencao: o toast do drag usa `exec.*`, diferente do toast do menu (abaixo).

**Porta B — menu de contexto da branch:**

| Modo | Caminho | Evidencia |
|---|---|---|
| MOUSE | Clique direito no chip da branch (grafo) ou na linha (rail) → **"Mesclar em {branch}"** (`menu.branch.mergeInto`, `pt.ts:1217`) | `menus.ts:235-241`; `RefChip.tsx:200-210` |
| TOUCH | Toque longo (500 ms) no chip/linha → mesmo item; ou "⋯" da linha → mesmo item | `useShellStore.ts:548-553`; `RefChip.tsx:135-138`; `RailPanels.tsx:329,363` |
| MOUSE | Menu de contexto de **remote branch** → "Mesclar em {branch}" | `menus.ts:327-333` |

- Item desabilitado quando nao ha branch atual ou o alvo e a propria branch
  (`menus.ts:213,238-239`).
- `openMergeInto(source)` (`actions.ts:317-355`): titulo
  `action.merge.title` = "Merge de {source} em {target}" (`pt.ts:1268`);
  preview `git merge --no-edit <source>` (330); campos: toggles `--no-ff`
  (`action.merge.noFf.hint`, `pt.ts:1272`) e `--squash`
  (`action.merge.squash.hint`, `pt.ts:1273`); **nao destrutivo** → botao
  `MultiStateButton` com `action.merge.confirm` = **"Merge"** (`pt.ts:1271`).
- Sucesso: toast `action.merge.done` = "{source} mesclado em {target}"
  (`pt.ts:1275`).
- **Gesto**: Porta A = drag (mouse: 6 px de distancia; toque: segurar 250 ms
  e arrastar). Porta B = clique direito / toque longo + clique no item.
  Nenhum hold na confirmacao (merge nao reescreve).
- **Mobile**: os alvos de soltura sao os chips do grafo (escalam 1.5x durante
  o arrasto, `RefChip.tsx:245`) e as linhas do rail; no layout compacto o
  DragOverlay mostra a dica `dnd.drop.missed.title` = "Arraste sobre um ramo"
  (`pt.ts:1104`) enquanto nao ha alvo sob o dedo (`GitDndProvider.tsx:349-356`).

### 3.4 REBASE

| Modo | Caminho | Evidencia |
|---|---|---|
| MOUSE | **Drag**: branch local sobre outra branch → opcao **"Rebase de {from} em cima de {into}"** (`intent.rebase.label`, `pt.ts:1154`) | `intents.ts:356-369` |
| MOUSE | Menu de contexto da branch (chip ou rail): **"Rebasear {branch} sobre esta"** (`menu.branch.rebaseOnto`, `pt.ts:1218`) | `menus.ts:243-248` |
| TOUCH | Toque longo / "⋯" na branch → "Rebasear {branch} sobre esta"; ou drag (toque 250 ms) branch→branch → opcao rebase no `IntentDialog` | `useShellStore.ts:548-553`; `RailPanels.tsx:329` |
| ambos | **remoteBranch → branch NAO oferece rebase** (evita detached HEAD); a dica e `intent.integrate.noRebaseRemote` (`pt.ts:1163-1164`) | `intents.ts:352-356,372-376` |

- **Rebase e DESTRUTIVO** — o unico ponto da matriz de drag com
  `destructive: true` (`intents.ts:368`), junto com os deletes.
- Porta drag: opcao destrutiva → `HoldToConfirmButton` **2 s** com
  `dialog.intent.holdRebase` = "Segure para rebasear" (`pt.ts:716`), badge
  "reescreve histórico" (`dialog.intent.rewritesHistory`, `pt.ts:715`),
  preview `git rebase <into> <from>` (`intents.ts:365`). Sucesso: toast
  `exec.rebase.done` = **"Rebase concluído"** (`pt.ts:1069`).
- Porta menu: `openRebaseOnto(onto)` (`actions.ts:361-383`): titulo
  `action.rebase.title` = "Rebase de {branch} sobre {onto}" (`pt.ts:1279`);
  preview `git rebase --autostash <onto> <alvo>` (374); **destrutivo** →
  `HoldToConfirmButton` **1.4 s** com `common.holdTo` = "Segure para rebase"
  (`pt.ts:40`, `confirmLabel` = `action.rebase.confirm` "Rebase", `pt.ts:1282`).
  Sucesso: toast `action.rebase.done` = "{branch} rebaseada sobre {onto}"
  (`pt.ts:1284`).
- HEAD detached: as portas de menu avisam com toast `action.detached.title` /
  `action.rebase.detached.body` ("Rebase precisa de uma branch atual…",
  `pt.ts:1265,1277-1278`; para merge, `action.merge.detached.body`, `pt.ts:1266`).
- **Gesto**: a confirmacao exige **segurar** (1.4 s no ConfirmHost, 2 s no
  IntentDialog); soltar antes cancela e nada roda.
- **Mobile**: o `IntentDialog` vira bottom sheet com alca; o hold e com o
  dedo parado no botao (o preenchimento destrutivo mostra o progresso).

### 3.5 SQUASH (e rebase interativo)

**Caminho real do squash:**

| Modo | Caminho | Evidencia |
|---|---|---|
| MOUSE | Selecionar 2+ commits (Shift+clique) e clicar com o botao direito num commit da selecao → **"Squash dos {count} commits"** (`menu.commit.squashSelected`, `pt.ts:1204`) — o menu vira o da SELECAO quando `selecao > 1 && hash clicado ∈ selecao` | `menus.ts:140-146`; `CommitRow.tsx:251-255` |
| MOUSE | Alternativa: "⋯" da linha selecionada → mesmo item | `CommitRow.tsx:528-532` |
| TOUCH | Ligar **"Selecionar vários"** (`selection.touch.enter`, `pt.ts:1466`), tocar no primeiro e no ultimo commit, depois **"Concluir seleção"** (`selection.touch.exit`, `pt.ts:1467`); toque longo/“⋯” na linha da selecao → "Squash dos {count} commits" | `useShellStore.ts:437-440` (modo `touchSelectionMode`); `CommitRow.tsx:285-290` |
| ambos | Menos de 2 commits → toast `action.squash.needsTwo` ("Squash precisa de dois ou mais commits", `pt.ts:648`) | `actions.ts:986-989` |

- `openSquash(commits)` (`actions.ts:985-1017`): titulo `action.squash.title`
  = "Squash de {count} commits" (`pt.ts:650`); preview
  `git rebase -i <hash>^` (993; via `GIT_SEQUENCE_EDITOR` + proxy-editor,
  nunca emulador de terminal); campos: textarea Mensagem final
  (`action.squash.field.message`, `pt.ts:654-655`) e toggle fixup
  (`action.squash.field.fixup`, `pt.ts:656`); **destrutivo** →
  `HoldToConfirmButton` **1.4 s** com `common.holdTo` = "Segure para squash".
  Sucesso: toast `action.squash.done` = **"Squash concluído"** (`pt.ts:657`).
- **REBASE INTERATIVO — BLOQUEIO documentado**: o componente
  `web/src/dialogs/InteractiveRebaseDialog.tsx` existe (titulo
  `rebaseInteractive.title` = "Rebase interativo de {count} commits",
  `pt.ts:750`; hold `rebaseInteractive.hold` = "Segure para executar",
  `pt.ts:753`; acoes pick/reword/squash/fixup/drop por commit, reordenação
  por setas ↑/↓, mensagem por reword) e o `DialogHost` o renderiza para
  `openDialog({kind: "interactive-rebase"})` (`DialogHost.tsx:84-85`), mas
  **NENHUM codigo chama `openDialog` com esse kind** (grep confirma: os unicos
  call-sites sao repo-picker, clone e add-remote). **Nao existe porta de UI
  para o rebase interativo na versao atual.** Os specs de teste so podem
  exercitar o rebase interativo pela porta do squash (que internamente e um
  `git rebase -i` sem emulador). O `SquashDialog` de `dialogs/` tem o mesmo
  problema: o `DialogHost` o renderiza (`DialogHost.tsx:82-83`) mas so o
  `openSquash` do `actions.ts` e alcancado. Se a onda 2 quiser testar o
  dialogo visual `SquashDialog`/`InteractiveRebaseDialog`, precisa primeiro
  ligar uma porta — anotar como decisao da onda 2, nao como bug do mapa.
- **Gesto**: MOUSE = Shift+clique para o intervalo, clique direito, clique no
  item, hold 1.4 s na confirmacao. TOUCH = modo "Selecionar varios" + toque
  longo/"⋯" + hold com o dedo.
- **Mobile**: com o modo de selecao ligado o **arrasto fica suspenso**
  (`pt.ts:1468-1469`, `selection.touch.hint`); o toque alterna a selecao.

### 3.6 CHERRY-PICK

| Modo | Caminho | Evidencia |
|---|---|---|
| MOUSE | **Drag**: arrastar um **commit** (a linha do grafo inteira e arrastavel) e soltar sobre o chip/linha de uma **branch** → `IntentDialog` com a opcao unica **"Cherry-pick em {branch}"** (`intent.cherryPick.label`, `pt.ts:1138`) | `intents.ts:232-276`; `CommitRow.tsx:232-238`; `RefChip.tsx:123-126` |
| MOUSE | Menu de contexto do commit: **"Cherry-pick na branch atual"** (`menu.commit.cherryPick`, `pt.ts:1211`) | `menus.ts:172-177` |
| MOUSE | 2+ commits selecionados: menu da selecao → **"Cherry-pick dos {count} na branch atual"** (`menu.commit.cherryPickSelected`, `pt.ts:1205`) | `menus.ts:147-151` |
| TOUCH | Toque longo (500 ms) na linha do commit / "⋯" → mesmo item do menu; ou drag (250 ms) commit→branch | `CommitRow.tsx:285-298`; `RefChip.tsx:135-158` |
| ambos | commit→commit, commit→remoteBranch, commit→tag, commit→trash = invalido (toast warning, sem dialogo) | `intents.ts:216-230`; `pt.ts:1122-1129` |

- Porta drag: opcao unica **nao destrutiva** (`intents.ts:264`) → botao de
  clique com o label "Cherry-pick em {branch}"; preview `git cherry-pick
  <hash-curto>` (`intents.ts:261`); titulo do dialogo
  `intent.cherryPick.title` = "Cherry-pick em {branch}" (`pt.ts:1139`).
  Sucesso: toast `exec.cherryPick.done` = **"Cherry-pick aplicado"**
  (`pt.ts:1067`).
- Porta menu: `openCherryPick(commits)` (`actions.ts:569-602`): titulo
  `action.cherryPick.title_one/_other` ("Cherry-pick de {hash}" /
  "Cherry-pick de {count} commits", `pt.ts:1291-1292`); preview
  `git cherry-pick <hash…>` (584); campo toggle `-n (--no-commit)`
  (`action.cherryPick.noCommit.hint`, `pt.ts:1299`); **nao destrutivo** →
  botao `MultiStateButton` com `action.cherryPick.confirm` = **"Cherry-pick"**
  (`pt.ts:1298`). Sucesso: toast `action.cherryPick.done` = **"Cherry-pick
  concluído"** (`pt.ts:1301`).
- Branch alvo presa em outra worktree → intencao invalida com
  `intent.branchBusy.title` ("Ramo ocupado em outra worktree", `pt.ts:1131`)
  e `intent.cherryPick.busy` (`pt.ts:1132-1133`).
- **Gesto**: MOUSE = drag de 6 px + soltura, ou clique direito + clique no
  item; confirmacao por CLIQUE (nao reescreve historico). TOUCH = segurar
  250 ms e arrastar, ou toque longo 500 ms + tap no item.
- **Mobile**: a linha do commit e o chip escalam durante o arrasto
  (`CommitRow.tsx:319` `data-[dragging]:opacity-40`; `RefChip.tsx:245`); o
  DragOverlay mostra o hash curto e o assunto truncado (`GitDndProvider.tsx:410-419`).

---

## 4. Comportamento mobile/touch transversal

1. **Layout**: < 768 px (ou tablet em retrato, ou preferencia manual) = coluna
   unica com `MobileNav` fixa embaixo (56 px + safe-area, `App.tsx:300,421`),
   troca de painel por tap na barra ou swipe (`PaneSwipe.tsx:45-51`). A View
   Tree e sempre `density="compact"` no compacto (`App.tsx:356`).
2. **Scroll horizontal com piso de 480 px**: a linha compacta do grafo nunca
   fica mais estreita que 480 px (`web/src/graph/shell.ts:49,60-62`); o
   container rola para o lado (`GraphView.tsx:544-556`) e mostra o hint
   `graph.hint.horizontalScroll` por ate 4 s (229-237, 636-653).
3. **Auto-scroll**: ao revelar (clique em ref no rail/menu "Levar a View Tree
   até aqui") o grafo rola a linha ao centro e marca a linha por
   `MARK_DURATION_MS` (`GraphView.tsx:285-356`); no compacto, revelar TAMBEM
   centraliza a lane horizontalmente (329-344) e o clique numa linha
   evidencia o commit com o mesmo scroll lateral (358-378).
4. **Drag com dedo**: acorda aos 250 ms mesmo parado; o sensor de ponteiro e o
   `TouchSensor` (`GitDndProvider.tsx:232`) — com `PointerSensor` +
   `touch-action: auto` o pan do navegador matava o drag com `pointercancel`
   (`touch-action` e decidido no `touchstart` e travado no gesto; o
   `TouchSensor` trava o pan via `touchmove` nao-passivo com `preventDefault`,
   so depois da ativacao, `sensors.ts:56-59`); o chip da branch escala
   para 1.5x enquanto um arrasto esta ativo (`RefChip.tsx:245`) — a area de
   drop cresce com o visual (medida uma vez, com transform, no inicio do
   drag). Dica "Arraste sobre um ramo" no overlay enquanto nao ha alvo sob o
   dedo (`GitDndProvider.tsx:349-356`; `pt.ts:1104`).
5. **Hold-to-confirm nas acoes destrutivas**: rebase, squash, abort, delete,
   push --force (na versao nao alcancavel do PushDialog). 1.4 s no
   `ConfirmHost` (`ConfirmHost.tsx:266`); 2 s nos dialogos de drag/conflicto.
   Soltar antes = cancelar (progresso volta a zero).
6. **O que NAO e touchable** (o spec de toque nao deve tentar):
   - atalhos de teclado: ⌘K (ha botao equivalente), ⌘R, setas, PageUp/Down,
     Home/End, Shift+setas, F10/ContextMenu, Space-hold nos botoes de hold;
   - Ctrl/⌘+clique e Shift+clique para selecao multipla (no toque o modo e o
     botao "Selecionar vários");
   - hover/tooltips (a densidade compacta nao monta balao, `GraphView.tsx:660`);
   - drag de teclado (KeyboardSensor existe, mas e acessibilidade, nao gesto
     de toque);
   - menu nativo do navegador (suprimido, exceto campos de texto).
7. **Menu de contexto do dedo**: toque longo 500 ms abre o MESMO menu do botao
   direito, no ponto do dedo (`useLongPress.ts`; `useShellStore.ts:548-553`).
   Onde ha arrasto, o arrasto vence (regra da secao 1). O "⋯" e a porta
   alternativa de todo no (commit, branch, remoto, tag, stash, worktree).

---

## 5. Estados de conflito (merge / rebase / cherry-pick / revert)

- Quando o git para no meio, o store publica o campo de estado `repo.head.pending` (nao e chave i18n; fonte: `web/src/dialogs/ConflictDialog.tsx:2-4`) e o
  **`ConflictDialog` abre SOZINHO** (`DialogHost.tsx:72-73`; `ConflictDialog.tsx:239-289`).
- Titulo: `conflict.title` = "{kind} em andamento{progress}" (`pt.ts:811`),
  com o kind traduzido por `conflict.kind.*` ("merge" `pt.ts:807`, "rebase"
  `pt.ts:805`, "cherry-pick" `pt.ts:808`, "rebase interativo" `pt.ts:806`,
  "revert" `pt.ts:809`); callout "Aplicando o commit {hash}." (`conflict.applying`, `pt.ts:821`).
- Lista de arquivos em conflito (`conflict.files` = "Arquivos em conflito
  ({count})", `pt.ts:822`); tocar/clickar num arquivo abre o editor inline:
  botoes **"Usar Nosso" / "Usar Deles" / "Ambos"** (`conflict.editor.ours/theirs/both`,
  `pt.ts:838-840`) e **"Salvar e fazer stage"** (`conflict.editor.saveResolve`,
  `pt.ts:846`).
- Rodape: **"Continuar"** (clique, `conflict.continue`, `pt.ts:818`) e
  **"Segure para abortar"** (`conflict.hold`, `pt.ts:817`; hold 2 s,
  `ConflictDialog.tsx:360-367`). Toasts de desfecho:
  `conflict.done.resumed` ("Operação retomada") / `conflict.done.aborted`
  ("Operação abortada") (`pt.ts:834-835`).
- Na toolbar, o `PendingBanner` (`role="status"`) tambem oferece "Continuar"
  (`toolbar.pending.continue`, `pt.ts:175`) e "Abortar" (`toolbar.pending.abort`,
  `pt.ts:176`) — o Abortar abre o `ConfirmHost` destrutivo (hold 1.4 s,
  `action.abort.confirm` = "Abortar", `pt.ts:663`; `actions.ts:1028-1040`).

---

## 6. TABELA-RESUMO (contrato de testes)

| Operacao | Modo | Caminho de UI | Evidencia | Chave i18n (texto pt) | Gesto | Hold |
|---|---|---|---|---|---|---|
| **Pull** | MOUSE | Toolbar → botao "Pull" | `Toolbar.tsx:840-846` | `action.pull` ("Pull") `pt.ts:489`; toast `action.pull.done` ("Pull concluído") `pt.ts:490` | clique | — |
| **Pull** | MOUSE | ⌘K → "Pull" (Rede) | `commands.ts:187-193` | `action.pull` | clique na linha | — |
| **Pull** | TOUCH | "⋯" da toolbar compacta → "Pull" | `Toolbar.tsx:717-744` | `action.pull` | tap | — |
| **Push** | MOUSE | Toolbar → botao "Push" → dialogo ConfirmHost | `Toolbar.tsx:847-853`; `actions.ts:133-193` | `action.push.title` ("Push") `pt.ts:496`; botao `action.push.confirm` ("Push") `pt.ts:499`; toast `action.push.done` ("Push concluído") `pt.ts:500` + confete | clique; campos: remoto (select), branch (texto), toggles | — (nem com --force-with-lease; defeito conhecido) |
| **Push** | MOUSE | Menu de contexto/"⋯" da branch → "Push desta branch" | `menus.ts:250-254`; `pt.ts:221` | `rail.branches.push` | clique direito + clique | — |
| **Push** | MOUSE | Menu do remoto → "Push para este remoto" | `menus.ts:423-426`; `pt.ts:236` | `rail.remotes.push` | clique direito + clique | — |
| **Push** | TOUCH | "⋯" toolbar compacta → "Push" | `Toolbar.tsx:737-742` | `action.push.title` | tap | — |
| **Push** (alt) | ambos | `PushDialog` (componente **sem caller** — nao testavel hoje) | `PushDialog.tsx:154-162` | `push.hold` ("Segure para push --force-with-lease") `pt.ts:780` | — | 2 s (se re-ligado) |
| **Merge** | MOUSE | **Drag** branch/remoteBranch → branch; `IntentDialog` opcao "Merge de {from} em {into}" | `intents.ts:340-348`; `IntentDialog.tsx:103-105` | `intent.merge.label` `pt.ts:1151`; toast `exec.merge.done` ("Merge concluído") `pt.ts:1068` | drag (6 px) + soltura + clique no botao | — |
| **Merge** | MOUSE | Menu de contexto da branch → "Mesclar em {branch}" | `menus.ts:235-241`; `actions.ts:317-355` | `menu.branch.mergeInto` `pt.ts:1217`; botao `action.merge.confirm` ("Merge") `pt.ts:1271`; toast `action.merge.done` `pt.ts:1275` | clique direito + clique | — |
| **Merge** | TOUCH | Toque longo/"⋯" na branch → "Mesclar em {branch}"; ou drag 250 ms branch→branch | `RailPanels.tsx:329,363`; `RefChip.tsx:135-158,245` | `menu.branch.mergeInto` | toque longo + tap / drag | — |
| **Rebase** | MOUSE | **Drag** branch→branch; `IntentDialog` opcao "Rebase de {from} em cima de {into}" | `intents.ts:356-369`; `IntentDialog.tsx:91-101` | `intent.rebase.label` `pt.ts:1154`; botao `dialog.intent.holdRebase` ("Segure para rebasear") `pt.ts:716`; toast `exec.rebase.done` ("Rebase concluído") `pt.ts:1069` | drag + soltura + **segurar** | **2 s** |
| **Rebase** | MOUSE | Menu de contexto da branch → "Rebasear {branch} sobre esta" | `menus.ts:243-248`; `actions.ts:361-383` | `menu.branch.rebaseOnto` `pt.ts:1218`; botao `common.holdTo` ("Segure para rebase") `pt.ts:40`; toast `action.rebase.done` `pt.ts:1284` | clique direito + clique + **segurar** | **1.4 s** |
| **Rebase** | TOUCH | Toque longo/"⋯" na branch → item; ou drag 250 ms | `RefChip.tsx:135-158`; `RailPanels.tsx:329` | `menu.branch.rebaseOnto` | toque longo + tap / drag + **segurar com o dedo** | 1.4 s / 2 s |
| **Squash** | MOUSE | 2+ commits selecionados (Shift+clique) → menu de contexto → "Squash dos {count} commits" | `menus.ts:140-146`; `actions.ts:985-1017` | `menu.commit.squashSelected` `pt.ts:1204`; `action.squash.title` `pt.ts:650`; botao "Segure para squash" (`common.holdTo`); toast `action.squash.done` ("Squash concluído") `pt.ts:657` | Shift+cliques + clique direito + clique + **segurar** | **1.4 s** |
| **Squash** | TOUCH | "Selecionar varios" + toques nas pontas + "Concluir seleção" + toque longo/"⋯" → item | `useShellStore.ts:437-440`; `pt.ts:1466-1469` | `selection.touch.enter`/`exit`; `menu.commit.squashSelected` | taps + toque longo + tap + **segurar** | **1.4 s** |
| **Rebase interativo** | ambos | **SEM PORTA NA UI** (so `openDialog({kind:"interactive-rebase"})`, sem caller) | `DialogHost.tsx:84-85` | `rebaseInteractive.title` `pt.ts:750`; `rebaseInteractive.hold` `pt.ts:753` | — | 2 s (se re-ligado) |
| **Cherry-pick** | MOUSE | **Drag** commit → chip/linha de branch; `IntentDialog` opcao unica "Cherry-pick em {branch}" | `intents.ts:232-276`; `IntentDialog.tsx:103-105` | `intent.cherryPick.label` `pt.ts:1138`; toast `exec.cherryPick.done` ("Cherry-pick aplicado") `pt.ts:1067` | drag (6 px) + soltura + clique | — |
| **Cherry-pick** | MOUSE | Menu de contexto do commit → "Cherry-pick na branch atual" | `menus.ts:172-177`; `actions.ts:569-602` | `menu.commit.cherryPick` `pt.ts:1211`; botao `action.cherryPick.confirm` ("Cherry-pick") `pt.ts:1298`; toast `action.cherryPick.done` ("Cherry-pick concluído") `pt.ts:1301` | clique direito + clique | — |
| **Cherry-pick** | MOUSE | 2+ commits → menu da selecao → "Cherry-pick dos {count} na branch atual" | `menus.ts:147-151` | `menu.commit.cherryPickSelected` `pt.ts:1205` | Shift+cliques + clique direito + clique | — |
| **Cherry-pick** | TOUCH | Toque longo/"⋯" na linha do commit → item; ou drag 250 ms commit→branch | `CommitRow.tsx:285-298`; `RefChip.tsx:135-158` | `menu.commit.cherryPick` | toque longo + tap / drag | — |
| **Abort de op. pendente** | ambos | PendingBanner → "Abortar" / ConflictDialog → "Segure para abortar" | `Toolbar.tsx:653-655`; `ConflictDialog.tsx:360-367`; `actions.ts:1028-1040` | `toolbar.pending.abort` ("Abortar") `pt.ts:176`; `conflict.hold` ("Segure para abortar") `pt.ts:817`; toast `conflict.done.aborted` `pt.ts:835` | clique + **segurar** | 1.4 s (ConfirmHost) / 2 s (ConflictDialog) |

---

## 7. Verificacao (evidencia de cada afirmacao)

- **Sem `data-testid`**: `grep -rn "data-testid" web/src` → zero ocorrencias.
- **Todas as chaves i18n citadas existem em `web/src/i18n/locales/pt.ts`**:
  grep individual de ~110 chaves (secao 6 e corpo do doc) — todas com a linha
  exata citada; as mais criticas re-verificadas por grep antes da publicacao
  (ex.: `action.pull` :489, `action.push.title` :496, `action.merge.confirm`
  :1271, `action.rebase.confirm` :1282, `action.cherryPick.confirm` :1298,
  `action.squash.confirm` :653, `menu.branch.mergeInto` :1217,
  `menu.branch.rebaseOnto` :1218, `menu.commit.cherryPick` :1211,
  `intent.merge.label` :1151, `intent.rebase.label` :1154,
  `intent.cherryPick.label` :1138, `dialog.intent.holdRebase` :716,
  `common.holdTo` :40, `exec.*.done` :1067-1069, `conflict.*` :805-853,
  `toolbar.pending.*` :170-176, `dnd.drop.missed.title` :1104,
  `graph.hint.horizontalScroll` :1419, `selection.touch.*` :1466-1469).
- **Todos os arquivo:linha citados existem** (arquivos lidos integralmente na
  producao deste mapa): `web/src/panels/Toolbar.tsx` (936 linhas),
  `web/src/app/{actions.ts,menus.ts,ConfirmHost.tsx,ContextMenuHost.tsx,Toasts.tsx,commands.ts,App.tsx}`,
  `web/src/panels/{parts.tsx,RailPanels.tsx}`, `web/src/dnd/{intents.ts,sensors.ts,ids.ts,bindings.ts,GitDndProvider.tsx}`,
  `web/src/dialogs/{IntentDialog.tsx,DialogHost.tsx,executors.ts,parts.tsx,PushDialog.tsx,ConflictDialog.tsx,requests.ts,SquashDialog.tsx,InteractiveRebaseDialog.tsx}`,
  `web/src/hooks/{useLongPress.ts,useShellStore.ts,useViewport.ts,useLayoutMode.ts}`,
  `web/src/graph/{CommitRow.tsx,RefChip.tsx,GraphView.tsx,shell.ts}`,
  `web/src/state/store.ts`, `web/src/i18n/locales/pt.ts`,
  `web/src/components/motion-ui/hold-to-confirm/index.tsx`, `web/src/app/PaneSwipe.tsx`,
  `web/src/app/MobileNav.tsx`, `web/src/lib/api.ts`.
- **Portas nao alcancaveis comprovadas por grep**: `openDialog({kind:"push"})`,
  `openDialog({kind:"squash"})` e `openDialog({kind:"interactive-rebase"})` —
  nenhum call-site no codigo (os unicos `openDialog` sao `repo-picker`,
  `clone` (2x) e `add-remote`).
- **`doPull(true)` sem caller** — grep `doPull(` so encontra `doPull()`.
