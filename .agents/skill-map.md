# Skill map — GitCraque

Phase 2 artifact. Designed before any skill file was written. Nine skills: one
router, six task skills covering the real work surface, two meta skills.

## The rule that decided the split

**A skill's scope must be validatable by one verification signal.**

Every candidate boundary was tested against that. Merging the backend and graph
skills, for instance, would put graph knowledge under `npm run test:server` — a
command that cannot fail when the graph is wrong, so the memory pipeline could
never validate an update to it. The split therefore follows the ownership table
in `CLAUDE.md:66-72`, which already lines up one-to-one with the five test
commands in `package.json:21-26`. That alignment is the project's, not this
system's invention.

## Catalogue

| Skill | Type | Owns | Verification signal |
|---|---|---|---|
| `project-router` | router | dispatch, questioning, `TASK_PLAN.md` | — (routing evals) |
| `orchestrating-git-backend` | task | `server/**` | `npm run test:server` |
| `laying-out-commit-graph` | task | `web/src/graph/**` | `npm run test:graph` |
| `resolving-drag-intents` | task | `web/src/dnd/**`, `web/src/dialogs/**` | `npm run test:dnd` |
| `composing-shell-interface` | task | `web/src/app/**`, `panels/**`, `hooks/**` | `npm run typecheck && node .agents/skills/scripts/check-project-rules.mjs` |
| `translating-interface-text` | task | `web/src/i18n/**`, `server/src/i18n.mjs` | `npm run typecheck` |
| `verifying-changes` | task | the five suites, the no-bundler discipline | `npm test` |
| `meta-skill-evolution` | meta | the memory pipeline | `node .agents/skills/scripts/lint-skills.mjs` |
| `meta-skill-consolidate` | meta | dedup, staleness, GC | `node .agents/skills/scripts/lint-skills.mjs` |

### Why each exists, and what it must inject

**`project-router`** — the single entry point. Exists because the expensive
failure in this repo is starting work in the wrong module: the fronts do not
edit each other's directories, and six files are frozen. Asks its clarifying
questions in Brazilian Portuguese, writes `TASK_PLAN.md`, deletes it on
completion. Carries the frozen-contract pre-flight inline rather than as a tenth
skill — it is a gate on every task, not a domain, and it is fifteen lines.

**`orchestrating-git-backend`** — `contract.mjs` throws at boot on route/handler
drift; `execGit` never rejects; the mutation lock is serial and not reentrant;
reads must use `readGit`; errors carry an i18n key, never a phrase. None of that
is inferable from the code without reading several files first.

**`laying-out-commit-graph`** — lane allocation invariants, the blocked row→edge
index, `reveal.ts` purity, and the three-phase custom test runner. Also records
that `docs/ARCHITECTURE.md` misdescribes the lane heuristic, so a future agent
does not "fix" the code to match the doc.

**`resolving-drag-intents`** — the intent matrix, scoped drag ids
(`${scope}::${type}:${key}`, which the architecture doc still gets wrong), the
rule that `onDragEnd` executes nothing, and the api-contract test that reads
`lib/api.ts` as text.

**`composing-shell-interface`** — the Motion UI cascade, the z-ladder, the
click-time context-menu construction, and the four-step recipe for adding a menu
entry. This is the only domain with **no tests at all**, which is precisely why
its signal pairs `tsc` with the new rule checker: without the checker its skill
would have no way to validate an update.

**`translating-interface-text`** — transversal by `CLAUDE.md:74-75`. `pt.ts` is
the master catalogue and `tsc` enforces the other three **in both directions**;
the skill's job is to say what `tsc` does *not* catch (orphan plural pairs, a
typo in a `pt` key silently redefining the contract, backend catalogue parity)
and to carry the hard rule that `web/src/i18n/**` must contain zero `@/` runtime
imports, because two test suites load it raw.

**`verifying-changes`** — procedural. Which suite covers what, how to add a test
to each of five different harnesses, and the two runtime gotchas: run the
commands serially, and `test:graph` rewrites a tracked file.

