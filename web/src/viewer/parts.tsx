/**
 * As pecas pequenas e repetidas do visualizador.
 *
 * O que faltou no catalogo do Motion UI: um botao-icone neutro (o `SheetClose`
 * existe, mas so vive dentro de um `Sheet`, e este painel e fixo), um aviso
 * inline de erro/estado, e uma etiqueta de metadado — nenhum dos tres tem
 * equivalente instalado, entao os tres sao escritos aqui, uma vez.
 */
import type { ReactNode } from "react";
import { Skeleton } from "@/components/motion-ui/skeleton";
import { cn } from "@/lib/utils";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";

/* ------------------------------------------------------------------ */
/* Botao-icone                                                         */
/* ------------------------------------------------------------------ */

export interface IconButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

/** Botao so-icone, do mesmo peso visual do `CopyButton variant="icon"`. */
export function IconButton({ label, onClick, disabled, children, className }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-sm border border-border bg-muted px-2 py-1.5 text-muted-foreground",
        "transition-colors duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
        "hover:text-foreground disabled:pointer-events-none disabled:opacity-60",
        FOCUS_RING,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function CloseIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Etiquetas e avisos                                                  */
/* ------------------------------------------------------------------ */

/** Metadado curto do cabecalho: origem, tamanho, contagem de linhas. */
export function Meta({
  children,
  title,
  className,
}: {
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-sm border border-border bg-surface-inset px-1.5 py-0.5 font-mono text-xs text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export type NoticeTone = "error" | "warning" | "muted";

const NOTICE_TONE: Record<NoticeTone, string> = {
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  warning: "border-warning/40 bg-warning/10 text-warning",
  muted: "border-border bg-surface-inset text-muted-foreground",
};

/**
 * Aviso DENTRO do painel. Erro de carga do visualizador nunca vira toast: a
 * pessoa esta olhando exatamente para este retangulo, e a mensagem tem de
 * aparecer onde o conteudo apareceria.
 */
export function Notice({
  tone = "muted",
  title,
  children,
  className,
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn("rounded-md border px-3 py-2 text-xs", NOTICE_TONE[tone], className)}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className={cn("font-mono", title && "mt-1 opacity-90")}>{children}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Carregando                                                          */
/* ------------------------------------------------------------------ */

/** Ossos com cara de codigo: gutter estreito + linha de largura irregular. */
export function CodeSkeleton({ rows = 14 }: { rows?: number }) {
  return (
    <div className="space-y-1.5 p-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-3 w-8 shrink-0" />
          <Skeleton className="h-3" style={{ width: `${45 + ((i * 37) % 50)}%` }} />
        </div>
      ))}
    </div>
  );
}
