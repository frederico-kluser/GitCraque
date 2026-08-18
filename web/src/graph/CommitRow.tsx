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
 *
 * UMA EXCECAO: o corpo de um commit — comum ou merge — NAO vem de `paint.ts`
 * e o retrato do autor, desenhado aqui a partir de `gravatar.ts` (o desenho
 * continua sem decidir tamanho; o raio vem de `metrics`). O anel da lane que
 * borda o retrato e o traco que `paint.ts` ja punha no corpo.
 */
import { memo, useEffect, useId, useState } from "react";
import type { ComponentProps, MouseEvent } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { areEqual } from "react-window";
import type { ListChildComponentProps } from "react-window";
import { useMotionUITransition } from "@/components/motion-ui/ui-theme";
import { useDraggableEntity } from "@/dnd/bindings";
import { longPressMenu, useCommitDetail, withLongPress } from "@/hooks";
import { formatGitRelativeDate, t } from "@/i18n";
import { cn, laneVar, short } from "@/lib/utils";
import { ActionMenu } from "@/panels/parts";
import { toast } from "@/state/store";
import type { RawCommit } from "@/types/git";
import { clipEdgePath, laneX } from "./bezier.ts";
import { commitTooltip, TOOLTIP_DELAY } from "./CommitTooltip.tsx";
import { avatarLane, gravatarUrl, initialsOf } from "./gravatar.ts";
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

/**
 * O RETRATO DO AUTOR no lugar do corpo da bolinha — foto do Gravatar quando
 * existe, iniciais quando nao. E irmao do `CommitAvatar` do tooltip
 * (`CommitTooltip.tsx`): a MESMA logica de `gravatarUrl` + `initialsOf` +
 * `avatarLane`, so que desenhada em SVG, dentro do grupo que cresce no hover.
 *
 * A URL da foto e assincrona (o `gravatarUrl` faz um digest SHA-256), entao o
 * estado de carregamento vive AQUI, no proprio retrato: `CommitRow` e memoizado
 * por `areEqual` do react-window, e uma re-renderizacao de cada avatar a medida
 * que as fotos chegam nao pode vazar para a linha inteira. Ate a URL resolver
 * (ou o 404 derrubar) aparece o retrato de iniciais; a foto e que se sobrepoe
 * quando carrega — mesma arquitetura do tooltip.
 *
 * Nenhum numero de aparencia mora aqui: o raio e a espessura do traco vem de
 * `metrics` (via props) e o anel usa a cor da lane da linha. O pedido ao
 * Gravatar sai no DOBRO do tamanho exibido para nao borrar em tela retina,
 * como o tooltip faz com o `avatarPx`.
 *
 * Com `isMerge`, o retrato cresce do delta do merge e o fallback vira a bola
 * cheia da cor da lane — o merge e bola cheia, nao rosquinha.
 */
