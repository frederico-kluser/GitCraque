/**
 * A VIEW TREE VIRTUALIZADA — a fronteira publica visual do modulo do grafo.
 *
 * `FixedSizeList` do react-window sobre a lista de commits, com altura de linha
 * constante: so as linhas visiveis (+ overscan) vao ao DOM. Cada linha desenha o
 * proprio <svg>; nao existe um SVG unico gigante em lugar nenhum.
 *
 * Teclado, selecao multipla e menu de contexto vivem aqui; o layout X/Y vem de
 * `layout.ts` e a geometria das curvas de `bezier.ts`.
 */
import { forwardRef, useCallback, useMemo, useRef } from "react";
import type { CSSProperties, HTMLAttributes, KeyboardEvent } from "react";
import { motion } from "motion/react";
import { FixedSizeList } from "react-window";
import { Skeleton } from "@/components/motion-ui/skeleton";
import { useMotionUITransition } from "@/components/motion-ui/ui-theme";
import {
  StaggerReveal,
  StaggerRevealHeadline,
  StaggerRevealItem,
} from "@/components/motion-ui/stagger-reveal";
import { cn } from "@/lib/utils";
import type { GraphMetrics, GraphViewProps } from "@/types/modules";
import { CommitRow } from "./CommitRow.tsx";
import { computeGraphLayout, DEFAULT_METRICS } from "./layout.ts";
import {
  FALLBACK_HEIGHT,
  OVERSCAN,
  ROW_GRID,
  graphColumnWidth,
  graphVars,
  rowDomId,
} from "./shell.ts";
import type { GraphRowData } from "./shell.ts";
import { useElementHeight } from "./useElementSize.ts";

/* O `innerElementType` da lista e o rowgroup do role="grid". */
const ListInner = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function ListInner(props, ref) {
    return <div ref={ref} role="rowgroup" {...props} />;
  },
);

function ColumnHeader() {
  return (
    <div
      role="row"
      aria-rowindex={1}
      className={cn(
        ROW_GRID,
        "h-8 shrink-0 border-b border-border bg-surface-rail/60",
        "text-[11px] font-medium tracking-wide text-muted-foreground uppercase",
      )}
    >
      <div role="columnheader" className="pl-[var(--graph-pad)]">
        Grafo
      </div>
      <div role="columnheader" className="pl-2">
        Descricao
      </div>
      <div role="columnheader">Autor</div>
      <div role="columnheader">Data</div>
      <div role="columnheader">Hash</div>
    </div>
  );
}

/** Carregamento — o `Skeleton` do Motion UI, sem shimmer proprio. */
function LoadingRows({ rows = 16 }: { rows?: number }) {
  return (
    <div aria-busy className="h-full overflow-hidden">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cn(ROW_GRID, "h-7")}>
          <div className="pl-[var(--graph-pad)]">
            <Skeleton className="size-2.5 rounded-full" />
          </div>
          <div className="pl-2">
            {/* larguras deterministicas: nada de Math.random em render */}
            <Skeleton className="h-2.5" style={{ width: `${34 + ((i * 23) % 46)}%` }} />
          </div>
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="h-2.5 w-12" />
        </div>
      ))}
    </div>
  );
}

/** Repositorio sem historico. */
function EmptyState() {
  return (
    <div className="grid h-full place-items-center p-8">
      <StaggerReveal className="flex max-w-sm flex-col items-center gap-2 text-center">
        <StaggerRevealHeadline as="h2" className="font-heading text-base text-foreground">
          Nenhum commit para desenhar
        </StaggerRevealHeadline>
        <StaggerRevealItem as="p" className="text-sm text-muted-foreground">
          Este repositorio ainda nao tem historico. Faca o primeiro commit e a
          View Tree aparece aqui.
        </StaggerRevealItem>
        <StaggerRevealItem as="p" className="font-mono text-xs text-muted-foreground">
          git log --all --topo-order
        </StaggerRevealItem>
      </StaggerReveal>
    </div>
  );
}

