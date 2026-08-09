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
 *   src/panels/   → RailPanels, DetailPanel, BottomDock, StatusPanel, Toolbar
 *   src/app/      → App                                 (shell que monta tudo)
 */
import type { ReactNode } from "react";
import type {
  CommitRef,
  DragIntent,
  DragPayload,
  DropPayload,
  RawCommit,
  RefsPayload,
} from "./git";
import type { Translate } from "@/i18n/types";
import type { MenuItemSpec } from "@/hooks";

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
   * ACRESCENTADO (aditivo): menu de contexto sobre um CHIP de referencia.
   *
   * Irmao de `onRefActivate` e pela mesma razao: o grafo nao sabe o que se pode
   * fazer com uma branch — ele so avisa em qual chip foi o clique direito. O
   * chip so consome o evento quando o shell devolve algo; sem handler (ou com
   * menu vazio, no caso de um chip de stash ou de HEAD solto) o clique CAI para
   * a linha, e quem responde e o menu do commit.
   */
  onRefContextMenu?: (refEntry: CommitRef, position: { x: number; y: number }) => void;
  /**
   * ACRESCENTADO (aditivo): duplo clique num chip de referencia do grafo.
   *
   * O grafo nao decide o que "ativar uma branch" significa — ele nao pode
   * importar as acoes do shell sem inverter a dependencia entre os modulos.
   * Ele so avisa qual ref foi ativada; quem faz o checkout e o shell.
   */
  onRefActivate?: (refEntry: CommitRef) => void;
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
  /**
   * ACRESCENTADO pela frente da casca (aditivo — nada removido nem renomeado).
   *
   * Densidade da coluna do grafo. `"comfortable"` e o desenho de sempre;
   * `"compact"` e o de tela pequena, onde a linha encolhe para caber mais
   * historia na altura de um celular.
   *
   * Entra por PROP, e nao por um `useViewport` dentro do grafo, por um motivo
   * mecanico: o `getServerSnapshot` do `useViewport` devolve desktop, e
   * `graph/__tests__/virtualization.domtest.ts` renderiza o `GraphView` com
   * `renderToStaticMarkup` — um hook faria o caminho movel nunca ser
   * exercitado e a suite reportaria verde para sempre. Como prop, o teste
   * escolhe a densidade e ve as duas.
   *
   * Irmao de `metrics`: quem quiser um numero especifico continua passando
   * `metrics`, que vence campo a campo. Esta prop e o atalho nomeado para o
   * conjunto inteiro.
   */
  density?: "comfortable" | "compact";
  /**
   * ACRESCENTADO (aditivo): menu de contexto de um COMMIT, pronto para o dedo.
   *
   * O grafo nao sabe o que se pode fazer com um commit — ele nao pode importar
   * as acoes do shell sem inverter a dependencia entre os modulos. O shell
   * passa o CONSTRUTOR dos itens, e a linha os consome em tres lugares:
   * toque longo (o botao direito do dedo), clique direito do mouse e o botao
   * "⋯" da coluna de metadados na densidade compacta. Lista vazia nao abre
   * menu (regra do `openContextMenu`); sem este construtor, a linha se
   * comporta como antes desta prop existir.
   */
  buildCommitMenu?: (hash: string) => MenuItemSpec[];
  /**
   * ACRESCENTADO (aditivo): menu de contexto de um CHIP de referencia, pronto
   * para o dedo. Irmao de `buildCommitMenu`; quando ausente, o chip mantem o
   * comportamento de `onRefContextMenu` (apenas mouse).
   */
  buildRefMenu?: (refEntry: CommitRef) => MenuItemSpec[];
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
 *
 * ACRESCENTADO (aditivo): `context.t`. O motor e puro e nao pode importar o
 * i18n (ver o cabecalho de `dnd/intents.ts`), entao o tradutor entra por aqui —
 * e assim `title`, `description` e `reason` saem no idioma da interface.
 */
export type ResolveDragIntent = (
  source: DragPayload,
  target: DropPayload,
  context: { refs: RefsPayload | null; headBranch: string | null; t: Translate },
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