function CommitAvatarNode({
  name,
  email,
  radius,
  strokeWidth,
  laneColor,
  isMerge,
}: {
  name: string;
  email: string;
  radius: number;
  strokeWidth: number;
  laneColor: string;
  isMerge?: boolean;
}) {
  /* o corpo do merge e a bola cheia maior (`NODE.mergeDelta`): o retrato
     cresce junto, senao o anel do merge comeria a borda da foto. */
  const r = isMerge ? radius + NODE.mergeDelta : radius;
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  /* id unico para o `clipPath` da foto. O `useId` do React traz ":" no id e
     elas nao saem bem numa referencia `url(#...)`: fora elas. */
  const clipId = useId().replace(/:/g, "");

  useEffect(() => {
    let alive = true;
    setFailed(false);
    setUrl(null);
    /* o digest e assincrono: a URL so existe um tick depois do e-mail */
    void gravatarUrl(email, r * 4).then((next) => {
      if (alive) setUrl(next);
    });
    return () => {
      alive = false;
    };
  }, [email, r]);

  const initials = initialsOf(name, email);

  if (!url || failed) {
    return (
      <>
        {/* Um circulo so resolve o anel E o fundo: o fill sai da lane do autor
            (`avatarLane`, deterministica pelo e-mail) — no merge, da propria
            lane do commit, porque la a bola e cheia — e o traco e a cor da
            lane do commit, o anel de borda que o corpo tinha. */}
        <circle
          r={r}
          fill={isMerge ? laneColor : laneVar(avatarLane(email || name))}
          stroke={laneColor}
          strokeWidth={strokeWidth}
        />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={r * 0.7}
          fontWeight="500"
          className="fill-white"
        >
          {initials}
        </text>
      </>
    );
  }

  return (
    <>
      {/* O anel da lane por cima da foto, como borda: a foto e recortada um
          pouco menor (strokeWidth/2) para o traco nao comer a borda dela. */}
      <circle r={r} fill="none" stroke={laneColor} strokeWidth={strokeWidth} />
      <clipPath id={clipId}>
        <circle r={r - strokeWidth / 2} />
      </clipPath>
      <image
        href={url}
        x={-(r - strokeWidth / 2)}
        y={-(r - strokeWidth / 2)}
        width={2 * (r - strokeWidth / 2)}
        height={2 * (r - strokeWidth / 2)}
        clipPath={`url(#${clipId})`}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
        /* o `d=404` do Gravatar entrega o fallback: sem conta, o 404 vira
           `onError` e as iniciais voltam a aparecer */
        onError={() => setFailed(true)}
      />
    </>
  );
}

/**
 * A LINHA DE METADADOS da densidade compacta: autor, data, hash e contagem de
 * arquivos sob o assunto — o conteudo que o balao do hover mostra na
 * densidade confortavel, e que no celular nao existe (o dedo cobre o que
 * segura). Vive num COMPONENTE proprio de proposito: so ele monta (e pede) o
 * detalhe do commit, via `useCommitDetail` com cache de modulo — cada linha
 * visivel busca a rota uma vez, e a revisita sai do cache. A contagem de
 * arquivos e OPT-IN: enquanto o detalhe nao chega (ou falha), a linha mostra
 * so o que ja tinha em memoria.
 */
export function CommitMetaLine({ commit }: { commit: RawCommit }) {
  const detail = useCommitDetail(commit.hash);
  const files =
    detail.data !== null ? ` · ${t("graph.tooltip.files", { count: detail.data.stats.filesChanged })}` : "";

  return (
    <div className={cn("min-w-0 max-w-full truncate text-muted-foreground", TEXT.meta)}>
      {commit.authorName}
      {" · "}
      {formatGitRelativeDate(commit.relativeDate)}
      {" · "}
      {short(commit.hash)}
      {files}
    </div>
  );
}

