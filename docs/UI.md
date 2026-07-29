# Regras de UI — Motion UI primeiro, CSS por ultimo

O projeto ja tem **18 componentes Motion UI instalados** em
`web/src/components/motion-ui/`. Escrever componente do zero e o **ultimo**
recurso, nao o primeiro reflexo.

> **Nao reinstale `stagger-reveal` nem `skeleton` sem ler isto.** As versoes do
> registry importam `motion-plus`, que e alias do `@motionplus/core` — pacote do
> registro privado, que faz `npm install` devolver 401 para quem nao tem
> `MOTION_TOKEN`. O repo foi despublicado dessa amarra: `stagger-reveal` importa
> `splitText` do `motion-plus-dom` (publico, MIT, o mesmo codigo — `motion-plus`
> so reexporta ele), e o bloco `SkeletonReveal`, que usava `AnimateView`, foi
> removido por ser codigo morto e quebrado (React 19 nao exporta
> `ViewTransition`). Rodar `add @motion/stagger-reveal` ou `add @motion/skeleton`
> traz o import pago de volta e quebra o build — a falha e barulhenta, mas o
> conserto e refazer estas duas edicoes.

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
| `sheet` | **sem uso.** E uma gaveta de RODAPE (`fixed inset-x-0 bottom-0`, `max-w-md`, dismiss arrastando para baixo) e a caixa externa dela nao aceita `className`. A gaveta de alteracoes precisava da borda direita e altura cheia, entao foi pelos primitivos de `overlay`, como o `DialogShell` |
| `toast-stack` | resultado de cada comando git (`useToastStack`, `ToastStack`, `Toast`) |
| `command-palette` | ⌘K com todos os comandos git (`useCommandK`, `CommandPalette`) |
| `smooth-tabs` | abas do seletor de repositorios (Favoritos / Recentes / Procurar / Navegar). As abas dos paineis sairam: a coluna direita mostra uma tela por vez e alterna pelo clique num arquivo, nao por tablist |
| `segmented-toggle` | alternadores (todos os ramos x ramo atual, diff unificado x lado a lado) |
| `multi-state-button` | fetch / pull / push com idle → loading → ok → erro |
| `hold-to-confirm` | **obrigatorio** em toda acao destrutiva: deletar branch remota, push --force, reset --hard, squash |
| `progress-bar` | operacoes longas (clone, fetch, rebase) |
| `skeleton` | carregamento da View Tree e do diff |
| `accordion` | secoes do rail: Worktrees, Branches, Remotos, Tags, Stashes |
| `copy-button` | copiar hash, copiar patch, copiar url do remoto |
| `expand-card` | linha do commit expandindo para o detalhe |
| `swipe-actions` | linhas de arquivo no staging (stage / descartar) |
| `border-beam` | botao de commit da toolbar, enquanto ha o que commitar (`active={dirty}`). **Nao** na worktree ativa: aquela e marcada de forma ESTATICA (fundo + borda em `primary`), por pedido de produto — nao devolva o beam para la |
| `stagger-reveal` | entrada dos paineis e dos estados vazios |
| `sparkline` | atividade de commits no cabecalho do repositorio |
| `confetti` | push bem-sucedido |

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
`cd web && npx shadcn@4.16.0 add --yes @motion/<nome>` (o `components.json` ja
esta configurado; o token vem do ambiente, em `MOTION_TOKEN`).

O `.npmrc` nao existe mais: **instalar e compilar o projeto nao pede token
nenhum**. So ADICIONAR componente novo do registry `@motion` pede, porque o
`components.json` manda o `Authorization: Bearer ${MOTION_TOKEN}`. Se o
componente que voce trouxer importar `motion-plus`, veja o aviso do topo antes
de commitar.

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
