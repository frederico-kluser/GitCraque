"use client"

import { motion, useInView } from "motion/react"
import { Typewriter } from "motion-plus/react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { useMotionUITheme, useMotionUITransition } from "@/components/motion-ui/ui-theme"

/**
 * ==============   Motion mode   ================
 */

/* Theme reduced-motion strategy: "off" (still) and "calm" both skip the typing
 * simulation and print the whole session at once (`disabled`); "calm"
 * additionally keeps the output-line opacity fade but drops its travel; full
 * motion types the session out line by line. defaultTheme ships "calm". Works
 * with no provider mounted (falls back to defaultTheme), so the session is
 * safe standalone. */

/**
 * ==============   Line model   ================
 */

/** How an output line is toned. No shadcn token names "terminal success
 *  green", so this borrows the kit's brightness-carries-direction convention
 *  instead of inventing a hue: `"success"` reads the brightest, most legible
 *  ink (`text-foreground`) so it visually outranks the merely informational
 *  `"muted"` lines, and `"accent"` spends the brand slot (`text-primary`) on a
 *  session's own headline moment. */
export type TerminalLineTone = "muted" | "success" | "accent"

/** One line of a terminal session: a typed `command` (drawn with a leading
 *  `$` prompt), or an `output` line the process prints back, optionally
 *  toned. Content, not feel - author the real session here. */
export type TerminalLine =
  | { kind: "command"; text: string }
  | { kind: "output"; text: string; tone?: TerminalLineTone }

/** Maps an output-line tone to its shadcn text utility. Internal - the tone
 *  vocabulary is the API, the class is an implementation detail. */
const TONE_CLASS: Record<TerminalLineTone, string> = {
  muted: "text-muted-foreground",
  success: "text-foreground",
  accent: "text-primary",
}

/** The motion-plus `Typewriter`'s typing cursor: a 2px brand-coloured bar, so
 *  the caret that moves with the characters matches the idle resting caret. */
const CARET_STYLE: CSSProperties = {
  background: "var(--primary)",
  width: 2,
}

/** The idle resting caret shown at the prompt once the session finishes: a
 *  decorative (`aria-hidden`) brand bar whose blink is compositor-only opacity,
 *  gated on viewport presence (an off-screen caret never burns a frame) and
 *  held solid under reduced motion. A hard on/off (via `times`) reads as a
 *  terminal caret rather than a soft pulse. */
function IdleCaret({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref)
  const { motionMode } = useMotionUITheme()
  const ambient = useMotionUITransition("ambient")
  const running = inView && motionMode === "full"
  return (
    <motion.span
      ref={ref}
      aria-hidden="true"
      className={`inline-block bg-primary${className ? ` ${className}` : ""}`}
      style={{ willChange: running ? "opacity" : "auto" }}
      animate={running ? { opacity: [1, 1, 0, 0] } : { opacity: 1 }}
      transition={
        running
          ? {
              duration: ambient.duration * 2.2,
              times: [0, 0.5, 0.5, 1],
              ease: "linear",
              repeat: Infinity,
            }
          : { duration: 0 }
      }
    />
  )
}

/**
 * ==============   useTerminalSession   ================
 */

/** Tuning for `useTerminalSession`. */
export interface UseTerminalSessionOptions {
  /** Milliseconds to wait before the first line starts typing. */
  startDelayMs: number
  /** Milliseconds an output line rests after it fades in before the session
   *  advances to the next line. */
  outputDelayMs: number
  /** Skip the simulation and reveal the whole session at once (the
   *  reduced-motion path). */
  disabled: boolean
}

/** Result of `useTerminalSession`: which line is currently animating, the
 *  callback a line fires when it finishes so the next one starts, and whether
 *  the whole session has played out. */
export interface TerminalSessionState {
  /** Index of the line currently being revealed; `-1` before the first line
   *  starts, `count` once every line is shown. */
  active: number
  /** Fire when the active line finishes to schedule the next one (command
   *  lines call it on their Typewriter's completion, output lines on a short
   *  timeout after they fade in). */
  advance: () => void
  /** `true` once every line has been revealed. */
  done: boolean
}

/**
 * The headless session controller. Reveals one line at a time: `active` is the
 * index currently animating; a command line advances on its Typewriter's
 * completion, an output line on a finite timeout after it fades in. A single
 * `setTimeout` chain, never a render loop, fully cleared on unmount. When
 * `disabled`, the whole session is shown immediately.
 */
export function useTerminalSession(
  count: number,
  { startDelayMs, outputDelayMs, disabled }: UseTerminalSessionOptions
): TerminalSessionState {
  const [active, setActive] = useState(disabled ? count : -1)
  const advRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    if (disabled) {
      setActive(count)
      return
    }
    setActive(-1)
    const start = setTimeout(() => setActive(0), startDelayMs)
    return () => {
      clearTimeout(start)
      clearTimeout(advRef.current!)
    }
  }, [count, startDelayMs, disabled])

  const advance = useCallback(() => {
    clearTimeout(advRef.current!)
    advRef.current = setTimeout(() => setActive((a) => a + 1), outputDelayMs)
  }, [outputDelayMs])

  return { active, advance, done: active >= count }
}

/**
 * ==============   TerminalSession   ================
 */