export const CommitRow = memo(function CommitRow({
  index: row,
  style,
  data,
}: ListChildComponentProps<GraphRowData>) {
  const { layout, metrics, graphWidth, selected, primary, headHash, marked, density, buildCommitMenu } = data;
  const compact = density === "compact";
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

  /**
   * O botao direito do dedo: so existe quando o shell entrega o construtor dos
   * itens (`buildCommitMenu`). A selecao da linha acontece DENTRO do gesto,
   * como no clique direito do mouse — o menu abrir por cima de uma linha nao
   * selecionada com ela ainda nao selecionada e o bug classico que
   * `handleContextMenu` ja resolvia.
   */
  const press = buildCommitMenu
    ? longPressMenu(`Commit ${short(commit.hash)}`, () => {
        if (!isSelected) data.onSelect(commit.hash, "replace");
        return buildCommitMenu(commit.hash);
      })
    : null;

  /* Os listeners do arraste e do toque longo sao os MESMOS quatro eventos de
     ponteiro: espalhar dois objetos por cima um do outro apagaria o handler do
     vizinho em silencio, e o `tsc` nao acusa. `withLongPress` encadeia os dois,
     com o arranque do @dnd-kit PRIMEIRO — o arraste por toque acorda em
     `DND_DELAY_MS` (250) antes do menu em `LONG_PRESS_MS` (500) e o
     `cancelLongPress()` do motor morre no `onDragStart` do arraste. */
  const rowListeners = press ? withLongPress(draggable.listeners, press) : (draggable.listeners ?? {});

  /* A linha monta os mesmos atributos nas duas densidades; muda so o envoltorio
     (o balao do hover no confortavel, o `<div>` pelado no compacto). */
  const rowProps: ComponentProps<"div"> = {
    ...draggable.attributes,
    ...rowListeners,
    ref: draggable.setNodeRef,
    role: "row",
    tabIndex: -1,
    "aria-pressed": undefined,
    "aria-rowindex": row + 2 /* 1 e o cabecalho */,
    "aria-selected": isSelected,
    /* `data-dragging`/`data-revealed` entram INLINE, nos dois pontos de uso:
       a tipagem do React so conhece atributos `data-*` na forma de JSX. */
    /* `style` vem do react-window e ja traz position/top/height — e o que faz
       a linha ser um bloco de posicionamento para o realce abaixo. */
    style,
    className: cn(
      ROW_GRID,
      "group cursor-default select-none text-foreground",
      "data-[dragging]:opacity-40",
      /* Opt-in: a callout nativa do iOS (Copiar/Consultar) so morre onde ha
         menu de verdade. No ponteiro fino a classe nao declara nada. */
      press && "longpress-menu",
    ),
    onMouseDown: data.onFocusGrid,
    onClick: handleClick,
    /* Com bundle, o `onContextMenu` dele assume (preventDefault + seleciona +
       abre o menu do store); sem bundle, o caminho antigo do mouse. */
    onContextMenu: press ? press.onContextMenu : handleContextMenu,
  };

  const rowContent = (
    <>
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
            }).map((shape) => {
              /* o corpo de um commit — comum ou merge — NAO e desenhado por
                 `paint.ts`: no lugar dele entra o retrato do autor, logo
                 abaixo — e o miolo da raiz tambem, para nao pintar por cima
                 da foto. O anel de HEAD e o anel do merge continuam vindo de
                 la (no merge o anel fica por fora do retrato, de moldura). */
              if (shape.key === "body" || (!node.isMerge && shape.key === "root-core")) {
                return null;
              }
              return (
                <circle
                  key={shape.key}
                  r={shape.r}
                  fill={tone(shape.fill, laneColor)}
                  stroke={tone(shape.stroke, laneColor)}
                  strokeWidth={shape.strokeWidth}
                  opacity={shape.opacity}
                />
              );
            })}
            {/* O retrato do autor: corpo da bolinha de todo commit — comum ou
                merge —, com o anel colorido da lane como borda. No merge o
                anel externo (`merge-ring`) continua por fora, de moldura.
                Vive dentro do grupo que cresce no hover — a escala continua
                valendo para ele. */}
            <CommitAvatarNode
              name={commit.authorName}
              email={commit.authorEmail}
              radius={metrics.nodeRadius}
              strokeWidth={metrics.strokeWidth}
              laneColor={laneColor}
              isMerge={node.isMerge}
            />
            {/* A raiz nao muda de corpo por causa do retrato: o miolo cheio
                continua por cima da foto — e o que distingue o commit sem pai.
                Espelha o root-core de `paint.ts` (mesmo raio e mesma cor,
                resolvida aqui na cor da lane). */}
            {node.isRoot && !node.isMerge && (
              <circle r={metrics.nodeRadius * NODE.rootCoreRatio} fill={laneColor} />
            )}
          </g>
        </g>
      </svg>

      {/* `relative z-10` no gridcell de descricao (os dois ramos): com muitas
          lanes o `min-w-0` empurra a descricao para a direita e o chip de ref
          (shrink-0) transborda por cima das colunas de metadados (autor, data,
          hash) — pintadas DEPOIS na ordem do DOM, elas roubariam os ponteiros
          e o clique no chip abriria o menu do commit. O z-10 local coloca o
          transbordo acima delas em hit-testing e pintura, sem chegar aos
          overlays (z-40+). RefChip.tsx:8-14 — o chip e o alvo do produto. */}
      {/* ---- descricao: refs + assunto --------------------------------- */}
      {compact ? (
        /* No compacto a descricao empilha: os metadados que a coluna da direita
           nao tem mais espaco (autor, data, hash, arquivos) descem para a linha
           de baixo do assunto. `items-start` em vez de `center`: a pilha nao
           ocupa a altura toda e o realce da selecao continua escondendo os dois
           textos, nao so o de cima. */
        <div
          role="gridcell"
          className="relative z-10 flex min-w-0 flex-col items-start justify-center gap-0.5 py-1 pr-2 pl-2"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <RefChips
              refs={commit.refs}
              onActivate={data.onRefActivate}
              onContextMenu={data.onRefContextMenu}
              buildRefMenu={data.buildRefMenu}
            />
            <span className={cn("truncate", TEXT.subject, isPrimary && TEXT.subjectPrimary)}>
              {commit.subject}
            </span>
          </div>
          <CommitMetaLine commit={commit} />
        </div>
      ) : (
        <div role="gridcell" className="relative z-10 flex min-w-0 items-center gap-1.5 pr-3 pl-2">
          <RefChips
            refs={commit.refs}
            onActivate={data.onRefActivate}
            onContextMenu={data.onRefContextMenu}
            buildRefMenu={data.buildRefMenu}
          />
          <span className={cn("truncate", TEXT.subject, isPrimary && TEXT.subjectPrimary)}>
            {commit.subject}
          </span>
        </div>
      )}

      {/* ---- metadados: colunas de largura fixa ------------------------ */}
      {compact ? (
        /* Uma coluna so, e ela guarda o "⋯" — a entrada do MESMO menu por
           toque direto (o toque longo na linha segue valendo). O menu abre por
           cima da linha com `z-50`; os items sao os do `buildCommitMenu`, o
           construtor do shell, como no botao direito. */
        <div role="gridcell" className="flex min-w-0 items-center justify-end pr-2">
          {buildCommitMenu && (
            <ActionMenu items={buildCommitMenu(commit.hash)} label={`Commit ${short(commit.hash)}`} />
          )}
        </div>
      ) : (
        <>
          {/* Sem `title=` nas colunas de autor e data: o balao do hover ja
              mostra os dois, e o tooltip nativo do navegador subiria por cima
              dele. */}
          <div role="gridcell" className={cn("truncate pr-3 text-muted-foreground", TEXT.meta)}>
            {commit.authorName}
          </div>
          <div role="gridcell" className={cn("truncate pr-3 text-muted-foreground", TEXT.meta)}>
            {/* O `%ar` do git chega sempre em ingles (LC_ALL=C): a exibicao muda
                de idioma, o payload nao — `useCommitActivity` depende do
                original. */}
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
        </>
      )}
    </>
  );

  /* O envoltorio muda com a densidade. No confortavel a linha e o GATILHO do
     balao — e o `id` vai NO GATILHO: o Base UI usa o id como a IDENTIDADE do
     gatilho no seu registro, e posto so no elemento do `render` ele sobrescreve
     o id do DOM sem o registro saber, e o balao nunca abre (falha muda, com o
     ponteiro em cima e `data-base-ui-tooltip-trigger` no lugar). No compacto
     nao ha balao nenhum, e o `id` cai na propria linha, onde o
     `aria-activedescendant` e o reveal procuram — e assim o orcamento de nos
     por linha fica igual ao confortavel: um no de DOM a mais seria caro, e a
     conta e verificada em `__tests__/virtualization.domtest.ts`. */
  if (compact) {
    return (
      <div
        id={rowDomId(commit.hash)}
        {...rowProps}
        data-dragging={draggable.isDragging || undefined}
        data-revealed={isMarked || undefined}
      >
        {rowContent}
      </div>
    );
  }

  return (
    <Tooltip.Trigger
      handle={commitTooltip}
      payload={commit}
      delay={TOOLTIP_DELAY}
      disabled={draggable.isDragging}
      id={rowDomId(commit.hash)}
      render={
        <div
          {...rowProps}
          data-dragging={draggable.isDragging || undefined}
          data-revealed={isMarked || undefined}
        />
      }
    >
      {rowContent}
    </Tooltip.Trigger>
  );
}, areEqual);
