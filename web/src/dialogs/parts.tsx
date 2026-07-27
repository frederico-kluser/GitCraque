/**
 * Pecas compartilhadas por todos os dialogos.
 *
 * `DialogShell` e a base obrigatoria: `Backdrop` + `useFocusTrap` +
 * `useScrollLock` do Motion UI (nunca focus trap escrito a mao), Escape fecha,
 * Enter confirma quando a acao nao e destrutiva, e o foco volta sozinho para
 * quem abriu (o `restoreFocus` do `useFocusTrap`).
 *
 * O catalogo Motion UI nao tem controles de formulario (campo, checkbox,
 * select), entao `TextField`, `CheckboxField` e `SelectField` sao codigo novo
 * sobre elementos nativos — que e o que mantem o `useFocusTrap` do overlay
 * previsivel: um elemento focavel por controle, sem input escondido ao lado.
 */
import { AnimatePresence, motion } from "motion/react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { CopyButton } from "@/components/motion-ui/copy-button";
import { Backdrop, useFocusTrap, useScrollLock } from "@/components/motion-ui/overlay";
import {
  useMotionUITheme,
  useMotionUITransition,
} from "@/components/motion-ui/ui-theme";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Base                                                                */
/* ------------------------------------------------------------------ */

const SIZE_CLASS = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
} as const;

export interface DialogShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** tinge o titulo quando a operacao e destrutiva */
  tone?: "default" | "destructive";
  /** Enter confirma. Nao passe em dialogo destrutivo — la o hold e obrigatorio. */
  onEnter?: () => void;
  size?: keyof typeof SIZE_CLASS;
  children?: ReactNode;
  footer?: ReactNode;
}

export function DialogShell({
  open,
  onClose,
  title,
  description,
  tone = "default",
  onEnter,
  size = "md",
  children,
  footer,
}: DialogShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const ui = useMotionUITransition("ui");
  const { motionMode, travel } = useMotionUITheme();
  const full = motionMode === "full";
  const still = motionMode === "off";
  const titleId = useId();
  const descId = useId();

  useFocusTrap({ active: open, container: panelRef, onEscape: onClose });
  useScrollLock(open);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onEnter || event.key !== "Enter" || event.shiftKey) return;
    const target = event.target as HTMLElement | null;
    // Botoes, links, textareas e selects tratam Enter por conta propria.
    const tag = target?.tagName;
    if (tag === "TEXTAREA" || tag === "BUTTON" || tag === "A" || tag === "SELECT") return;
    event.preventDefault();
    onEnter();
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="dialog"
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ ...ui }}
          className="fixed inset-0 z-50 grid place-items-center p-4"
        >
          <Backdrop opacity={0.55} onClick={onClose} />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            onKeyDown={handleKeyDown}
            initial={still ? false : full ? { scale: 0.97, y: travel.enter / 2 } : false}
            animate={full ? { scale: 1, y: 0 } : {}}
            exit={full ? { scale: 0.98, opacity: 0 } : { opacity: 0 }}
            transition={{ ...ui }}
            className={cn(
              "relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl",
              SIZE_CLASS[size],
            )}
          >
            <header className="border-b border-border px-5 py-4">
              <h2
                id={titleId}
                className={cn(
                  "font-heading text-base font-semibold",
                  tone === "destructive" && "text-destructive",
                )}
              >
                {title}
              </h2>
              {description ? (
                <p id={descId} className="mt-1 text-sm text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>

            {footer ? (
              <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-inset px-5 py-3">
                {footer}
              </footer>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Mantem o ultimo valor nao nulo enquanto o dialogo sai de cena, para a
 * animacao de saida ter o que renderizar depois do estado ja ter zerado.
 */
export function useLingering<T>(value: T | null): T | null {
  const [kept, setKept] = useState<T | null>(value);
  useEffect(() => {
    if (value !== null) setKept(value);
  }, [value]);
  return value ?? kept;
}

/* ------------------------------------------------------------------ */
/* O comando cru — todo dialogo que executa algo mostra isto           */
/* ------------------------------------------------------------------ */

export function CommandPreview({
  argv,
  label = "Comando",
  className,
}: {
  argv: string[];
  label?: string;
  className?: string;
}) {
  const text = `git ${argv.join(" ")}`;
  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-surface-inset", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">{label}</span>
        <CopyButton
          value={text}
          variant="icon"
          label="Copiar comando"
          copiedLabel="Comando copiado"
          className="h-7 w-7"
        />
      </div>
      <pre className="overflow-x-auto px-3 py-2">
        <code className="font-mono text-xs text-foreground">{text}</code>
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Formulario                                                          */
/* ------------------------------------------------------------------ */

const CONTROL_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  type = "text",
  autoFocus,
  mono,
  autoComplete,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  error?: string;
  type?: "text" | "password";
  autoFocus?: boolean;
  mono?: boolean;
  autoComplete?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        className={cn(CONTROL_CLASS, mono && "font-mono")}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 3,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  rows?: number;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <textarea
        id={id}
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        className={cn(CONTROL_CLASS, "resize-y font-mono")}
      />
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        className={CONTROL_CLASS}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 rounded border-input accent-[var(--primary)] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      />
      <label htmlFor={id} className="text-sm text-foreground">
        {label}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Botoes e avisos                                                     */
/* ------------------------------------------------------------------ */

const BUTTON_VARIANT = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary: "border border-border bg-secondary text-secondary-foreground hover:bg-accent",
  ghost: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
} as const;

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  type = "button",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: keyof typeof BUTTON_VARIANT;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        BUTTON_VARIANT[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

const CALLOUT_TONE = {
  warning: "border-warning/50 bg-warning/10 text-foreground",
  danger: "border-destructive/50 bg-destructive/10 text-foreground",
  info: "border-border bg-surface-inset text-muted-foreground",
} as const;

export function Callout({
  tone = "info",
  children,
}: {
  tone?: keyof typeof CALLOUT_TONE;
  children: ReactNode;
}) {
  return (
    <p className={cn("rounded-md border px-3 py-2 text-xs leading-relaxed", CALLOUT_TONE[tone])}>
      {children}
    </p>
  );
}

/** Chip de referencia (ramo, tag, hash) no corpo dos dialogos. */
export function RefChip({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-border bg-surface-inset px-1.5 py-0.5 text-xs text-foreground",
        mono && "font-mono",
      )}
    >
      {children}
    </span>
  );
}

/** Texto de apoio do hold-to-confirm, referenciado por aria-describedby. */
export function HoldHint({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <p id={id} className="text-xs text-muted-foreground">
      {children ?? "Segure o botao para confirmar. Solte antes do fim para cancelar."}
    </p>
  );
}
