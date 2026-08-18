---
name: painting-graph-column
description: "Injects how the GitCraque commit graph is PAINTED by hand — the single knobs file web/src/graph/paint.ts, the shape of a commit dot, the CSS-only hover growth, and the three tests any repaint has to survive. Use whenever a task changes how the history view LOOKS: dot size and shape, how round the corners and elbows look, hover growth, row height, subject font size, ref chip shape, selection and reveal highlights, colour tokens. Triggers on 'make it prettier', 'bigger dots', 'more rounded', 'the text is too small', 'it should grow when I hover'. Anything about WHERE a node or an edge goes — allocation, topology, a path that looks geometrically wrong — belongs to laying-out-commit-graph instead."
metadata:
  type: task
  verification_signal: npm run test:graph
---

# Painting the graph column

## When to use

Any task about how the commit graph **looks**. The sibling skill
`laying-out-commit-graph` owns *where things go* (lane allocation, the row→edge
index, virtualization, reveal); this one owns *what they look like*. If the task
is "the dot should be bigger / rounder / grow on hover / this text is too small",
it is here. If it is "this branch got the wrong lane", it is there.

## The one thing to know

**Every number and every shape of the drawing lives in
`web/src/graph/paint.ts`.** Nothing else. Four files read from it and none of
them holds a competing value:

| File | What it takes from `paint.ts` |
|---|---|
| `layout.ts` | `METRICS` → re-exported as `DEFAULT_METRICS`, the module's public defaults |
| `bezier.ts` | `CONTROL_RATIO` → re-exported, because the tests import it by that path |
| `CommitRow.tsx` | `commitNodeShapes()`, `NODE`, `EDGE`, `TEXT`, `SURFACE` — the row turns them into elements and decides nothing about their size |
| `devtools/make-sample-svg.ts` | the same shapes, so `docs/graph-sample.svg` is proof of the drawing rather than a second version of it |
| `shell.ts` | publishes `NODE.hoverScale` as the CSS var `--graph-node-hover` on the container, once, not per row |

So the procedure for a visual change is: **open `paint.ts`, change the constant,
run `npm run test:graph`, look at `docs/graph-sample.svg`.** Reaching into
`CommitRow.tsx` to hardcode a radius is the mistake this file exists to prevent.

## The map — what to change for what

| You want | Change |
|---|---|
| taller / shorter rows | `METRICS.rowHeight` |
| lanes further apart | `METRICS.laneWidth` |
| bigger / smaller commit dot | `METRICS.nodeRadius` (rings follow, they are deltas) |
| thicker lines | `METRICS.strokeWidth` |
| rounder / sharper elbow | `CONTROL_RATIO` |
| how much the dot grows under the pointer | `NODE.hoverScale` (`1` disables it) |
| how forgiving the hover target is | `NODE.haloRestScale` — see "the invisible hit area" below |
| merge ring, HEAD ring, root core, selection halo | `NODE.*` |
| edge translucency, caps, joins | `EDGE.*` |
| subject / metadata / chip font size | `TEXT.*` |
| roundness and colour of the row highlights | `SURFACE.*` |
| how wide the column may get before it scrolls | `COLUMN.max` / `COLUMN.maxCompact` |
| the look of the column's scrollbar | `SCROLLER.*` |
| the colours themselves | **not here** — `web/src/styles/theme.css`, `--lane-0..7`, light and dark |

Lane colours are deliberately *not* in `paint.ts`: they are theme tokens, they
have a dark variant, and the drawing only ever refers to them through the alias
`"lane"`, resolved per row by `laneVar(node.color)`.

## How a row draws itself

Each row mounts its **own** `<svg>` of exactly `rowHeight` tall. There is no
single big SVG anywhere — that is what freezes on large repositories, and a test
asserts the DOM does not grow with the repo.

Inside that `<svg>`, in painting order:

1. the clipped edge segments crossing this band (`clipEdgePath`);
2. a `<g transform="translate(cx cy)">` — everything about the node is
   concentric at (0,0) from here on, so the hover scale never has to know which
   lane it is in;
3. inside it, the group that scales on hover, holding the selection halo plus
   whatever `commitNodeShapes()` returned.

`commitNodeShapes({ isMerge, isRoot, isHead })` returns the node as **data** —
a list of `{ key, r, fill, stroke, strokeWidth, opacity }` where the colours are
aliases (`"lane" | "surface" | "primary" | "none"`). Adding a ring, changing a
radius, giving roots a different core: all of it is editing that one function.
Both renderers then map the alias to a real token, and they differ in exactly one
place — the UI resolves `"surface"` to `--surface-graph`, the sample SVG to its
own `--surface`.

## The column has a ceiling, and its scrollbar is hand-drawn