**`meta-skill-evolution` / `meta-skill-consolidate`** — the memory pipeline and
the periodic garbage collection. Named as the templates require rather than in
gerund form; the linter exempts exactly these three names because they are
addressed by name from `AGENTS.md` and the router.

## Composition graph

```
project-router  (entry — always first, never skipped)
  │
  ├─ 1. asks clarifying questions in pt-BR until the task is unambiguous
  ├─ 2. writes TASK_PLAN.md (pt-BR)
  ├─ 3. frozen-contract pre-flight
  └─ 4. selects and orders the chain:
       │
       ├── orchestrating-git-backend ─┐   independent of each other:
       ├── laying-out-commit-graph  ──┤   different directories,
       ├── resolving-drag-intents   ──┤   different test commands,
       └── composing-shell-interface ─┘   safe to run in parallel subagents
                    │
                    ├── depends on ──> translating-interface-text
                    │                  (whenever user-facing text is added;
                    │                   NEVER parallel — all four fronts write
                    │                   the same locales/pt.ts and would collide)
                    │
                    └── always last ─> verifying-changes
                                          │
                                          └── on completion, per involved skill:
                                              meta-skill-evolution
                                                    │
                                                    └── periodically:
                                                        meta-skill-consolidate
```

Two composition rules earn their place:

- **`translating-interface-text` is a dependency, not a sibling.** Any front
  adding UI text needs it, and all four write the same master catalogue. Running
  those fronts in parallel is safe; running their *catalogue edits* in parallel
  is a guaranteed conflict on `web/src/i18n/locales/pt.ts`.
- **`verifying-changes` runs last and alone.** Serially, because the graph perf
  suite asserts wall-clock ratios.

## Verification signal per skill — and what it cannot see

An honest signal beats a flattering one. Recorded so the evolution pipeline does
not over-trust a green:

| Skill | Signal catches | Signal is blind to |
|---|---|---|
| backend | route parity, git env, parsing, path escape, askpass | anything in `web/**`; backend has no tsconfig, so typos are runtime-only |
| graph | lane invariants, geometry, determinism, perf | React rendering beyond the two `domtest` files |
| dnd | intent matrix, endpoint/body contract | dialog rendering; `dialogs/requests.ts` is entirely untested |
| shell | types + 9 greppable rules | behaviour — this domain has zero tests |
| i18n | catalogue completeness both directions, unknown keys | orphan plural pairs, backend catalogue parity |
| verifying | all 367 tests | `app`/`panels`/`hooks`, and `test:e2e` (not in `npm test`) |
| meta | skill form: frontmatter, budget, provenance, `<evolution>` | whether the knowledge is *true* — that is what the domain signals are for |

## Regression gating

Each task skill carries a small eval set under `.agents/skills/evals/`. An
update is promoted only if it introduces no correct→wrong flips. Two kinds:

- **Routing evals** — queries that must select the skill, plus near-misses that
  must not. Guards the description, which is the only signal at selection time.
- **Knowledge evals** — assertions that a claim in the skill still matches the
  repository (e.g. `contract.mjs` still exports `LOG_ARGS`; `web/src/i18n/**`
  still has no runtime `@/` import). These catch a skill that has gone stale
  against the code, which is the failure mode provenance exists to detect.

## Granularity: what was rejected

- **A `viewer` skill.** 82 tests but a small surface, and its one dangerous rule
  (no-bundler imports) is shared with graph, dnd and i18n. It lives in
  `verifying-changes` and in the rule checker instead of a fourth copy.
- **A `frozen-contracts` skill.** A pre-flight gate on every task, not a domain.
  It goes in `AGENTS.md` (always-on) and the router.
- **Splitting `app` from `panels`.** They import each other bidirectionally
  (`panels/SidePanel.tsx:33` → `@/app/Splitter`; `app/ConfirmHost.tsx:30` →
  `@/panels/parts`). They are one unit in practice; splitting them would model a
  layering that does not exist.
- **A per-route or per-component skill.** Sprawl. Routing degrades as the
  catalogue grows, and nine descriptions is already the point where the router
  must choose carefully.
