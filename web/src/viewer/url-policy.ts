/**
 * POLITICA DE URL E ESCAPE — a camada que decide o que, num README de
 * repositorio ALHEIO, pode virar `href`/`src` na tela do usuario.
 *
 * Nada aqui e UI: o catalogo do Motion UI nao tem (nem deveria ter) uma peca de
 * sanitizacao, entao esta parte e escrita a mao.
 *
 * Duas regras carregam o modulo inteiro:
 *
 * 1. **Classificar antes de confiar.** O navegador normaliza uma url antes de
 *    navegar: decodifica entidades HTML no atributo, joga fora TAB/LF/CR em
 *    qualquer posicao e ignora espaco nas pontas. `java&Tab;script:alert(1)` e
 *    `javascript:alert(1)` para ele. Entao a classificacao roda sobre a forma
 *    NORMALIZADA, nao sobre a string crua.
 * 2. **Escapar na saida.** Todo valor interpolado no HTML passa por
 *    `escapeHtml`, inclusive `&` — sem isso uma entidade sobrevive ate o parser
 *    do navegador e o esquema recusado renasce (`&#106;avascript:`).
 *
 * As duas juntas: mesmo que a classificacao erre, a saida escapada nao forma
 * esquema; mesmo que o escape falhe, a classificacao ja recusou o esquema.
 */

/* ------------------------------------------------------------------ */
/* Escape                                                              */
/* ------------------------------------------------------------------ */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapa para conteudo E para atributo entre aspas (duplas ou simples).
 * Um unico escape para os dois contextos: mais curto de auditar do que dois.
 */
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);

/* ------------------------------------------------------------------ */
/* Normalizacao                                                        */
/* ------------------------------------------------------------------ */

/** As nomeadas que interessam a um ataque de esquema; o resto fica como esta. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  colon: ":",
  sol: "/",
  tab: "\t",
  newline: "\n",
  nbsp: " ",
};

const ENTITY = /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);?/gi;

const fromCodePoint = (code: number): string | null => {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return null;
  try {
    return String.fromCodePoint(code);
  } catch {
    return null;
  }
};

/**
 * UMA passada de decodificacao de entidade, igual a do parser do navegador.
 * Uma passada so, de proposito: `&amp;#106;` vira o texto `&#106;`, nao `j` —
 * decodificar de novo inventaria um ataque que o navegador nao faria.
 */
export function decodeEntitiesOnce(value: string): string {
  return value.replace(ENTITY, (whole, body: string) => {
    const key = body.toLowerCase();
    if (key.startsWith("#x")) return fromCodePoint(Number.parseInt(key.slice(2), 16)) ?? whole;
    if (key.startsWith("#")) return fromCodePoint(Number.parseInt(key.slice(1), 10)) ?? whole;
    return NAMED_ENTITIES[key] ?? whole;
  });
}

/**
 * Espaco, controle, e os invisiveis de Unicode que o navegador descarta.
 * Mais duro do que o navegador (que so joga fora TAB/LF/CR no meio da url):
 * aqui a classificacao ve a url sem NENHUM deles.
 */
const INVISIBLE = /[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060\ufeff]/g;

const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** A forma que a classificacao enxerga: entidades resolvidas, invisiveis fora. */
export const normalizeUrl = (raw: string): string =>
  decodeEntitiesOnce(raw).replace(INVISIBLE, "");

/* ------------------------------------------------------------------ */
/* Classificacao                                                       */
/* ------------------------------------------------------------------ */

/**
 * - `external`  http/https — vira link de verdade, em aba nova.
 * - `mail`      mailto — vira link, sem aba nova.
 * - `fragment`  `#secao` — ancora no proprio documento.
 * - `relative`  `./docs/x.md`, `//host` — nao ha servidor de blobs para
 *               resolver; nao vira link nem imagem, degrada para texto.
 * - `blocked`   qualquer outro esquema (`javascript:`, `data:`, `vbscript:`,
 *               `file:`...). Nunca chega ao DOM.
 */
export type UrlKind = "external" | "mail" | "fragment" | "relative" | "blocked";

export interface ClassifiedUrl {
  kind: UrlKind;
  /** so preenchido em `external` | `mail` | `fragment`; vazio no resto. */
  href: string;
  /** o esquema normalizado com dois-pontos ("https:"), ou null se nao houver. */
  scheme: string | null;
}

const LINK_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/** Percent-encoda sem duplicar o que ja veio encodado (igual ao marked). */
function encodeHref(value: string): string {
  try {
    return encodeURI(value).replace(/%25/g, "%");
  } catch {
    return "";
  }
}

/** Classifica uma url de markdown. Nunca lanca: url ruim vira `blocked`. */
export function classifyUrl(raw: string): ClassifiedUrl {
  const normalized = normalizeUrl(raw ?? "");
  if (!normalized) return { kind: "relative", href: "", scheme: null };

  const match = SCHEME.exec(normalized);
  if (match) {
    const scheme = `${match[1]!.toLowerCase()}:`;
    if (!LINK_SCHEMES.has(scheme)) return { kind: "blocked", href: "", scheme };
    const href = encodeHref(normalized);
    if (!href) return { kind: "blocked", href: "", scheme };
    return { kind: scheme === "mailto:" ? "mail" : "external", href, scheme };
  }

  if (normalized.startsWith("#")) {
    return { kind: "fragment", href: encodeHref(normalized), scheme: null };
  }

  // `//host/x` e relativo-de-protocolo: o navegador resolveria contra o host do
  // gitcraque. Fora do escopo de um visualizador de arquivo — degrada.
  return { kind: "relative", href: "", scheme: null };
}

/** Imagem so carrega de http/https: nao ha blob server, e `data:` fica fora. */
export const isRenderableImage = (url: ClassifiedUrl): boolean => url.kind === "external";

/* ------------------------------------------------------------------ */
/* Contrato com o DOMPurify                                            */
/* ------------------------------------------------------------------ */

/**
 * O `ALLOWED_URI_REGEXP` do DOMPurify — a MESMA politica da classificacao
 * acima, escrita na forma que a segunda camada entende. O DOMPurify tira os
 * caracteres de controle do valor antes de testar, entao a regexp so precisa
 * cuidar do esquema.
 *
 * Deliberadamente sem alternativa vazia: o HTML que geramos nunca tem href
 * relativo, entao aceitar um seria abrir mao de sinal por nada.
 */
export const SAFE_URI_REGEXP = /^(?:https?:|mailto:|#)/i;
