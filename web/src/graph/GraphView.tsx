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
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, HTMLAttributes, KeyboardEvent } from "react";
import { motion } from "motion/react";
import { FixedSizeList } from "react-window";
import type { ListOnScrollProps } from "react-window";
import { Skeleton } from "@/components/motion-ui/skeleton";
import { useMotionUITransition } from "@/components/motion-ui/ui-theme";
import {
  StaggerReveal,
  StaggerRevealHeadline,
  StaggerRevealItem,
} from "@/components/motion-ui/stagger-reveal";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { GraphMetrics, GraphViewProps } from "@/types/modules";
import { CommitRow } from "./CommitRow.tsx";
import { computeGraphLayout, DEFAULT_METRICS } from "./layout.ts";
import { applyRevealPlan, MARK_DURATION_MS, planReveal } from "./reveal.ts";
import type { RevealSurface, RevealTarget } from "./reveal.ts";
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
        {t("graph.column.graph")}
      </div>
      <div role="columnheader" className="pl-2">
        {t("graph.column.description")}
      </div>
      <div role="columnheader">{t("graph.column.author")}</div>
      <div role="columnheader">{t("graph.column.date")}</div>
      <div role="columnheader">{t("graph.column.hash")}</div>
    </div>
  );
}

/**
 * Carregamento — o `Skeleton` do Motion UI, sem shimmer proprio.
 *
 * A altura e a bola vem das METRICAS, nao de classe cravada: sem isso, mexer em
 * `paint.ts` faria o esqueleto pular de tamanho no instante em que a arvore
 * chega.
 */
