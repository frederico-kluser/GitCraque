/**
 * Sidebar direito: duas gavetas empilhadas, divididas por uma divisoria
 * arrastavel.
 *
 *   Detalhe   → metadados do commit selecionado e a lista de arquivos
 *   Trabalho  → abas Alteracoes (staging) e Visualizador (diff/markdown/cru)
 *
 * Antes o de baixo era uma faixa horizontal no rodape do shell. Passou para ca
 * porque as duas coisas falam do MESMO commit: a lista de arquivos e o conteudo
 * do arquivo escolhido ficavam em cantos opostos da tela, e o olho tinha de
 * atravessar o grafo inteiro a cada clique.
 *
 * Cada gaveta minimiza e maximiza. Os dois gestos sao o mesmo movimento visto
 * de lados diferentes — minimizar uma E maximizar a outra —, entao o estado e
 * um so (`sideLayout`), e nao dois booleanos que poderiam se contradizer.
 *
 * CASCATA: o catalogo do Motion UI nao tem gaveta redimensionavel com
 * minimizar/maximizar (o `accordion` de la e altura automatica por conteudo, sem
 * divisoria nem estado maximizado). O cabecalho, os controles e a mecanica de
 * colapso estao escritos aqui; o que veio do catalogo e o `SmoothTabs` das abas
 * de trabalho e a transicao de tamanho, que sai dos tokens do tema.
 */
import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, Maximize2, Minimize2, Minus } from "lucide-react";
import {
  SIDE_RANGE,
  minimizeSide,
  restoreSide,
  setSideSplit,
  toggleMaximizeSide,
  useShellState,
} from "@/hooks";
import type { SideLayout } from "@/hooks";
import { Splitter } from "@/app/Splitter";
import { cn } from "@/lib/utils";
import type { PanelProps } from "@/types/modules";
import { DetailPanel } from "./DetailPanel";
import { WorkDock } from "./WorkDock";
import { FOCUS_RING, ToolButton } from "./parts";

export type SideDrawerId = "detail" | "work";

/* ------------------------------------------------------------------ */
/* Controles                                                           */
/* ------------------------------------------------------------------ */

/**
 * Minimizar e maximizar de uma gaveta.
 *
 * Ficam sempre os dois visiveis, mesmo quando um deles e redundante, porque
 * esconder um controle conforme o estado obriga a pessoa a descobrir de novo
 * onde ele foi parar a cada mudanca.
 */
export function DrawerControls({
  id,
  layout,
  nome,
}: {
  id: SideDrawerId;
  layout: SideLayout;
  nome: string;
}) {
  const colapsada = layout !== "split" && layout !== id;
  const maximizada = layout === id;

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <ToolButton
        size="sm"
        tone="ghost"
        aria-label={`Minimizar ${nome}`}
        title={`Minimizar ${nome}`}
        disabled={colapsada}
        onClick={() => minimizeSide(id)}
        icon={<Minus className="size-3.5" />}
      />
      <ToolButton
        size="sm"
        tone="ghost"
        aria-label={maximizada ? `Restaurar ${nome}` : `Maximizar ${nome}`}
        title={maximizada ? `Restaurar ${nome}` : `Maximizar ${nome}`}
        active={maximizada}
        onClick={() => toggleMaximizeSide(id)}
        icon={
          maximizada ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cabecalho de gaveta colapsada                                       */
/* ------------------------------------------------------------------ */

/**
 * Quando a gaveta esta recolhida, o cabecalho INTEIRO volta a abri-la. Deixar
 * so o botao clicavel transforma uma faixa de 28 px de altura num alvo de 20 px.
 */
function CollapsedBar({
  id,
  nome,
  badge,
  posicao,
  layout,
}: {
  id: SideDrawerId;
  nome: string;
  badge?: ReactNode;
  posicao: "topo" | "base";
  layout: SideLayout;
}) {
  const Seta = posicao === "topo" ? ChevronDown : ChevronUp;
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 bg-surface-rail px-3 py-1.5",
        posicao === "topo" ? "border-b border-border" : "border-t border-border",
      )}
    >
      <button
        type="button"
        onClick={restoreSide}
        aria-label={`Expandir ${nome}`}
        title={`Expandir ${nome}`}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-md py-0.5 text-left",
          "hover:text-foreground",
          FOCUS_RING,
        )}
      >
        <Seta className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {nome}
        </span>
        {badge}
      </button>
      <DrawerControls id={id} layout={layout} nome={nome} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

export function SidePanel({ className }: PanelProps) {
  const layout = useShellState((s) => s.sideLayout);
  const sideSplit = useShellState((s) => s.sideSplit);

  const detalheColapsada = layout === "work";
  const trabalhoColapsada = layout === "detail";

  /**
   * As tres formas do grid. A gaveta colapsada vira `auto` — a altura do proprio
   * cabecalho — e a divisoria some, porque nao ha o que dividir.
   */
  const rows = detalheColapsada
    ? "auto 0px minmax(0,1fr)"
    : trabalhoColapsada
      ? "minmax(0,1fr) 0px auto"
      : `${sideSplit}px auto minmax(0,1fr)`;

  return (
    /* Sem transicao no `grid-template-rows`: colapsar troca `1fr` por `auto`, e
       essas duas unidades nao interpolam — a animacao sairia pela metade, o que
       e pior que nao ter. O movimento fica no conteudo, nao na caixa. */
    <aside
      className={cn("grid min-h-0 min-w-0", className)}
      style={{ gridTemplateRows: rows }}
      aria-label="Detalhe e trabalho"
    >
      {/* --- gaveta de cima: detalhe do commit --- */}
      {detalheColapsada ? (
        <CollapsedBar id="detail" nome="Detalhe" posicao="topo" layout={layout} />
      ) : (
        <DetailPanel
          className="min-h-0 bg-card"
          headerExtra={<DrawerControls id="detail" layout={layout} nome="Detalhe" />}
        />
      )}

      {/* --- divisoria: so existe quando as duas estao abertas --- */}
      {layout === "split" ? (
        <Splitter
          axis="y"
          value={sideSplit}
          min={SIDE_RANGE.min}
          max={SIDE_RANGE.max}
          label="Altura do detalhe do commit"
          onChange={setSideSplit}
        />
      ) : (
        <div aria-hidden />
      )}

      {/* --- gaveta de baixo: alteracoes e visualizador --- */}
      {trabalhoColapsada ? (
        <CollapsedBar id="work" nome="Trabalho" posicao="base" layout={layout} />
      ) : (
        <WorkDock
          className="min-h-0 border-t border-border"
          controls={<DrawerControls id="work" layout={layout} nome="Trabalho" />}
        />
      )}
    </aside>
  );
}
