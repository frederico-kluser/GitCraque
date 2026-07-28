# GitCraque — project analysis for the knowledge-skill system

Phase 1 artifact. Baseline commit `98abad9`. Everything below was read from the
repository or verified by running it; nothing is assumed from prior knowledge of
the project.

## 1. Method and baseline

Six isolated-context subagents mapped the tree in parallel (backend, graph, dnd,
shell, i18n/contracts, tooling); each returned a condensed summary rather than
file contents. Their claims were spot-checked against the code and, where they
concerned behaviour, re-run locally.

Verified baseline:

| Signal | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | clean, ~2.5 s |
| Tests | `npm test` | **367 passing**, 0 failing (server 223, graph 36 + 6, dnd 20, viewer 82) |
| E2E | `npm run test:e2e` | 39 checks, ~2.6 s, hermetic — **not** part of `npm test` |
| Rules | `node .agents/skills/scripts/check-project-rules.mjs` | clean (new; see §5) |

**Gotcha found by running it, not by reading it:** `npm test` fails when run
concurrently with another heavy job. The graph suite asserts that doubling the
input cannot triple the runtime (`web/src/graph/__tests__/perf.test.ts:70-76`),
and under CPU contention the 2500→5000 step flakes. Serially it passes with
17-30x headroom. **Run test commands one at a time.**

## 2. Normative sources

Four documents govern this repo. Quoted verbatim (Portuguese preserved — these
are the contract as written).

**`CLAUDE.md:24-38` — the inviolable product rules**, condensed: no gitgraph
library; history from one exact command; worktree switching is `process.chdir()`
never `git checkout`; drag-and-drop is `@dnd-kit/core`; squash via
`GIT_SEQUENCE_EDITOR`; network via the `GIT_ASKPASS` trampoline.

**`CLAUDE.md:44-46`** — `> **`spawn` com array de argumentos, jamais `shell: true`** e jamais interpolar entrada do usuario numa string de comando.`

**`CLAUDE.md:52-57`** — `> **Nenhum texto de interface cravado no codigo.** Tudo sai do catalogo […] Texto novo entra em `web/src/i18n/locales/pt.ts` (o catalogo mestre) e o `tsc` cobra os outros tres.`

**`docs/UI.md:6-14` — the cascade**: search the 19 installed Motion UI
components → compose from those plus Base UI → only then write new code, with a
one-line comment saying what the catalogue lacked.

**`docs/ARCHITECTURE.md:41-48` — files nobody changes alone**:
`web/src/types/git.ts`, `types/modules.ts`, `lib/api.ts`, `lib/ws.ts`,
`state/store.ts`, `server/src/contract.mjs`.

**`CLAUDE.md:66-72` — module ownership.** Each front owns a directory and does
not edit the others': `server/**`, `web/src/graph/**`, `web/src/dnd/**` +
`dialogs/**`, `web/src/app/**` + `panels/**` + `hooks/**`. `web/src/i18n/**` is
transversal: every front reads it.

These boundaries are the reason the skill map in phase 2 is split the way it is —
they are the project's own decomposition, not an invention of this system.

## 3. Annotated module map

**`server/**` — Node backend, only dependency `ws`.**
`contract.mjs` is a runtime contract, not documentation: a route present in
`ROUTES` with no handler (or a handler outside `ROUTES`) **throws at boot**
(`server/src/routes/index.mjs:40-59`). `git/exec.mjs` is the single spawn point;
`execGit` never rejects on a non-zero exit — callers branch on `ok`
(`server/src/git/exec.mjs:104-114`). Reads must go through
`readGit`/`execGitLines` (`:312-323`), which force `silent:true` and
`--no-optional-locks`; using `execGit` for a refresh floods the UI console. The
mutation lock is serial and **not reentrant** — inside a `tx()` you must call the
non-locking `step()` or deadlock (`server/src/git/ops.mjs:137-146`).

**`web/src/graph/**` — own layout algorithm.** `index.ts` is the only door and
the app imports exactly one symbol from it (`web/src/app/App.tsx:14`).
`layout.ts`, `bezier.ts` and `reveal.ts` carry **type-only imports** — load-bearing,
not stylistic (§4). The row→edge structure is a *blocked* index (default block 32,
`web/src/graph/layout.ts:48,134-183`), not the dense per-row array the
architecture doc implies.

**`web/src/dnd/**` + `dialogs/**` — semantic drag engine.** `intents.ts` is pure
and has no runtime imports at all; the translator arrives via
`DragIntentContext.t` (`web/src/dnd/intents.ts:67-71`). `onDragEnd` executes
nothing — it resolves an intent into the store and the dialog executes after
confirmation (`web/src/dnd/GitDndProvider.tsx:246-263`).

