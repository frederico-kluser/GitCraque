# Regras de UI — Motion UI primeiro, CSS por ultimo

O projeto ja tem **19 componentes Motion UI instalados** em
`web/src/components/motion-ui/`. Escrever componente do zero e o **ultimo**
recurso, nao o primeiro reflexo.

## A cascata, na ordem

1. **Procurar** no que ja esta instalado (lista abaixo) e em
   `docs/_motion-ui-props.md`, que tem os exports e as props de cada um.
2. **Compor** a partir dos instalados + primitivos Base UI (`@base-ui/react`,
   ja instalado).
3. **So entao** escrever codigo novo — e, ao fazer, escrever **uma linha** de
   comentario dizendo o que faltou no catalogo.

## O que ja esta instalado e para que serve aqui

| Componente | Uso no GitCraque |
|---|---|
| `overlay` | `useFocusTrap` / `useScrollLock` / `Backdrop` de todo dialogo |
| `sheet` | painel de detalhe do commit e diffs longos |
| `toast-stack` | resultado de cada comando git (`useToastStack`, `ToastStack`, `Toast`) |
| `command-palette` | ⌘K com todos os comandos git (`useCommandK`, `CommandPalette`) |
| `smooth-tabs` | abas dos paineis (Alteracoes / Historico / Console) |
| `segmented-toggle` | alternadores (todos os ramos x ramo atual, diff unificado x lado a lado) |
| `multi-state-button` | fetch / pull / push com idle → loading → ok → erro |
| `hold-to-confirm` | **obrigatorio** em toda acao destrutiva: deletar branch remota, push --force, reset --hard, squash |
| `progress-bar` | operacoes longas (clone, fetch, rebase) |
| `skeleton` | carregamento da View Tree e do diff |
| `accordion` | secoes do rail: Worktrees, Branches, Remotos, Tags, Stashes |
| `copy-button` | copiar hash, copiar patch, copiar url do remoto |
| `expand-card` | linha do commit expandindo para o detalhe |
| `swipe-actions` | linhas de arquivo no staging (stage / descartar) |
| `border-beam` | sem uso hoje — a worktree ativa e marcada de forma ESTATICA (fundo + borda em `primary`), por pedido de produto. Nao devolva o beam para la |
| `stagger-reveal` | entrada dos paineis e dos estados vazios |
| `sparkline` | atividade de commits no cabecalho do repositorio |
| `confetti` | push bem-sucedido |
| `terminal-session` | estetica do console de comandos crus |

## O que o catalogo nao tem (e por isso e proprio)

O Motion UI e feito de MECANICAS de revelacao e gesto — nao ha nele menu
ancorado. Onde o app precisa de menu, a semantica vem do `Menu` do Base UI
(`@base-ui/react`, ja instalado): o `ActionMenu` das linhas, os seletores da
toolbar e o **menu de contexto** (`app/ContextMenuHost.tsx`). Os tres desenham
com a MESMA moldura e a mesma linha, exportadas de `panels/parts.tsx`
(`MENU_POPUP_CLASS`, `MenuItems`) — menu com duas aparencias e menu quebrado.

Regra de produto que acompanha isso: **o menu do navegador nao aparece em lugar
nenhum**, exceto em campo de texto. Alvo sem acao util nao mostra caixa vazia e
tambem nao devolve o menu nativo — ver `docs/ARCHITECTURE.md`.

Instalar mais, se realmente faltar:
`cd web && npx shadcn@4.16.0 add --yes @motion/<nome>` (o `.npmrc` e o
`components.json` ja estao configurados; o token vem do ambiente).

## Regras duras

1. **Nunca importe `framer-motion`** — so `motion/react`.
2. **Movimento vem do tema**, nunca de numeros na mao:
   `useMotionUITransition("snap" | "ui" | "gentle" | "lively" | "ambient")`.
   Nada de `stiffness`/`damping` escritos inline.
3. **Cor e espacamento vem dos tokens semanticos**: `bg-background`,
   `text-muted-foreground`, `border-border`, `bg-card`, `text-destructive`.
   Nunca hex, nunca `text-zinc-*`, nunca px cravado em estrutura.
   Tokens proprios do app: `bg-surface-rail`, `bg-surface-graph`,
   `bg-surface-inset`, `text-success`, `text-warning`, e as lanes
   `var(--lane-0..7)` (use o helper `laneVar(n)` de `@/lib/utils`).
4. **Anime so `transform`, `opacity`, `filter`.** Mudanca de caixa usa o prop
   `layout`. Nunca anime `top`/`left`/`width`/`height`/`margin`.
5. **Nao edite os arquivos em `components/motion-ui/**`** — o CLI do shadcn e
   dono deles e sobrescreve no proximo `add`. Customize em wrapper.
6. **Nao rode `add @motion/motion-theme`** — sobrescreveria `motion.theme.ts`,
   que ja esta customizado.
7. **`<MotionUIThemeProvider>` ja esta montado** em `src/main.tsx`. Nao monte de novo.
8. **Reduced motion**: o tema usa `reducedMotion: "calm"`. Efeito continuo ou
   ligado a scroll que voce escrever ainda precisa de `useReducedMotion()`.
9. **CSS de layout e sinal de erro.** Estrutura e grid/flex do Tailwind. Se voce
   estiver escrevendo `position: absolute` para montar uma secao inteira, parou
   na etapa errada da cascata.

## Idioma

A interface fala **ingles, portugues, espanhol e chines**. O idioma sai do
navegador; sem nenhum dos quatro, ingles. O seletor da toolbar (e o grupo
*Idioma* do ⌘K) sobrepoe a deteccao e a escolha fica no `localStorage`.

**Nenhuma string de interface no meio do JSX.** Todo texto vem do catalogo:

```tsx
import { t } from "@/i18n";

<h2>{t("rail.branches.title")}</h2>
{t("changes.filesChanged", { count: n })}   // plural por `_one` / `_other`
```

Texto com marcacao no meio usa `<Rich>`, nunca concatenacao — a ordem das
palavras muda de idioma para idioma:

```tsx
<Rich k="app.emptyRepo.body" nodes={{ command: <code>git log</code> }} />
```

Numero, data e tamanho saem de `@/i18n` (`formatDateTime`, `formatNumber`,
`formatBytes`), nunca de `Intl` com locale cravado.

Texto novo entra em `web/src/i18n/locales/pt.ts` — ele e o catalogo MESTRE, e o
`tsc` aponta os outros tres que faltam preencher.

Nomes de comandos git, argumentos (`--force-with-lease`) e mensagens do proprio
git ficam em ingles, como o git os emite.
