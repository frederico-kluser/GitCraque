/**
 * Chips de referencia da linha do commit: branch local, branch remota, tag,
 * stash e HEAD, cada um com sua cor semantica.
 *
 * Nada no catalogo do Motion UI e um "chip" de ref (o mais proximo, `badge`, nao
 * esta instalado), entao a marcacao e propria — mas so com tokens semanticos.
 *
 * O chip NAO e enfeite: e o alvo do produto inteiro.
 *
 *   arrastar um commit ATE um chip de branch  → cherry-pick
 *   arrastar um chip de branch ATE outro      → merge ou rebase
 *   duplo clique num chip de branch           → troca para ela
 *
 * Por isso ele e ao mesmo tempo origem de arraste (`useDraggableEntity`) e alvo
 * de soltura (`useDroppableTarget`), os dois do `@/dnd`.
 *
 * ARMADILHA que custa caro se esquecida: a LINHA inteira do commit tambem e
 * arrastavel. Sem `stopPropagation` no ponteiro do chip, um arraste comecado no
 * chip sobe e vira arraste da linha — a pessoa pega `main` e o app entende que
 * ela pegou o commit. Por isso os listeners do chip sao embrulhados.
 */
import { useCallback } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Archive, CircleDot, Cloud, GitBranch, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useDraggableEntity, useDropFeedback, useDroppableTarget } from "@/dnd";
import { cn } from "@/lib/utils";
import type { CommitRef, DragPayload, DropPayload, RefKind } from "@/types/git";

/** Quantos chips cabem antes de virar "+N". */
const MAX_CHIPS = 4;

const TONE: Record<RefKind, string> = {
  head: "border-primary/45 bg-primary/15 text-primary",
  localBranch: "border-border bg-secondary text-secondary-foreground",
  remoteBranch: "border-border bg-muted text-muted-foreground",
  tag: "border-warning/45 bg-warning/15 text-warning",
  stash: "border-border bg-accent text-accent-foreground",
};

const ICON: Record<RefKind, LucideIcon> = {
  head: CircleDot,
  localBranch: GitBranch,
  remoteBranch: Cloud,
  tag: Tag,
  stash: Archive,
};

/** HEAD primeiro, depois branches locais, remotas, tags e stashes. */
const ORDER: Record<RefKind, number> = {
  head: 0,
  localBranch: 1,
  remoteBranch: 2,
  tag: 3,
  stash: 4,
};

/** O `head` solto (detached) e o stash nao participam do motor semantico. */
const arrastavel = (kind: RefKind) =>
  kind === "localBranch" || kind === "remoteBranch" || kind === "tag";
const soltavel = (kind: RefKind) => kind === "localBranch" || kind === "remoteBranch";

function dragPayloadDe(refEntry: CommitRef): DragPayload {
  return {
    type:
      refEntry.kind === "localBranch"
        ? "branch"
        : refEntry.kind === "remoteBranch"
          ? "remoteBranch"
          : "tag",
    key: refEntry.name,
    label: refEntry.name,
    remote: refEntry.remote,
  };
}

function dropPayloadDe(refEntry: CommitRef): DropPayload {
  return {
    type: refEntry.kind === "localBranch" ? "branch" : "remoteBranch",
    key: refEntry.name,
    label: refEntry.name,
    remote: refEntry.remote,
  };
}

export interface RefChipProps {
  refEntry: CommitRef;
  /** duplo clique: o shell decide o que "ativar uma ref" significa (checkout). */
  onActivate?: (refEntry: CommitRef) => void;
}

