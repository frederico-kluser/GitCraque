---
name: laying-out-commit-graph
description: "Injects the lane-allocation invariants, edge geometry, virtualization rules and the three-phase custom test runner of the GitCraque commit graph in web/src/graph/**. Use whenever a task touches the graph, lanes, commit rows, SVG edges, Bezier paths, reveal/scroll-to-commit, react-window virtualization, or web/src/graph/__tests__ — even when the user only says 'the history view' or 'the commit list' and never mentions skills."
metadata:
  type: task
  verification_signal: npm run test:graph
---

# Laying out the commit graph

## When to use

Anything under `web/src/graph/**`: lane allocation, edge paths, row rendering,
virtualization, keyboard navigation, reveal, or the graph's own test runner.
Also when a change elsewhere alters the *shape* of the commit list the graph
consumes.

## Injected knowledge

**`index.ts` is the only door.** The whole app imports exactly one symbol,
`GraphView` (`web/src/app/App.tsx:14`). `reveal.ts`, `shell.ts`, `CommitRow` and
`RefChip` are deliberately not exported. Keep it that way — the narrow surface is
what lets the algorithm change without touching the shell.

**Three files carry type-only imports, and that is load-bearing.**
`layout.ts:19-30`, `bezier.ts:31` and `reveal.ts:17-20` import nothing at
runtime. This is not style: it is what lets `node --test` load them directly.
`LANE_HUES` is deliberately duplicated in `layout.ts:41-45` rather than imported
from `@/lib/utils`. Adding one ordinary runtime import here passes `tsc` and
breaks the entire suite with `ERR_MODULE_NOT_FOUND`.

**Lane allocation, and where the architecture doc is wrong.** The pass runs
top→bottom over `--topo-order` output, with `lanes[]` holding the hash each
active lane awaits (`web/src/graph/layout.ts:210-213`). `pickLane`
(`:109-118`) prefers the lowest **branch-child** lane, and only then the lowest
merge-child lane. `docs/ARCHITECTURE.md:259-277` says "lowest index among the
waiting lanes", which is **not what the code does** — do not "fix" the code to
match the doc.

**Why no edge ever crosses a foreign commit circle:** a non-first parent claims
the first free lane strictly to the *right* of the commit's lane
(`web/src/graph/layout.ts:286`), and that reservation (`throughLane`) is provably
empty of commits for the whole span. This is an invariant with a test
(`layout.test.ts:209-224`), so a change that breaks it fails rather than merely
looking wrong.

**The row→edge structure is a blocked index, not a dense array** (default block
32, `web/src/graph/layout.ts:48,134-183`). `forRow` filters within a block;
`forRange` dedupes by `e.id`. The dense form the doc implies would blow up as
the sum of edge lengths.

**Edge geometry.** Same lane → a vertical line. Different lanes → a cubic with
vertical control points, `k ≈ rowHeight * 0.75`. Straight segments are clipped
in Y; **cubic segments are emitted whole and clipped by the `<svg>` box**
(`web/src/graph/bezier.ts:147-189`) — de Casteljau subdivision was considered and
rejected.

**Virtualization is the performance contract.** `FixedSizeList` with
`itemKey = commit.hash` (`web/src/graph/GraphView.tsx:402-415`); each row renders
its **own** `<svg>` containing only the edges crossing that band. A single giant
SVG is forbidden — it is exactly what freezes on large repositories, and
`virtualization.domtest.ts` asserts the DOM does not grow with the repo.

**`reveal.ts` is pure and lives outside React** so it is testable with a fake
surface and no DOM. Four rules it exists to enforce
(`web/src/graph/reveal.ts:1-19`): the **nonce** drives, not the hash (clicking
the same branch twice must scroll twice); a served nonce is never served again
(this breaks the render loop); a hash absent from the log still calls
`release()`, or the request stays stuck in the store; a request arriving before
the log **waits** instead of being consumed.

**Test runner is custom and has three phases** (`web/src/graph/__tests__/run.mjs`):
1. `*.test.ts` → straight to `node --test` under Node type stripping.
2. `*.domtest.ts` → bundled by esbuild into `__tests__/.build/` first, because
   **JSX is not strippable**.
3. `devtools/make-sample-svg.ts` runs and **rewrites the git-tracked
   `docs/graph-sample.svg`** (`run.mjs:71`) with no assertion. Byte-stable today,
   so a genuine algorithm change shows up as a silent working-tree diff — expect
   it and commit it deliberately.

Naming decides routing: a helper must **not** end in `.test.ts` or `.domtest.ts`
or it is collected as a suite. Anything needing JSX or a runtime `@/` import must
be `.domtest.ts`.

**Brittleness to respect.** The perf budget has 17-30x headroom, but the
linearity assertion (`perf.test.ts:70-76`, doubling must not triple the time) is
noise-sensitive at the 2500→5000 step and **flakes under CPU contention**. The
tightest assertion in the module is `virtualization.domtest.ts:74-77`: DOM node
count may vary under 15% between 200 and 20 000 commits, and it currently sits at
11.8%. Adding one element per row can break it.

## Procedure

1. Change the algorithm in `layout.ts` / `bezier.ts` / `reveal.ts`, keeping
   imports type-only.
2. Add or extend a test: pure logic → `*.test.ts` with type-only `@/` and
   relative imports carrying an explicit `.ts`; anything rendering → `*.domtest.ts`.
   Reuse `fixtures.ts` (deterministic mulberry32, seed 20260727) and
   `geometry.ts` (`findCollisions`, `findLaneOverlaps`).
3. Run `npm run test:graph` **alone** — never beside another heavy job.
4. Check `git status`: if `docs/graph-sample.svg` changed, that is the runner,
   and the diff is a real signal about your change.

## References

`docs/ARCHITECTURE.md:244-331` — accurate on coordinates, edges and reveal;
**inaccurate on the lane heuristic** as noted above.

## <evolution>

On completion, run the memory pipeline in `meta-skill-evolution`. Update this
file directly only when the learning is important **and** `npm run test:graph`
went green, recorded via
`node .agents/skills/scripts/record-validation.mjs laying-out-commit-graph`.
Replace what it contradicts; do not append a rival rule. Without a green signal,
discard it.
