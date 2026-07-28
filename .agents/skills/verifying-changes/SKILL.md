---
name: verifying-changes
description: "Injects how GitCraque is actually verified: five separate test harnesses, what each covers and cannot cover, the type-stripping import rules that silently break three suites, and the requirement to run the commands one at a time. Use at the end of EVERY task before reporting it done, whenever a test fails or flakes, when adding a test file, or when a change touches an import in graph, dnd, viewer or i18n — even when the user never asks for tests."
metadata:
  type: task
  verification_signal: npm test
---

# Verifying changes

## When to use

At the close of every task, before reporting anything as done. Also when a suite
fails unexpectedly, when adding a test, or when changing imports in the
no-bundler files.

## Injected knowledge

**Run the commands one at a time.** The graph suite asserts that doubling the
input cannot triple the runtime (`web/src/graph/__tests__/perf.test.ts:70-76`).
Serially it passes with 17-30x headroom; run beside another heavy job and the
2500→5000 step flakes into a false red. This was reproduced: `npm test` alongside
`tsc` fails, `npm test` alone gives 367/367.

**The five harnesses** — they are genuinely different mechanisms, not one runner
with five globs:

| Command | Covers | Count | Note |
|---|---|---|---|
| `npm run test:server` | `server/test/*.test.mjs` | 223 | ~25 s, the backend's entire safety net |
| `npm run test:graph` | custom runner, 3 phases | 36 + 6 | rewrites a tracked file, see below |
| `npm run test:dnd` | `web/src/dnd/__tests__/*.test.mjs` | 20 | |
| `npm run test:viewer` | `web/src/viewer/__tests__/*.test.mjs` | 82 | |
| `npm run test:e2e` | `scripts/verify-e2e.mjs` | 39 checks | **not** part of `npm test` |

`npm test` = server + graph + dnd + viewer. **`test:e2e` is excluded**, so run it
explicitly when a change touches the six product rules. It is hermetic and safe:
it builds a throwaway repo in `os.tmpdir()` with global and system git config
neutralised, never touches the GitCraque repo, and takes ~2.6 s. Its step 5
attempts a real push to a nonexistent remote and **asserts it fails cleanly
rather than hanging on a password prompt** — offline, failure is the expected
outcome.

**`npm run test:graph` rewrites `docs/graph-sample.svg`**, a git-tracked file
(`web/src/graph/__tests__/run.mjs:71`), with no assertion. Byte-stable today, so
a diff there after running tests is a real signal that your change altered the
layout — inspect it, then commit it deliberately.

**The type-stripping rules — the highest-value knowledge in this skill.** Three
suites load `.ts` sources directly under Node's built-in type stripping (Node
v24.15.0; no flag, no loader, no `NODE_OPTIONS`). Node erases `import type`, but:

1. **`@/` is only legal in `import type`.** A runtime import through the alias is
   an instant `ERR_MODULE_NOT_FOUND` — Node does not read `tsconfig` paths.
2. **Relative runtime imports need the explicit extension**: `../layout.ts`, not
   `../layout`. This is what `allowImportingTsExtensions: true` exists for.
3. **`.tsx` cannot be imported at runtime** — `ERR_UNKNOWN_FILE_EXTENSION`.
4. **No `enum`, `namespace`, decorators, or constructor parameter properties.**
   Erasable syntax only. `tsc` does *not* warn: `erasableSyntaxOnly` is off.
5. **JSX is not strippable**, which is exactly why the graph runner has a
   separate `.domtest.ts` family routed through esbuild first.

The affected files: `web/src/graph/{layout,bezier,reveal}.ts`,
`web/src/dnd/{intents,ids}.ts`, the `web/src/viewer/*.ts` core, and **everything
under `web/src/i18n/`** — the widest blast radius, since it is loaded
transitively by both `test:viewer` and `test:dnd`. A violation passes `tsc` and
review, then breaks a whole suite at load time.
`node .agents/skills/scripts/check-project-rules.mjs` now catches this.

**What the signals cannot see.** `npm run typecheck` covers `web/src` only:
`server/**` has no tsconfig at all, and `allowJs: false` means the `.mjs` test
files living inside `web/src` are silently excluded. `strict: true` is on, but
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are **off**, so index
access and optional properties are not as safe as `strict` suggests. And
`web/src/app`, `panels` and `hooks` have **no tests whatsoever**.

**There is no linter, no formatter and no CI** — no `.github/`, no husky, no
lint-staged; `.git/hooks/` holds only stock samples. Nothing runs automatically,
ever. `node .agents/skills/scripts/check-project-rules.mjs` is the substitute for
the greppable subset of the rules; run it as part of verifying.

**Node floor is wrong in the manifest.** `package.json:11` and `README.md:65`
declare `>=20.11`, but type stripping needs ≥22.18 unflagged. On Node 20, three
of five suites fail immediately.

## Procedure

1. Run the suites relevant to what changed — **one at a time**:
   `npm run test:server`, `npm run test:graph`, `npm run test:dnd`,
   `npm run test:viewer`.
2. Run `npm run typecheck` (front-end only; it will not catch backend typos).
3. Run `node .agents/skills/scripts/check-project-rules.mjs`.
4. If the change touched worktree switching, the log format, squash or askpass,
   also run `npm run test:e2e`.
5. Check `git status`. A modified `docs/graph-sample.svg` is expected after
   `test:graph`; anything else unexpected deserves a look.
6. On a red result, first ask whether it is the known flake: re-run that suite
   alone before believing it.

**Adding a test** — each harness has its own rules:
- backend → `server/test/<name>.test.mjs`, use both helpers, **one server per
  file** (`runtime` is a process-wide singleton).
- graph → `*.test.ts` for pure logic (type-only `@/`, relative imports with
  `.ts`); `*.domtest.ts` for anything rendering. Helpers must not end in either
  suffix or they get collected as suites.
- dnd / viewer → `*.test.mjs` importing sources relatively with explicit `.ts`.

## References

`.agents/project-analysis.md` §4 for the full guaranteed-vs-prose table.

## <evolution>

On completion, run the memory pipeline in `meta-skill-evolution`. This skill's
signal is `npm test` itself, so an update here is validated by the suite it
describes — record with
`node .agents/skills/scripts/record-validation.mjs verifying-changes`. Flakes and
timing observations are worth recording only once reproduced twice; a single red
run is not evidence.
