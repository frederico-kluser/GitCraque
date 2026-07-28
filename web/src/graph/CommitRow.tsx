/**
 * UMA linha da View Tree — e o coracao do requisito de performance.
 *
 * Cada linha monta o SEU proprio <svg> de altura `rowHeight` contendo apenas os
 * trechos de aresta que cruzam aquela faixa (ja recortados) e, quando for o
 * caso, o <circle> do commit. Um <svg> unico gigante com as 20 000 linhas e
 * proibido: e exatamente o que trava em repositorios grandes.
 *
 * A faixa de texto ao lado e um grid — colunas de metadados fixas, assunto
 * elastico — compartilhado com o cabecalho, entao nunca desalinha.
 */
import { memo } from "react";
import type { MouseEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { areEqual } from "react-window";
import type { ListChildComponentProps } from "react-window";
import { useMotionUITransition } from "@/components/motion-ui/ui-theme";
import { useDraggableEntity } from "@/dnd/bindings";
import { cn, laneVar, short } from "@/lib/utils";
import { clipEdgePath, laneX } from "./bezier.ts";
import { RefChips } from "./RefChip.tsx";
import { ROW_GRID, rowDomId } from "./shell.ts";
import type { GraphRowData } from "./shell.ts";

export const CommitRow = memo(function CommitRow({
  index: row,
  style,
  data,
}: ListChildComponentProps<GraphRowData>) {
  const { layout, metrics, graphWidth, selected, primary, headHash, marked } = data;
  const node = layout.nodes[row];
  const snap = useMotionUITransition("snap");
  const ui = useMotionUITransition("ui");
  /* o tema ja degrada sozinho, mas o realce do reveal e um efeito proprio: em
     modo reduzido ele aparece e some estatico, sem entrada nem saida. */
  const reduced = !!useReducedMotion();

  /* o gancho de arraste da frente de DND: todo commit e arrastavel. */
  const commit = node.commit;
  const draggable = useDraggableEntity({
    type: "commit",
    key: commit.hash,
    label: commit.subject,
    detail: commit.subject,
  });

  const isSelected = selected.has(commit.hash);
  const isPrimary = primary === commit.hash;
  const isHead = headHash === commit.hash;
  const isMarked = marked !== null && marked.hash === commit.hash;

  /* so as arestas que ATRAVESSAM esta linha, pelo indice pre-calculado. */
  const edges = layout.rowEdges.forRow(row);
  const cx = laneX(node.lane, metrics);
  const cy = metrics.rowHeight / 2;
  const laneColor = laneVar(node.color);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.shiftKey) data.onSelect(commit.hash, "range");
    else if (event.ctrlKey || event.metaKey) data.onSelect(commit.hash, "toggle");
    else data.onSelect(commit.hash, "replace");
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!data.onContextMenu) return;
    event.preventDefault();
    if (!isSelected) data.onSelect(commit.hash, "replace");
    data.onContextMenu(commit.hash, { x: event.clientX, y: event.clientY });
  };

  return (
    <div
      {...draggable.attributes}
      {...(draggable.listeners ?? {})}
      ref={draggable.setNodeRef}
      id={rowDomId(commit.hash)}
      role="row"
      tabIndex={-1}
      aria-pressed={undefined}
      aria-rowindex={row + 2 /* 1 e o cabecalho */}
      aria-selected={isSelected}
      data-dragging={draggable.isDragging || undefined}
      data-revealed={isMarked || undefined}
      /* `style` vem do react-window e ja traz position/top/height — e o que faz
         a linha ser um bloco de posicionamento para o realce abaixo. */
      style={style}
      className={cn(
        ROW_GRID,
        "cursor-default select-none text-sm text-foreground",
        "hover:bg-accent/40 data-[dragging]:opacity-40",
      )}
      onMouseDown={data.onFocusGrid}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {/* Realce da selecao: camada propria animada so em opacidade (regra de
          movimento do projeto), com o token "snap". */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-primary/12"
        initial={false}
        animate={{ opacity: isSelected ? 1 : 0 }}
        transition={snap}
      />
      {isPrimary && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-primary" />
      )}

      {/* Realce do REVEAL — temporario, apaga-se sozinho. Precisa se distinguir
          da selecao porque o commit revelado tambem fica selecionado: a selecao
          e so o banho de fundo, este aqui tem contorno e um pulo de escala na
          entrada. So `opacity` e `transform` animam; a saida vem do
          `AnimatePresence`, que em modo reduzido simplesmente nao existe (sem
          `exit`, a remocao e imediata). */}
      {/* sem `initial={false}` de proposito: a rolagem costuma MONTAR a linha
          revelada ja marcada, e e justamente nesse caso que o realce precisa
          entrar animado. */}
      <AnimatePresence>
        {isMarked && (
          <motion.span
            key={marked.nonce}
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-primary/20 ring-2 ring-primary ring-inset"
            initial={reduced ? false : { opacity: 0, scaleY: 0.82 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={ui}
          />
        )}
      </AnimatePresence>

      {/* ---- coluna do grafo ------------------------------------------- */}
      <svg
        role="gridcell"
        aria-label={`lane ${node.lane}`}
        width={graphWidth}
        height={metrics.rowHeight}
        viewBox={`0 0 ${graphWidth} ${metrics.rowHeight}`}
        className="pointer-events-none relative block overflow-hidden"
      >
        {edges.map((edge) => {
          const d = clipEdgePath(edge, metrics, row, row);
          if (d === null) return null;
          return (
            <path
              key={edge.id}
              d={d}
              fill="none"
              stroke={laneVar(edge.color)}
              strokeWidth={metrics.strokeWidth}
              strokeLinecap="round"
              opacity={0.9}
            />
          );
        })}

        {/* halo da selecao — escala e opacidade, nunca o raio */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={metrics.nodeRadius + 4.5}
          fill={laneColor}
          initial={false}
          animate={{ opacity: isSelected ? 0.22 : 0, scale: isSelected ? 1 : 0.6 }}
          transition={snap}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        {isHead && (
          <circle
            cx={cx}
            cy={cy}
            r={metrics.nodeRadius + 3}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={1.25}
          />
        )}
        <circle
          cx={cx}
          cy={cy}
          r={node.isMerge ? metrics.nodeRadius + 1.5 : metrics.nodeRadius}
          fill={node.isMerge ? laneColor : "var(--surface-graph)"}
          stroke={laneColor}
          strokeWidth={metrics.strokeWidth}
        />
        {node.isRoot && !node.isMerge && (
          <circle cx={cx} cy={cy} r={metrics.nodeRadius - 2} fill={laneColor} />
        )}
      </svg>

      {/* ---- descricao: refs + assunto --------------------------------- */}
      <div role="gridcell" className="flex min-w-0 items-center gap-1.5 pr-3 pl-2">
        <RefChips refs={commit.refs} />
        <span className={cn("truncate", isPrimary && "font-medium")}>{commit.subject}</span>
      </div>

      {/* ---- metadados: colunas de largura fixa ------------------------ */}
      <div
        role="gridcell"
        className="truncate pr-3 text-xs text-muted-foreground"
        title={commit.authorEmail}
      >
        {commit.authorName}
      </div>
      <div role="gridcell" className="truncate pr-3 text-xs text-muted-foreground">
        {commit.relativeDate}
      </div>
      <div role="gridcell" className="truncate pr-2 font-mono text-xs text-muted-foreground">
        {short(commit.hash)}
      </div>
    </div>
  );
}, areEqual);
