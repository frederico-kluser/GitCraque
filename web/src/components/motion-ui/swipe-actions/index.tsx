import {
  AnimatePresence,
  LayoutGroup,
  clamp,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
} from "motion/react"
import type { MotionValue } from "motion/react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react"
import { useMotionUITheme, useMotionUITransition } from "@/components/motion-ui/ui-theme"
import type { TransitionToken } from "@/components/motion-ui/ui-theme"

/** Which edge a group of actions lives on: `left` actions are revealed by
 *  swiping the row to the RIGHT, `right` actions by swiping it LEFT. */
export type SwipeSide = "left" | "right"

/** shadcn's ring utilities, the shared focus-visible treatment for every
 *  interactive element in this component. */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

/** Filters falsy class parts and joins them - keeps the conditional className
 *  composition readable without a `clsx`-style dependency. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ")
}

/* Theme reduced-motion strategy, shared by every part: "off" mounts no
 * entrance at all; "calm" keeps opacity fades but drops travel. The swipe
 * itself is direct manipulation and always live - reduced motion only drops
 * the decorative flourishes (`flat`): the row entrance stagger/travel and the
 * elastic action offset/scale, keeping every opacity fade. defaultTheme ships
 * "calm". */

/**
 * ==============   Contexts   ================
 */

interface SwipeListContextValue {
  /** The id of the row currently held open, or null. */
  openId: string | null
  /** Open the given row (and, by coordination, close any other). Passing null
   *  closes whichever row is open. */
  setOpenId: (id: string | null) => void
}

const SwipeListContext = createContext<SwipeListContextValue | null>(null)

function useSwipeListContext(who: string): SwipeListContextValue {
  const ctx = useContext(SwipeListContext)
  if (!ctx) throw new Error(`${who} must be rendered inside <SwipeActionsList>.`)
  return ctx
}

interface SwipeRowContextValue {
  /** The row's live swipe progress, in [-1, 1]: negative swiped left (right
   *  actions revealed), positive swiped right (left actions revealed). */
  progress: MotionValue<number>
  /** The snap spring the row follows with - reuse it so a face's own
   *  de-emphasis settles on the same curve. */
  spring: TransitionToken
  /** True when the user prefers reduced motion: drop the elastic flourish,
   *  keep opacity fades. */
  flat: boolean
  /** Fraction of the row a swipe must clear to commit a full swipe (0..1). */
  fullSwipeThreshold: number
  /** Snap the row open on the given side (used by an action opening its side
   *  on focus, so the keyboard reaches it). */
  revealSide: (side: SwipeSide) => void
  /** Snap the row shut. */
  closeRow: () => void
  /** A `primary` action registers its activate handler for its side, so a full
   *  swipe to that edge commits it. Returns an unregister cleanup. */
  registerPrimary: (side: SwipeSide, activate: () => void) => () => void
}

const SwipeRowContext = createContext<SwipeRowContextValue | null>(null)

function useSwipeRowContext(who: string): SwipeRowContextValue {
  const ctx = useContext(SwipeRowContext)
  if (!ctx) throw new Error(`${who} must be rendered inside <SwipeActions>.`)
  return ctx
}

/** What `useSwipeRow` hands a row face. */
export interface SwipeRowState {
  /** The row's live swipe progress, in [-1, 1] (see `SwipeRowContextValue`). */
  progress: MotionValue<number>
  /** The snap spring the row follows with. */
  spring: TransitionToken
  /** True under reduced motion - drop decorative swipe-driven flourishes. */
  flat: boolean
}

/**
 * Read the enclosing row's live swipe state from a face rendered as
 * `SwipeActions` children. A face uses `progress` to de-emphasise itself as
 * the actions come in (e.g. fading its content), `spring` to settle that
 * response on the same curve the row follows, and `flat` to drop the response
 * entirely under reduced motion. Must be called inside a `SwipeActions` row.
 */
export function useSwipeRow(): SwipeRowState {
  const { progress, spring, flat } = useSwipeRowContext("useSwipeRow")
  return { progress, spring, flat }
}

/**
 * ==============   SwipeActionsList   ================
 */

export interface SwipeActionsListProps {
  /** The `SwipeActions` rows (keyed by their stable id), and optionally an
   *  empty-state child when the list is exhausted. */
  children?: ReactNode
  /** Merged onto the `<ul>` - this is where the list look lives (a bordered
   *  `rounded-lg border border-border bg-card` card, or your own). The
   *  structural `relative w-full overflow-hidden` is always applied. */
  className?: string
  /** Inline styles merged onto the `<ul>` - a `maxWidth` for the column
   *  typically lives here. */
  style?: CSSProperties
  /** Forwarded to the `<ul>` (React 19 ref-as-prop). */
  ref?: Ref<HTMLUListElement>
}