**`web/src/app/**` + `panels/**` + `hooks/**` — shell.** In practice `app` and
`panels` are **one bidirectional unit**, not a layer stack: `panels/SidePanel.tsx:33`
imports `@/app/Splitter`, and `app/ConfirmHost.tsx:30` deep-imports
`@/panels/parts`, which `panels/index.ts` does not export. The barrel understates
the real surface. Overlay z-ladder, worth knowing before adding one: ActionMenu
50 → confetti 55 → confirm dialog 60 → reconnect banner 70 → context menu 80.

**`web/src/i18n/**` — transversal.** `locales/pt.ts` is the only catalogue with no
type annotation, so it *defines* the key set; the other three are annotated
`: Messages` and therefore checked in both directions (§4).

## 4. Guaranteed by tooling vs. prose-only

This is the section that decides where prose is wasted effort.

### Actually guaranteed (a check fails)

| Convention | Guard |
|---|---|
| i18n catalogue completeness, **both directions** | `tsc` — `TS2741` (missing key) / `TS2353` (stray key), via `Messages = Record<keyof typeof pt, string>` at `web/src/i18n/types.ts:35,49`. Verified by deleting a key and compiling. |
| Unknown key passed to `t()` | `tsc` — `MessageKey` is a literal union (`web/src/i18n/translate.ts:45`) |
| Route table ↔ router parity | **boot throws** (`server/src/routes/index.mjs:40-59`) + `server/test/router-security.test.mjs` |
| The whole injected git env, and `shell:false` | `server/test/exec-watcher.test.mjs` |
| `git log` parsing with `\|` in the subject | `server/test/log-parser.test.mjs`, `api.test.mjs` |
| Path-escape guard incl. symlinked directory | `server/test/file-content.test.mjs` (24 tests) |
| Host/Origin guard, askpass nonce, token never in env | `server/test/askpass.test.mjs`, `router-security.test.mjs` |
| Graph determinism, lane stability, no edge crossing a foreign commit | `web/src/graph/__tests__/layout.test.ts:173-262` |
| Drag intent matrix, destructive flags, endpoint/body contract vs `lib/api.ts` | `web/src/dnd/__tests__/intents.test.mjs` |
| The six product rules, behaviourally | `scripts/verify-e2e.mjs` (asserts worktree switch performs **no** checkout, `:214`) |

### Prose-only before this phase

No ESLint, no Prettier, no Biome, no `.editorconfig`, **no CI of any kind** — no
`.github/`, no husky, no lint-staged; `.git/hooks/` holds only stock samples.
Nothing ran automatically, ever. So all of the following were unguarded: the
gitgraph ban, `shell:true`, the literal `LOG_ARGS`, the `framer-motion` ban,
token-vs-hex colour, `transition-all`, module boundaries, the frozen-file list,
hardcoded UI strings, and erasable-only TypeScript syntax.

### The invisible tripwire — worth its own heading

Three of the five test suites load `.ts` sources **directly** under Node's type
stripping (Node v24.15.0, no flag, no loader). Node erases `import type`, but it
does **not** resolve the `@/` alias and does **not** resolve extensionless
specifiers. Consequence: adding one ordinary-looking runtime import to
`web/src/graph/layout.ts`, `dnd/intents.ts`, any `web/src/viewer/*.ts` core file,
or **anything under `web/src/i18n/`**, passes `tsc` cleanly and silently takes an
entire suite from passing to *cannot load*. `web/src/i18n/**` is the widest blast
radius: it is transitively loaded by both `test:viewer` and `test:dnd`.

## 5. Enforcement added by this system

`node .agents/skills/scripts/check-project-rules.mjs` converts nine prose rules
into one pass/fail signal. It is calibrated against `98abad9`: **clean on HEAD,
and each rule verified to fire on an injected violation** (both directions
tested, tree restored). Rules: gitgraph ban, `LOG_ARGS` literal, `shell:true`,
`child_process.exec` import, `framer-motion`, hex colour, numbered Tailwind
palette, `transition-all`, and the no-bundler import discipline above.

It is comment-aware — `server/src/git/exec.mjs:136` says *"NUNCA shell: true"*,
and a checker that flags the rule for stating the rule gets switched off.

