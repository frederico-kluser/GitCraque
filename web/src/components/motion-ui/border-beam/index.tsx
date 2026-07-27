"use client"

import { motion, useInView } from "motion/react"
import { useRef, type CSSProperties, type ReactNode } from "react"
import { useMotionUITheme } from "@/components/motion-ui/ui-theme"

/**
 * ==============   Constants   ================
 */

// Ring mask: a full-box white layer XOR'd with a content-box white layer, so
// only the padding band (of width `thickness`) survives - the classic
// mask-composite border cut-out. Because `mask-clip` resolves against the
// ring's border/content boxes, giving the element a `border-radius` rounds
// BOTH the outer and inner edges of the rim to the panel's own corners, with
// no per-corner geometry to tune. Geometry of the mechanic, not a prop.
const RING_MASK = "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)"

/* Theme reduced-motion strategy: an infinite perimeter lap is motion, so BOTH
 * "off" (mount nothing moving) and "calm" (keep fades, drop travel) hold the
 * panel at its resting border and render no beam. Works with no provider
 * mounted (falls back to defaultTheme), so the wrapper is safe standalone. */

/** The spinning conic fill: transparent for most of the turn, then a tail that
 *  fades up through a mid `color-mix` to a bright `--primary` head at the
 *  360deg/0deg seam (the hard seam is the crisp leading edge). `size` sets how
 *  much of the turn the lit arc spans, so a longer arc reads as a longer comet
 *  tail. Derived inline off `--primary`, mixed in srgb so the fade to
 *  transparent stays hue-stable - the active theme decides what `--primary`
 *  resolves to. */
function beamGradient(size: number) {
  const tailStart = Math.max(0, 360 - size)
  const mid = tailStart + (360 - tailStart) * 0.65
  return (
    "conic-gradient(from 0deg at 50% 50%, " +
    "transparent 0deg, " +
    `transparent ${tailStart}deg, ` +
    `color-mix(in srgb, var(--primary) 55%, transparent) ${mid.toFixed(1)}deg, ` +
    "var(--primary) 360deg)"
  )
}

export interface BorderBeamProps {
  /** Angular length of the lit streak, in degrees of the lap. A longer arc
   *  reads as a longer comet tail. Defaults to `120`. */
  size?: number
  /** Seconds for one full lap of the border. Smaller is faster. Defaults to
   *  `6`. */
  duration?: number
  /** Thickness of the rim, in px. Defaults to `3`. */
  thickness?: number
  /** Phase offset in seconds, so stacked beams travel out of sync. Pass a
   *  different delay per beam (e.g. `-(duration / 3) * i`) to spread three
   *  cards permanently out of phase. Defaults to `0`. */
  delay?: number
  /** Your enable gate: run the beam when `true`, hold the resting border when
   *  `false` (e.g. "this card is featured"). The beam additionally, and
   *  independently, does not render under `prefers-reduced-motion` and settles
   *  while scrolled off-screen, so you never fold those in yourself. Defaults
   *  to `true`. */
  active?: boolean
  /** Merged onto the wrapping element. */
  className?: string
  /** The panel the beam traces - your card, tile or pricing panel. */
  children: ReactNode
}

/**
 * The reusable wrapper. Renders its child panel, then an aria-hidden ring
 * clipped to the same rounded rect through which the beam shows. The ring is a
 * `thickness`-wide rim carved from a rounded rectangle with the
 * `mask-composite` border trick, and inside it a single oversized square
 * carries the `conic-gradient` and spins about the panel's centre. The mask
 * reveals only the rim, so the eye tracks a bright arc chasing the border.
 *
 * The spinning square is sized well past the panel (`inset` a large negative)
 * so its conic fill covers every corner of a portrait OR landscape card
 * through the whole turn; the rim mask (and `overflow-hidden`) trim the
 * overshoot to the panel's real rounded shape. Rotation is a literal
 * `transform: rotate()` string - compositor-only, no per-frame paint, no
 * measurement.
 */
export function BorderBeam({
  size = 120,
  duration = 6,
  thickness = 3,
  delay = 0,
  active = true,
  className,
  children,
}: BorderBeamProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const { motionMode } = useMotionUITheme()
  const motionAllowed = motionMode === "full"
  // Gate the infinite lap on visibility: the beam only spins while its ring is
  // on-screen, so a card mounted off-screen in a gallery/showcase never runs a
  // perpetual compositor loop. When it scrolls away the loop stops and the
  // fill settles rather than animating unseen.
  const inView = useInView(trackRef)
  // The beam renders only when the consumer wants it AND motion is allowed;
  // under reduced motion the panel simply keeps its resting border.
  const enabled = active && motionAllowed
  const running = enabled && inView

  return (
    <div className={`relative${className ? ` ${className}` : ""}`}>
      {children}
      <div
        ref={trackRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
        style={
          {
            padding: thickness,
            WebkitMask: RING_MASK,
            WebkitMaskComposite: "xor",
            mask: RING_MASK,
            maskComposite: "exclude",
          } as CSSProperties
        }
      >
        {enabled && (
          <motion.span
            className="absolute inset-[-75%] block"
            style={{ background: beamGradient(size) }}
            initial={{ transform: "rotate(0deg)" }}
            animate={{
              transform: running
                ? ["rotate(0deg)", "rotate(360deg)"]
                : "rotate(0deg)",
            }}
            transition={
              running
                ? { duration, delay, repeat: Infinity, ease: "linear" }
                : { duration: 0 }
            }
          />
        )}
      </div>
    </div>
  )
}
