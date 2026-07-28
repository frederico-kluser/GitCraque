/**
 * Confirmacao das acoes que nascem nos PAINEIS.
 *
 * O `DialogHost` de `@/dialogs` e dono das intencoes de DRAG-AND-DROP, cujo
 * `kind` e um union fechado em `types/git.ts` (cherry-pick | merge | rebase |
 * reset | tag-move | delete-branch | invalid). Push, squash, remocao de
 * worktree, drop de stash e afins nao cabem nesse tipo, entao o rail e a
 * toolbar passam por aqui. Quando `@/dialogs` exportar dialogos nomeados para
 * essas acoes, este host vira uma casca fina em cima deles.
 *
 * CASCATA: a mecanica de overlay vem inteira do catalogo — `useFocusTrap`,
 * `useScrollLock` e `Backdrop` do `overlay`, `HoldToConfirmButton` para o
 * destrutivo, `MultiStateButton` para o estado do botao. O que faltou no
 * catalogo, e por isso esta escrito aqui, sao os CONTROLES DE FORMULARIO
 * (campo de texto, textarea, alternador e seletor): o Motion UI nao instala
 * nenhum.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, TriangleAlert, X } from "lucide-react";
import { Backdrop, useFocusTrap, useScrollLock } from "@/components/motion-ui/overlay";
import { HoldToConfirmButton } from "@/components/motion-ui/hold-to-confirm";
import { MultiStateButton } from "@/components/motion-ui/multi-state-button";
import { useMotionUITransition } from "@/components/motion-ui/ui-theme";
import { closeConfirm, selectConfirm, useShellState } from "@/hooks";
import type { ConfirmAction, ConfirmField } from "@/hooks";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { FOCUS_RING, SectionLabel, ToolButton } from "@/panels/parts";

/* ------------------------------------------------------------------ */
/* Controles de formulario (o que faltou no catalogo)                  */
/* ------------------------------------------------------------------ */

const INPUT_CLASS = cn(
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground",
  "placeholder:text-muted-foreground",
  FOCUS_RING,
);

function Field({
  field,
  value,
  onChange,
}: {
  field: ConfirmField;
  value: string;
  onChange: (next: string) => void;
}) {
  const id = useId();

  if (field.kind === "toggle") {
    const on = value === "true";
    return (
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 py-0.5">
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => onChange(on ? "false" : "true")}
          className={cn(
            "mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
            "duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
            on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background",
            FOCUS_RING,
          )}
        >
          {on && <Check className="size-3" />}
        </button>
        <span className="min-w-0">
          <span className="block font-mono text-[11px] text-foreground">{field.label}</span>
          {field.hint && <span className="block text-[11px] text-muted-foreground">{field.hint}</span>}
        </span>
      </label>
    );
  }

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block">
        <SectionLabel>{field.label}</SectionLabel>
      </label>
      {field.kind === "text" && (
        <input
          id={id}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT_CLASS}
        />
      )}
      {field.kind === "textarea" && (
        <textarea
          id={id}
          value={value}
          rows={3}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(INPUT_CLASS, "resize-y font-mono leading-relaxed")}
        />
      )}
      {field.kind === "select" && (
        <div className="relative">
          <select
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn(INPUT_CLASS, "appearance-none pr-7")}
          >
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

const initialValues = (fields: ConfirmField[] | undefined): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const f of fields ?? []) {
    values[f.name] = f.kind === "toggle" ? String(f.value ?? false) : String(f.value ?? "");
  }
  return values;
};

/* ------------------------------------------------------------------ */
/* O host                                                              */
/* ------------------------------------------------------------------ */

export function ConfirmHost() {
  const action = useShellState(selectConfirm);
  return (
    <AnimatePresence>{action && <ConfirmDialog key={action.id} action={action} />}</AnimatePresence>
  );
}

type RunState = "idle" | "running" | "ok" | "error";

