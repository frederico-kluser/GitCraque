
## `@/components/motion-ui/accordion`

exports: `nextOpenIds`, `revealOpenIds`, `useAccordionHash`, `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionPanel`, `AccordionChevron`, `AccordionPlusMinus`

```ts
interface AccordionProps {
  /** Whether multiple rows can be open at once. Defaults to false (classic
  multiple?: boolean
  /** The values open on first render (uncontrolled). Base UI vocabulary: an
  defaultValue?: string[]
  /** The controlled open values. Omit (and optionally set `defaultValue`) to
  value?: string[]
  /** Called with the next open values whenever a row is toggled. */
  onValueChange?: (value: string[]) => void
  /** Wire deep-linking: open and scroll to the row whose value matches the
  deepLink?: boolean
  /** Merged onto the container element - this is where the container look
  className?: string
  /** The `AccordionItem` rows. */
  children?: ReactNode
}

interface AccordionItemProps {
  /** Stable value for this row: its open-state key (Base UI vocabulary) AND
  value: string
  /** Merged onto the row element - a per-row divider (`border-b`) lives here. */
  className?: string
  /** The row's `AccordionTrigger` and `AccordionPanel`. */
  children?: ReactNode
}

interface AccordionTriggerProps {
  /** The trigger label. Wrap it in your own `<span>` to size/weight it
  children?: ReactNode
  /** The open/closed indicator, rendered after the label. Defaults to
  indicator?: ReactNode
  /** Merged onto the `<button>` - trigger padding (`px-6 py-5`) lives here. */
  className?: string
  /** The heading level wrapping the button, for document outline correctness.
  headingLevel?: 2 | 3 | 4 | 5 | 6
  /** Use the inset focus ring instead of the offset one - set this when the
  inset?: boolean
}

interface AccordionPanelProps {
  /** The disclosed content (typically a `<p>`). */
  children?: ReactNode
  /** Merged onto the inner content wrapper - panel padding (`px-6 pt-1 pb-6`)
  className?: string
}

interface AccordionIndicatorProps {
  /** Force the open/closed state. Omit inside an `AccordionItem` and the
  open?: boolean
  /** Merged onto the indicator. The default tone is `text-muted-foreground`. */
  className?: string
}
```

## `@/components/motion-ui/border-beam`

exports: `BorderBeam`

```ts
interface BorderBeamProps {
  /** Angular length of the lit streak, in degrees of the lap. A longer arc
  size?: number
  /** Seconds for one full lap of the border. Smaller is faster. Defaults to
  duration?: number
  /** Thickness of the rim, in px. Defaults to `3`. */
  thickness?: number
  /** Phase offset in seconds, so stacked beams travel out of sync. Pass a
  delay?: number
  /** Your enable gate: run the beam when `true`, hold the resting border when
  active?: boolean
  /** Merged onto the wrapping element. */
  className?: string
  /** The panel the beam traces - your card, tile or pricing panel. */
  children: ReactNode
}
```

## `@/components/motion-ui/command-palette`

exports: `fuzzyMatch`, `commandMatches`, `filterCommandGroups`, `nextCommandIndex`, `useCommandK`, `CommandPalette`

```ts
interface CommandPaletteProps {
  /** Controlled open state. Omit for uncontrolled state. */
  open?: boolean
  /** Initial open state when uncontrolled. Defaults to `false`. */
  defaultOpen?: boolean
  /** Called whenever Base UI requests an open-state change. */
  onOpenChange?: (open: boolean) => void
  /** The commands the palette filters and lists. */
  items: CommandPaletteItem[]
  /** The order group headers render in; defaults to the items' own first-seen
  groupOrder?: string[]
  /** Tallest the scrollable result list is allowed to grow before it scrolls
  maxListHeight?: number
  /** The collapsed trigger bar's placeholder text. */
  triggerLabel?: string
  /** The trigger's trailing shortcut badge glyphs. */
  triggerShortcut?: string
  /** The open dialog input's placeholder. */
  inputPlaceholder?: string
  /** The open dialog input's accessible label. */
  inputAriaLabel?: string
  /** The dialog's accessible label. */
  dialogLabel?: string
  /** The footer-strip hints. Defaults to navigate / select / close. */
  footerHints?: CommandFooterHint[]
  /** Renders the no-results message; receives the trimmed query. */
  renderEmpty?: (query: string) => ReactNode
  /** Called with the chosen item when a row is selected (click or Enter). The
  onSelect?: (item: CommandPaletteItem) => void
}
```

