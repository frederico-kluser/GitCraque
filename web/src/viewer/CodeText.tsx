/**
 * Renderizador do realce leve (`highlight.ts`) — a fronteira React dele.
 *
 * REGRA DE OURO: um run "plain" vira TEXTO PURO (Fragment sem casca), nunca um
 * `<span>`. Os testes de render do diff afirmam o HTML exato das linhas
 * simples; se todo o conteudo ganhasse casca, cada assercao morria sem que
 * nada de visual tivesse mudado. So os cinco tipos coloridos ganham span.
 */
import { Fragment, type ReactNode } from "react";

import { detectLang, highlightLines, tokenizeLine, type CodeKind, type Lang } from "./highlight.ts";

const CODE_CLASS: Record<Exclude<CodeKind, "plain">, string> = {
  comment: "text-code-comment italic",
  string: "text-code-string",
  number: "text-code-number",
  keyword: "text-code-keyword",
  function: "text-code-function",
};

function nodes(tokens: ReturnType<typeof tokenizeLine>): ReactNode[] {
  return tokens.map((token, index) =>
    token.kind === "plain" ? (
      <Fragment key={index}>{token.text}</Fragment>
    ) : (
      <span key={index} className={CODE_CLASS[token.kind]}>
        {token.text}
      </span>
    ),
  );
}

/**
 * Texto avulso (um segmento de word-diff, uma linha solta). Estado novo — um
 * segmento cortado no meio de um comentario e texto seu, e ta bem.
 */
export function codeText(text: string, lang: Lang): ReactNode[] {
  return nodes(tokenizeLine(text, lang));
}

/**
 * Linhas com estado carregado entre elas (comentarios de bloco e templates
 * atravessam linhas). `lang` vem de `detectLang(caminho)`.
 */
export function codeLines(lines: string[], lang: Lang): ReactNode[][] {
  return highlightLines(lines, lang).map(nodes);
}

export { detectLang };
export type { Lang };
