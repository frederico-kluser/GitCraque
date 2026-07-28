---
name: composing-shell-interface
description: "Injects the Motion UI cascade, semantic design tokens, the overlay z-ladder, click-time context menus and the confirm/hold-to-confirm gate for GitCraque's shell in web/src/app/**, web/src/panels/** and web/src/hooks/**. Use whenever a task touches the toolbar, rail, panels, dock, footer, dialogs, context menus, keyboard shortcuts, styling or any React component outside graph and dnd — even when the user just says 'add a button', 'change the layout' or names a panel, and never mentions skills."
metadata:
  type: task
  verification_signal: npm run typecheck && node .agents/skills/scripts/check-project-rules.mjs
---

# Composing the shell interface

## When to use

Anything in `web/src/app/**`, `web/src/panels/**`, `web/src/hooks/**`: shell
layout, toolbar, rail, dock, status footer, dialogs, context menus, hotkeys,
theming, or any new UI component.

## Injected knowledge

**This domain has no tests.** `npm test` covers server, graph, dnd and viewer
only — `web/src/app`, `panels` and `hooks` have zero test files. Its signal is
`tsc` plus the rule checker, and neither can see behaviour. Change carefully and
verify by running the app when the change is behavioural.

**The cascade is an order, not a preference** (`docs/UI.md:6-14`): search the 19
installed components and `docs/_motion-ui-props.md` → compose from those plus
Base UI primitives → only then write new code, adding one line of comment saying
what the catalogue lacked. Writing `position: absolute` to lay out a whole
section means you stopped at the wrong step.

**Do not edit `web/src/components/motion-ui/**`.** The shadcn CLI owns it and
overwrites on the next `add`. Customise in a wrapper: local composition plus
`className` pass-through via `cn()`, as in `web/src/panels/RailPanels.tsx:95-114`.
Never run `add @motion/motion-theme` — it would overwrite the customised
`motion.theme.ts`. `<MotionUIThemeProvider>` is already mounted in
`web/src/main.tsx`; do not mount a second one.

**Four installed components have zero consumers:** `sheet`, `expand-card`,
`terminal-session`, `border-beam`. `docs/UI.md:21,32,38` claims the first three
are in use — they are not. Treat that table as a catalogue of what is
*available*, not what is wired.

**Motion comes from the theme, never from inline numbers.** Use
`useMotionUITransition("snap" | "ui" | "gentle" | "lively" | "ambient")` and
spread it (`web/src/app/ConfirmHost.tsx:150,192`). Derive rather than hardcode:
`ambient.duration * 1.6` (`web/src/panels/Toolbar.tsx:157`). The CSS-only idiom
is `duration-[var(--motion-ui-transition-snap-duration)]`.

**Colour and spacing come from semantic tokens** — `bg-background`,
`text-muted-foreground`, `border-border`, plus the app's own `bg-surface-rail`,
`bg-surface-graph`, `bg-surface-inset`, `text-success`, `text-warning`. They are
defined in `web/src/styles/theme.css:44-56,135-202` (all `oklch`). `laneVar(n)`
from `@/lib/utils` is graph-only; the shell never uses it. Hex, numbered Tailwind
palettes and `transition-all` are now caught by
`node .agents/skills/scripts/check-project-rules.mjs`.

**Animate `transform`, `opacity`, `filter` only.** Box changes use the `layout`
prop. The theme sets `reducedMotion: "calm"`, but any continuous or
scroll-linked effect you write still needs `useReducedMotion()`.

**Overlay z-ladder — memorise before adding one:** ActionMenu `z-50` → confetti
`z-[55]` → confirm dialog `z-[60]` → reconnect banner `z-[70]` → context menu
`z-[80]` (`web/src/app/ContextMenuHost.tsx:117`, which must beat the dialog).

**`app` and `panels` are one bidirectional unit, not a layer stack.**
`panels/SidePanel.tsx:33` imports `@/app/Splitter`; `app/ConfirmHost.tsx:30`
deep-imports `@/panels/parts`, which `panels/index.ts` does not export. That deep
import is load-bearing — `parts.tsx` holds the shared menu frame
(`MENU_POPUP_CLASS`, `MenuItems`), and a menu with two appearances is a broken
menu.

**Context menus are built at click time**, inside the event handler
(`web/src/hooks/useShellStore.ts:330-336`). Two consequences: `t()` runs per
click so labels follow a language switch, and the menu reads live state, so
"Checkout" can say *pinned in ../other-worktree*. **An empty list means no menu
at all** (`useShellStore.ts:307-313`) — a ref chip returning `[]` lets the click
fall through to the commit row underneath, which was the real target. The browser
menu is suppressed globally by a bubble-phase `window` listener with exactly one
exception: text fields (`input, textarea, select, [contenteditable]`).

**Nothing executes from a menu.** Items call an exported `open*`/`do*` from
`web/src/app/actions.ts`, never `api.*` directly. Destructive or input-taking
actions become `askConfirm({ title, preview, destructive, run })`, and `preview`
is the literal argv shown before running — the product's core promise.
`destructive: true` is the **only** switch that swaps `MultiStateButton` for
`HoldToConfirmButton` (`web/src/app/ConfirmHost.tsx:250-262`).

**Known defect, do not copy the pattern:** `openPushDialog`
(`web/src/app/actions.ts:143-192`) exposes `--force-with-lease` but never sets
`destructive: true`, so that path renders a plain click button. The drag path
does it correctly (`web/src/dialogs/PushDialog.tsx:155`). `docs/UI.md:27` lists
`push --force` as mandatory hold.

**A gotcha that cost real time:** `ActionMenu` wraps trigger and portal in
`<span className="contents">` that stops five event types
(`web/src/panels/parts.tsx:226-233`). The Base UI portal is still a React child
of a draggable row, so without it, opening the menu fires the row click — which
switches worktree — and dnd-kit swallows the item click.

**Hooks worth knowing** (`web/src/hooks/`): `useCommitActivity.ts:31-42` parses
the **English** `%ar` string, safe only because the backend pins `LC_ALL=C`;
`useShellStore` persists a whitelist so ephemeral state never restores, and
applies the theme at module scope to kill the flash; `useHotkeys` is a single
capture-phase listener where `Escape` deliberately bails out when a context menu
is open.

## Procedure

1. Search `docs/_motion-ui-props.md` and the installed components before writing
   anything new.
2. Compose in a wrapper; never edit the vendor tree.
3. Any user-facing string goes through `t()` — see `translating-interface-text`.
4. For a new context-menu entry: add the string to `locales/pt.ts`; push a
   `MenuItemSpec` into the right builder in `web/src/app/menus.ts`, calling `t()`
   **inside** the builder; point `onSelect` at an exported action. Nothing in
   `ContextMenuHost.tsx` needs touching.
5. Run `npm run typecheck && node .agents/skills/scripts/check-project-rules.mjs`.

## References

`docs/UI.md` (whole file — the cascade and hard rules);
`docs/_motion-ui-props.md` for exports and props of all 19 components.

## <evolution>

On completion, run the memory pipeline in `meta-skill-evolution`. Because this
domain has no behavioural tests, be **stricter** than elsewhere about what counts
as verified: a green `tsc` plus rule checker proves form, not correctness. Prefer
explicit user confirmation for behavioural claims. Record with
`node .agents/skills/scripts/record-validation.mjs composing-shell-interface`,
replace rather than append, and discard anything unverified.