## `@/components/motion-ui/confetti`

exports: `buildConfettiParticles`, `computeConfettiKeyframes`, `ConfettiPiece`, `Confetti`

```ts
interface ConfettiProps {
  /** How many pieces each burst spawns. Default 30. */
  particleCount?: number
  /** The launch cone width in degrees - how wide the pieces fan out from
  spread?: number
  /** Initial particle speed - how far the burst throws before gravity and
  startVelocity?: number
  /** Merged onto the burst layer (the `absolute inset-0` container). */
  className?: string
  /** Imperative handle exposing `burst()`. */
  ref?: Ref<ConfettiHandle>
}
```

## `@/components/motion-ui/copy-button`

exports: `CopyButton`

```ts
interface CopyButtonProps {
  /** The text written to the clipboard when the button is clicked. */
  value: string
  /** The button shape. `"label"` (default) is a primary-fill pill with
  variant?: CopyButtonVariant
  /** The visible resting label, `"label"` variant only (ignored by `"icon"`).
  children?: ReactNode
  /** The visible confirmed label shown after a copy, `"label"` variant only.
  copiedText?: ReactNode
  /** The button's accessible name (`aria-label`) while resting. Essential for
  label?: string
  /** The accessible name after a copy, also announced via the `aria-live`
  copiedLabel?: string
  /** How long the confirmed state holds, in milliseconds, before it reverts
  resetMs?: number
  /** Fired at the copy beat, after the clipboard write is attempted, with the
  onCopy?: (value: string) => void
  /** Disable the button (skips the copy and the swap). */
  disabled?: boolean
  /** Merged onto the button element. */
  className?: string
  /** Ref to the underlying `<button>`, React 19 ref-as-prop style, for
  ref?: Ref<HTMLButtonElement>
}
```

## `@/components/motion-ui/expand-card`

exports: `useExpandCard`, `ExpandCards`, `ExpandCardTrigger`, `ExpandCardShared`, `ExpandCardPanel`, `ExpandCardBody`

```ts
interface ExpandCardsProps {
  /** Your grid of `ExpandCardTrigger`s and the single `ExpandCardPanel`. */
  children?: ReactNode
  /** Scrim opacity behind an open card (0-1). A visual constant, not global
  scrimOpacity?: number
}

interface ExpandCardTriggerProps {
  /** The card's id - matched against `openId` and used to build the shared
  id: string
  /** Your card's visible content (an `ExpandCardShared` icon, a heading,
  children?: ReactNode
  /** Merged onto the morphing surface - style the card face here
  className?: string
  /** The button's accessible name (the tile's text is often abbreviated, so
  "aria-label"?: string
}

interface ExpandCardSharedProps {
  /** A stable name for this morphing part (e.g. `"icon"`, `"head"`). Render
  part: string
  /** Which element to render. Defaults to `"span"`. */
  as?: "span" | "div"
  /** Pass `"position"` to animate only the element's position during the
  layout?: "position" | "size" | boolean
  /** Merged onto the element - size and style the part here. The trigger and
  className?: string
  /** The part's content. */
  children?: ReactNode
}

interface ExpandCardPanelProps {
  /** The dialog body. A render function receiving the open card's `id`
  children: ((card: { id: string }) => ReactNode) | ReactNode
  /** Merged onto the dialog surface - the morphing box (`bg-card`, border,
  className?: string
  /** Merged onto the inner `layout="position"` wrapper that holds your
  contentClassName?: string
  /** Builds the dialog's `aria-labelledby` from the open card's id - point it
  labelledBy?: (id: string) => string
  /** Builds the dialog's `aria-describedby` from the open card's id. */
  describedBy?: (id: string) => string
  /** Where focus lands when the dialog opens. Defaults to the first focusable
  initialFocusRef?: RefObject<HTMLElement | null>
}

interface ExpandCardBodyProps {
  /** The dialog's non-shared detail content. */
  children?: ReactNode
  /** Merged onto the wrapper. */
  className?: string
}
```