function ConfirmDialog({ action }: { action: ConfirmAction }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState(() => initialValues(action.fields));
  const [runState, setRunState] = useState<RunState>("idle");
  const enter = useMotionUITransition("ui");
  const titleId = useId();

  useScrollLock(true);
  useFocusTrap({ active: runState !== "running", container: panelRef, onEscape: closeConfirm });

  const missing = useMemo(
    () => (action.fields ?? []).some((f) => f.kind === "text" && f.required && !values[f.name]?.trim()),
    [action.fields, values],
  );

  // Fecha sozinho quando a operacao termina bem; erro fica na tela com o toast.
  useEffect(() => {
    if (runState !== "ok") return;
    const t = setTimeout(closeConfirm, 420);
    return () => clearTimeout(t);
  }, [runState]);

  const execute = () => {
    if (runState === "running" || missing) return;
    setRunState("running");
    void action
      .run(values)
      .then(() => setRunState("ok"))
      .catch(() => setRunState("error"));
  };

  const buttonState: Record<RunState, { label: string; surface: string }> = {
    idle: { label: action.confirmLabel, surface: "bg-primary text-primary-foreground" },
    running: { label: t("common.running"), surface: "bg-primary/70 text-primary-foreground" },
    ok: { label: t("common.done"), surface: "bg-success text-success-foreground" },
    error: { label: t("common.failed"), surface: "bg-destructive text-destructive-foreground" },
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <Backdrop
        className="bg-[color-mix(in_srgb,var(--background)_70%,transparent)]"
        onClick={runState === "running" ? undefined : closeConfirm}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ ...enter }}
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, transform: "translateY(12px) scale(0.98)" }}
        animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
        exit={{ opacity: 0, transform: "translateY(8px) scale(0.99)" }}
        transition={{ ...enter }}
        className="relative z-10 flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-2xl"
      >
        <header className="flex items-start gap-3">
          {action.destructive && (
            <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-destructive/12 text-destructive">
              <TriangleAlert className="size-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-heading text-sm font-semibold text-foreground">
              {action.title}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{action.description}</p>
          </div>
          <ToolButton
            tone="ghost"
            size="sm"
            aria-label={t("confirm.close")}
            icon={<X className="size-3.5" />}
            onClick={closeConfirm}
          />
        </header>

        {/* O argv exato, antes de rodar: o produto inteiro se apoia em "voce ve o comando". */}
        <pre className="overflow-x-auto rounded-md border border-border bg-surface-inset px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {action.preview.join(" ")}
        </pre>

        {action.fields && action.fields.length > 0 && (
          <div className="flex flex-col gap-3">
            {action.fields.map((field) => (
              <Field
                key={field.name}
                field={field}
                value={values[field.name] ?? ""}
                onChange={(next) => setValues((v) => ({ ...v, [field.name]: next }))}
              />
            ))}
          </div>
        )}

        <footer className="flex items-center justify-end gap-2 pt-1">
          <ToolButton tone="ghost" onClick={closeConfirm} disabled={runState === "running"}>
            {t("common.cancel")}
          </ToolButton>

          {action.destructive ? (
            <HoldToConfirmButton
              holdSeconds={1.4}
              onConfirm={execute}
              className={cn(
                "rounded-md bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground",
                missing && "pointer-events-none opacity-50",
              )}
            >
              {runState === "running"
                ? t("common.running")
                : t("common.holdTo", { action: action.confirmLabel.toLowerCase() })}
            </HoldToConfirmButton>
          ) : (
            <MultiStateButton
              state={runState}
              onClick={execute}
              disabled={runState === "running" || missing}
              feedback={runState === "error" ? "shake" : runState === "ok" ? "pop" : "none"}
              surfaceClassName={buttonState[runState].surface}
              pillClassName="rounded-md px-4 py-2 text-xs font-medium"
              announce={buttonState[runState].label}
              aria-label={action.confirmLabel}
            >
              {buttonState[runState].label}
            </MultiStateButton>
          )}
        </footer>
      </motion.div>
    </div>,
    document.body,
  );
}
