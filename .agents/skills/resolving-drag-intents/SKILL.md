---
name: resolving-drag-intents
description: "Injects the drag-intent matrix, scoped dnd-kit ids, the resolve-then-confirm split and the api-contract test of GitCraque's semantic drag engine in web/src/dnd/** and web/src/dialogs/**. Use whenever a task touches drag-and-drop, dropping a commit on a branch, merge/rebase/cherry-pick from a gesture, the trash target, or the drag-initiated confirmation dialogs and their hold-to-confirm — even when the user only says 'dragging' or names a git operation and never mentions skills. A toolbar or menu action that needs confirming belongs to composing-shell-interface instead."
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
(`web/src/dnd/GitDndProvider.tsx`): exactly ONE pointer sensor — `TouchSensor`
for `(pointer: coarse)`, `PointerSensor` for the mouse, chosen by
`coarsePointer ? TouchSensor : PointerSensor` (`:232`) — plus the
`KeyboardSensor` for accessibility. The sensor choice is load-bearing, not
cosmetic: with a `PointerSensor`, `touch-action: auto` lets the browser steal
the touch for the pan and kill the drag with `pointercancel` on the first move
past the slop (~11px) — even after delay activation — and `touch-action` is
decided at `touchstart` and locked for the gesture, so it cannot be toggled from
JS (dnd-kit docs). The `TouchSensor` solves it without CSS: a non-passive
`touchmove` with `preventDefault` locks the pan, but only AFTER activation
(250ms); a fast swipe passes the 5px tolerance, the sensor deactivates without
`preventDefault`, and the list scrolls normally — dnd-kit's own recommendation
for scrollable lists. The constraint is picked by
`activationConstraintFor(getViewport().coarsePointer)` from
`web/src/dnd/sensors.ts` — `{distance: 6}` on a fine pointer so a plain click
stays a selection, `{delay: 250, tolerance: 5}` on `(pointer: coarse)`
(`sensors.ts:56-59`) so scrolling by touch never becomes a drag. Two traps, both
load-bearing: never mount a second pointer sensor next to the chosen one
(double activation), and never pass `{distance}` and `{delay, tolerance}`
together — dnd-kit types the constraint as a union and silently ignores
`distance` when both are present, so `sensors.ts` types it as the union itself.
`onDragStart` calls `cancelLongPress()` (from `@/hooks`): drag always beats the
long-press menu because `DND_DELAY_MS = 250 < LONG_PRESS_MS = 500`
(`sensors.ts:56`, mirrored from `useShellStore.ts`). Collision is `pointerWithin`
falling back to `rectIntersection` (`:200-203`) because `closestCenter`
misbehaves with small adjacent branch chips; `MeasuringStrategy.Always`
(`:364`) because the commit list is virtualized and scrolls mid-drag. Payload
reads are defensive — bad `data` yields `null`, never a throw (`:144-152`).

**The dnd suites test only the pure modules.** `intents.test.mjs`, `ids.test.mjs`
and `sensors.test.mjs` load `intents.ts`, `ids.ts`, `sensors.ts` — never
`GitDndProvider.tsx` (a `.tsx` cannot be imported at runtime). The provider's
sensor configuration is covered indirectly: `sensors.test.mjs` proves
`activationConstraintFor` returns exactly one union member per pointer, which is
what the provider passes to `useSensor`.

**Touch targets in the graph are a scope where the audit lies.** The DOM
audit (`web/src/__audit__/touch-targets.domtest.ts`) scans only the shell
(app/panels/dialogs) and only `button`/`role=button`/`menuitem` — a `RefChip`
passes without any `touch:` utility and can still be a 21px drop target in the
middle of a 52px compact row. It also cannot take a static `touch:min-h-tap`
(44px): the compact row stacks chips+subject over the meta line
(`web/src/graph/CommitRow.tsx:495-498`), and 44px chips would overflow the
52px row (`paint.ts:101`, o `rowHeight` das metricas compactas). The mobile pattern that fits is a transform scale
**while a drag is active**: `feedback.dragging && "touch:scale-150"` in
`RefChip.tsx` — no reflow, and the drop hit area grows with the visual. The
mechanism is NOT re-measuring: with the default `frequency: "optimized"`,
dnd-kit measures each droppable once, at the start of the drag (plus
ResizeObserver events). The `dragging` class is applied before that first
measurement, `getBoundingClientRect` includes transforms, so the measured
rectangle is already the scaled one — and it stays stable for the whole drag.

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
