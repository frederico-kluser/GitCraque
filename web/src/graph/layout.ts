/**
 * MOTOR DE LAYOUT DO GRAFO — algoritmo proprio, sem nenhuma biblioteca de
 * gitgraph (regra 1 do produto).
 *
 * Coordenadas (docs/ARCHITECTURE.md §2):
 *   Y = ordem topologica. `row` e o indice do array como o backend devolveu,
 *       de `git log --all --topo-order`. Nada e reordenado aqui.
 *   X = lane, alocada pela heuristica de filhos de ramificacao x mesclagem.
 *
 * A varredura e uma unica passada de cima para baixo (mais novo -> mais antigo)
 * mantendo um vetor de lanes ativas; cada lane ativa guarda o hash que ela esta
 * esperando encontrar. `--topo-order` garante que todo filho ja foi processado
 * quando o pai chega, e e disso que a heuristica vive.
 *
 * Custo: O(commits + arestas) em Map/Set. A unica varredura linear e a busca da
 * primeira lane livre, que percorre o vetor de LANES ATIVAS (limitado pelo
 * numero de ramos simultaneos do repositorio), nunca a lista de commits.
 *
 * Este arquivo nao tem NENHUM import de `@/` em runtime — so tipos. Isso e
 * proposital: ele roda tal e qual sob `node --test`, sem bundler no meio. O
 * unico import de valor e relativo e com `.ts` explicito, que e a forma que o
 * Node resolve sozinho.
 */
import { METRICS, METRICS_COMPACT } from "./paint.ts";
import type { RawCommit } from "@/types/git";
import type {
  EdgeKind,
  GraphEdge,
  GraphLayout,
  GraphMetrics,
  GraphRowIndex,
  PositionedCommit,
} from "@/types/modules";

/**
 * As medidas do desenho moram em `paint.ts` — a mesa de knobs da coluna do
 * grafo. Aqui elas so ganham o nome pelo qual o resto do app as conhece.
 */
export const DEFAULT_METRICS: GraphMetrics = METRICS;

/**
 * As medidas da densidade compacta — a mesma fonte unica (`paint.ts`), com o
 * nome pelo qual o resto do app as conhece. A folga de colisao da variante e
 * provada por `layout.test.ts` (a mesma `findCollisions` da confortavel).
 */
export const COMPACT_METRICS: GraphMetrics = METRICS_COMPACT;

/**
 * Quantidade de matizes da rampa de lanes. Espelha `LANE_COUNT` de
 * `@/lib/utils` de proposito: importar aquele modulo criaria uma dependencia de
 * runtime e este arquivo precisa continuar executavel sem bundler.
 */
const LANE_HUES = 8;

/** Tamanho do bloco do indice `row -> arestas`. */
const DEFAULT_INDEX_BLOCK = 32;

export interface GraphLayoutOptions {
  /**
   * Tamanho do bloco do indice de arestas por linha. Blocos maiores montam mais
   * rapido e filtram um pouco mais na consulta. O default (32) e ~o dobro de uma
   * janela de virtualizacao.
   */
  indexBlockSize?: number;
}

/**
 * Uma lane reservada por um filho ja processado, esperando o pai aparecer.
 * Guarda tudo que a aresta filho->pai vai precisar quando o pai for encontrado.
 */
interface Reservation {
  /** lane que ficou segurada (e portanto vazia de commits) ate o pai chegar */
  lane: number;
  /** true quando o filho tem este commit como PRIMEIRO pai (filho de ramificacao) */
  branch: boolean;
  childRow: number;
  childLane: number;
  childHash: string;
  parentIndex: number;
}

const EMPTY_EDGES: GraphEdge[] = [];

const hue = (lane: number) => ((lane % LANE_HUES) + LANE_HUES) % LANE_HUES;

const now = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

/**
 * Primeira lane livre com indice >= `start`. Cresce o vetor quando nao ha
 * nenhuma. A varredura e sobre lanes ativas, nunca sobre commits.
 */
function claimFreeLane(lanes: (string | null)[], start: number): number {
  for (let l = start; l < lanes.length; l++) {
    if (lanes[l] === null) return l;
  }
  lanes.push(null);
  return lanes.length - 1;
}

function releaseLane(lanes: (string | null)[], lane: number): void {
  if (lane >= 0 && lane < lanes.length) lanes[lane] = null;
}

