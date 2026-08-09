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
import { AnimatePresence, motion, useMotionValue } from "motion/react";
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
import { selectIsMobile, useViewportValue } from "@/hooks";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Base                                                                */
/* ------------------------------------------------------------------ */

/**
 * Os tres tamanhos SO existem a partir de 768px (`md:`). Abaixo disso o dialogo
 * vira bottom sheet e ocupa a largura inteira, entao um `max-w` ali seria
 * exatamente o padrao errado que estamos corrigindo.
 */
const SIZE_CLASS = {
  sm: "md:max-w-md",
  md: "md:max-w-xl",
  lg: "md:max-w-3xl",
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

  /*
   * Gesto de arrastar para fechar do bottom sheet. `drag` so existe abaixo de
   * 768px — onde o puxador aparece — e nunca no corpo rolavel: so o puxador e
   * o cabecalho arrastam, o scroll da lista fica intacto.
   */
  const isMobile = useViewportValue(selectIsMobile);
  const dragY = useMotionValue(0);

  // Reabriu (ou o mesmo painel ficou montado apos uma saida cancelada):
  // o arrasto volta a zero, senao o sheet reabriria deslocado.
  useEffect(() => {
    if (open) dragY.set(0);
  }, [open, dragY]);

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
          /*
           * Abaixo de 768px o dialogo e ancorado EMBAIXO e cola nas bordas;
           * de 768px para cima e o centralizado de sempre. As duas media
           * queries sao mutuamente exclusivas, entao nenhuma das duas geometrias
           * depende de ordem na cascata para vencer a outra.
           *
           * `pl-safe-left`/`pr-safe-right` valem 0px em qualquer tela sem
           * recorte; existem para o celular deitado, onde o notch invadiria a
           * lateral do sheet.
           */
          className={cn(
            "fixed inset-0 z-50 grid",
            "md:place-items-center md:p-4",
            "max-md:items-end max-md:justify-items-stretch max-md:p-0",
            "max-md:pl-safe-left max-md:pr-safe-right",
          )}
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
              "relative z-10 flex w-full flex-col overflow-hidden border border-border bg-card text-card-foreground shadow-xl",
              /*
               * `dvh` e nao `vh`: no navegador movel `vh` mede a viewport COM a
               * barra de endereco, entao com ela retraida o dialogo passava da
               * area visivel. `dvh` mede o que esta visivel AGORA.
               */
              "max-h-[85dvh]",
              /*
               * Bottom sheet abaixo de 768px: so os cantos de cima arredondados,
               * e `pb-safe-bottom` para o rodape nao ficar embaixo da barra de
               * gestos. Acima de 768px, o cartao arredondado de sempre.
               */
              "md:rounded-lg",
              "max-md:rounded-t-2xl max-md:rounded-b-none max-md:pb-safe-bottom",
              SIZE_CLASS[size],
            )}
          >
            {/*
             * Puxador + cabecalho: a zona de arrasto do bottom sheet. So estes
             * dois arrastam (`drag="y"`), nunca o corpo — o corpo e um irmao
             * rolavel e o gesto nao rouba o scroll dele. `dragConstraints` com
             * `top: 0` impede que o sheet suba; `dragElastic: 0.1` da a
             * resistencia na borda de cima; `dragSnapToOrigin` devolve o sheet
             * ao lugar quando o arrasto nao chega ao limite.
             *
             * Acima de 768px nao ha sheet nem puxador (`md:hidden`), e o
             * dialogo volta ao cartao centralizado: `drag` fica desligado.
             */}
            <motion.div
              style={{ y: dragY }}
              drag={isMobile ? "y" : false}
              dragConstraints={{ top: 0 }}
              dragElastic={0.1}
              dragSnapToOrigin
              onDragEnd={(_event, info) => {
                // Fecha arrastando 30% da altura do sheet OU num puxao para
                // baixo a mais de 500px/s — os dois numeros de produto.
                const height = panelRef.current?.getBoundingClientRect().height ?? 0;
                if (info.offset.y > height * 0.3 || info.velocity.y > 500) onClose();
              }}
              className="shrink-0"
            >
              <div
                role="img"
                aria-label={t("touch.grabber.label")}
                className="flex shrink-0 justify-center pt-2 pb-1 md:hidden"
              >
                <span className="h-1 w-9 rounded-full bg-border" />
              </div>

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
            </motion.div>

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
  label,
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
        <span className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">
          {label ?? t("common.command")}
        </span>
        <CopyButton
          value={text}
          variant="icon"
          label={t("common.copyCommand")}
          copiedLabel={t("common.commandCopied")}
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

/**
 * Base de `TextField`, `TextAreaField` e `SelectField`.
 *
 * No toque a caixa cresce ate 44px pela altura minima — campo e alvo largo, o
 * aperto e so vertical, e um `::after` esticado sobre um `<input>` roubaria o
 * clique que posiciona o cursor no texto. No ponteiro fino continua o mesmo
 * `py-2` de sempre (~38px). No `textarea` o minimo e inofensivo: com `rows=3`
 * ele ja passa de 44px.
 */
const CONTROL_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 touch:min-h-tap touch:py-2.5";

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
        /*
         * A caixa so cresce de 16 para 20px no toque: o alvo de verdade e o
         * `<label htmlFor>` ao lado, que ja alterna o campo e ocupa a linha
         * inteira. `::after` esticado nao serve — elemento substituido nao gera
         * pseudo-elemento — e 44px de caixa deixariam o quadradinho maior que o
         * texto que ele rotula.
         */
        className="mt-0.5 size-4 shrink-0 rounded border-input accent-[var(--primary)] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 touch:size-5"
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
        /*
         * Caixa real de 44px no toque (o `min-h` vence o `h-9`), nunca area
         * invisivel: os botoes do rodape de um dialogo vivem lado a lado com
         * `gap-2`, e dois `::after` de 44px em vizinhos se cobririam. O `px-5`
         * so aumenta a folga horizontal entre os rotulos.
         */
        "touch:min-h-tap touch:min-w-tap touch:px-5",
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
      {children ?? t("common.holdToConfirm")}
    </p>
  );
}