## `@/components/motion-ui/hold-to-confirm`

exports: `useHoldToConfirm`, `HoldToConfirmButton`

```ts
interface HoldToConfirmButtonProps {
  /** Seconds the button must be held to confirm. Default 2. */
  holdSeconds?: number
  /** What happens visually after confirmation. `"callback"` leaves the
  mode?: "callback" | "success"
  /** Label shown beside the built-in check in `"success"` mode. Default
  successLabel?: ReactNode
  /** Fired once the hold completes. Flip your own confirmed state here. */
  onConfirm?: () => void
  /** Fired when the hold is released early. */
  onCancel?: () => void
  /** The button label (typically an icon + text). Rendered in BOTH the
  children?: ReactNode
  /** Merged onto the button element. */
  className?: string
  /** Points at the consumer's own hint/instruction text, wired through to the
  "aria-describedby"?: string
}
```

## `@/components/motion-ui/multi-state-button`

exports: `MultiStateButton`

```ts
interface MultiStateButtonProps {
  /** The current state key - the consumer owns and advances the state machine.
  state: string
  /** The visible label for the current state - the text that morphs. */
  children: ReactNode
  /** An optional leading glyph for the current state, rendered before the
  icon?: ReactNode
  /** Surface-colour classes for the CURRENT state, merged onto the morphing
  surfaceClassName?: string
  /** Constant pill styling applied in EVERY state - shape, padding and text
  pillClassName?: string
  /** Imperative feedback fired when `state` settles: `"shake"` for a failed
  feedback?: MultiStateFeedback
  /** Whether the pill animates its width on the compositor (via Motion layout
  widthMorph?: boolean
  /** Accessible status text for the current state, announced through an
  announce?: string
  /** Accessible name for the button. Set this when the visible label alone
  "aria-label"?: string
  /** Button type. `"button"` (default) for a standalone action; `"submit"`
  type?: "button" | "submit"
  /** Disables the button (e.g. while a request is in flight). Adds
  disabled?: boolean
  /** Click handler - advance your state machine, or leave undefined and let a
  onClick?: () => void
  /** Merged onto the button root (the focus target). */
  className?: string
}
```

## `@/components/motion-ui/overlay`

exports: `getFocusableElements`, `useFocusTrap`, `useScrollLock`, `Backdrop`

```ts
interface BackdropProps {
  /** The scrim's opacity. A number for a plain fading dialog scrim (drive it
  opacity?: number | MotionValue<number>
  /** Click-to-dismiss handler. */
  onClick?: () => void
  /** When set, the scrim is itself the keyboard-reachable dismiss control: it
  label?: string
  /** The scrim surface class. Defaults to `bg-black` - the universal modal
  className?: string
  /** Extra inline styles, merged under `opacity`. */
  style?: MotionStyle
  /** Rarely needed - content rendered inside the scrim. */
  children?: ReactNode
}
```

## `@/components/motion-ui/progress-bar`

exports: `ProgressBar`

