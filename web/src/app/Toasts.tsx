/**
 * Fila de toasts: o `ToastStack` do Motion UI alimentado por `s.toasts`.
 *
 * O toast de erro carrega o argv do comando que falhou; o botao "ver comando"
 * acha a linha correspondente no console e rola ate ela (destacando-a). E o
 * caminho curto entre "deu erro" e "eis o comando exato que o git rodou".
 */
import { useEffect, useRef } from "react";
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import { Confetti, type ConfettiHandle } from "@/components/motion-ui/confetti";
import { Toast, ToastStack, useToast } from "@/components/motion-ui/toast-stack";
import { dismissToast, getState, useAppState, type AppToast, type ToastTone } from "@/state/store";
import { focusConsoleLine, setConsoleFilter } from "@/hooks";
import { cn } from "@/lib/utils";

const TONE: Record<ToastTone, { icon: typeof Info; className: string; accent: string }> = {
  info: { icon: Info, className: "border-border", accent: "text-primary" },
  success: { icon: CheckCircle2, className: "border-success/50", accent: "text-success" },
  warning: { icon: TriangleAlert, className: "border-warning/50", accent: "text-warning" },
  error: { icon: CircleAlert, className: "border-destructive/60", accent: "text-destructive" },
};

/** Acha a linha de comando do console cujo argv bate com o do toast. */
function findConsoleLine(argv: string[]): string | null {
  const wanted = argv.join(" ");
  const lines = getState().console;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.kind === "command" && line.argv?.join(" ") === wanted) return line.id;
  }
  return null;
}

function ToastCard({ toast }: { toast: AppToast }) {
  const { isVisible } = useToast();
  const tone = TONE[toast.tone];
  const Icon = tone.icon;

  const jumpToConsole = () => {
    if (!toast.argv) return;
    const id = findConsoleLine(toast.argv);
    // Um filtro ativo pode estar escondendo justamente a linha procurada.
    setConsoleFilter("all");
    if (id) focusConsoleLine(id);
  };

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
            <code className="min-w-0 flex-1 truncate rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              git {toast.argv.join(" ")}
            </code>
            <button
              type="button"
              tabIndex={isVisible ? undefined : -1}
              onClick={jumpToConsole}
              className="shrink-0 text-[10px] font-medium text-primary underline-offset-2 hover:underline"
            >
              ver comando
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label="Dispensar"
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
      <ToastStack maxVisible={4} className="right-6 bottom-6 left-auto mx-0 w-[min(24rem,calc(100vw-3rem))]">
        {toasts.map((toast) => (
          <Toast key={toast.id}>
            <ToastCard toast={toast} />
          </Toast>
        ))}
      </ToastStack>
    </>
  );
}
