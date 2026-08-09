/**
 * A DECISAO DE LAYOUT — uma coluna ou tres.
 *
 * Cruza a PREFERENCIA da pessoa (`layoutMode`, persistida em `useShellStore`)
 * com o TAMANHO da tela (`useViewport`) e devolve o unico dado que a interface
 * consome: `"compact"` ou `"full"`. E este o hook que `app/App.tsx` usa para
 * trocar de layout, e e por ele que todo painel pergunta "cabe uma coluna ou
 * tres?".
 *
 * As duas fontes sao separadas de proposito. `layoutMode` responde "o que a
 * pessoa PEDIU"; o viewport responde "o que CABE". Misturar as duas num campo
 * so tiraria da pessoa a possibilidade de discordar da tela — que e justamente
 * o que `compact` e `full` existem para permitir.
 */
import { getShellState, selectLayoutMode, useShellState } from "./useShellStore";
import type { LayoutMode } from "./useShellStore";
import { getViewport, useViewportValue } from "./useViewport";
import type { Viewport } from "./useViewport";

/**
 * O layout QUE VALE AGORA. Duas opcoes e nao tres: `auto` e uma preferencia,
 * nunca um layout — no momento de desenhar, ou sao tres colunas ou e uma.
 */
export type ResolvedLayout = "compact" | "full";

/**
 * O que a TELA pediria, ignorando a preferencia.
 *
 * Constante de modulo porque o comparador do `useViewportValue` e `Object.is`:
 * um seletor recriado a cada render re-assinaria o store em todo render. E
 * devolve string primitiva, entao a comparacao e por valor e o componente so
 * re-renderiza quando o layout REALMENTE vira — nao a cada pixel de resize.
 *
 * ## O tablet, que e o caso interessante
 *
 * Celular (< 768) e sempre `compact`: nao ha discussao, as tres colunas nao
 * cabem. Desktop (>= 1280) e sempre `full`. O tablet (768–1279) decide pela
 * ORIENTACAO, e a conta e de largura util:
 *
 *   - **Retrato** (iPad em 768/820/834px): as colunas laterais sozinhas ja
 *     ocupam no minimo 520px (`RAIL_RANGE.min` + `DETAIL_RANGE.min`), sobrando
 *     menos de 320px para o grafo — que e o produto. Vira `compact`.
 *   - **Paisagem** (1024–1279px): sobram de 500 a 760px para o grafo, que e
 *     largura de trabalho de verdade. Vira `full`.
 *
 * Na pratica a regra so decide na faixa de 1024 a 1279px: abaixo de 1024 nao
 * ha tablet em paisagem, e a partir de 1280 o corte de desktop ja respondeu.
 * Quem discordar da conta tem a saida certa e explicita: mudar a preferencia
 * para `compact` ou `full` nas configuracoes.
 */
export const selectAutoLayout = (v: Viewport): ResolvedLayout =>
  v.isMobile || (v.isTablet && !v.landscape) ? "compact" : "full";

/** A regra pura, sem React — para teste e para quem ja tem os dois valores. */
export function resolveLayout(preference: LayoutMode, auto: ResolvedLayout): ResolvedLayout {
  return preference === "auto" ? auto : preference;
}

/**
 * O layout que vale agora, reativo as duas fontes.
 *
 * Duas subscricoes, cada uma devolvendo uma string: uma no shell (preferencia)
 * e uma no viewport (tamanho). Nenhuma delas monta objeto novo, entao nenhuma
 * das duas re-renderiza a toa.
 */
export function useLayoutMode(): ResolvedLayout {
  const preference = useShellState(selectLayoutMode);
  const auto = useViewportValue(selectAutoLayout);
  return resolveLayout(preference, auto);
}

/**
 * A mesma resposta fora do React — handlers, acoes, modulos sem componente.
 *
 * Barato: as duas leituras sao sincronas e ja estao em memoria (o `getViewport`
 * so rele o ambiente quando ninguem esta assinado).
 */
export function getLayoutMode(): ResolvedLayout {
  return resolveLayout(getShellState().layoutMode, selectAutoLayout(getViewport()));
}