/**
 * The list container: coordinates single-open state across its rows (opening
 * one closes any other). A `LayoutGroup` keeps the layout-aware `<motion.ul>`
 * and row items in the same measurement pass, while `AnimatePresence`
 * `mode="popLayout"` removes a committed row from flow so its surviving
 * siblings translate into place cleanly.
 */
export function SwipeActionsList({
  children,
  className,
  style,
  ref,
}: SwipeActionsListProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const value = useMemo<SwipeListContextValue>(
    () => ({ openId, setOpenId }),
    [openId]
  )

  return (
    <SwipeListContext.Provider value={value}>
      <LayoutGroup>
        <motion.ul
          ref={ref}
          layout
          className={cx("relative w-full overflow-hidden", className)}
          style={style}
        >
          <AnimatePresence mode="popLayout">{children}</AnimatePresence>
        </motion.ul>
      </LayoutGroup>
    </SwipeListContext.Provider>
  )
}

/**
 * ==============   SwipeActions (row)   ================
 * The single-row swipe machinery: document-level pointermove/pointerup
 * listeners (so the swipe tracks even when the pointer leaves the row), a
 * full-swipe threshold that snaps to the edge and commits on release, a reveal
 * threshold that snaps the row open, and a spring-smoothed follow. Every value
 * animated is transform/opacity only.
 */
export interface SwipeActionsProps {
  /** Stable id for this row: its single-open key. Required. */
  id: string
  /** The row FACE - the resting content that slides over the actions. It sits
   *  on an opaque `bg-card` layer the row draws; render your own row here and
   *  read `useSwipeRow()` inside it to de-emphasise as the swipe crosses. */
  children?: ReactNode
  /** The `SwipeAction`s revealed by swiping the row RIGHT (they live off the
   *  left edge). Give each `side="left"`. */
  left?: ReactNode
  /** The `SwipeAction`s revealed by swiping the row LEFT (they live off the
   *  right edge). Give each `side="right"`. */
  right?: ReactNode
  /** Row height in px. Defaults to 88. */
  rowHeight?: number
  /** Fraction of the row a swipe must clear to snap open on release (0..1).
   *  Defaults to 0.25. */
  revealThreshold?: number
  /** Fraction of the row a swipe must clear to commit a full swipe (0..1).
   *  Defaults to 0.8. */
  fullSwipeThreshold?: number
  /** How far the row snaps open on release, as a fraction of its width (0..1).
   *  Defaults to 0.5. */
  revealAmount?: number
  /** This row's position in the list, for the entrance stagger. Defaults to 0. */
  index?: number
  /** Drop the bottom divider on the last row. Defaults to false. */
  isLast?: boolean
  /** Merged onto the row `<li>`. */
  className?: string
}

/** One swipeable row. Owns the pointer/drag machinery, the spring follow and
 *  the thresholds; renders the face over two action groups and provides the
 *  swipe context every `SwipeAction` (and the face's `useSwipeRow`) reads. */
