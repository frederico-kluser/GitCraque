---
name: resolving-drag-intents
description: "Injects the drag-intent matrix, scoped dnd-kit ids, the resolve-then-confirm split and the api-contract test of GitCraque's semantic drag engine in web/src/dnd/** and web/src/dialogs/**. Use whenever a task touches drag-and-drop, dropping a commit on a branch, merge/rebase/cherry-pick from a gesture, the trash target, confirmation dialogs or hold-to-confirm — even when the user only says 'dragging' or names a git operation and never mentions skills."
metadata:
  type: task
  verification_signal: npm run test:dnd
---

# Resolving drag intents

## When to use

Anything under `web/src/dnd/**` or `web/src/dialogs/**`: the intent matrix, drag
sources and drop targets, the dialogs that confirm an operation, or the
executors that finally call the API.

## Injected knowledge

**The engine is pure and decides nothing about execution.** `resolveDragIntent`
(`web/src/dnd/intents.ts:157`) maps a source/target pair to options.
`onDragEnd` **executes nothing** — it resolves and puts the result in the store
(`web/src/dnd/GitDndProvider.tsx:246-263`); the dialog executes after
confirmation. That split is the product's core promise: the raw argv is shown
before anything runs.

**The matrix** (`web/src/dnd/intents.ts`): `commit → branch` = cherry-pick, one
option, not destructive. `branch → branch` = merge **and** rebase, where rebase
is `destructive: true`. `remoteBranch → branch` = **merge only** — a
`rebase main origin/main` would detach HEAD (`:306-317`). `branch → trash` =
local delete; `remoteBranch → trash` = `push <remote> --delete`. Everything else,
including any target dropped on itself and `commit → commit`, is invalid.

**A branch checked out in another worktree blocks the operation**
(`heldByOtherWorktree`, `web/src/dnd/intents.ts:115`). `checkedOutIn` is also set
for the *current* HEAD, hence the explicit exclusion at `:120`.

**`intents.ts` has no runtime imports at all** — only three `import type`
statements (`:29,37,38`). `shortHash` is deliberately duplicated at `:79` rather
than imported from `@/lib/utils`, and the translator arrives through
`DragIntentContext.t` (`:67-71`) instead of `import { t }`. Adding any value
import — especially an `@/` alias or anything reaching a `.tsx` — makes the
module unloadable and takes every intent test with it.

**Drag ids are scoped, and the architecture doc is stale on this.** The real
format is `${scope}::${type}:${key}` (`web/src/dnd/ids.ts:27-29`), with scopes
`graph | rail | app`. `docs/ARCHITECTURE.md:335` still shows the old
`${type}:${key}`, which survives only as a decode fallback. The reason is
recorded at `ids.ts:1-21`: the same branch registered from both the graph chip
and the rail row silently overwrote itself in dnd-kit's id-keyed map, leaving
`over` permanently null. **Scope lives only in the DOM id** — the `data` payload
is unchanged. `useDropFeedback(target, scope)` must receive the *same* scope as
`useDroppableTarget` or feedback never matches.

**dnd-kit configuration that was chosen, not defaulted**
(`web/src/dnd/GitDndProvider.tsx`): `PointerSensor` with
`activationConstraint: {distance: 6}` so a plain click stays a selection
(`:206-210`); collision is `pointerWithin` falling back to `rectIntersection`
(`:194-197`) because `closestCenter` misbehaves with small adjacent branch chips;
`MeasuringStrategy.Always` (`:318`) because the commit list is virtualized and
scrolls mid-drag. Payload reads are defensive — bad `data` yields `null`, never a
throw (`:138-150`).

**`preview` is argv without the leading `git`.** The UI prepends it
(`web/src/panels/parts.tsx:173`). Endpoints must come from `INTENT_ENDPOINTS`
(`web/src/dnd/intents.ts:49`).

**The api-contract test is unusually clever, and worth not breaking.**
`intents.test.mjs:220-253` reads `web/src/lib/api.ts` **as text**, regex-extracts
every route signature, then asserts that every endpoint the engine emits exists
and every `body` key it sends is declared. This catches the exact class of bug
`tsc` cannot see, because `body` is typed `Record<string, unknown>`.

**A trap in the delete path.** The `deleteBranchLocal` / `deleteBranchRemote`
cases in `web/src/dialogs/executors.ts:62-82` are **unreachable from a drag**:
`DialogHost.tsx:40-54` intercepts any allowed `delete-branch` intent and reroutes
it to a dedicated dialog. Real deletion, including the `-d` → `-D` escalation,
lives in `DeleteBranchDialogs.tsx:58` via `requests.ts`.

**Known gap.** `web/src/dialogs/requests.ts:7` cites a test file
`dnd/__tests__/api-contract.test.mjs` that **does not exist**. Its 12
`REQUEST_ENDPOINTS` are untested; the real contract test covers only the 5 in
`INTENT_ENDPOINTS`. Extending it there would close a genuine hole.

## Procedure

1. Change the matrix in `intents.ts`, keeping every import type-only.
2. Give each option a `preview` (argv minus `git`), an `endpoint` from
   `INTENT_ENDPOINTS`, a `body`, and an honest `destructive` flag — that flag is
   what swaps a click for `HoldToConfirmButton`.
3. If the endpoint is new, add it to `web/src/lib/api.ts` first, or the
   api-contract test fails by design.
4. Add a case in `web/src/dialogs/executors.ts`; an unknown endpoint only
   surfaces as a runtime toast (`executors.ts:84-91`).
5. Add a test in `web/src/dnd/__tests__/*.test.mjs`, importing sources
   **relatively with an explicit `.ts` extension**, never `@/`. Build the
   translator from the English catalogue with `createTranslator(en)` so
   assertions read real text.
6. Run `npm run test:dnd`.

## References

`docs/ARCHITECTURE.md:333-350` — accurate on the matrix, **stale on the id
format**.

## <evolution>

On completion, run the memory pipeline in `meta-skill-evolution`. Update this
file only when the learning is important **and** `npm run test:dnd` went green,
recorded via
`node .agents/skills/scripts/record-validation.mjs resolving-drag-intents`.
Replace the contradicted passage rather than appending. No green, no write.