function LoadingRows({ metrics, rows = 16 }: { metrics: GraphMetrics; rows?: number }) {
  return (
    <div aria-busy className="h-full overflow-hidden">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={ROW_GRID} style={{ height: metrics.rowHeight }}>
          <div className="pl-[var(--graph-pad)]">
            <Skeleton
              className="rounded-full"
              style={{ width: metrics.nodeRadius * 2, height: metrics.nodeRadius * 2 }}
            />
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
          {t("graph.empty.title")}
        </StaggerRevealHeadline>
        <StaggerRevealItem as="p" className="text-sm text-muted-foreground">
          {t("graph.empty.body")}
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
  onRefActivate,
  onRefContextMenu,
  reveal,
  onRevealed,
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
  const viewportHeight = height || FALLBACK_HEIGHT;

  /* ancora da selecao por intervalo: o store usa `primary` como ponta, e o
     Shift+seta precisa manter a ponta ORIGINAL para o intervalo crescer. */
  const anchorRef = useRef<string | null>(null);

  const focusGrid = useCallback(() => gridRef.current?.focus(), []);

  /* ---- reveal: levar a View Tree ate um commit e marcar a linha ------- */

  /** a linha marcada agora; o realce se apaga sozinho depois de MARK_DURATION_MS */
  const [mark, setMark] = useState<RevealTarget | null>(null);
  /* ultimo nonce atendido. Sem ele o ciclo `reveal muda -> rola -> onRevealed
     limpa -> re-render` viraria laco. */
  const servedNonceRef = useRef<number | null>(null);
  const markTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* deslocamento atual da lista, alimentado pelo onScroll do react-window —
     ler o state interno dele seria depender de coisa privada. */
  const scrollOffsetRef = useRef(0);
  /* de onde as setas continuam quando nao ha commit focado */
  const revealedHashRef = useRef<string | null>(null);

  /* o shell pode passar uma closure nova a cada render; como dependencia de
     efeito isso reabriria o laco. Fica numa ref. */
  const onRevealedRef = useRef(onRevealed);
  useEffect(() => {
    onRevealedRef.current = onRevealed;
  });

  const handleListScroll = useCallback(({ scrollOffset }: ListOnScrollProps) => {
    scrollOffsetRef.current = scrollOffset;
  }, []);

  useEffect(
    () => () => {
      if (markTimerRef.current !== null) clearTimeout(markTimerRef.current);
    },
    [],
  );

  /* o efeito observa o NONCE, nao o hash: clicar duas vezes na mesma branch tem
     de rolar de novo. Toda a decisao esta em `planReveal`; aqui so se aplica. */
  const revealHash = reveal?.hash ?? null;
  const revealNonce = reveal?.nonce ?? null;

  useEffect(() => {
    const surface: RevealSurface = {
      scrollToRow: (row) => listRef.current?.scrollToItem(row, "center"),
      focusRow: (hash) => {
        /* o teclado acompanha: cursor das setas e ancora do Shift passam a ser a
           linha revelada, e o grid toma o foco do DOM — o clique aconteceu no
           rail, entao sem isso as setas nao chegariam aqui. */
        revealedHashRef.current = hash;
        anchorRef.current = hash;
        gridRef.current?.focus({ preventScroll: true });
      },
      mark: (target) => {
        setMark(target);
        if (markTimerRef.current !== null) clearTimeout(markTimerRef.current);
        markTimerRef.current = setTimeout(() => setMark(null), MARK_DURATION_MS);
      },
      release: () => onRevealedRef.current?.(),
    };

    const plan = planReveal(
      revealHash !== null && revealNonce !== null
        ? { hash: revealHash, nonce: revealNonce }
        : null,
      {
        layout,
        viewport: {
          scrollOffset: scrollOffsetRef.current,
          height: viewportHeight,
          rowHeight: metrics.rowHeight,
        },
        servedNonce: servedNonceRef.current,
        loading,
      },
    );
    if (plan !== null) servedNonceRef.current = plan.nonce;
    applyRevealPlan(plan, surface);
  }, [revealHash, revealNonce, layout, viewportHeight, metrics.rowHeight, loading]);

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
      /* o cursor e o commit focado; na falta dele, a ultima linha revelada — e
         assim que as setas continuam de onde o reveal parou. */
      const cursor = primary ?? revealedHashRef.current;
      const current = cursor !== null ? (layout.index.get(cursor) ?? -1) : -1;
      const page = Math.max(1, Math.floor(viewportHeight / metrics.rowHeight) - 1);

      /* A tecla de menu (e o Shift+F10 de quem nao a tem) abre o mesmo menu do
         botao direito, ancorado na LINHA focada — sem isto, tudo o que o menu
         oferece ficaria fora do alcance de quem navega por teclado. */
      if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
        if (cursor === null || !onContextMenu) return;
        event.preventDefault();
        /* Ancora na linha focada; se ela estiver virtualizada para fora (o
           usuario rolou longe com a roda), o grid serve de ancora — melhor que
           abrir o menu no canto da tela. */
        const box =
          document.getElementById(rowDomId(cursor))?.getBoundingClientRect() ??
          gridRef.current?.getBoundingClientRect();
        if (!box) return;
        onContextMenu(cursor, {
          x: box.left + Math.min(240, box.width / 3),
          y: Math.min(box.bottom - 4, box.top + metrics.rowHeight),
        });
        return;
      }

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
    [layout, primary, viewportHeight, metrics.rowHeight, moveTo, onContextMenu],
  );

  const itemData = useMemo<GraphRowData>(
    () => ({
      layout,
      metrics,
      graphWidth,
      selected: selectedSet,
      primary,
      headHash,
      marked: mark,
      onSelect: handleSelect,
      onContextMenu,
      onRefActivate,
      onRefContextMenu,
      onFocusGrid: focusGrid,
    }),
    [
      layout,
      metrics,
      graphWidth,
      selectedSet,
      primary,
      headHash,
      mark,
      handleSelect,
      onContextMenu,
      onRefActivate,
      onRefContextMenu,
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
      aria-label={t("graph.label")}
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
          <LoadingRows metrics={metrics} />
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
              height={viewportHeight}
              width="100%"
              itemCount={commits.length}
              itemSize={metrics.rowHeight}
              overscanCount={OVERSCAN}
              onScroll={handleListScroll}
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
