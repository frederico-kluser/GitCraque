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
import type {
  CSSProperties,
  HTMLAttributes,
  KeyboardEvent,
  PointerEvent,
  WheelEvent,
} from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeftRight } from "lucide-react";
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
import { laneX } from "./bezier.ts";
import { CommitRow } from "./CommitRow.tsx";
import { CommitTooltip } from "./CommitTooltip.tsx";
import { COMPACT_METRICS, computeGraphLayout, DEFAULT_METRICS } from "./layout.ts";
import { applyRevealPlan, MARK_DURATION_MS, planReveal } from "./reveal.ts";
import type { RevealSurface, RevealTarget } from "./reveal.ts";
import { SCROLLER } from "./paint.ts";
import {
  FALLBACK_HEIGHT,
  OVERSCAN,
  ROW_GRID,
  compactContentWidth,
  graphColumnBox,
  graphColumnSpan,
  graphVars,
  rowDomId,
} from "./shell.ts";
import type { GraphDensity, GraphRowData } from "./shell.ts";
import { useElementHeight } from "./useElementSize.ts";

/* O `innerElementType` da lista e o rowgroup do role="grid". */
const ListInner = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function ListInner(props, ref) {
    return <div ref={ref} role="rowgroup" {...props} />;
  },
);

function ColumnHeader({ density }: { density: GraphDensity }) {
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
      {density === "compact" ? (
        /* autor, data e hash colapsaram para a linha de metadado do assunto;
           so resta a coluna dos detalhes, onde mora o "⋯" da linha. */
        <div role="columnheader">{t("graph.column.meta")}</div>
      ) : (
        <>
          <div role="columnheader">{t("graph.column.author")}</div>
          <div role="columnheader">{t("graph.column.date")}</div>
          <div role="columnheader">{t("graph.column.hash")}</div>
        </>
      )}
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
function LoadingRows({
  metrics,
  density,
  rows = 16,
}: {
  metrics: GraphMetrics;
  density: GraphDensity;
  rows?: number;
}) {
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
          {density === "compact" ? (
            /* o esqueleto espelha a linha compacta: assunto + linha de metadado */
            <div className="flex min-w-0 flex-col justify-center gap-1.5 py-1 pl-2 pr-2">
              <Skeleton className="h-2.5" style={{ width: `${34 + ((i * 23) % 46)}%` }} />
              <Skeleton className="h-2 w-32 opacity-60" />
            </div>
          ) : (
            <div className="pl-2">
              {/* larguras deterministicas: nada de Math.random em render */}
              <Skeleton className="h-2.5" style={{ width: `${34 + ((i * 23) % 46)}%` }} />
            </div>
          )}
          {density === "compact" ? (
            <Skeleton className="h-6 w-6 justify-self-end" />
          ) : (
            <>
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-2.5 w-14" />
              <Skeleton className="h-2.5 w-12" />
            </>
          )}
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
  density = "comfortable",
  buildCommitMenu,
  buildRefMenu,
  loading,
  className,
}: GraphViewProps) {
  /* A densidade entra por PROP, nunca por um `useViewport` aqui dentro: o
     `getServerSnapshot` do hook devolve desktop, e o `renderToStaticMarkup` da
     suite de testes renderizaria sempre o caminho confortavel — o compacto
     nunca seria exercitado e a suite diria verde para sempre. Quem decide a
     densidade e o SHELL, que enxerga o tamanho da tela.
     `metrics` (quando passado) vence campo a campo, como prometido no contrato. */
  const compact = density === "compact";
  const {
    rowHeight: rowHeightProp,
    laneWidth: laneWidthProp,
    nodeRadius: nodeRadiusProp,
    paddingLeft: paddingLeftProp,
    strokeWidth: strokeWidthProp,
  } = metricsProp ?? {};
  const metrics = useMemo<GraphMetrics>(
    () => ({
      rowHeight: rowHeightProp ?? (compact ? COMPACT_METRICS.rowHeight : DEFAULT_METRICS.rowHeight),
      laneWidth: laneWidthProp ?? (compact ? COMPACT_METRICS.laneWidth : DEFAULT_METRICS.laneWidth),
      nodeRadius: nodeRadiusProp ?? (compact ? COMPACT_METRICS.nodeRadius : DEFAULT_METRICS.nodeRadius),
      paddingLeft: paddingLeftProp ?? (compact ? COMPACT_METRICS.paddingLeft : DEFAULT_METRICS.paddingLeft),
      strokeWidth: strokeWidthProp ?? (compact ? COMPACT_METRICS.strokeWidth : DEFAULT_METRICS.strokeWidth),
    }),
    [rowHeightProp, laneWidthProp, nodeRadiusProp, paddingLeftProp, strokeWidthProp, compact],
  );

  const ui = useMotionUITransition("ui");
  const layout = useMemo(() => computeGraphLayout(commits), [commits]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  /* SPAN e o desenho inteiro, BOX e a janela por onde ele aparece. Enquanto o
     grafo e estreito os dois sao o mesmo numero; passando do teto de `COLUMN`
     o box para de crescer, a coluna para junto e a diferenca vira rolagem. */
  const graphSpan = graphColumnSpan(layout.laneCount, metrics);
  const graphBox = graphColumnBox(graphSpan, density);
  const scrollable = graphSpan > graphBox;
  const headHash = refs?.head.hash ?? null;

  const gridRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<FixedSizeList<GraphRowData>>(null);
  const { ref: bodyRef, height } = useElementHeight<HTMLDivElement>();
  const viewportHeight = height || FALLBACK_HEIGHT;

  /* ---- rolagem horizontal DA COLUNA do grafo -------------------------- */

  /* Um repositorio com muitos merges vivos ao mesmo tempo desenhava uma coluna
     de 500px e alem, comendo o assunto do commit. Agora a coluna tem teto e o
     que passa dele rola AQUI DENTRO: as colunas de texto ficam paradas.

     O rolador e um `overflow-x-auto` de verdade — inercia, gesto de dois dedos
     e teclado vem de graca —, mas ele nao carrega conteudo nenhum: e uma barra
     de 10px com um espacador da largura do SPAN. Quem se desloca sao os `<svg>`
     das linhas, pela variavel CSS `--graph-scroll-x` que o `onScroll` escreve
     no no do grid. Uma escrita de estilo por quadro contra um re-render de
     todas as linhas montadas — a lista e virtualizada exatamente para isso nao
     acontecer. */
  const graphScrollRef = useRef<HTMLDivElement>(null);

  const handleGraphScroll = useCallback(() => {
    const el = graphScrollRef.current;
    if (el === null) return;
    gridRef.current?.style.setProperty("--graph-scroll-x", `${-el.scrollLeft}px`);
    setHintDismissed(true);
  }, []);

  /* Trocar de repositorio, filtrar ou simplesmente encolher a topologia muda o
     span: o navegador ja limita o `scrollLeft` do rolador sozinho, e este
     efeito copia o valor limitado de volta para a variavel. Sem ele, um grafo
     que deixa de ser rolavel ficaria congelado deslocado. */
  useEffect(() => {
    const left = graphScrollRef.current?.scrollLeft ?? 0;
    gridRef.current?.style.setProperty("--graph-scroll-x", `${-left}px`);
  }, [graphSpan, graphBox]);

  /* Roda do mouse: Shift+roda (o gesto classico) e o `deltaX` que o trackpad
     manda sozinho. Sem `preventDefault` de proposito — o listener de roda do
     React e passivo, e nao ha nada para cancelar: o container nao rola no eixo
     x, entao ninguem disputa o gesto. */
  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const el = graphScrollRef.current;
    if (el === null) return;
    const dx = event.shiftKey ? event.deltaY : event.deltaX;
    if (dx === 0) return;
    el.scrollLeft += dx;
  }, []);

  /* ARRASTAR O POLEGAR com o mouse. O toque nao passa por aqui: dentro de um
     rolador nativo o dedo ja arrasta o conteudo sozinho, e reagir ao pointer
     tambem faria a barra andar duas vezes. O fator de conversao e o inverso da
     razao que dimensiona o polegar — cada pixel de trilho vale `span / box`
     pixels de desenho. */
  const dragRef = useRef<{ x: number; left: number } | null>(null);

  const handleThumbDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const el = graphScrollRef.current;
    if (event.pointerType === "touch" || el === null) return;
    dragRef.current = { x: event.clientX, left: el.scrollLeft };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handleThumbMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const el = graphScrollRef.current;
      if (drag === null || el === null || graphBox === 0) return;
      el.scrollLeft = drag.left + (event.clientX - drag.x) * (graphSpan / graphBox);
    },
    [graphSpan, graphBox],
  );

  const handleThumbUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  /* O aviso dura um instante e morre no primeiro gesto de rolagem — quem ja
     viu uma vez nao precisa ver de novo no mesmo repositorio. */
  const [hintDismissed, setHintDismissed] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!scrollable) return;
    setHintDismissed(false);
    if (hintTimerRef.current !== null) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHintDismissed(true), 4000);
    return () => {
      if (hintTimerRef.current !== null) clearTimeout(hintTimerRef.current);
    };
  }, [scrollable]);

  const showHint = scrollable && !hintDismissed;

  /**
   * Leva a bola de uma lane ao centro da janela do grafo — e SO quando ela
   * esta fora dela.
   *
   * A guarda e o que separa "evidenciar o commit" de "sacudir a tela": clicar
   * numa linha cuja bola ja aparece nao pode deslocar o desenho. `laneX` JA e
   * o centro da bola (convencao presa por `paint.test.ts`); somar `nodeRadius`
   * moveria a fronteira em 14px e faria a rolagem disparar a toa.
   */
  const centerLane = useCallback(
    (lane: number) => {
      const scroller = graphScrollRef.current;
      if (scroller === null) return;
      const targetX = laneX(lane, metrics);
      if (targetX >= scroller.scrollLeft && targetX <= scroller.scrollLeft + graphBox) return;
      scroller.scrollTo({ left: targetX - graphBox / 2, behavior: "smooth" });
    },
    [metrics, graphBox],
  );

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

    /* Centralizar a LINHA nao basta quando o grafo passa do teto: a lane do
       commit revelado pode estar fora da janela horizontal da coluna. Depois
       do scroll vertical, leva a coluna ate ela. Vale nas duas densidades —
       antes so o compacto rolava de lado, agora o confortavel tambem tem
       coluna com teto. */
    if (plan !== null && plan.row !== null) {
      const node = layout.nodes[plan.row];
      if (node !== undefined) centerLane(node.lane);
    }
  }, [
    revealHash,
    revealNonce,
    layout,
    viewportHeight,
    metrics.rowHeight,
    loading,
    centerLane,
  ]);

  const handleSelect = useCallback<GraphViewProps["onSelect"]>(
    (hash, mode) => {
      if (mode !== "range") anchorRef.current = hash;
      onSelect(hash, mode);
      /* O clique direto numa linha tambem evidencia o commit: se a bola dele
         estiver fora da janela da coluna, a coluna rola ate centraliza-la — o
         mesmo gesto do reveal, so que disparado pela selecao. */
      const row = layout.index.get(hash);
      const node = row !== undefined ? layout.nodes[row] : undefined;
      if (node !== undefined) centerLane(node.lane);
    },
    [onSelect, layout, centerLane],
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
      graphBox,
      selected: selectedSet,
      primary,
      headHash,
      marked: mark,
      onSelect: handleSelect,
      onContextMenu,
      onRefActivate,
      onRefContextMenu,
      onFocusGrid: focusGrid,
      /* aditivo: o que muda com a densidade desce para as linhas */
      density,
      buildCommitMenu,
      buildRefMenu,
    }),
    [
      layout,
      metrics,
      graphBox,
      selectedSet,
      primary,
      headHash,
      mark,
      handleSelect,
      onContextMenu,
      onRefActivate,
      onRefContextMenu,
      focusGrid,
      density,
      buildCommitMenu,
      buildRefMenu,
    ],
  );

  const isEmpty = commits.length === 0;
  const showSkeleton = isEmpty && loading === true;

  /**
   * Cabecalho + lista + barra da coluna: o MESMO bloco nas duas densidades.
   *
   * O que a densidade troca e so o ENVOLTORIO. No compacto ele ainda rola para
   * o lado, mas agora por um motivo residual: com o teto da coluna a grade
   * inteira mede `compactContentWidth` (368px com o teto compacto) e cabe em
   * qualquer celular de 375px para cima — o rolador da linha so entra em acao
   * numa tela de 320px, onde a alternativa seria cortar o conteudo.
   */
  const content = (
    <>
      <ColumnHeader density={density} />

      {/* A BARRA DA COLUNA — so existe quando o desenho passa do teto.

          Ela nao contem o grafo: contem um espacador da largura do SPAN, e e o
          `onScroll` dela que desloca os `<svg>` das linhas pela variavel CSS.
          Larga exatamente como a coluna (`--graph-col`), entao fica sobre o
          grafo e nao sobre a descricao. `tabIndex` porque um rolador tem de ser
          alcancavel pelo teclado — com o foco nele, as setas rolam.

          POR QUE NO TOPO, e nao sob a lista, onde uma barra horizontal
          normalmente mora: a area de IA e `fixed inset-x-0 bottom-6` e flutua
          sobre o rodape de TODOS os paineis (`app/AiBar.tsx`; a armadilha esta
          descrita em `composing-shell-interface`). Medido a 1440x900 com a
          barra no rodape: a faixa ficava em y 866..876 e o
          `document.elementFromPoint` na ponta direita dela devolvia a secao da
          IA — ou seja, metade do controle era inclicavel. Encostada no
          cabecalho ela nunca disputa com nada. */}
      {scrollable && (
        <div
          className={cn(SCROLLER.rail, "border-b border-border")}
          onPointerDown={handleThumbDown}
          onPointerMove={handleThumbMove}
          onPointerUp={handleThumbUp}
          onPointerCancel={handleThumbUp}
        >
          <div
            ref={graphScrollRef}
            data-graph-scroller
            tabIndex={0}
            aria-label={t("graph.scroll.label")}
            onScroll={handleGraphScroll}
            className={SCROLLER.track}
          >
            <div className={SCROLLER.spacer} style={{ width: graphSpan }} />
          </div>
          <div aria-hidden className={SCROLLER.thumb} style={SCROLLER.thumbStyle} />
        </div>
      )}
      {/* o container medido fica SEMPRE montado, para o ResizeObserver nao
          perder o no quando o estado troca de esqueleto para arvore. */}
      <div ref={bodyRef} className="min-h-0 flex-1">
        {showSkeleton ? (
          <LoadingRows metrics={metrics} density={density} />
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

    </>
  );

  return (
    /* O `Provider` do Base UI e OBRIGATORIO aqui, e nao e enfeite: gatilho e
       balao moram em arvores diferentes (a linha esta dentro da lista
       virtualizada, o cartao esta fora dela) e e o provider que os liga. Sem
       ele o gatilho recebe o ponteiro, marca `data-base-ui-tooltip-trigger` no
       DOM e simplesmente nunca abre — falha muda, verificada por CDP.
       Nao emite elemento nenhum: e so contexto, entao o grid nao sente. */
    <Tooltip.Provider>
      <div
        ref={gridRef}
        role="grid"
        tabIndex={0}
        aria-label={t("graph.label")}
        /* `aria-colcount` acompanha a densidade: 5 colunas no confortavel
           (grafo, assunto, autor, data, hash), 3 no compacto (grafo, assunto,
           detalhes — autor, data e hash viraram uma linha de metadado). */
        aria-colcount={compact ? 3 : 5}
        aria-rowcount={commits.length + 1}
        aria-activedescendant={primary !== null ? rowDomId(primary) : undefined}
        data-graph-lanes={layout.laneCount}
        data-graph-edges={layout.edges.length}
        data-graph-elapsed={layout.elapsedMs.toFixed(2)}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
        style={graphVars(graphBox, graphSpan, metrics, density) as CSSProperties}
        className={cn(
          "relative flex h-full min-h-0 flex-col bg-surface-graph outline-none",
          "focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
          className,
        )}
      >
        {compact ? (
          /* `min-width` (CSS) e o que prende a largura de verdade: a grade
             inteira (coluna do grafo + assunto + meta) nunca fica menor que
             `compactContentWidth`, entao numa tela estreita demais ha o que
             rolar em vez de conteudo cortado. `overscroll-x-contain` devolve o
             gesto ao resto da pagina quando o conteudo termina. O CABECALHO
             mora dentro do rolador — fora dele espremeria as colunas ate
             desalinhar da lista. */
          <div className="min-h-0 flex-1 overflow-x-auto overscroll-x-contain">
            <div
              className="flex h-full min-h-0 flex-col"
              style={{ minWidth: compactContentWidth(graphBox) }}
            >
              {content}
            </div>
          </div>
        ) : (
          content
        )}

        {/* O aviso de rolagem lateral: aparece quando o desenho passa do teto
            da coluna, e so por um tempo — a primeira rolagem dispensa. Entra e
            sai como um balao: sem estado de movimento persistente no
            container, so a entrada e a saida do pill.

            Mora no TOPO pelo mesmo motivo da barra: no rodape a area de IA
            passa por cima dele. */}
        <AnimatePresence>
          {showHint && (
            <motion.div
              key="scroll-hint"
              role="status"
              initial={{ opacity: 0, y: 8, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: 8, x: "-50%" }}
              transition={ui}
              className="pointer-events-none absolute top-12 left-1/2 z-10"
            >
              <div className="flex items-center gap-1.5 rounded-full border border-border bg-popover px-3 py-1.5 text-[11px] text-muted-foreground shadow-lg">
                <ArrowLeftRight aria-hidden className="size-3.5 shrink-0" />
                {t("graph.hint.horizontalScroll")}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* UMA instancia de balao para a lista inteira, fora da virtualizacao: as
            linhas sao so gatilhos ligados a ela pelo handle. Montado aqui, e nao
            por linha, para nao custar um no de DOM e um fetch por linha visivel.
            No compacto nao ha gatilhos (o dedo cobre o alvo que segura), entao o
            balao nao e montado — o conteudo dele ja esta na linha. */}
        {!compact && <CommitTooltip />}
      </div>
    </Tooltip.Provider>
  );
}
