/**
 * Fila de toasts: o `ToastStack` do Motion UI alimentado por `s.toasts`.
 *
 * O toast de erro carrega o argv do comando que falhou, escrito na cara e
 * copiavel — nao ha console na interface para onde mandar o usuario. O buffer
 * `state.console` continua existindo como trilha de auditoria, so nao tem tela.
 */
import { useEffect, useRef } from "react";
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import { Confetti, type ConfettiHandle } from "@/components/motion-ui/confetti";
import { CopyButton } from "@/components/motion-ui/copy-button";
import { Toast, ToastStack, useToast } from "@/components/motion-ui/toast-stack";
import { useLayoutMode } from "@/hooks";
import { dismissToast, useAppState, type AppToast, type ToastTone } from "@/state/store";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

const TONE: Record<ToastTone, { icon: typeof Info; className: string; accent: string }> = {
  info: { icon: Info, className: "border-border", accent: "text-primary" },
  success: { icon: CheckCircle2, className: "border-success/50", accent: "text-success" },
  warning: { icon: TriangleAlert, className: "border-warning/50", accent: "text-warning" },
  error: { icon: CircleAlert, className: "border-destructive/60", accent: "text-destructive" },
};

function ToastCard({ toast }: { toast: AppToast }) {
  const { isVisible } = useToast();
  const tone = TONE[toast.tone];
  const Icon = tone.icon;

  return (
    <div
      className={cn(
        "pointer-events-auto flex gap-2.5 rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl",
        tone.className,
      )}
    >
      <Icon className={cn("mt-px size-4 shrink-0", tone.accent)} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 line-clamp-3 text-[11px] leading-relaxed break-words text-muted-foreground">
            {toast.description}
          </p>
        )}
        {toast.argv && (
          <div className="mt-1.5 flex items-center gap-2">
            <code
              title={`git ${toast.argv.join(" ")}`}
              className="min-w-0 flex-1 truncate rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              git {toast.argv.join(" ")}
            </code>
            <CopyButton
              variant="icon"
              value={`git ${toast.argv.join(" ")}`}
              label={t("toast.copyCommand")}
              copiedLabel={t("toast.commandCopied")}
              className="shrink-0"
            />
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label={t("common.dismiss")}
        tabIndex={isVisible ? undefined : -1}
        onClick={() => dismissToast(toast.id)}
        className="size-5 shrink-0 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="mx-auto size-3.5" />
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useAppState((s) => s.toasts);
  const compact = useLayoutMode() === "compact";

  // Push bem-sucedido ganha confete — o unico momento do app em que o trabalho
  // sai da maquina. Dispara uma vez por toast, pelo id.
  const confetti = useRef<ConfettiHandle>(null);
  const celebrated = useRef<string | null>(null);
  useEffect(() => {
    const push = toasts.find((t) => t.tone === "success" && t.argv?.[0] === "push");
    if (!push || celebrated.current === push.id) return;
    celebrated.current = push.id;
    confetti.current?.burst();
  }, [toasts]);

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[55]">
        <Confetti ref={confetti} particleCount={36} />
      </div>
      <ToastStack
        maxVisible={4}
        className={cn(
          "right-6 left-auto mx-0 w-[min(24rem,calc(100vw-3rem))]",
          /* Acima da barra de navegacao: um toast colado no rodape de um
             celular apareceria atras dela. A conta e a mesma da AiBar:
             56px + folga de 1.5rem + recorte de seguranca. */
          compact ? "bottom-[calc(56px+1.5rem+env(safe-area-inset-bottom,0px))]" : "bottom-6",
        )}
      >
        {toasts.map((toast) => (
          <Toast key={toast.id}>
            <ToastCard toast={toast} />
          </Toast>
        ))}
      </ToastStack>
    </>
  );
}