export function SwipeActions({
  id,
  children,
  left,
  right,
  rowHeight = 88,
  revealThreshold = 0.25,
  fullSwipeThreshold = 0.8,
  revealAmount = 0.5,
  index = 0,
  isLast = false,
  className,
}: SwipeActionsProps) {
  const theme = useMotionUITheme()
  const snap = theme.transitions.snap
  const enter = useMotionUITransition("ui")
  const motionMode = theme.motionMode
  const still = motionMode === "off"
  const calm = motionMode === "calm"
  const flat = motionMode !== "full"

  const { openId, setOpenId } = useSwipeListContext("SwipeActions")

  const [isSwiping, setIsSwiping] = useState(false)

  // Refs for swipe measurements:
  //   swipeItemRef / swipeItemWidth - the row face and its cached width;
  //   swipeStartX / swipeStartOffset - pointer + offset at swipe start;
  //   fullSwipeSnapPosition - which edge the row has snapped to past threshold.
  const swipeItemRef = useRef<HTMLDivElement>(null)
  const swipeItemWidth = useRef(0)
  const swipeStartX = useRef(0)
  const swipeStartOffset = useRef(0)
  const fullSwipeSnapPosition = useRef<"left" | "right" | null>(null)

  // A `primary` action per side registers its activate handler here, so a full
  // swipe to that edge commits the right one without the consumer wiring the
  // commit twice.
  const primaryActivators = useRef<Partial<Record<SwipeSide, () => void>>>({})
  const registerPrimary = useCallback(
    (side: SwipeSide, activate: () => void) => {
      primaryActivators.current[side] = activate
      return () => {
        if (primaryActivators.current[side] === activate) {
          delete primaryActivators.current[side]
        }
      }
    },
    []
  )

  const swipeAmount = useMotionValue(0)
  const swipeAmountSpring = useSpring(swipeAmount, snap)
  const swipeProgress = useTransform(swipeAmount, (value) => {
    const width = swipeItemWidth.current
    if (!width) return 0
    return value / width
  })

  // Document-level swipe listeners, attached only while this row is swiping so
  // an N-row list does not run N idle handler sets.
  useEffect(() => {
    if (!isSwiping) return

    const handlePointerMove = (info: PointerEvent) => {
      const itemWidth = swipeItemWidth.current
      if (!itemWidth) return

      const swipeDelta =
        info.clientX - swipeStartX.current + swipeStartOffset.current
      const threshold = itemWidth * fullSwipeThreshold
      const isBeyondThreshold = Math.abs(swipeDelta) > threshold
      const isSwipingLeft = swipeDelta < 0

      // Already snapped to a side.
      if (fullSwipeSnapPosition.current) {
        const isSwipingBackToCentre = Math.abs(swipeDelta) < threshold
        if (isSwipingBackToCentre) {
          fullSwipeSnapPosition.current = null
          swipeAmount.set(swipeDelta)
        } else {
          swipeAmount.set(
            fullSwipeSnapPosition.current === "left" ? -itemWidth : itemWidth
          )
        }
        return
      }

      // Not yet snapped.
      if (isBeyondThreshold) {
        fullSwipeSnapPosition.current = isSwipingLeft ? "left" : "right"
        swipeAmount.set(isSwipingLeft ? -itemWidth : itemWidth)
      } else {
        swipeAmount.set(clamp(-itemWidth, itemWidth, swipeDelta))
      }
    }

    const handlePointerUp = () => {
      const itemWidth = swipeItemWidth.current
      if (!itemWidth) {
        setIsSwiping(false)
        return
      }

      const currentOffset = swipeAmount.get()
      const snapThreshold = itemWidth * revealThreshold
      let targetOffset = 0
      if (Math.abs(currentOffset) > snapThreshold) {
        targetOffset =
          currentOffset > 0
            ? itemWidth * revealAmount
            : itemWidth * -revealAmount
      }

      const committedSnap = fullSwipeSnapPosition.current
      if (committedSnap) {
        // Full swipe: commit the primary action on the revealed edge. Swiping
        // LEFT reveals the RIGHT actions (and vice versa), so the committed
        // side is the opposite of the snap direction. The row unmounts on
        // commit, so there is nothing to snap back - it exits swiped.
        const targetSide: SwipeSide = committedSnap === "left" ? "right" : "left"
        primaryActivators.current[targetSide]?.()
      } else {
        swipeAmount.set(targetOffset)
        setOpenId(targetOffset !== 0 ? id : null)
      }

      setIsSwiping(false)
      fullSwipeSnapPosition.current = null
    }

    document.addEventListener("pointermove", handlePointerMove)
    document.addEventListener("pointerup", handlePointerUp)
    return () => {
      document.removeEventListener("pointermove", handlePointerMove)
      document.removeEventListener("pointerup", handlePointerUp)
    }
  }, [
    isSwiping,
    swipeAmount,
    id,
    fullSwipeThreshold,
    revealThreshold,
    revealAmount,
    setOpenId,
  ])

  // Resize: re-measure the row and keep the offset proportional. Jump (not
  // set) so the correction is instant, with no spring easing.
  useEffect(() => {
    const handleResize = () => {
      const newWidth = swipeItemRef.current?.getBoundingClientRect().width
      if (!newWidth) return

      const currentProgress = swipeItemWidth.current
        ? swipeAmount.get() / swipeItemWidth.current
        : 0
      swipeItemWidth.current = newWidth
      const newOffset = currentProgress * newWidth
      swipeAmount.jump(newOffset)
      swipeAmountSpring.jump(newOffset)
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [swipeAmount, swipeAmountSpring])

  // Single-open coordination: when another row becomes the open one, snap this
  // row shut (unless it is mid-swipe).
  useEffect(() => {
    if (openId !== id && !isSwiping) {
      swipeAmount.set(0)
    }
  }, [openId, id, isSwiping, swipeAmount])

  const handlePointerDown = (event: React.PointerEvent<HTMLLIElement>) => {
    // A pointerdown on a revealed action button is a tap, not a swipe start.
    if ((event.target as HTMLElement).closest("button")) return
    setIsSwiping(true)
    swipeStartX.current = event.clientX
    swipeStartOffset.current = swipeAmount.get()
  }

  // Focus leaving the whole row closes it - the keyboard counterpart to
  // releasing a swipe with the row still open.
  const handleBlur = (event: React.FocusEvent<HTMLLIElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      swipeAmount.set(0)
      if (openId === id) setOpenId(null)
    }
  }

  // A revealed action gaining focus opens its side, so a keyboard user sees the
  // control they have landed on. "left" actions live on the swipe-right offset.
  const revealSide = useCallback(
    (side: SwipeSide) => {
      const width = swipeItemWidth.current
      if (!width) return
      const offset = (side === "left" ? 1 : -1) * width * revealAmount
      swipeAmount.set(offset)
      setOpenId(id)
    },
    [revealAmount, swipeAmount, setOpenId, id]
  )

  const closeRow = useCallback(() => {
    swipeAmount.set(0)
    setOpenId(null)
  }, [swipeAmount, setOpenId])

  const rowValue = useMemo<SwipeRowContextValue>(
    () => ({
      progress: swipeProgress,
      spring: snap,
      flat,
      fullSwipeThreshold,
      revealSide,
      closeRow,
      registerPrimary,
    }),
    [
      swipeProgress,
      snap,
      flat,
      fullSwipeThreshold,
      revealSide,
      closeRow,
      registerPrimary,
    ]
  )

  return (
    <SwipeRowContext.Provider value={rowValue}>
      <motion.li
        layout
        className={cx(
          "relative touch-pan-y overflow-hidden bg-card select-none",
          !isLast && "border-b border-border",
          className
        )}
        style={{ height: rowHeight }}
        initial={still ? false : { opacity: 0, transform: `translateY(${calm ? 0 : theme.travel.enter}px)` }}
        animate={{ opacity: 1, transform: "translateY(0px)" }}
        exit={{ opacity: 0 }}
        transition={{
          ...enter,
          delay: still || calm ? 0 : index * theme.stagger.tight,
        }}
        onPointerDown={handlePointerDown}
        onBlur={handleBlur}
      >
        {/* The row face: an opaque bg-card layer above the action groups
            (z-10), translated by the spring-smoothed swipe amount. */}
        <motion.div
          ref={swipeItemRef}
          className="absolute inset-0 z-10 flex items-center bg-card"
          style={{ x: swipeAmountSpring }}
        >
          {children}
        </motion.div>

        {left && (
          <ActionsGroup side="left" swipeAmount={swipeAmountSpring}>
            {left}
          </ActionsGroup>
        )}
        {right && (
          <ActionsGroup side="right" swipeAmount={swipeAmountSpring}>
            {right}
          </ActionsGroup>
        )}
      </motion.li>
    </SwipeRowContext.Provider>
  )
}

/**
 * ==============   Actions group (internal)   ================
 * One side's actions, positioned just off the corresponding edge (left actions
 * hang off the left via right-full, right actions off the right via left-full)
 * and translated by the same spring so they slide in as the face slides away.
 */
function ActionsGroup({
  swipeAmount,
  side,
  children,
}: {
  swipeAmount: MotionValue<number>
  side: SwipeSide
  children: ReactNode
}) {
  return (
    <motion.div
      className={`absolute flex h-full w-full select-none ${side === "right" ? "left-full" : "right-full"}`}
      style={{ x: swipeAmount }}
    >
      {children}
    </motion.div>
  )
}

/**
 * ==============   SwipeAction   ================
 */

export interface SwipeActionProps {
  /** The action glyph, e.g. a line-icon `<svg>`. Sized/coloured by you;
   *  `fillClassName`'s `text-*` colour flows through a `currentColor` icon. */
  icon: ReactNode
  /** The short action label, rendered under the icon. */
  label: string
  /** Which edge this action lives on - must match the slot (`left`/`right`) of
   *  `SwipeActions` it is passed to. */
  side: SwipeSide
  /** The outer action on its side: it slides to the edge as the swipe crosses
   *  and snaps to fill the row on a full swipe, and it is the one a full swipe
   *  commits. Exactly one action per side should be primary. Defaults to
   *  false. */
  primary?: boolean
  /** The fill + text classes for this action's box, e.g.
   *  `"bg-destructive text-destructive-foreground"`. Colour is a demo/consumer
   *  decision, never baked into the mechanic. */
  fillClassName: string
  /** The button's accessible label (the icon is decorative). */
  ariaLabel: string
  /** Fired when the action is tapped, and - for a `primary` action - when a
   *  full swipe commits its side. A secondary action snaps the row shut first;
   *  a primary action leaves the row as is (typically its consumer removes the
   *  row in response). */
  onActivate: () => void
}

/** A single revealed action. The icon + label spring through an elastic
 *  offset/scale as the swipe crosses the threshold; a secondary action fades
 *  out near full swipe so it never overlaps the primary, and the primary
 *  slides to the outer edge and snaps to fill. Reads the row's swipe state
 *  from the enclosing `SwipeActions`. */
export function SwipeAction({
  icon,
  label,
  side,
  primary = false,
  fillClassName,
  ariaLabel,
  onActivate,
}: SwipeActionProps) {
  const { progress, spring, flat, fullSwipeThreshold, revealSide, closeRow, registerPrimary } =
    useSwipeRowContext("SwipeAction")
  const ref = useRef<HTMLDivElement>(null)
  const actionWidth = useRef(0)

  // Measures the primary action's x offset so it lands as the outer box on its
  // side; secondary actions stay flush (return 0). At/over the full-swipe
  // threshold the primary snaps to 0 to fill the row.
  const calculateX = useCallback(
    (value: number) => {
      const width = actionWidth.current
      if (primary) {
        if (Math.abs(value) >= fullSwipeThreshold) return 0
        return ((value * width) / 2) * -1
      }
      return 0
    },
    [primary, fullSwipeThreshold]
  )

  const x = useSpring(0, spring)
  useMotionValueEvent(progress, "change", (value) => {
    x.set(calculateX(value))
  })

  useEffect(() => {
    const updateWidth = () => {
      const width = ref.current?.getBoundingClientRect().width
      if (!width) return
      actionWidth.current = width
      x.jump(calculateX(progress.get()))
    }
    updateWidth()
    window.addEventListener("resize", updateWidth)
    return () => window.removeEventListener("resize", updateWidth)
  }, [progress, x, calculateX])

  // Register a primary action so a full swipe to its edge commits it.
  useEffect(() => {
    if (!primary) return
    return registerPrimary(side, onActivate)
  }, [primary, side, registerPrimary, onActivate])

  // A secondary action is hidden at full swipe (finalStateOpacity 0) so it
  // does not overlap the primary; the primary stays at 1 throughout.
  const finalStateOpacity = primary ? 1 : 0
  const rawOpacity = useTransform(
    progress,
    [-1, -0.8, -0.5, -0.25, 0.25, 0.5, 0.8, 1],
    [finalStateOpacity, 1, 1, 0, 0, 1, 1, finalStateOpacity]
  )
  const contentOpacity = useSpring(rawOpacity, spring)

  const rawContentX = useTransform(
    progress,
    [-1, -0.8, -0.5, 0.5, 0.8, 1],
    [0, 16, 0, 0, -16, 0]
  )
  const contentX = useSpring(rawContentX, spring)

  const rawContentScale = useTransform(
    progress,
    [-1, -0.8, 0, 0.8, 1],
    [1, 0.8, 1, 0.8, 1]
  )
  const contentScale = useSpring(rawContentScale, spring)

  const handleClick = () => {
    // A secondary tap snaps the row shut; a primary leaves it (its consumer
    // typically removes the row).
    if (!primary) closeRow()
    onActivate()
  }

  return (
    <motion.div
      ref={ref}
      className={`absolute inset-0 flex ${fillClassName}`}
      style={{
        justifyContent: side === "right" ? "flex-start" : "flex-end",
        x,
      }}
    >
      <div className="flex h-full w-1/4 items-center justify-center">
        <motion.span
          className="block"
          style={{
            // Opacity fade rides along under reduced motion; the elastic
            // offset/scale (travel) is dropped when `flat`.
            opacity: contentOpacity,
            ...(flat
              ? {}
              : {
                  x: contentX,
                  scale: contentScale,
                  transformOrigin: side === "right" ? "right" : "left",
                }),
          }}
        >
          <button
            type="button"
            onClick={handleClick}
            onFocus={() => revealSide(side)}
            aria-label={ariaLabel}
            className={`flex flex-col items-center justify-center gap-1 rounded-sm ${FOCUS_RING}`}
          >
            {icon}
            <span className="text-[11px] font-medium">{label}</span>
          </button>
        </motion.span>
      </div>
    </motion.div>
  )
}