/**
 * A escolha da lane quando varias esperavam este commit.
 *
 * Regra da arquitetura: um commit com pelo menos um FILHO DE RAMIFICACAO herda a
 * lane dele — e isso que da continuidade visual a uma branch e mantem `main` na
 * mesma coluna do inicio ao fim. Um commit que so tem FILHOS DE MESCLAGEM fica
 * com a lane que foi reservada para ele (a mais a esquerda entre elas), que por
 * construcao ja e "a mais a esquerda possivel sem cruzar linha viva": ela foi
 * alocada como a primeira livre e ficou segurada desde entao.
 */
function pickLane(reservations: Reservation[]): number {
  let branchLane = -1;
  let anyLane = -1;
  for (let i = 0; i < reservations.length; i++) {
    const r = reservations[i];
    if (anyLane < 0 || r.lane < anyLane) anyLane = r.lane;
    if (r.branch && (branchLane < 0 || r.lane < branchLane)) branchLane = r.lane;
  }
  return branchLane >= 0 ? branchLane : anyLane;
}

/** true quando `parents[at]` ja apareceu antes na lista (pai repetido). */
function isRepeatedParent(parents: string[], at: number): boolean {
  for (let i = 0; i < at; i++) if (parents[i] === parents[at]) return true;
  return false;
}

/**
 * Indice `row -> arestas que atravessam a linha`, por blocos.
 *
 * Um indice denso custaria a SOMA DOS COMPRIMENTOS das arestas, que estoura numa
 * branch antiga que atravessa 20 000 linhas. Por blocos o custo cai para
 * `arestas + soma(comprimento)/blockSize`, e a consulta filtra o bloco (que tem
 * poucas arestas) pelo intervalo exato.
 */
function buildRowIndex(
  edges: GraphEdge[],
  rows: number,
  blockSize: number,
): GraphRowIndex {
  const blockCount = rows > 0 ? Math.ceil(rows / blockSize) : 0;
  const blocks: GraphEdge[][] = new Array(blockCount);
  for (let b = 0; b < blockCount; b++) blocks[b] = [];

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const first = Math.max(0, Math.floor(e.fromRow / blockSize));
    const last = Math.min(blockCount - 1, Math.floor(e.toRow / blockSize));
    for (let b = first; b <= last; b++) blocks[b].push(e);
  }

  return {
    forRow(row: number): GraphEdge[] {
      if (row < 0 || row >= rows) return EMPTY_EDGES;
      const block = blocks[Math.floor(row / blockSize)];
      if (block === undefined || block.length === 0) return EMPTY_EDGES;
      const out: GraphEdge[] = [];
      for (let i = 0; i < block.length; i++) {
        const e = block[i];
        if (e.fromRow <= row && row <= e.toRow) out.push(e);
      }
      return out;
    },

    forRange(startRow: number, endRow: number): GraphEdge[] {
      if (blockCount === 0 || endRow < startRow) return EMPTY_EDGES;
      const first = Math.max(0, Math.floor(startRow / blockSize));
      const last = Math.min(blockCount - 1, Math.floor(endRow / blockSize));
      if (last < first) return EMPTY_EDGES;
      const out: GraphEdge[] = [];
      const seen = new Set<string>();
      for (let b = first; b <= last; b++) {
        const block = blocks[b];
        for (let i = 0; i < block.length; i++) {
          const e = block[i];
          if (e.toRow < startRow || e.fromRow > endRow) continue;
          if (seen.has(e.id)) continue;
          seen.add(e.id);
          out.push(e);
        }
      }
      return out;
    },
  };
}

/**
 * Calcula o layout inteiro. Funcao PURA e deterministica: a mesma entrada devolve
 * sempre a mesma saida (o unico campo que varia e `elapsedMs`, que e medicao).
 */