The column stops growing at `COLUMN.max` (256px comfortable, 160px compact);
past that the drawing scrolls **inside** the column while the text columns stay
put. Two consequences for anything visual you add there:

- **The row's `<svg>` is the width of the BOX, not of the drawing.** Everything
  it paints hangs off one `<g>` translated by `translateX(var(--graph-scroll-x,
  0px))`, so the whole column pans with a single CSS-variable write. The
  fallback in that `var()` is load-bearing — the variable is deliberately never
  declared in `graphVars`, or React's style diffing would fight the imperative
  write.
- **A native scrollbar is not a visible affordance.** Chromium paints it as an
  overlay: absent at rest, `scrollbar-width: thin` included, which left a blank
  band under the header. So `SCROLLER` hides the system bar
  (`[scrollbar-width:none]` + `[&::-webkit-scrollbar]:hidden`) and draws the
  thumb: width `calc(var(--graph-col) * var(--graph-ratio))`, offset
  `translateX(calc(var(--graph-scroll-x, 0px) * -1 * var(--graph-ratio)))`. No
  number is computed in JavaScript and nothing re-renders while it moves.

The bar sits against the **header**, not under the list, and that is a shell
constraint rather than taste: the AI area is `fixed inset-x-0 bottom-6` and
floats over the bottom of every panel, so with the bar at the foot of the
column `document.elementFromPoint` on its right end returned the AI section —
half the control was unclickable (measured at 1440x900).

## Hover is CSS, and that is not negotiable

The dot grows through `:hover` on the group, with the scale coming from
`--graph-node-hover`. **Never** rewrite it with `useState`:

- the list is virtualized precisely so rows do not re-render; a hover state
  re-renders the row on every pointer enter and leave;
- a state-driven approach usually adds a wrapper element per row, and the node
  budget is tight (see below).

`pointer-events-auto` on the group re-opens hit testing that the `<svg>` turned
off, so the node responds to the pointer and the edges do not.

**The invisible hit area.** The selection halo never leaves the DOM — when the
row is not selected it sits at `opacity: 0`, and an SVG shape with zero opacity
is *still* a hit target. That is deliberate: at `haloRestScale` 0.8 it gives a
~9.6px hover radius around a 6px dot, which is what makes hitting the ball
comfortable without spending a DOM node on a transparent target circle. Lower it
and the dot gets fiddly; raise it and hover fires visibly far from the ball.

Transitions read the theme's CSS vars
(`--motion-ui-transition-snap-duration` / `--motion-ui-transition-snap`), never
hand-written milliseconds, and carry `motion-reduce:transition-none`.

## The three walls a repaint hits

**1. The DOM node budget** (`__tests__/virtualization.domtest.ts:66-78`). Hard
ceiling of 1200 nodes for the mounted window, and the count may not vary more
than 15% between a 200-commit and a 20 000-commit repository. Measured after this
column ceiling landed: 414 → 389, i.e. **6.0%**. There is room for another element or two per
row, not for ten. Counter-intuitively, adding a *constant* element per row makes
the variance assertion easier, not harder — it grows the denominator. What breaks
it is anything that scales with edge density.

**2. Curves may not leave their row.** A lane-changing edge gets exactly one row
of height to turn in, and that is a correctness constraint, not a style one: the
child's row and the parent's row are the only two rows provably free of a foreign
commit, so a curve spread over more rows would cross someone else's dot.
`layout.test.ts` catches it as a collision. `CONTROL_RATIO` moves the control
points *within* that row and is the only curvature knob there is. Above `1.0` the
curve stops being monotone in Y and doubles back.

**3. A bigger dot tightens a test.** `findCollisions`
(`__tests__/geometry.ts:81`) demands `nodeRadius + 1.5 + strokeWidth/2` of
clearance between an edge's ink and a foreign commit's ink — 8.6px today against
20px of `laneWidth`. Growing `nodeRadius` without growing `laneWidth` eventually
fails `layout.test.ts`, and the failure names a collision, which does not
obviously read as "your dot is too fat".

`geometry.ts` imports `CONTROL_RATIO` rather than hardcoding it — it used to
carry a literal `0.75`, which meant the collision test sampled a curve nobody
drew as soon as the curvature was tuned.

## Type stripping applies to `paint.ts`

`paint.ts` is loaded directly by Node, with no bundler, when the graph runner
regenerates the sample SVG. So: **no runtime `@/` import** — type-only is fine,
a real one passes `tsc` and kills phase 3 with `ERR_MODULE_NOT_FOUND`. Relative
runtime imports need the explicit `.ts`, which is how `layout.ts`, `bezier.ts`
and `shell.ts` reach it legally. No `enum`, no `namespace`, no decorators.

## Procedure

