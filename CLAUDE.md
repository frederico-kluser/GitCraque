# GitCraque

Cliente Git de desktop sem Electron: backend Node.js puro orquestrando o binario
do `git` por `child_process`, SPA React servida por ele. Sobe com `gitcraque` no
terminal.

**Leia antes de escrever codigo:**

- `docs/ARCHITECTURE.md` — a arquitetura inteira, modulo a modulo. Fonte de verdade.
- `docs/UI.md` — a cascata do Motion UI e as regras de estilo. Obrigatorio para front-end.
- `docs/_motion-ui-props.md` — exports e props dos 19 componentes ja instalados.

## Comandos

```bash
npm install              # workspaces: server + web
npm run build            # vite build → web/dist
npm start                # sobe o gitcraque servindo web/dist
npm run dev              # backend com --watch + vite dev (proxy /api e /ws)
npm run typecheck        # tsc --noEmit no web
```

O backend escuta em **5271**; o Vite em dev escuta em **5273** e faz proxy.

## Regras invioláveis do produto

1. **Zero biblioteca de gitgraph.** `@gitgraph/react` e `gitgraph.js` proibidos.
   O layout do grafo e algoritmo proprio em `web/src/graph/layout.ts`.
2. **O historico sai deste comando exato:**
   `git log --pretty=format:"%H|%P|%an|%ae|%s|%ar|%d" --all --topo-order`
   (constante `LOG_ARGS` em `server/src/contract.mjs`).
3. **Trocar de worktree e `process.chdir()`, nunca `git checkout`.**
4. **Drag-and-drop e `@dnd-kit/core`.** Nada de HTML5 drag events.
5. **Squash e `GIT_SEQUENCE_EDITOR` + proxy-editor.** Nada de emulador de terminal.
6. **Rede usa o trampolim `GIT_ASKPASS`.** Nenhum comando pode travar num prompt.

## Convencoes de codigo

- **ESM em tudo.** Backend `.mjs`, front-end `.ts`/`.tsx`.
- **Backend sem framework**: `node:http` nativo. A unica dependencia e `ws`.
- **`spawn` com array de argumentos, jamais `shell: true`** e jamais interpolar
  entrada do usuario numa string de comando.
- **Front-end em TypeScript estrito.** `npm run typecheck` tem de passar limpo.
- **Nunca invente rota.** A superficie REST inteira esta em `web/src/lib/api.ts`
  e espelhada em `server/src/contract.mjs`.
- **Nunca duplique estado do repositorio.** Tudo passa por `web/src/state/store.ts`.
- Comentarios e texto de UI em **portugues**; identificadores em ingles.
- Sem acentos em comentarios de codigo (mantem o diff limpo em terminais variados).

## Fronteiras entre modulos

Cada frente e dona absoluta do seu diretorio e nao edita o dos outros:

| Frente | Diretorio | Nao toca em |
|---|---|---|
| backend | `server/**` | `web/**` |
| grafo | `web/src/graph/**` | `dnd`, `dialogs`, `panels`, `app` |
| dnd | `web/src/dnd/**`, `web/src/dialogs/**` | `graph`, `panels`, `app` |
| shell | `web/src/app/**`, `web/src/panels/**`, `web/src/hooks/**` | `graph`, `dnd`, `dialogs` |

**Arquivos congelados** (nao edite sem alinhar — eles sao o contrato):
`web/src/types/git.ts`, `web/src/types/modules.ts`, `web/src/lib/api.ts`,
`web/src/lib/ws.ts`, `web/src/state/store.ts`, `server/src/contract.mjs`,
`web/src/components/motion-ui/**` (o shadcn CLI e dono).

Precisa de um campo novo no contrato? Acrescente **sem remover nem renomear** o
que ja existe, e deixe claro no commit.
