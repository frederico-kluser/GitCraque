/**
 * FRONTEIRAS ENTRE MODULOS.
 *
 * O app e escrito por quatro frentes em paralelo. Cada modulo e dono absoluto
 * do seu diretorio, mas o que ele EXPOE para os outros esta declarado aqui.
 * Mudar uma assinatura destas quebra outro modulo — nao mude sem alinhar.
 *
 *   src/graph/    → GraphView, computeGraphLayout      (motor SVG + virtualizacao)
 *   src/dnd/      → GitDndProvider, resolveDragIntent  (motor semantico @dnd-kit)
 *   src/dialogs/  → DialogHost                          (confirmacoes das intencoes)
 *   src/panels/   → RailPanels, DetailPanel, ConsolePanel, StatusPanel
 *   src/app/      → App                                 (shell que monta tudo)
 */
import type { ReactNode } from "react";
import type {
  DragIntent,
  DragPayload,
  DropPayload,
  RawCommit,
  RefsPayload,
} from "./git";

/* ================================================================== *
 * src/graph — motor do grafo
 * ================================================================== */

/** Um commit ja posicionado na matriz (X = lane, Y = ordem topologica). */
export interface PositionedCommit {
  commit: RawCommit;
  /** indice topologico — a linha. Y em px = row * rowHeight. */
  row: number;
  /** coluna/lane calculada pela heuristica de filhos de ramificacao e mesclagem. */
  lane: number;
  /** cor da lane (indice ciclico em --lane-N) */
  color: number;
  /** true quando o commit tem mais de um pai */
  isMerge: boolean;
  /** true quando nenhum outro commit o tem como pai (ponta de ramo) */
  isTip: boolean;
  /** true quando nao tem pais */
  isRoot: boolean;
}

export type EdgeKind =
  /** continuacao na mesma lane */
  | "straight"
  /** o filho abriu um ramo novo: sai da lane do pai para a lane do filho */
  | "branch"
  /** segundo pai (ou posterior) de um merge chegando de outra lane */
  | "merge";

/** Uma aresta pai→filho, ja com os pontos para o <path> de Bezier cubica. */
export interface GraphEdge {
  id: string;
  fromHash: string;
  toHash: string;
  /** linha/lane do filho (topo do desenho, menor row) */
  fromRow: number;
  fromLane: number;
  /** linha/lane do pai (base do desenho, maior row) */
  toRow: number;
  toLane: number;
  /**
   * ACRESCENTADO pela frente do grafo (aditivo — nada foi removido nem renomeado).
   *
   * Lane pela qual a aresta TRANSITA entre os dois extremos. E a lane que ficou
   * reservada durante todo o intervalo [fromRow, toRow], portanto comprovadamente
   * sem nenhum commit em cima. A geometria curva de `fromLane` para ela logo
   * abaixo do filho, corre reta no meio, e curva dela para `toLane` logo acima do
   * pai — e por isso nenhuma aresta cruza o <circle> de um commit alheio.
   *
   * Igual a `fromLane` nas arestas de primeiro pai; e a lane nova alocada a
   * direita nas arestas de merge.
   */
  throughLane: number;
  kind: EdgeKind;
  /** cor herdada da lane que "possui" a aresta */
  color: number;
}

/**
 * ACRESCENTADO pela frente do grafo (aditivo).
 *
 * Indice `row → GraphEdge[]`: as arestas que ATRAVESSAM cada linha
 * (`fromRow <= row <= toRow`). Sem ele a virtualizacao teria de varrer todas as
 * arestas do repositorio para desenhar uma unica faixa visivel.
 *
 * A implementacao e por blocos de linhas, entao o custo de montagem nao explode
 * quando uma aresta atravessa milhares de linhas.
 */
export interface GraphRowIndex {
  /** arestas que atravessam esta linha, em ordem estavel. */
  forRow(row: number): GraphEdge[];
  /** arestas que atravessam qualquer linha da faixa [startRow, endRow]. */
  forRange(startRow: number, endRow: number): GraphEdge[];
}

export interface GraphLayout {
  nodes: PositionedCommit[];
  edges: GraphEdge[];
  /** mapa hash → indice em `nodes`, para lookup O(1) */
  index: Map<string, number>;
  /** maior lane usada + 1 — define a largura da coluna do grafo */
  laneCount: number;
  /** ms gastos no calculo, exibido no rodape de diagnostico */
  elapsedMs: number;
  /** ACRESCENTADO pela frente do grafo: indice de arestas por linha. */
  rowEdges: GraphRowIndex;
}

export interface GraphMetrics {
  /** altura de cada linha em px */
  rowHeight: number;
  /** distancia horizontal entre lanes em px */
  laneWidth: number;
  /** raio do <circle> do commit */
  nodeRadius: number;
  /** margem esquerda antes da lane 0 */
  paddingLeft: number;
  /** espessura do <path> */
  strokeWidth: number;
}

export interface GraphViewProps {
  /** commits em ordem topologica, exatamente como vieram do backend */
  commits: RawCommit[];
  refs: RefsPayload | null;
  /** hashes selecionados (multi-selecao alimenta o squash) */
  selected: string[];
  /** hash focado */
  primary: string | null;
  onSelect: (hash: string, mode: "replace" | "toggle" | "range") => void;
  /** menu de contexto do botao direito sobre um commit */
  onContextMenu?: (hash: string, position: { x: number; y: number }) => void;
  /**
   * ACRESCENTADO (aditivo): pedido de "role ate este commit e marque a linha".
   *
   * Vem de clicar numa branch ou tag no rail. O `nonce` muda a cada pedido, e e
   * ELE que o grafo observa — clicar duas vezes na mesma branch tem de rolar de
   * novo, e so o hash nao mudaria nada na segunda vez. Depois de atender,
   * chame `onRevealed` para o store limpar o pedido.
   */
  reveal?: { hash: string; nonce: number; origin: "ref" | "command" | "detail" } | null;
  onRevealed?: () => void;
  /** metricas opcionais; o modulo tem defaults sensatos */
  metrics?: Partial<GraphMetrics>;
  /** exibido quando `commits` esta vazio por carregamento */
  loading?: boolean;
  className?: string;
}

/* ================================================================== *
 * src/dnd — motor semantico
 * ================================================================== */

export interface GitDndProviderProps {
  children: ReactNode;
  /**
   * Chamado quando o motor resolve uma intencao valida em onDragEnd.
   * O consumidor (o shell) joga isso no store, e o DialogHost confirma.
   */
  onIntent: (intent: DragIntent) => void;
}

/**
 * A funcao pura que implementa as regras duras de intercepcao:
 *   commit → branch  ⇒ cherry-pick
 *   branch → branch  ⇒ merge | rebase
 * Tudo o mais e `allowed: false` com um motivo legivel.
 */
export type ResolveDragIntent = (
  source: DragPayload,
  target: DropPayload,
  context: { refs: RefsPayload | null; headBranch: string | null },
) => DragIntent;

/* ================================================================== *
 * src/dialogs — confirmacoes
 * ================================================================== */

export interface DialogHostProps {
  /** intencao pendente vinda do DND; null fecha o dialogo */
  intent: DragIntent | null;
  onClose: () => void;
}

/* ================================================================== *
 * src/panels — paineis do shell
 * ================================================================== */

export interface PanelProps {
  className?: string;
}
