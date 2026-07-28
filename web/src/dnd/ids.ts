/**
 * Os ids do @dnd-kit — e a invariante que os torna corretos.
 *
 * O registro de alvos do @dnd-kit e um MAPA POR ID. Registrar dois nos com o
 * mesmo id nao dispara erro: o segundo simplesmente sobrescreve o primeiro, e o
 * retangulo medido passa a ser o do outro lugar da tela. Solturas no primeiro
 * no param de colidir, em silencio.
 *
 * A mesma branch aparece em DOIS lugares do GitCraque — o chip dela na View Tree
 * e a linha dela no rail. Sem escopo, os dois registram `branch:main`, e o chip
 * do grafo herda o retangulo da linha do rail. Foi exatamente o que aconteceu:
 * 7 alvos registrados, 6 retangulos medidos, `over` sempre nulo, e o motor
 * semantico inteiro morto sem uma linha de erro.
 *
 * O escopo vive SO no id do DOM. O `data` (o payload) continua identico, entao
 * arrastar `main` do grafo ou do rail resolve exatamente a mesma intencao.
 *
 * Este arquivo nao importa NADA em tempo de execucao, de proposito: assim o
 * `node --test` carrega o TypeScript direto e a invariante fica coberta por
 * teste, sem bundler no meio.
 */

/** Onde o elemento vive na tela. Dois lugares diferentes, dois ids diferentes. */
export type DndScope = "graph" | "rail" | "app";

/** Separador entre escopo e entidade. Nao aparece em nome de ref nem em hash. */
export const SCOPE_SEP = "::";

export const encodeId = (type: string, key: string, scope: DndScope = "app") =>
  `${scope}${SCOPE_SEP}${type}:${key}`;

export function decodeId(id: string): { scope: DndScope; type: string; key: string } {
  const corte = id.indexOf(SCOPE_SEP);
  const scope = (corte < 0 ? "app" : id.slice(0, corte)) as DndScope;
  const resto = corte < 0 ? id : id.slice(corte + SCOPE_SEP.length);
  const i = resto.indexOf(":");
  return i < 0
    ? { scope, type: resto, key: "" }
    : { scope, type: resto.slice(0, i), key: resto.slice(i + 1) };
}