```ts
interface ProgressBarProps {
  /** Fill length as a share in [0,1] (0 = empty, 1 = full). Drives the
  value: number
  /** Animate the fill in with a left-anchored `scaleX` reveal on the theme's
  reveal?: boolean
  /** Gate for `reveal`: while `false` the fill holds empty (`scaleX 0`); flip
  revealed?: boolean
  /** Stagger index for `reveal`: the reveal spring is delayed by
  index?: number
  /** A fixed reference marker painted over the track, as a share in [0,1]
  referenceTick?: number
  /** Paint the fill with the brand slot (`bg-primary`) - the one highlighted
  highlight?: boolean
  /** The opaque colour of a non-highlighted fill. Defaults to a 55%
  tone?: string
  /** Track height: `"sm"` is a 4px hairline (a media scrubber), `"md"` the 8px
  size?: "sm" | "md"
  /** Expose the track as an ARIA `progressbar` with `aria-valuemin` 0,
  progressbar?: boolean
  /** Accessible name for the track when `progressbar` is set. */
  "aria-label"?: string
  /** Leading label slot, laid out opposite `valueLabel`. Fully styled by you
  label?: ReactNode
  /** Trailing label slot, laid out opposite `label`. Fully styled by you (the
  valueLabel?: ReactNode
  /** Where the label row sits relative to the track: `"top"` above (benchmark
  labelPlacement?: "top" | "bottom"
  /** Merged onto the root wrapper. Set spacing (`gap-*`) and layout here. */
  className?: string
  /** Merged onto the root wrapper, for consumers that need to measure it. */
  ref?: Ref<HTMLDivElement>
}
```

## `@/components/motion-ui/segmented-toggle`

exports: `SegmentedToggle`, `SegmentedToggleOption`

```ts
interface SegmentedToggleOptionProps {
  /** This option's value. When it matches the group's `value` the option is
  value: string
  /** The option's content: its label, plus any extra content that rides in the
  children?: ReactNode
  /** Merged onto the option `<button>`. */
  className?: string
}
```

## `@/components/motion-ui/sheet`

exports: `useSheet`, `Sheet`, `SheetTrigger`, `SheetBackdrop`, `shouldDismissSheet`, `SheetPanel`, `SheetHandle`, `SheetClose`

```ts
interface SheetProps {
  /** The trigger, backdrop, panel and your resting content. Keep the backdrop
  children?: ReactNode
  /** Controlled open state. Omit for uncontrolled (drive it via
  open?: boolean
  /** Initial open state when uncontrolled. Defaults to `false`. */
  defaultOpen?: boolean
  /** Called whenever the sheet requests an open-state change (trigger, close
  onOpenChange?: (open: boolean) => void
}

interface SheetTriggerProps {
  /** The trigger's contents (label, and optionally an icon). */
  children?: ReactNode
  /** Merged onto the trigger button, last, so it wins. */
  className?: string
}

interface SheetBackdropProps {
  /** The scrim surface class, merged onto the shared `Backdrop`. Defaults to
  className?: string
  /** The scrim's accessible label. When set, the scrim is a keyboard-reachable
  label?: string
}

interface SheetPanelProps {
  /** The sheet's contents - your handle, header, close button and rows. */
  children?: ReactNode
  /** Downward drag distance (px) past which releasing dismisses the sheet.
  dismissOffset?: number
  /** Downward flick velocity (px/s) past which releasing dismisses the sheet.
  dismissVelocity?: number
  /** The id of the element that labels the dialog, wired to
  labelledBy?: string
  /** Merged onto the panel, last, so it wins. */
  className?: string
}

interface SheetHandleProps {
  /** Merged onto the centring row, last, so it wins. */
  className?: string
}

interface SheetCloseProps {
  /** The button's contents. Defaults to a close (×) glyph. */
  children?: ReactNode
  /** The accessible label. Defaults to `"Close"`. */
  label?: string
  /** Merged onto the button, last, so it wins. */
  className?: string
}
```

## `@/components/motion-ui/skeleton`

