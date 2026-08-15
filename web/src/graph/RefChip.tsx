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
 *   botao direito num chip                    → menu daquela referencia
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
import { chain, longPressMenu } from "@/hooks";
import type { MenuItemSpec } from "@/hooks";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { TEXT } from "./paint.ts";
import type { CommitRef, DragPayload, DropPayload, RefKind } from "@/types/git";

/**
 * A moldura do chip. Formato de pilula para acompanhar o resto do desenho da
 * coluna — a bola do commit, o realce da linha e o chip sao as tres formas que a
 * pessoa ve juntas, e canto vivo no meio de duas curvas salta aos olhos.
 * O corpo do texto vem de `paint.ts`, como todo tipo desta coluna.
 */
const CHIP_SHAPE = cn("rounded-full border px-2 py-0.5", TEXT.chip);

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

/** So estes tres tem menu proprio; `head` solto e `stash` devolvem o clique. */
const temMenu = (kind: RefKind) =>
  kind === "localBranch" || kind === "remoteBranch" || kind === "tag";

export interface RefChipProps {
  refEntry: CommitRef;
  /** duplo clique: o shell decide o que "ativar uma ref" significa (checkout). */
  onActivate?: (refEntry: CommitRef) => void;
  /** botao direito: o shell decide o que oferecer para esta referencia. */
  onContextMenu?: (refEntry: CommitRef, position: { x: number; y: number }) => void;
  /**
   * Construtor dos itens do menu do chip, no formato do dedo (`longPressMenu`).
   * Sem ele o chip fica so com o caminho antigo do mouse (`onContextMenu`).
   */
  buildRefMenu?: (refEntry: CommitRef) => MenuItemSpec[];
}

export function RefChip({ refEntry, onActivate, onContextMenu: onRefMenu, buildRefMenu }: RefChipProps) {
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

  /**
   * O botao direito do dedo sobre o chip. So existe quando ha menu proprio (a
   * lista vem do shell, nunca de aqui) — chip de HEAD solto e de stash nao
   * abrem menu proprio, como no mouse.
   */
  const press =
    temMenu(refEntry.kind) && buildRefMenu !== undefined
      ? longPressMenu(refEntry.name, () => buildRefMenu(refEntry))
      : null;

  /* O chip vive DENTRO da linha arrastavel: sem barrar o ponteiro aqui, o
     arraste vira arraste do commit. O `chain` compoe o STOP com o arranque do
     @dnd-kit e com o arme do toque longo — espalhar os objetos um por cima do
     outro apagaria o handler do vizinho em silencio. */
  const pararPropagacao = (event: ReactPointerEvent<HTMLElement>) => event.stopPropagation();
  const dragPointerDown = (drag.listeners as { onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void } | undefined)
    ?.onPointerDown;
  const listeners = podeArrastar
    ? {
        ...(drag.listeners ?? {}),
        onPointerDown: chain(pararPropagacao, dragPointerDown, press?.onPointerDown),
        onPointerUp: chain(drag.listeners?.onPointerUp, press?.onPointerUp),
        onPointerCancel: chain(drag.listeners?.onPointerCancel, press?.onPointerCancel),
        onPointerMove: chain(drag.listeners?.onPointerMove, press?.onPointerMove),
      }
    : press
      ? press
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
      /* Sem `stopPropagation` o clique subiria e a LINHA responderia por cima,
         trocando o menu da branch pelo menu do commit. Chip sem menu proprio
         (HEAD solto, stash) nao consome nada de proposito: ali o alvo real e o
         commit mesmo.
         Com `buildRefMenu` o `onContextMenu` do bundle assume (e o mesmo
         `contextMenuFor`, com a guarda contra o sintetico do Android). */
      onContextMenu={
        press
          ? press.onContextMenu
          : onRefMenu && temMenu(refEntry.kind)
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                onRefMenu(refEntry, { x: event.clientX, y: event.clientY });
              }
            : undefined
      }
      data-drop={podeSoltar ? feedback.state : undefined}
      data-dragging={drag.isDragging || undefined}
      title={
        ativavel
          ? t("graph.refChip.hint", { ref: refEntry.fullName ?? refEntry.name })
          : (refEntry.fullName ?? refEntry.name)
      }
      className={cn(
        "inline-flex max-w-[14rem] shrink-0 items-center gap-1",
        CHIP_SHAPE,
        TONE[refEntry.kind],
        refEntry.isHead && refEntry.kind !== "head" && "ring-1 ring-primary/40",
        // So no caminho do toque longo a callout nativa do iOS precisa morrer
        // (utilitaria opt-in — no mouse ela nao declara nada).
        press && "longpress-menu",
        podeArrastar && "cursor-grab",
        drag.isDragging && "cursor-grabbing opacity-40",
        // Aceita / recusa durante o arraste. So `filter`, `opacity`, cor de
        // borda e TRANSFORM: nada que mude a caixa e faca a linha inteira
        // reflowar.
        feedback.accepts && "ring-2 ring-success/70 brightness-125",
        feedback.rejects && "opacity-50 ring-2 ring-destructive/60",
        /*
         * O ALVO DE SOLTURA NO TOQUE. O chip nao pode ter `touch:min-h-tap`
         * estatico: na linha compacta (52px) a descricao empilha chips+assunto
         * sobre a linha de metadados, e 44px no chip estouraria a linha
         * (~70px > 52px). Em vez disso ele CRESCE durante o arraste, e so no
         * toque (`touch:`) — escala e a unica forma de crescer sem reflow. O
         * `getBoundingClientRect` inclui transform, entao o retangulo que o
         * @dnd-kit mede no INICIO do arrasto ja e o escalado — a classe
         * `dragging` e aplicada antes da primeira medicao — e permanece
         * estavel durante todo o arraste: a area de hit do drop cresce junto
         * com o visual.
         */
        feedback.dragging && "touch:scale-150",
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
  onContextMenu,
  buildRefMenu,
}: {
  refs: CommitRef[];
  onActivate?: (refEntry: CommitRef) => void;
  onContextMenu?: (refEntry: CommitRef, position: { x: number; y: number }) => void;
  buildRefMenu?: (refEntry: CommitRef) => MenuItemSpec[];
}) {
  if (refs.length === 0) return null;

  const sorted = refs.slice().sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  const shown = sorted.slice(0, MAX_CHIPS);
  const hidden = sorted.length - shown.length;

  return (
    <>
      {shown.map((entry) => (
        <RefChip
          key={`${entry.kind}:${entry.name}`}
          refEntry={entry}
          onActivate={onActivate}
          onContextMenu={onContextMenu}
          buildRefMenu={buildRefMenu}
        />
      ))}
      {hidden > 0 && (
        <span
          className={cn("shrink-0 border-border text-muted-foreground", CHIP_SHAPE)}
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