1. Change the constant in `paint.ts`.
2. `npm run test:graph`, **alone** — the suite asserts a wall-clock ratio and
   flakes next to another heavy job.
3. **Look at it.** Phase 3 of the runner rewrites the tracked
   `docs/graph-sample.svg` from the real metrics, so it is a faithful preview
   without starting the app. To actually see it:

   ```bash
   # rasterize the sample without leaving the terminal
   ~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome \
     --headless --disable-gpu --no-sandbox --hide-scrollbars \
     --force-device-scale-factor=2 --window-size=800,1100 \
     --screenshot=/tmp/graph.png \
     "file://$PWD/docs/graph-sample.svg"
   ```

   To compare candidate values, loop over them, `sed` the constant, run
   `node web/src/graph/devtools/make-sample-svg.ts`, screenshot each, and
   `convert +append` them into one strip. Judging curvature from numbers does not
   work; judging it from five crops side by side takes a minute. That is how
   `CONTROL_RATIO` landed on 0.62 — 0.35 reads as a diagonal with a corner, 0.85
   as a squared bracket.
4. **Verifying the hover needs a flag, or you get a false negative.** Tailwind v4
   wraps every `hover:` utility in `@media (hover: hover)`, and headless Chromium
   reports *no* pointing device — so the rule never applies, `:hover` still
   matches, and it looks like the effect is broken when it is not. Launch with

   ```
   --blink-settings=primaryHoverType=2,availableHoverTypes=2,\
   primaryPointerType=4,availablePointerTypes=4
   ```

   then drive `Input.dispatchMouseEvent` over the dot via CDP and measure
   `getBoundingClientRect().width`. Measured 2026-07-28: 12px at rest → 15.6px
   under the pointer, exactly `nodeRadius * 2 * hoverScale`. Note that
   `Emulation.setEmulatedMedia` with a `hover` feature did **not** work —
   `matchMedia("(hover: hover)")` stayed false; only the Blink flag flipped it.
   The media wrapper is also why the growth correctly does nothing on a
   touch-only device.

   **That flag buys CSS `:hover` only — it does not buy JS hover.** A Base UI
   popup (tooltip, menu, preview-card) opens through Floating UI's `useHover`,
   and `Input.dispatchMouseEvent` never opens one, no matter the flags: the
   element reports `:hover`, `pointerenter`/`pointermove` arrive with
   `pointerType: "mouse"`, `isTrusted: true` and real `movementX/Y`, and the
   popup still stays shut. Before concluding your wiring is broken, put Base
   UI's own canonical example on a scratch page and hover it — it fails
   identically, which is how you tell the harness apart from your code. What
   *does* work is forcing `open` on the Root and reading the popup: that
   exercises Portal, Positioner, Popup, the `handle` and the `payload` — every
   part you actually wrote — leaving only the library's own open-on-hover
   unverified. Budget for this: mistaking it for a real bug is a multi-hour
   detour.
5. `git status`: a diff in `docs/graph-sample.svg` is the runner, and it is the
   evidence of the change. Commit it deliberately.
6. `npm run typecheck` and
   `node .agents/skills/scripts/check-project-rules.mjs`.

## Traps that cost time here

- **The literal assertions in `bezier.test.ts` are tripwires, not duplication.**
  Each is paired with a symbolic assertion above it that proves the formula; the
  literal exists so a silent metric change gets noticed. Changing metrics on
  purpose means updating three literals — that is the design working.
- **The loading skeleton has to follow the metrics.** `LoadingRows` in
  `GraphView.tsx` takes `metrics` and sizes itself from `rowHeight` and
  `nodeRadius`. A hardcoded class there makes the skeleton jump the instant real
  rows arrive.
- **The three row highlights share one shape** (`SURFACE.pill`): hover, selection
  and the reveal mark. Given separate insets they show up one pixel apart when
  two of them are on at once.
- **Only `transform`, `opacity` and `filter` may animate** (`docs/UI.md`). The
  halo animates scale and opacity, never its radius — animating `r` is a layout
  animation on the SVG and it is the slow path.

## References

`web/src/graph/paint.ts` — the file itself is commented as the manual; read it
before this document if you only want to change a number.
`docs/UI.md` — semantic tokens, motion tokens, the no-CSS-layout rule.
`.agents/skills/laying-out-commit-graph/SKILL.md` — the algorithm side.

## <evolution>

On completion, run the memory pipeline in `meta-skill-evolution`. Update this
file directly only when the learning is important **and** `npm run test:graph`
went green, recorded via
`node .agents/skills/scripts/record-validation.mjs painting-graph-column`.
Replace what it contradicts; do not append a rival rule. Numbers quoted here
(node counts, clearances, the measured variance) are provenance — re-measure
before rewriting them, do not guess.