exports: `useSkeletonSweep`, `Skeleton`, `SkeletonReveal`, `useSkeletonResolve`, `SkeletonResolveList`, `SkeletonResolveRow`

```ts
interface SkeletonProps {
  /** Run the shimmer when `true`; hold a steady block when `false`. This is
  animate?: boolean
  /** Merged onto the bone. Size and shape the placeholder here
  className?: string
  /** Extra inline styles, merged onto the bone. */
  style?: CSSProperties
  /** Rendered invisibly to size the bone to the exact geometry of the real
  children?: ReactNode
}

interface SkeletonRevealProps {
  /** Whether the skeleton is showing (`true`) or the loaded content has taken
  loading: boolean
  /** The skeleton placeholder, shown while `loading`. Build it from `Skeleton`
  skeleton: ReactNode
  /** The loaded content, shown once `loading` is `false`. Give it and the
  children: ReactNode
  /** The shared view-transition name the skeleton and loaded layers hand off
  name?: string
  /** Merged onto the wrapper around the handoff (size the stage here). */
  className?: string
}

interface SkeletonResolveListProps {
  /** Whether the feed is still loading (`true`) or has resolved (`false`).
  loading: boolean
  /** The rows - one `SkeletonResolveRow` per feed item (or your own markup
  children: ReactNode
  /** Per-row delay step, in seconds, shared with every row. Defaults to the
  stagger?: number
}

interface SkeletonResolveRowProps {
  /** This row's position, used to stagger its handoff after the rows above. */
  index: number
  /** The real content layer. Sits in normal flow and defines the row's box the
  content: ReactNode
  /** The bones overlay - typically `Skeleton` bones laid out to mirror
  skeleton: ReactNode
  /** Whether the feed is loading. Optional inside a `SkeletonResolveList`
  loading?: boolean
  /** Per-row delay step, in seconds. Falls back to the list's value, then the
  stagger?: number
  /** Merged onto the row wrapper (the positioned container of both layers). */
  className?: string
}
```

## `@/components/motion-ui/smooth-tabs`

exports: `useSmoothTabsContext`, `SmoothTabs`, `SmoothTabsList`, `SmoothTabsTab`, `SmoothTabsPanels`, `SmoothTabsPanel`

```ts
interface SmoothTabsProps {
  /** The uncontrolled initial selected tab value. One of the child
  defaultValue?: string
  /** The selected tab value (controlled). Pair with `onValueChange`. */
  value?: string
  /** Called with the newly selected tab's value whenever the selection changes
  onValueChange?: (value: string) => void
  /** Horizontal distance (px) the outgoing/incoming panel slides during the
  contentOffsetX?: number
  /** Merged onto the root wrapper - lay the tablist and panels out here
  className?: string
  /** `SmoothTabsList` and `SmoothTabsPanels`. */
  children?: ReactNode
}

interface SmoothTabsListProps {
  /** Accessible name for the `role="tablist"` (e.g. "Workspace views").
  ariaLabel?: string
  /** Merged onto the tablist shell - extend the default recessed `bg-muted`
  className?: string
  /** The `SmoothTabsTab` children. */
  children?: ReactNode
}

interface SmoothTabsTabProps {
  /** This tab's value. When it matches the group's selected value the tab is
  value: string
  /** The tab's label (and any inline content). */
  children?: ReactNode
  /** Merged onto the tab `<button>`. */
  className?: string
}

interface SmoothTabsPanelsProps {
  /** The `SmoothTabsPanel` children. Only the one matching the selected value
  children?: ReactNode
  /** Merged onto the crossfade viewport - give it its card surface, border and
  className?: string
}

interface SmoothTabsPanelProps {
  /** This panel's value. It is shown when it matches the group's selected
  value: string
  /** The panel's content. */
  children?: ReactNode
  /** Merged onto the animated `role="tabpanel"` wrapper `SmoothTabsPanels`
  className?: string
}
```

## `@/components/motion-ui/sparkline`