export function RefChip({ refEntry, onActivate }: RefChipProps) {
  const Icon = ICON[refEntry.kind];
  const podeArrastar = arrastavel(refEntry.kind);
  const podeSoltar = soltavel(refEntry.kind);

  // Os hooks do @dnd-kit nao podem ser condicionais: sempre chamados, e o
  // resultado e que fica ligado ou nao ao elemento.
  const drag = useDraggableEntity(dragPayloadDe(refEntry), "graph");
  const dropPayload = dropPayloadDe(refEntry);
  const drop = useDroppableTarget(dropPayload, "graph");
  const feedback = useDropFeedback(dropPayload, "graph");

  const ativavel = onActivate && (refEntry.kind === "localBranch" || refEntry.kind === "remoteBranch");

  /* O chip vive DENTRO da linha arrastavel: sem barrar o ponteiro aqui, o
     arraste vira arraste do commit. */
  const listeners = podeArrastar
    ? {
        ...(drag.listeners ?? {}),
        onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
          event.stopPropagation();
          (drag.listeners as { onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void } | undefined)
            ?.onPointerDown?.(event);
        },
      }
    : {};

  /**
   * ESTA MEMOIZACAO NAO E ENFEITE — sem ela o drag-and-drop nao funciona.
   *
   * Um `ref` callback recriado a cada render faz o React DESANEXAR e reanexar o
   * no (chama com `null`, depois com o elemento). Como todo chip re-renderiza
   * quando um arraste comeca (o `useDropFeedback` muda de "idle" para
   * "dragging"), os alvos se desregistravam no exato instante em que o @dnd-kit
   * mede os retangulos — e o `over` vinha `null` para sempre. Medido: 20 eventos
   * de ponteiro, `onDragOver` com `over: null`, e a soltura caindo em "fora de
   * um alvo".
   */
  const setRef = useCallback(
    (el: HTMLElement | null) => {
      if (podeArrastar) drag.setNodeRef(el);
      if (podeSoltar) drop.setNodeRef(el);
    },
    [podeArrastar, podeSoltar, drag.setNodeRef, drop.setNodeRef],
  );

  return (
    <span
      ref={setRef}
      {...(podeArrastar ? drag.attributes : {})}
      {...listeners}
      onDoubleClick={
        ativavel
          ? (event) => {
              // Sem isto, o duplo clique tambem conta como dois cliques de
              // selecao na linha, e o commit selecionado pisca.
              event.stopPropagation();
              event.preventDefault();
              onActivate?.(refEntry);
            }
          : undefined
      }
      data-drop={podeSoltar ? feedback.state : undefined}
      data-dragging={drag.isDragging || undefined}
      title={
        ativavel
          ? `${refEntry.fullName ?? refEntry.name} — duplo clique troca para esta branch; arraste para outra para mesclar ou rebasear`
          : (refEntry.fullName ?? refEntry.name)
      }
      className={cn(
        "inline-flex max-w-[14rem] shrink-0 items-center gap-1 rounded-md border px-1.5 py-px text-[11px] leading-4",
        TONE[refEntry.kind],
        refEntry.isHead && refEntry.kind !== "head" && "ring-1 ring-primary/40",
        podeArrastar && "cursor-grab",
        drag.isDragging && "cursor-grabbing opacity-40",
        // Aceita / recusa durante o arraste. So `filter`, `opacity` e cor de
        // borda: nada que mude a caixa e faca a linha inteira reflowar.
        feedback.accepts && "ring-2 ring-success/70 brightness-125",
        feedback.rejects && "opacity-50 ring-2 ring-destructive/60",
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0 opacity-70" />
      <span className="truncate font-medium">{refEntry.name}</span>
    </span>
  );
}

export function RefChips({
  refs,
  onActivate,
}: {
  refs: CommitRef[];
  onActivate?: (refEntry: CommitRef) => void;
}) {
  if (refs.length === 0) return null;

  const sorted = refs.slice().sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  const shown = sorted.slice(0, MAX_CHIPS);
  const hidden = sorted.length - shown.length;

  return (
    <>
      {shown.map((entry) => (
        <RefChip key={`${entry.kind}:${entry.name}`} refEntry={entry} onActivate={onActivate} />
      ))}
      {hidden > 0 && (
        <span
          className="shrink-0 rounded-md border border-border px-1.5 py-px text-[11px] leading-4 text-muted-foreground"
          title={sorted
            .slice(MAX_CHIPS)
            .map((entry) => entry.name)
            .join(", ")}
        >
          +{hidden}
        </span>
      )}
    </>
  );
}
