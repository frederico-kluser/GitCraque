# AGENTS.md

GitCraque: a desktop Git client with **no Electron**. A pure Node backend drives
the `git` binary through `child_process` and serves a React SPA. The server
process *is* the thing that sits in the repository — switching worktree is
`process.chdir()`, not `git checkout`.

**Read before writing code:** `docs/ARCHITECTURE.md` (the whole architecture,
module by module — the source of truth), `docs/UI.md` (the Motion UI cascade and
style rules, mandatory for front-end), `docs/_motion-ui-props.md` (exports and
props of the 19 installed components).

## Commands

```bash
npm install              # workspaces: server + web
npm run dev              # backend --watch on 5271 + vite on 5273 (proxies /api and /ws)
npm run build            # vite build -> web/dist
npm start                # serve web/dist
npm run typecheck        # tsc --noEmit  (web only -- server/** has no tsconfig)

npm test                 # server + graph + dnd + viewer  (454 tests)
npm run test:server      # 310   node --test "server/test/*.test.mjs"
npm run test:graph       # 42    custom runner, 3 phases
npm run test:dnd         # 20
npm run test:viewer      # 82
npm run test:e2e         # 39 checks -- NOT part of `npm test`; run it explicitly

# single test file
node --test server/test/api.test.mjs
# single test by name
node --test --test-name-pattern "cherry-pick" web/src/dnd/__tests__/intents.test.mjs

node .agents/skills/scripts/check-project-rules.mjs   # the project's own rules
```

**Run test commands one at a time.** The graph suite asserts a wall-clock ratio
(`web/src/graph/__tests__/perf.test.ts:70-76`); run it beside another heavy job
and it flakes into a false red. There is no linter, no formatter and no CI —
nothing runs automatically, ever.

`npm run test:graph` rewrites the tracked file `docs/graph-sample.svg`. A diff
there after testing is real signal, not noise.

## Rules

Nine rules are now machine-checked by
`node .agents/skills/scripts/check-project-rules.mjs`: no gitgraph library, the
exact `LOG_ARGS` command, no `shell: true`, no `child_process.exec`, no
`framer-motion`, no hex colours, no numbered Tailwind palettes, no
`transition-all`, and the no-bundler import discipline below. Do not restate
them in prose — run the check.

What no check covers, and what actually bites:

- **Type stripping is load-bearing.** Three of five suites load `.ts` files
  directly under Node (v24.15.0). `@/` is legal **only** in `import type`;
  relative runtime imports need the explicit `.ts`; `.tsx` cannot be imported at
  runtime; no `enum`, `namespace`, or decorators. Affected:
  `web/src/graph/{layout,bezier,reveal}.ts`, `web/src/dnd/{intents,ids}.ts`,
  `web/src/viewer/*.ts`, and **everything under `web/src/i18n/`** — the widest
  blast radius, loaded by both `test:viewer` and `test:dnd`. A violation passes
  `tsc` and breaks a whole suite at load time.
- **Switching worktree is `process.chdir()`, never `git checkout`.** Same for
  opening a repository.
- **Squash is `GIT_SEQUENCE_EDITOR` + proxy-editor.** No terminal emulator.
- **Network goes through the `GIT_ASKPASS` trampoline.** No command may block on
  a prompt; the token never enters the git process env, argv, or disk.
- **No interface text hardcoded.** All text comes from the catalogue: `t("key")`
  from `@/i18n` in the front-end, an i18n key in backend errors. New text goes
  into `web/src/i18n/locales/pt.ts` — the master — and `tsc` then demands the
  other three (en, es, zh) in **both** directions.
- **`execGit` never rejects** on a non-zero exit; branch on `.ok`.
  The mutation lock is serial and **not reentrant** — use `step()` inside `tx()`.
- **Never duplicate repository state.** Everything goes through
  `web/src/state/store.ts`. Read with `useAppState(selector)` using the
  module-level selectors (the comparator is `Object.is`, so a selector building a
  new array re-renders forever); write only through exported actions. Outside
  React, `getState()`.
- **Never invent a route.** The entire REST surface is `web/src/lib/api.ts`,
  mirrored at runtime by `server/src/contract.mjs`.
- **ESM everywhere.** Backend `.mjs`, front-end `.ts`/`.tsx`. The backend uses
  native `node:http` — no framework.
- **Comments in Portuguese, identifiers in English, no accents in code
  comments.** Catalogue *text* keeps its accents — it is content, not comment.
- Backend has exactly one dependency: `ws`. Keep it that way.

## Frozen contracts

Additive only — add fields, never remove or rename, and say so in the commit:

`web/src/types/git.ts` · `web/src/types/modules.ts` · `web/src/lib/api.ts` ·
`web/src/lib/ws.ts` · `web/src/state/store.ts` · `server/src/contract.mjs`

A route absent from `web/src/lib/api.ts` does not exist to the front-end. A route
in `ROUTES` without a handler **throws at boot**. `tsc` catches a removal only if
some consumer reads the field — renaming an unread field passes clean, so check
by hand.

`web/src/components/motion-ui/**` is owned by the shadcn CLI and is overwritten
on the next `add`. Customise in a wrapper.

## Module ownership

Each front owns a directory and does not edit the others':

| Front | Directory | Signal |
|---|---|---|
| backend | `server/**` | `npm run test:server` |
| graph | `web/src/graph/**` | `npm run test:graph` |
| dnd | `web/src/dnd/**`, `web/src/dialogs/**` | `npm run test:dnd` |
| shell | `web/src/app/**`, `web/src/panels/**`, `web/src/hooks/**` | `npm run typecheck` + rule checker |

`web/src/i18n/**` is transversal: every front reads it, and adding a key invades
nobody's directory.

## Skills

**Every task goes through `.agents/skills/project-router`**, which asks its
clarifying questions in Brazilian Portuguese, writes `TASK_PLAN.md`, and deletes
it when done. Catalogue: `.agents/skills/catalog.md`.

Source of truth is `.agents/skills/`; `.claude/skills` is a symlink to it, so the
library is portable to other agent tools.

## Security

- Never read or commit `.env`, `secrets/**`, SSH keys. Enforced by
  `.agents/hooks/security-guard.mjs`.
- The server binds `127.0.0.1` only and rejects foreign `Host`/`Origin`. It runs
  git on the user's machine — it must never be exposed to a network.
- `spawn` with an argv array; never interpolate user input into a command string.
  User-supplied refs are rejected if they start with `-` (`--upload-pack=` is an
  injection even through an argv array).
