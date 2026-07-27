/**
 * Pecas miudas compartilhadas pelos cinco paineis.
 *
 * CASCATA: o catalogo do Motion UI e feito de MECANICAS (acordeao, swipe,
 * paleta, beam...) — nao ha nele um botao simples, um chip, um menu de contexto
 * nem um cabecalho de secao. Estes quatro sao exatamente o que faltou, entao
 * moram aqui, com Base UI (`Menu`) onde ha semantica de acessibilidade a
 * respeitar, e Tailwind com token semantico para o resto.
 */
import { Fragment, type ComponentType, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import {
  AlertTriangle,
  FileDiff,
  FilePlus2,
  FileMinus2,
  FileQuestion,
  FileSymlink,
  Files,
  MoreHorizontal,
} from "lucide-react";
import { StaggerReveal, StaggerRevealHeadline, StaggerRevealItem } from "@/components/motion-ui/stagger-reveal";
import { cn } from "@/lib/utils";
import type { ChangeStatus } from "@/types/git";

/** Anel de foco unico do app — o mesmo tratamento que o Motion UI usa. */
export const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

/* ------------------------------------------------------------------ */
/* Botao                                                               */
/* ------------------------------------------------------------------ */

export type ToolButtonTone = "default" | "ghost" | "primary" | "danger";

const TONE_CLASS: Record<ToolButtonTone, string> = {
  default: "border border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground",
  ghost: "border border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  primary: "border border-transparent bg-primary text-primary-foreground hover:opacity-90",
  danger: "border border-transparent text-destructive hover:bg-destructive/10",
};

export interface ToolButtonProps {
  children?: ReactNode;
  icon?: ReactNode;
  tone?: ToolButtonTone;
  size?: "sm" | "md";
  title?: string;
  "aria-label"?: string;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  onClick?: () => void;
}

export function ToolButton({
  children,
  icon,
  tone = "default",
  size = "md",
  title,
  "aria-label": ariaLabel,
  disabled,
  active,
  className,
  onClick,
}: ToolButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md font-medium transition-colors",
        "duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
        size === "sm" ? "h-6 px-2 text-[11px]" : "h-8 px-2.5 text-xs",
        TONE_CLASS[tone],
        active && "bg-accent text-accent-foreground",
        disabled && "pointer-events-none opacity-50",
        FOCUS_RING,
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Chip                                                                */
/* ------------------------------------------------------------------ */

export type ChipTone = "neutral" | "primary" | "success" | "warning" | "danger" | "muted";

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  primary: "border-primary/40 bg-primary/12 text-primary",
  success: "border-success/40 bg-success/12 text-success",
  warning: "border-warning/45 bg-warning/15 text-warning",
  danger: "border-destructive/40 bg-destructive/12 text-destructive",
  muted: "border-transparent bg-transparent text-muted-foreground",
};

export function Chip({
  children,
  tone = "neutral",
  title,
  className,
  mono,
}: {
  children: ReactNode;
  tone?: ChipTone;
  title?: string;
  className?: string;
  mono?: boolean;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-[10px] leading-4 font-medium whitespace-nowrap",
        mono && "font-mono tracking-tight",
        CHIP_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Menu de acoes (Base UI)                                             */
/* ------------------------------------------------------------------ */

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  icon?: ComponentType<{ className?: string }>;
  /** pinta a linha com o tom destrutivo — a confirmacao vem depois, no dialogo */
  destructive?: boolean;
  disabled?: boolean;
  /** insere um separador ANTES desta linha */
  separatorBefore?: boolean;
}

export function ActionMenu({
  items,
  label = "Acoes",
  trigger,
  className,
}: {
  items: ActionMenuItem[];
  label?: string;
  trigger?: ReactNode;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    /**
     * O menu vive DENTRO de linhas que sao clicaveis e ARRASTAVEIS, e o portal
     * do popup continua sendo filho REACT desta linha — entao um clique no item
     * borbulha ate ela mesmo estando em outro lugar do DOM. Sem barrar a
     * propagacao aqui, abrir o menu ja dispararia o clique da linha (trocar de
     * worktree!) e um clique no item iniciaria um arrasto do @dnd-kit, que
     * engole justamente esse clique — o menu nunca fechava.
     *
     * O `span` envolve gatilho E portal, e `display: contents` o mantem fora do
     * layout. Os handlers do Base UI ficam ABAIXO deste no, entao rodam antes.
     */
    <span
      className="contents"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Menu.Root>
        <Menu.Trigger
          aria-label={label}
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
            "duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
            "hover:bg-accent hover:text-accent-foreground data-[popup-open]:bg-accent data-[popup-open]:text-accent-foreground",
            FOCUS_RING,
            className,
          )}
        >
          {trigger ?? <MoreHorizontal className="size-3.5" />}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={6} align="end" className="z-50 outline-none">
            <Menu.Popup className="min-w-48 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-xl">
              {/* Fragmento, nao <div>: o Base UI registra os itens pela lista
                  composta e um wrapper quebra o clique e a navegacao por teclado. */}
              {items.map((item) => (
                <Fragment key={item.label}>
                  {item.separatorBefore && <Menu.Separator className="my-1 h-px bg-border" />}
                  <Menu.Item
                    disabled={item.disabled}
                    onClick={item.onSelect}
                    className={cn(
                      "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none select-none",
                      "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                      "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
                      item.destructive &&
                        "text-destructive data-[highlighted]:bg-destructive/12 data-[highlighted]:text-destructive",
                    )}
                  >
                    {item.icon && <item.icon className="size-3.5 shrink-0" />}
                    {item.label}
                  </Menu.Item>
                </Fragment>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Cabecalho de secao e estado vazio                                   */
/* ------------------------------------------------------------------ */

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase", className)}>
      {children}
    </span>
  );
}

/** Estado vazio com a entrada escalonada do catalogo. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <StaggerReveal className={cn("flex flex-col items-center gap-2 px-4 py-8 text-center", className)}>
      <StaggerRevealHeadline as="h3" className="font-heading text-sm font-medium text-foreground">
        {title}
      </StaggerRevealHeadline>
      {description && (
        <StaggerRevealItem as="p" className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          {description}
        </StaggerRevealItem>
      )}
      {action && <StaggerRevealItem>{action}</StaggerRevealItem>}
    </StaggerReveal>
  );
}

/* ------------------------------------------------------------------ */
/* Status de arquivo                                                   */
/* ------------------------------------------------------------------ */

const STATUS_META: Record<ChangeStatus, { icon: ComponentType<{ className?: string }>; className: string; label: string }> = {
  added: { icon: FilePlus2, className: "text-success", label: "adicionado" },
  modified: { icon: FileDiff, className: "text-warning", label: "modificado" },
  deleted: { icon: FileMinus2, className: "text-destructive", label: "removido" },
  renamed: { icon: FileSymlink, className: "text-primary", label: "renomeado" },
  copied: { icon: Files, className: "text-primary", label: "copiado" },
  typechange: { icon: FileSymlink, className: "text-warning", label: "tipo alterado" },
  unmerged: { icon: AlertTriangle, className: "text-destructive", label: "conflito" },
  untracked: { icon: FileQuestion, className: "text-muted-foreground", label: "nao rastreado" },
  unknown: { icon: FileQuestion, className: "text-muted-foreground", label: "desconhecido" },
};

export function statusMeta(status: ChangeStatus) {
  return STATUS_META[status] ?? STATUS_META.unknown;
}

export function StatusGlyph({ status, className }: { status: ChangeStatus; className?: string }) {
  const meta = statusMeta(status);
  const Icon = meta.icon;
  return <Icon aria-label={meta.label} className={cn("size-3.5 shrink-0", meta.className, className)} />;
}

/** `+12 −3` com os tokens de diff do tema. */
export function DiffStat({
  insertions,
  deletions,
  className,
}: {
  insertions: number;
  deletions: number;
  className?: string;
}) {
  return (
    <span className={cn("shrink-0 font-mono text-[10px] tabular-nums", className)}>
      <span className="text-diff-add-fg">+{insertions}</span>
      <span className="text-muted-foreground"> </span>
      <span className="text-diff-del-fg">−{deletions}</span>
    </span>
  );
}

/** Caminho de arquivo com o diretorio esmaecido e o nome em destaque. */
export function FilePath({ path, className }: { path: string; className?: string }) {
  const slash = path.lastIndexOf("/");
  const dir = slash < 0 ? "" : path.slice(0, slash + 1);
  const name = slash < 0 ? path : path.slice(slash + 1);
  return (
    <span className={cn("min-w-0 truncate text-xs", className)} title={path} dir="rtl">
      <span dir="ltr">
        {dir && <span className="text-muted-foreground">{dir}</span>}
        <span className="text-foreground">{name}</span>
      </span>
    </span>
  );
}
