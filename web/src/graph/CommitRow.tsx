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
 *
 * O QUE E DESENHO E O QUE E COMPORTAMENTO. Nenhum numero de aparencia mora
 * aqui: raio, curvatura, escala do hover, arredondamento e corpo do texto saem
 * todos de `paint.ts`. Este arquivo so decide QUANDO cada forma existe; a forma
 * em si vem de la. Para mudar o visual, va em `paint.ts`.
 */
import { memo } from "react";
import type { MouseEvent } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { areEqual } from "react-window";
import type { ListChildComponentProps } from "react-window";
import { useMotionUITransition } from "@/components/motion-ui/ui-theme";
import { useDraggableEntity } from "@/dnd/bindings";
import { formatGitRelativeDate, t } from "@/i18n";
import { cn, laneVar, short } from "@/lib/utils";
import { toast } from "@/state/store";
import { clipEdgePath, laneX } from "./bezier.ts";
import { commitTooltip, TOOLTIP_DELAY } from "./CommitTooltip.tsx";
import { commitNodeShapes, EDGE, NODE, SURFACE, TEXT } from "./paint.ts";
import type { PaintTone } from "./paint.ts";
import { RefChips } from "./RefChip.tsx";
import { ROW_GRID, rowDomId } from "./shell.ts";
import type { GraphRowData } from "./shell.ts";

/**
 * Resolve o apelido de cor de `paint.ts` no token do tema. Existe para que o
 * desenho possa ser descrito sem saber a cor da lane, que so esta linha conhece.
 */
const tone = (value: PaintTone, laneColor: string): string =>
  value === "lane"
    ? laneColor
    : value === "surface"
      ? "var(--surface-graph)"
      : value === "primary"
        ? "var(--primary)"
        : "none";

/**
 * O grupo do no cresce sob o ponteiro — em CSS puro, de proposito.
 *
 * Com `useState` o hover re-renderizaria a linha a cada entrada e saida do
 * ponteiro, no meio de uma lista virtualizada que existe justamente para nao
 * re-renderizar. `:hover` resolve sem estado, sem re-render e sem um no de DOM a
 * mais — e o orcamento de nos por linha e apertado
 * (`__tests__/virtualization.domtest.ts`).
 *
 * `pointer-events-auto` reabre o teste de ponteiro que o <svg> desliga: so o no
 * responde ao ponteiro, as arestas nao. O alvo do hover e a uniao das formas
 * PINTADAS do grupo — inclusive o halo da selecao, que fica invisivel mas
 * continua sendo alvo, e por isso da a folga de alguns px que faz acertar a bola
 * ser confortavel.
 */