export interface TerminalSessionProps {
  /** The session to play, top to bottom. Content, not feel. */
  lines: TerminalLine[]
  /** Base milliseconds per keystroke for command lines. Lower is faster.
   *  Defaults to `55`. */
  typingSpeedMs?: number
  /** Milliseconds before the first line starts typing. Defaults to `400`. */
  startDelayMs?: number
  /** Milliseconds an output line rests after fading in before the session
   *  advances. Defaults to `520`. */
  outputDelayMs?: number
  /** The lead-in for the `sr-only` spoken transcript, read as
   *  `"{label}: {full transcript}"`. Content - name your session. Defaults to
   *  `"Terminal session"`. */
  label?: string
  /** Merged onto the scrolling body wrapper. */
  className?: string
}

/** The height-stable typing terminal body: drives `useTerminalSession`,
 *  reserves the final session height from mount via an invisible full-session
 *  sizer, types the command lines and fades the output lines in over it, rests
 *  an idle caret at the prompt when finished, and exposes an `sr-only` spoken
 *  transcript for assistive tech (the visible transcript is `aria-hidden`).
 *  Handles all three reduced-motion tiers itself. Compose it inside your own
 *  window chrome (e.g. `BrowserWindow` + `BrowserChromeBar`). */
export function TerminalSession({
  lines,
  typingSpeedMs = 55,
  startDelayMs = 400,
  outputDelayMs = 520,
  label = "Terminal session",
  className,
}: TerminalSessionProps) {
  const { motionMode } = useMotionUITheme()
  const calm = motionMode === "calm"
  const disabled = motionMode !== "full"
  const session = useTerminalSession(lines.length, {
    startDelayMs,
    outputDelayMs,
    disabled,
  })

  const transcript = lines
    .map((l) => (l.kind === "command" ? `$ ${l.text}` : l.text))
    .join(". ")

  return (
    <div className={`overflow-x-auto px-4 py-4${className ? ` ${className}` : ""}`}>
      <div className="grid w-max min-w-full">
        {/* Sizer: the complete session at its final size, invisible - it
            contributes layout so the body starts at its finished height and
            never grows as lines type in, but paints no ink. Derived from the
            session data itself, so it stays correct if the content changes. */}
        <div
          className="invisible col-start-1 row-start-1 w-max font-mono text-[0.8125rem] leading-[1.9] tabular-nums"
          aria-hidden="true"
        >
          {lines.map((line, i) => (
            <div key={i} className="flex items-baseline gap-2">
              {line.kind === "command" && (
                <span className="shrink-0 select-none">$</span>
              )}
              <span>{line.text}</span>
            </div>
          ))}
          {/* The resting prompt the live view shows once the session is done. */}
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 select-none">$</span>
            <span className="inline-block h-[1.1em] w-[2px]" />
          </div>
        </div>

        {/* Live transcript: overlays the sizer in the same grid cell. */}
        <div
          className="col-start-1 row-start-1 w-max font-mono text-[0.8125rem] leading-[1.9] tabular-nums"
          aria-hidden="true"
        >
          {lines.map((line, i) => {
            if (i > session.active) return null
            const isActive = i === session.active && !disabled
            if (line.kind === "command") {
              return (
                <div key={i} className="flex items-baseline gap-2">
                  <span className="shrink-0 select-none text-primary">$</span>
                  {isActive ? (
                    <Typewriter
                      as="span"
                      className="text-foreground"
                      speed={typingSpeedMs}
                      cursorBlinkRepeat={2}
                      cursorStyle={CARET_STYLE}
                      onComplete={session.advance}
                    >
                      {line.text}
                    </Typewriter>
                  ) : (
                    <span className="text-foreground">{line.text}</span>
                  )}
                </div>
              )
            }
            return (
              <OutputLine
                key={i}
                text={line.text}
                className={TONE_CLASS[line.tone ?? "muted"]}
                calm={calm}
                disabled={disabled}
                onReveal={isActive ? session.advance : undefined}
              />
            )
          })}

          {/* Resting prompt with an idle blinking caret once the session
              finishes. IdleCaret holds solid under reduced motion and
              off-screen; it blinks only when allowed. */}
          {session.done && (
            <div className="flex items-baseline gap-2">
              <span className="shrink-0 select-none text-primary">$</span>
              <IdleCaret className="h-[1.1em] w-[2px] shrink-0 self-center" />
            </div>
          )}
        </div>
      </div>
      <p className="sr-only">
        {label}: {transcript}
      </p>
    </div>
  )
}

/**
 * ==============   OutputLine   ================
 * Fades in on opacity with a short compositor-only rise (no layout). Once
 * revealed it asks the session to advance. Under `calm` the rise is dropped;
 * under `disabled` it mounts with no animation (the parent still renders it,
 * just statically). Private to the session body.
 */
function OutputLine({
  text,
  className,
  calm,
  disabled,
  onReveal,
}: {
  text: string
  className: string
  calm: boolean
  disabled: boolean
  onReveal?: () => void
}) {
  const uiTheme = useMotionUITheme()
  const uiTransition = useMotionUITransition("ui")

  useEffect(() => {
    onReveal?.()
    // Only fire once, when this line first becomes the active one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      className={className}
      initial={
        disabled ? false : { opacity: 0, transform: `translateY(${calm ? 0 : uiTheme.travel.hover}px)` }
      }
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ ...uiTransition }}
    >
      {text}
    </motion.div>
  )
}