export function GraphView({
  commits,
  refs,
  selected,
  primary,
  onSelect,
  onContextMenu,
  metrics: metricsProp,
  loading,
  className,
}: GraphViewProps) {
  /* metricas estaveis: memo pelos campos, nao pelo objeto (que vem novo a cada
     render do shell). */
  const {
    rowHeight: rowHeightProp,
    laneWidth: laneWidthProp,
    nodeRadius: nodeRadiusProp,
    paddingLeft: paddingLeftProp,
    strokeWidth: strokeWidthProp,
  } = metricsProp ?? {};
  const metrics = useMemo<GraphMetrics>(
    () => ({
      rowHeight: rowHeightProp ?? DEFAULT_METRICS.rowHeight,
      laneWidth: laneWidthProp ?? DEFAULT_METRICS.laneWidth,
      nodeRadius: nodeRadiusProp ?? DEFAULT_METRICS.nodeRadius,
      paddingLeft: paddingLeftProp ?? DEFAULT_METRICS.paddingLeft,
      strokeWidth: strokeWidthProp ?? DEFAULT_METRICS.strokeWidth,
    }),
    [rowHeightProp, laneWidthProp, nodeRadiusProp, paddingLeftProp, strokeWidthProp],
  );

  const ui = useMotionUITransition("ui");
  const layout = useMemo(() => computeGraphLayout(commits), [commits]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const graphWidth = graphColumnWidth(layout.laneCount, metrics);
  const headHash = refs?.head.hash ?? null;

  const gridRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<FixedSizeList<GraphRowData>>(null);
  const { ref: bodyRef, height } = useElementHeight<HTMLDivElement>();

  /* ancora da selecao por intervalo: o store usa `primary` como ponta, e o
     Shift+seta precisa manter a ponta ORIGINAL para o intervalo crescer. */
  const anchorRef = useRef<string | null>(null);

  const focusGrid = useCallback(() => gridRef.current?.focus(), []);

  const handleSelect = useCallback<GraphViewProps["onSelect"]>(
    (hash, mode) => {
      if (mode !== "range") anchorRef.current = hash;
      onSelect(hash, mode);
    },
    [onSelect],
  );

  const moveTo = useCallback(
    (targetRow: number, extend: boolean) => {
      const nodes = layout.nodes;
      if (nodes.length === 0) return;
      const clamped = Math.min(nodes.length - 1, Math.max(0, targetRow));
      const hash = nodes[clamped].commit.hash;
      const anchor = anchorRef.current ?? primary;

      if (extend && anchor !== null && anchor !== hash) {
        /* recoloca a ponta na ancora e so entao pede o intervalo, senao o store
           usaria o ultimo item visitado como ponta e o intervalo nao cresceria. */
        onSelect(anchor, "replace");
        onSelect(hash, "range");
      } else {
        handleSelect(hash, "replace");
      }
      listRef.current?.scrollToItem(clamped, "smart");
    },
    [layout, primary, onSelect, handleSelect],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const count = layout.nodes.length;
      if (count === 0) return;
      const current = primary !== null ? (layout.index.get(primary) ?? -1) : -1;
      const page = Math.max(1, Math.floor((height || FALLBACK_HEIGHT) / metrics.rowHeight) - 1);

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          moveTo(current < 0 ? 0 : current + 1, event.shiftKey);
          break;
        case "ArrowUp":
          event.preventDefault();
          moveTo(current < 0 ? count - 1 : current - 1, event.shiftKey);
          break;
        case "PageDown":
          event.preventDefault();
          moveTo(current < 0 ? 0 : current + page, event.shiftKey);
          break;
        case "PageUp":
          event.preventDefault();
          moveTo(current < 0 ? 0 : current - page, event.shiftKey);
          break;
        case "Home":
          event.preventDefault();
          moveTo(0, event.shiftKey);
          break;
        case "End":
          event.preventDefault();
          moveTo(count - 1, event.shiftKey);
          break;
        default:
          break;
      }
    },
    [layout, primary, height, metrics.rowHeight, moveTo],
  );

  const itemData = useMemo<GraphRowData>(
    () => ({
      layout,
      metrics,
      graphWidth,
      selected: selectedSet,
      primary,
      headHash,
      onSelect: handleSelect,
      onContextMenu,
      onFocusGrid: focusGrid,
    }),
    [
      layout,
      metrics,
      graphWidth,
      selectedSet,
      primary,
      headHash,
      handleSelect,
      onContextMenu,
      focusGrid,
    ],
  );

  const isEmpty = commits.length === 0;
  const showSkeleton = isEmpty && loading === true;

  return (
    <div
      ref={gridRef}
      role="grid"
      tabIndex={0}
      aria-label="Historico de commits"
      aria-colcount={5}
      aria-rowcount={commits.length + 1}
      aria-activedescendant={primary !== null ? rowDomId(primary) : undefined}
      data-graph-lanes={layout.laneCount}
      data-graph-edges={layout.edges.length}
      data-graph-elapsed={layout.elapsedMs.toFixed(2)}
      onKeyDown={handleKeyDown}
      style={graphVars(graphWidth, metrics) as CSSProperties}
      className={cn(
        "flex h-full min-h-0 flex-col bg-surface-graph outline-none",
        "focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
        className,
      )}
    >
      <ColumnHeader />

      {/* o container medido fica SEMPRE montado, para o ResizeObserver nao
          perder o no quando o estado troca de esqueleto para arvore. */}
      <div ref={bodyRef} className="min-h-0 flex-1">
        {showSkeleton ? (
          <LoadingRows />
        ) : isEmpty ? (
          <EmptyState />
        ) : (
          /* a arvore entra com o token "ui" quando o log chega */
          <motion.div
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={ui}
          >
            <FixedSizeList<GraphRowData>
              ref={listRef}
              height={height || FALLBACK_HEIGHT}
              width="100%"
              itemCount={commits.length}
              itemSize={metrics.rowHeight}
              overscanCount={OVERSCAN}
              itemData={itemData}
              itemKey={(index, data) => data.layout.nodes[index].commit.hash}
              innerElementType={ListInner}
            >
              {CommitRow}
            </FixedSizeList>
          </motion.div>
        )}
      </div>
    </div>
  );
}