exports: `buildSparkPath`, `buildSparkAnimation`, `Sparkline`

```ts
interface SparklineProps {
  /** Data mode: a window of readings mapped to the curve via `buildSparkPath`.
  history?: number[]
  /** Literal mode: a hand-drawn SVG path `d` string, used verbatim as the
  path?: string
  /** viewBox width. Also the baseline width the area closes across and the
  width?: number
  /** viewBox height. Also the baseline the area closes down to. Default 64. */
  height?: number
  /** Vertical inset for `history` mapping (see `SparkPathOptions.padY`).
  padY?: number
  /** Line/area colour tier (see `SparklineTone`). Default `"primary"`. */
  tone?: SparklineTone
  /** Render the area fill under the line (gradient for `primary`, flat for
  area?: boolean
  /** Faint horizontal gridline y-positions, in viewBox coordinates. Omit for
  grid?: number[]
  /** Render the accent endpoint dot. In data mode it sits on the last
  dot?: boolean
  /** Endpoint-dot x in literal mode (data mode uses the last point). Defaults
  dotX?: number
  /** Endpoint-dot y in literal mode (data mode uses the last point). Defaults
  dotY?: number
  /** Endpoint-dot radius. Default 3.5. */
  dotRadius?: number
  /** Draw the line in once via a `pathLength` reveal (paint-tier, one-shot).
  draw?: boolean
  /** Gate for the `draw` reveal: the line holds at `pathLength` 0 until this
  revealed?: boolean
  /** Bump this on every live tick to pulse the endpoint dot (a compositor
  tickKey?: number
  /** Line stroke width, in viewBox units. Default 2. */
  strokeWidth?: number
  /** Keep the stroke a constant screen width regardless of any transform
  nonScalingStroke?: boolean
  /** Reduced-motion gate. When omitted, derived from the theme + the user's
  motionAllowed?: boolean
  /** An accessible label. When set the chart is exposed as `role="img"` with
  label?: string
  /** Merged onto the `<svg>`. Size the chart here (e.g. `h-24 w-full`). */
  className?: string
}
```

## `@/components/motion-ui/stagger-reveal`

exports: `useStaggerReveal`, `StaggerReveal`, `StaggerRevealHeadline`, `StaggerRevealItem`

```ts
interface StaggerRevealProps {
  /** The container content: one `StaggerRevealHeadline` and any number of
  children: ReactNode
  /** The element to render. Defaults to `"div"`. */
  as?: StaggerRevealTag
  /** Merged onto the container - this is where the layout utilities live
  className?: string
  /** Forwarded to the container element. */
  id?: string
}

interface StaggerRevealHeadlineProps {
  /** The plain headline text to split and reveal. Must be a string -
  children: string
  /** The element to render. Defaults to `"h1"`. */
  as?: StaggerRevealHeadlineTag
  /** The whole-headline announce for assistive tech, read instead of the
  ariaLabel?: string
  className?: string
  /** Forwarded to the heading (e.g. the `aria-labelledby` target id). */
  id?: string
}

interface StaggerRevealItemProps {
  /** The follower's content (a paragraph of copy, a CTA cluster, a trust
  children: ReactNode
  /** The element to render. Defaults to `"div"`. */
  as?: StaggerRevealItemTag
  /** Merged onto the follower - colour/size/layout shadcn utilities live
  className?: string
  /** Forwarded to the follower element. */
  id?: string
}
```

## `@/components/motion-ui/swipe-actions`

exports: `useSwipeRow`, `SwipeActionsList`, `SwipeActions`, `SwipeAction`

