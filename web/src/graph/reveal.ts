/**
 * CONTROLADOR DO REVEAL — "leve a View Tree ate este commit e marque a linha".
 *
 * Clicar numa branch ou tag no rail poe um pedido no store; a `GraphView`
 * recebe em `props.reveal`. TODA a decisao mora aqui, pura: sem DOM, sem React.
 * A view so aplica o plano. A separacao existe porque essa logica tem tres
 * armadilhas que precisam de teste direto, e nenhuma delas precisa de navegador:
 *
 *   1. Quem manda e o NONCE, nao o hash. Clicar duas vezes na mesma branch tem
 *      de rolar de novo — so o hash nao mudaria nada na segunda vez.
 *   2. Atender o mesmo nonce duas vezes e o laco
 *      `reveal muda -> rola -> onRevealed limpa -> re-render`.
 *   3. Hash que nao esta no log carregado (paginado fora, ou ref para objeto que
 *      o `--all` nao alcanca) nao rola para lugar nenhum, mas ainda assim
 *      LIBERA o pedido — senao ele fica preso no store.
 *
 * Este arquivo nao tem NENHUM import de runtime — so tipos — pelo mesmo motivo
 * que `layout.ts`: roda tal e qual sob `node --test`, sem bundler no meio.
 */
import type { GraphLayout } from "@/types/modules";

/** O alvo de um pedido, como chega em `GraphViewProps["reveal"]`. */
export interface RevealTarget {
  hash: string;
  /** muda a cada pedido — e o que o grafo observa */
  nonce: number;
}

/** A janela visivel da lista virtualizada, em px. */
export interface RevealViewport {
  /** deslocamento do topo da lista */
  scrollOffset: number;
  /** altura visivel da lista */
  height: number;
  /** altura de uma linha */
  rowHeight: number;
}

export interface RevealContext {
  layout: GraphLayout;
  viewport: RevealViewport;
  /** ultimo nonce ja atendido; null quando nenhum */
  servedNonce: number | null;
  /** true enquanto o log ainda esta a caminho */
  loading?: boolean;
}

/** O que fazer com um pedido. Devolvido so quando ha o que fazer. */
export interface RevealPlan {
  /** nonce atendido — o chamador guarda para nao atender de novo */
  nonce: number;
  hash: string;
  /** linha do hash; null quando ele nao esta no log carregado */
  row: number | null;
  /** true quando a lista precisa rolar (linha fora da janela ou colada na borda) */
  scroll: boolean;
}

/**
 * Folga, em linhas, entre a linha revelada e a borda da janela. Uma linha
 * visivel mas colada na borda ainda merece rolagem: e quase invisivel na
 * pratica e o realce passa despercebido.
 */
export const COMFORT_ROWS = 2;

/** Quanto tempo o realce temporario fica na tela antes de se apagar sozinho. */
export const MARK_DURATION_MS = 2000;

/**
 * A linha esta confortavelmente visivel? Se estiver, NAO se rola: rolar sem
 * necessidade e desorientador.
 *
 * A folga e limitada a metade do espaco util para que, numa janela baixa
 * demais para duas linhas de sobra, alguma posicao ainda conte como confortavel
 * (senao o grafo rolaria a cada pedido, sempre).
 */
export function isRowComfortable(row: number, view: RevealViewport): boolean {
  const { scrollOffset, height, rowHeight } = view;
  /* janela ainda nao medida: nao da para afirmar que esta visivel — role. */
  if (height <= 0 || rowHeight <= 0) return false;

  const slack = Math.min(COMFORT_ROWS * rowHeight, Math.max(0, (height - rowHeight) / 2));
  const top = row * rowHeight;
  return top >= scrollOffset + slack && top + rowHeight <= scrollOffset + height - slack;
}

/**
 * Resolve um pedido de reveal. `null` significa "nada a fazer agora": nao ha
 * pedido, ele ja foi atendido, ou o log ainda nao chegou — neste ultimo caso o
 * pedido ESPERA, e nao se perde, porque o plano e refeito quando os commits
 * chegam.
 */
export function planReveal(
  request: RevealTarget | null | undefined,
  context: RevealContext,
): RevealPlan | null {
  if (!request) return null;
  /* o corta-laco: um nonce so se atende uma vez. */
  if (context.servedNonce === request.nonce) return null;
  /* consumir antes do log chegar perderia o alvo por nada. */
  if (context.loading && context.layout.nodes.length === 0) return null;

  const row = context.layout.index.get(request.hash);
  if (row === undefined) {
    return { nonce: request.nonce, hash: request.hash, row: null, scroll: false };
  }

  return {
    nonce: request.nonce,
    hash: request.hash,
    row,
    scroll: !isRowComfortable(row, context.viewport),
  };
}

/**
 * O que a `GraphView` sabe fazer com um plano. Injetado como interface para que
 * o despacho inteiro seja testavel sem navegador — a view monta esta superficie
 * a partir das refs da lista e do grid.
 */
export interface RevealSurface {
  /** centraliza a linha na lista virtualizada */
  scrollToRow(row: number): void;
  /** o teclado passa a continuar dali (cursor das setas + ancora do Shift) */
  focusRow(hash: string): void;
  /** liga o realce temporario; o nonce faz ele reanimar no mesmo commit */
  mark(target: RevealTarget): void;
  /** avisa o store que o pedido foi atendido */
  release(): void;
}

/** Aplica o plano. Chamar com `null` nao faz nada. */
export function applyRevealPlan(plan: RevealPlan | null, surface: RevealSurface): void {
  if (plan === null) return;

  if (plan.row !== null) {
    if (plan.scroll) surface.scrollToRow(plan.row);
    surface.focusRow(plan.hash);
    surface.mark({ hash: plan.hash, nonce: plan.nonce });
  }

  /* SEMPRE — inclusive quando o hash nao esta no log carregado. */
  surface.release();
}