export function computeGraphLayout(
  commits: RawCommit[],
  options: GraphLayoutOptions = {},
): GraphLayout {
  const started = now();
  const total = commits.length;

  /* hash -> linha. E o unico lookup usado dentro do laco. */
  const index = new Map<string, number>();
  for (let i = 0; i < total; i++) index.set(commits[i].hash, i);

  /* quem aparece como pai de alguem — o complemento define as pontas de ramo. */
  const hasChild = new Set<string>();
  for (let i = 0; i < total; i++) {
    const parents = commits[i].parents;
    for (let p = 0; p < parents.length; p++) hasChild.add(parents[p]);
  }

  const nodes: PositionedCommit[] = new Array(total);
  const edges: GraphEdge[] = [];

  /** lanes ativas: lanes[l] = hash que a lane espera, ou null se esta livre. */
  const lanes: (string | null)[] = [];
  /** hash do pai -> reservas dos filhos que ja passaram por aqui. */
  const waiting = new Map<string, Reservation[]>();

  let maxLane = 0;

  for (let row = 0; row < total; row++) {
    const commit = commits[row];
    const parents = commit.parents;

    /* ---- 1. Reivindicacao ------------------------------------------------ */
    const reservations = waiting.get(commit.hash);
    if (reservations !== undefined) waiting.delete(commit.hash);

    let lane: number;
    if (reservations !== undefined && reservations.length > 0) {
      /* 2. Classificacao: ramificacao ganha de mesclagem (ver pickLane). */
      lane = pickLane(reservations);
      /* as demais convergiram aqui — suas lanes morrem neste ponto. */
      for (let i = 0; i < reservations.length; i++) {
        if (reservations[i].lane !== lane) releaseLane(lanes, reservations[i].lane);
      }
    } else {
      /* ninguem esperava: e uma ponta de ramo, ocupa a primeira lane livre. */
      lane = claimFreeLane(lanes, 0);
    }
    lanes[lane] = commit.hash;
    if (lane > maxLane) maxLane = lane;

    /* ---- arestas: agora que a lane do pai e conhecida, os filhos ligam ---- */
    if (reservations !== undefined) {
      for (let i = 0; i < reservations.length; i++) {
        const r = reservations[i];
        const kind: EdgeKind =
          r.parentIndex === 0 ? (r.childLane === lane ? "straight" : "branch") : "merge";
        edges.push({
          /* estavel e unico: um filho tem exatamente um pai por indice. */
          id: `${r.childHash}~${r.parentIndex}`,
          fromHash: r.childHash,
          toHash: commit.hash,
          fromRow: r.childRow,
          fromLane: r.childLane,
          toRow: row,
          toLane: lane,
          throughLane: r.lane,
          kind,
          /* branch herda a cor do filho; merge herda a do pai (docs §2). */
          color: hue(kind === "merge" ? lane : r.childLane),
        });
        if (r.lane > maxLane) maxLane = r.lane;
      }
    }

    /* ---- 3. Propagacao para os pais -------------------------------------- */
    let firstParentKeepsLane = false;
    for (let pi = 0; pi < parents.length; pi++) {
      const parentHash = parents[pi];
      const parentRow = index.get(parentHash);
      /*
       * 4. Liberacao: pai fora do conjunto carregado (log truncado pelo limit)
       * nao reserva lane nenhuma — e assim o grafo nao cresce indefinidamente.
       * `parentRow <= row` seria violacao da ordem topologica; ignoramos por
       * seguranca em vez de desenhar uma aresta para tras.
       */
      if (parentRow === undefined || parentRow <= row) continue;
      if (pi > 0 && isRepeatedParent(parents, pi)) continue;

      let parentLane: number;
      if (pi === 0) {
        /* o primeiro pai herda a lane do commit: a linha de desenvolvimento segue. */
        parentLane = lane;
        firstParentKeepsLane = true;
      } else {
        /* cada pai adicional recebe a primeira lane livre A DIREITA — e dali que
         * saem as curvas de merge. */
        parentLane = claimFreeLane(lanes, lane + 1);
      }
      lanes[parentLane] = parentHash;
      if (parentLane > maxLane) maxLane = parentLane;

      const reservation: Reservation = {
        lane: parentLane,
        branch: pi === 0,
        childRow: row,
        childLane: lane,
        childHash: commit.hash,
        parentIndex: pi,
      };
      const list = waiting.get(parentHash);
      if (list === undefined) waiting.set(parentHash, [reservation]);
      else list.push(reservation);
    }
    /* commit raiz (ou com o primeiro pai fora do conjunto): a lane acaba aqui. */
    if (!firstParentKeepsLane) releaseLane(lanes, lane);

    nodes[row] = {
      commit,
      row,
      lane,
      color: hue(lane),
      isMerge: parents.length > 1,
      isTip: !hasChild.has(commit.hash),
      isRoot: parents.length === 0,
    };
  }

  const blockSize = Math.max(1, Math.floor(options.indexBlockSize ?? DEFAULT_INDEX_BLOCK));

  return {
    nodes,
    edges,
    index,
    laneCount: total === 0 ? 0 : maxLane + 1,
    elapsedMs: now() - started,
    rowEdges: buildRowIndex(edges, total, blockSize),
  };
}