```ts
interface SwipeActionsListProps {
  /** The `SwipeActions` rows (keyed by their stable id), and optionally an
  children?: ReactNode
  /** Merged onto the `<ul>` - this is where the list look lives (a bordered
  className?: string
  /** Inline styles merged onto the `<ul>` - a `maxWidth` for the column
  style?: CSSProperties
  /** Forwarded to the `<ul>` (React 19 ref-as-prop). */
  ref?: Ref<HTMLUListElement>
}

interface SwipeActionsProps {
  /** Stable id for this row: its single-open key. Required. */
  id: string
  /** The row FACE - the resting content that slides over the actions. It sits
  children?: ReactNode
  /** The `SwipeAction`s revealed by swiping the row RIGHT (they live off the
  left?: ReactNode
  /** The `SwipeAction`s revealed by swiping the row LEFT (they live off the
  right?: ReactNode
  /** Row height in px. Defaults to 88. */
  rowHeight?: number
  /** Fraction of the row a swipe must clear to snap open on release (0..1).
  revealThreshold?: number
  /** Fraction of the row a swipe must clear to commit a full swipe (0..1).
  fullSwipeThreshold?: number
  /** How far the row snaps open on release, as a fraction of its width (0..1).
  revealAmount?: number
  /** This row's position in the list, for the entrance stagger. Defaults to 0. */
  index?: number
  /** Drop the bottom divider on the last row. Defaults to false. */
  isLast?: boolean
  /** Merged onto the row `<li>`. */
  className?: string
}

interface SwipeActionProps {
  /** The action glyph, e.g. a line-icon `<svg>`. Sized/coloured by you;
  icon: ReactNode
  /** The short action label, rendered under the icon. */
  label: string
  /** Which edge this action lives on - must match the slot (`left`/`right`) of
  side: SwipeSide
  /** The outer action on its side: it slides to the edge as the swipe crosses
  primary?: boolean
  /** The fill + text classes for this action's box, e.g.
  fillClassName: string
  /** The button's accessible label (the icon is decorative). */
  ariaLabel: string
  /** Fired when the action is tapped, and - for a `primary` action - when a
  onActivate: () => void
}
```

## `@/components/motion-ui/terminal-session`

exports: `useTerminalSession`, `TerminalSession`

```ts
interface TerminalSessionProps {
  /** The session to play, top to bottom. Content, not feel. */
  lines: TerminalLine[]
  /** Base milliseconds per keystroke for command lines. Lower is faster.
  typingSpeedMs?: number
  /** Milliseconds before the first line starts typing. Defaults to `400`. */
  startDelayMs?: number
  /** Milliseconds an output line rests after fading in before the session
  outputDelayMs?: number
  /** The lead-in for the `sr-only` spoken transcript, read as
  label?: string
  /** Merged onto the scrolling body wrapper. */
  className?: string
}
```

## `@/components/motion-ui/toast-stack`

exports: `useToastStack`, `useToast`, `Toast`, `ToastStack`

```ts
interface ToastProps {
  /** The toast's content - typically a `NotificationCard` carrying the icon,
  children?: ReactNode
  /** Merged onto the animated card element. Positioning (absolute bottom / full
  className?: string
}

interface ToastStackProps {
  /** The `Toast` children, newest first (map `useToastStack().toasts` in
  children?: ReactNode
  /** How many toasts stay fully visible before the rest hide behind them.
  maxVisible?: number
  /** Vertical push, in px, applied per step back in the stack. Defaults to
  stackOffsetY?: number
  /** Scale shed per step back in the stack (`0.06` = 6% smaller each). Defaults
  stackScale?: number
  /** Opacity shed per step back in the stack. Defaults to `0.2`. */
  stackOpacity?: number
  /** Merged onto the fixed viewport element - reposition the well (e.g. top
  className?: string
}
```

## `@/components/motion-ui/ui-theme`

exports: `defineTheme`, `resolveReducedMotion`, `transitionToLinear`, `themeToCssVars`, `cssVarsToStyleString`, `MotionUIThemeProvider`, `useMotionUITheme`, `useMotionUITransition`

```ts
interface MotionUIThemeProviderProps {
  theme?: MotionUITheme
  children: ReactNode
}
```