Also installed: a Stop gate that blocks turn-end while a bootstrap phase is red,
a PreToolUse gate that blocks editing a live `SKILL.md` without a fresh green
receipt, and a security guard calibrated for a git client — it blocks
`rm -rf /`, force-push, `filter-branch`, `curl|sh` and secret reads, while
deliberately allowing `git rebase -i`, `git reset --hard`, `--force-with-lease`
and fixture force-pushes under `/tmp`, because that is how this project's own
suite works.

## 6. Findings for human attention

Not fixed — this mission builds the knowledge system, it does not change the
product. Each is recorded so a future agent does not trust a stale claim.

**Real defect.** `openPushDialog` (`web/src/app/actions.ts:143-192`) offers
`--force-with-lease` but never sets `destructive: true`, so that path renders a
plain click button. `docs/UI.md:27` lists `push --force` as mandatory
hold-to-confirm, and the drag path does it correctly
(`web/src/dialogs/PushDialog.tsx:155`). Two doors, two safety levels.

**Stale documentation.**
- `docs/ARCHITECTURE.md:335` gives drag ids as `${type}:${key}`. They are
  `${scope}::${type}:${key}` (`web/src/dnd/ids.ts:27-29`); the old form survives
  only as a decode fallback. Scoping was added because a branch registered from
  both the graph chip and the rail row silently overwrote itself in dnd-kit's map.
- `docs/ARCHITECTURE.md:259-277` describes lane allocation as "lowest index among
  waiting lanes". The code prefers the lowest *branch-child* lane even when a
  merge-child holds a lower index (`web/src/graph/layout.ts:109-118`).
- `docs/UI.md:21,32,38` lists `sheet`, `expand-card` and `terminal-session` as in
  use. All three have **zero consumers**. Only `border-beam` is marked unused.
- `web/src/dialogs/requests.ts:7` cites a test file
  `dnd/__tests__/api-contract.test.mjs` that **does not exist**. The 12 endpoints
  in `REQUEST_ENDPOINTS` are untested; the real contract test covers only the 5
  in `INTENT_ENDPOINTS`.

**Config that contradicts reality.** `package.json:11` and `README.md:65` declare
`node >=20.11`. Type stripping needs ≥22.18 unflagged; on Node 20 three of five
suites fail immediately. Environment runs v24.15.0.

**Cheap wins not taken** (they change project config, which is outside this
mission's scope): adding `"erasableSyntaxOnly": true` to `web/tsconfig.json`
would make the erasable-syntax rule a compile-time guarantee; bumping `engines`
to `>=22.18` would make the floor honest.

**Unguarded seams.** `server/**` has no tsconfig — zero static checking on the
backend. `web/src/app`, `panels` and `hooks` have no tests at all, which is how
the force-push gap above survived. Backend catalogue parity (56 keys × 4) is
unchecked and degrades silently to English (`server/src/i18n.mjs:325`). The
`types/git.ts` ↔ `contract.mjs` mirror is maintained by hand with no sync test.
`npm run test:graph` rewrites the tracked file `docs/graph-sample.svg`
(`web/src/graph/__tests__/run.mjs:71`) with no assertion — byte-stable today, so
a real algorithm change lands as a silent working-tree diff. That same runner
hardcodes `node_modules/.bin/esbuild`, which is declared in no `package.json`.

## 7. Candidate knowledge areas → phase 2

Five domains, each with a distinct verification signal, plus process and meta:
backend (`npm run test:server`), graph (`npm run test:graph`), dnd + dialogs
(`npm run test:dnd`), shell + Motion UI (`npm run typecheck` + the rule checker),
i18n (`npm run typecheck`), verification discipline (`npm test`), and the two
meta skills. The split follows `CLAUDE.md:66-72`; merging domains would put a
skill's knowledge under a signal that cannot validate it.

## 8. Language policy

`CLAUDE.md:60-63` requires Portuguese comments in project source. This system's
artifacts under `.agents/` are written in English, which is what the mission
specifies for skill bodies and hooks, with two deliberate exceptions that are
functional rather than stylistic: **every question the router asks the user, and
the whole of `TASK_PLAN.md`, are in Brazilian Portuguese.** Project source code
under `server/**` and `web/**` keeps the `CLAUDE.md` convention untouched — this
system does not edit product code.

## 9. Not found

No linter, formatter, or style config of any kind. No CI or git hooks. No ADRs,
CONTRIBUTING, or RFC directory. No tsconfig for `server/**`. No tests for
`web/src/app`, `web/src/panels`, `web/src/hooks`. No `AGENTS.md` before this
mission. No sync test between `web/src/types/git.ts` and `server/src/contract.mjs`.