const NODE_GROUP_CLASS = cn(
  "pointer-events-auto [scale:1] hover:[scale:var(--graph-node-hover)]",
  "transition-[scale] duration-[var(--motion-ui-transition-snap-duration)]",
  "ease-[var(--motion-ui-transition-snap)] motion-reduce:transition-none",
);

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
  }, "graph");

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

  /* Clicar na coluna Hash copia o hash COMPLETO — o curto e so o que cabe na
     coluna. `stopPropagation` porque copiar nao e selecionar: a linha continua
     de fora do clique. */
  const handleCopyHash = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(commit.hash);
      toast("success", t("copy.hash"), commit.hash);
    } catch {
      /* clipboard negado (contexto inseguro, permissao) — nao ha plano B util */
      toast("error", t("graph.copyHash.failed"), commit.hash);
    }
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!data.onContextMenu) return;
    event.preventDefault();
    if (!isSelected) data.onSelect(commit.hash, "replace");
    data.onContextMenu(commit.hash, { x: event.clientX, y: event.clientY });
  };

  return (
    /* O balao do hover entra como GATILHO da propria linha, pela prop `render`:
       o Base UI funde os seus handlers no <div> que ja existia em vez de
       embrulha-lo. Um elemento a mais por linha aqui seria caro — o orcamento de
       nos de DOM e verificado em `__tests__/virtualization.domtest.ts`.

       `disabled` enquanto arrasta: o cartao seguindo o ponteiro no meio de um
       arraste atrapalharia a leitura do alvo do drop.

       O `id` vai NO GATILHO, nunca no <div> de dentro. O Base UI usa o id como
       a IDENTIDADE do gatilho no seu registro; posto so no elemento do `render`
       ele sobrescreve o id do DOM sem o registro saber, e o balao nunca abre —
       falha muda, com o ponteiro em cima e `data-base-ui-tooltip-trigger` no
       lugar. Bisseccao por CDP: o mesmo id no <div> quebra um gatilho que
       funcionava; movido para ca, volta a abrir. */
    <Tooltip.Trigger
      handle={commitTooltip}
      payload={commit}
      delay={TOOLTIP_DELAY}
      disabled={draggable.isDragging}
      id={rowDomId(commit.hash)}
      render={
        <div
          {...draggable.attributes}
          {...(draggable.listeners ?? {})}
          ref={draggable.setNodeRef}
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
            "group cursor-default select-none text-foreground",
            "data-[dragging]:opacity-40",
          )}
          onMouseDown={data.onFocusGrid}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
        />
      }
    >
      {/* As tres camadas de realce sao a MESMA pilula (`SURFACE.pill`): mesmo
          recuo, mesmo raio. Fossem caixas diferentes, hover e selecao juntos
          apareceriam desencontrados por um px. */}

      {/* Hover: so CSS, pelo `group` da linha. Nao ha estado nem re-render — a
          lista e virtualizada e um `useState` de hover custaria um render por
          movimento do ponteiro. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute opacity-0 group-hover:opacity-100",
          "transition-opacity duration-[var(--motion-ui-transition-snap-duration)]",
          "ease-[var(--motion-ui-transition-snap)] motion-reduce:transition-none",
          SURFACE.pill,
          SURFACE.hover,
        )}
      />

      {/* Realce da selecao: camada propria animada so em opacidade (regra de
          movimento do projeto), com o token "snap". */}
      <motion.span
        aria-hidden
        className={cn("pointer-events-none absolute", SURFACE.pill, SURFACE.selected)}
        initial={false}
        animate={{ opacity: isSelected ? 1 : 0 }}
        transition={snap}
      />
      {isPrimary && (
        <span aria-hidden className={cn("pointer-events-none absolute", SURFACE.primaryBar)} />
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
            className={cn("pointer-events-none absolute", SURFACE.pill, SURFACE.marked)}
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
              strokeLinecap={EDGE.linecap}
              strokeLinejoin={EDGE.linejoin}
              opacity={EDGE.opacity}
            />
          );
        })}

        {/* O no inteiro num grupo TRANSLADADO ate o centro: assim as formas sao
            todas concentricas em (0,0) e a escala do hover nao precisa saber
            onde a lane esta. */}
        <g transform={`translate(${cx} ${cy})`}>
          <g className={NODE_GROUP_CLASS} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
            {/* Halo da selecao — escala e opacidade, nunca o raio. Fica DENTRO
                do grupo que cresce, entao a bola nunca escapa do proprio halo.
                Invisivel em repouso, mas ainda assim alvo do ponteiro: e ele que
                da folga ao hover. */}
            <motion.circle
              r={metrics.nodeRadius + NODE.haloDelta}
              fill={laneColor}
              initial={false}
              animate={{
                opacity: isSelected ? NODE.haloOpacity : 0,
                scale: isSelected ? 1 : NODE.haloRestScale,
              }}
              transition={snap}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            />
            {/* As formas do no vem prontas de `paint.ts` — aqui so viram
                elementos. Acrescentar um anel, mudar um raio ou trocar o miolo
                da raiz e mexer LA, nao aqui. */}
            {commitNodeShapes({
              isMerge: node.isMerge,
              isRoot: node.isRoot,
              isHead,
            }).map((shape) => (
              <circle
                key={shape.key}
                r={shape.r}
                fill={tone(shape.fill, laneColor)}
                stroke={tone(shape.stroke, laneColor)}
                strokeWidth={shape.strokeWidth}
                opacity={shape.opacity}
              />
            ))}
          </g>
        </g>
      </svg>

      {/* ---- descricao: refs + assunto --------------------------------- */}
      <div role="gridcell" className="flex min-w-0 items-center gap-1.5 pr-3 pl-2">
        <RefChips
          refs={commit.refs}
          onActivate={data.onRefActivate}
          onContextMenu={data.onRefContextMenu}
        />
        <span className={cn("truncate", TEXT.subject, isPrimary && TEXT.subjectPrimary)}>
          {commit.subject}
        </span>
      </div>

      {/* ---- metadados: colunas de largura fixa ------------------------ */}
      {/* Sem `title=` nas colunas de autor e data: o balao do hover ja mostra os
          dois, e o tooltip nativo do navegador subiria por cima dele. */}
      <div role="gridcell" className={cn("truncate pr-3 text-muted-foreground", TEXT.meta)}>
        {commit.authorName}
      </div>
      <div role="gridcell" className={cn("truncate pr-3 text-muted-foreground", TEXT.meta)}>
        {/* O `%ar` do git chega sempre em ingles (LC_ALL=C): a exibicao muda de
            idioma, o payload nao — `useCommitActivity` depende do original. */}
        {formatGitRelativeDate(commit.relativeDate)}
      </div>
      {/* O `copy-button` do catalogo nao serve aqui: ele traz botao e glifo
          proprios, e o alvo do clique tem de ser o proprio hash da coluna. */}
      <div role="gridcell" className="min-w-0 pr-2">
        <button
          type="button"
          onClick={(event) => void handleCopyHash(event)}
          title={t("graph.copyHash")}
          aria-label={t("graph.copyHash.aria", { hash: commit.hash })}
          className={cn(
            "-mx-1 block max-w-full truncate rounded-md px-1 font-mono text-muted-foreground",
            TEXT.meta,
            "transition-colors duration-[var(--motion-ui-transition-snap-duration)]",
            "ease-[var(--motion-ui-transition-snap)] hover:bg-accent hover:text-foreground",
            "outline-none focus-visible:ring-1 focus-visible:ring-ring",
          )}
        >
          {short(commit.hash)}
        </button>
      </div>
    </Tooltip.Trigger>
  );
}, areEqual);
