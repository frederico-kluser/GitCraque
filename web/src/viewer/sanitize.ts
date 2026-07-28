/**
 * DOMPURIFY — a SEGUNDA camada de sanitizacao, a que fala com o DOM.
 *
 * Nao tem equivalente no catalogo do Motion UI: e a fronteira entre um arquivo
 * de repositorio alheio e o `innerHTML` da janela do usuario.
 *
 * A camada 1 (`markdown.ts`) ja entrega um HTML montado por nos, tag por tag, a
 * partir de texto escapado. Esta aqui existe porque uma unica linha errada
 * naquele renderer — hoje ou daqui a um ano, num commit apressado — voltaria a
 * abrir o buraco. As duas juntas: a de cima nao produz vetor, e a de baixo nao
 * deixaria passar se produzisse.
 *
 * A politica e uma ALLOWLIST fechada, nao uma lista de proibidos:
 *
 * - `ALLOWED_TAGS` tem exatamente as tags que o nosso renderer emite. `script`,
 *   `iframe`, `object`, `embed`, `style`, `form` e `svg` nao estao la — entao
 *   nao passam, mesmo antes de olhar o `FORBID_TAGS` (que fica como documento
 *   da intencao e como trava de regressao no teste).
 * - `ALLOWED_ATTR` idem. Qualquer `on*` — `onerror`, `onload`, `onclick`,
 *   `onanimationstart`, o que inventarem — cai fora por nao estar na lista;
 *   nao ha como enumerar handler de evento, e por isso a lista e fechada.
 * - `ALLOWED_URI_REGEXP` recusa `javascript:`, `data:` e `vbscript:` em
 *   qualquer atributo de url. O DOMPurify tira os caracteres de controle do
 *   valor ANTES de testar, entao `java\tscript:` tambem morre aqui.
 *
 * O que este arquivo NAO faz: silenciar falha. Sem DOM (SSR, teste em node)
 * o DOMPurify se declara `isSupported === false` e a sua `sanitize` nem
 * existe — nesse caso `sanitizeHtml` LANCA, e o painel mostra o erro. Devolver
 * a entrada crua seria transformar a rede de seguranca em cano.
 */
import DOMPurify from "dompurify";
/* `../i18n/store.ts` e nao `@/i18n`: estes dois modulos sao carregados pelo
 * `node --test` SEM bundler (ver `__tests__/sanitize.test.mjs`), e ali o alias
 * `@/` nao resolve. O `store` nao depende de React nem de alias — cabe. */
import { t } from "../i18n/store.ts";
import { SAFE_URI_REGEXP } from "./url-policy.ts";

/* ------------------------------------------------------------------ */
/* Politica                                                            */
/* ------------------------------------------------------------------ */

/** Exatamente as tags que `markdown.ts` emite. Nada alem. */
export const ALLOWED_TAGS = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
];

/** Exatamente os atributos que `markdown.ts` emite. Nenhum `on*` cabe aqui. */
export const ALLOWED_ATTR = [
  "align",
  "alt",
  "aria-hidden",
  "class",
  "href",
  "loading",
  "referrerpolicy",
  "rel",
  "src",
  "start",
  "target",
  "title",
];

/**
 * Redundante com a allowlist — de proposito. Serve de documento da intencao e
 * de trava: se alguem um dia afrouxar `ALLOWED_TAGS`, estes continuam fora.
 */
export const FORBID_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "style",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "svg",
  "math",
  "template",
  "noscript",
  "portal",
];

export const FORBID_ATTR = [
  "style",
  "srcset",
  "formaction",
  "action",
  "background",
  "dynsrc",
  "lowsrc",
  "xlink:href",
  "xmlns:xlink",
];

/**
 * Atributos INERTES: nao carregam url, entao nao passam pelo
 * `ALLOWED_URI_REGEXP`.
 *
 * Isto nao e frouxidao, e consequencia de apertar a regexp. A regexp padrao do
 * DOMPurify aceita "qualquer coisa que nao seja um esquema", entao `_blank` e
 * `no-referrer` passavam de carona. Trocada pela nossa — que so aceita
 * `https?:`, `mailto:` e `#` — esses valores passariam a ser recusados e o
 * `target`/`rel` do link externo sumiria justamente da tag onde ele protege.
 */
export const URI_SAFE_ATTR = ["target", "rel", "align", "start", "loading", "referrerpolicy"];

/** A configuracao inteira, exportada para o teste poder auditar cada campo. */
export const SANITIZE_CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
  ADD_URI_SAFE_ATTR: URI_SAFE_ATTR,
  FORBID_TAGS,
  FORBID_ATTR,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  ALLOW_SELF_CLOSE_IN_ATTR: false,
  SAFE_FOR_TEMPLATES: false,
  WHOLE_DOCUMENT: false,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_TRUSTED_TYPE: false,
  KEEP_CONTENT: true,
  IN_PLACE: false,
} as const;

/* ------------------------------------------------------------------ */
/* Execucao                                                            */
/* ------------------------------------------------------------------ */

let hooked = false;

/**
 * O `target`/`rel` de todo link externo, imposto no DOM e nao so na string.
 * Sem `noopener` a aba aberta ganha `window.opener` e pode navegar a nossa;
 * sem `noreferrer` o destino recebe a url local do gitcraque.
 */
function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!("tagName" in node) || (node as Element).tagName !== "A") return;
    const el = node as Element;
    const href = el.getAttribute("href") ?? "";
    if (/^https?:/i.test(href)) {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noreferrer noopener");
    } else {
      el.removeAttribute("target");
      el.removeAttribute("rel");
    }
  });
}

export class SanitizerUnavailableError extends Error {
  constructor() {
    // A mensagem aparece NA TELA, dentro do aviso do `MarkdownView`.
    super(t("sanitize.noDom"));
    this.name = "SanitizerUnavailableError";
  }
}

/**
 * Passa o HTML da camada 1 pelo DOMPurify. Lanca `SanitizerUnavailableError`
 * quando nao ha DOM: falhar e a resposta certa, exibir sem sanitizar nao e.
 */
export function sanitizeHtml(html: string): string {
  if (!DOMPurify.isSupported) throw new SanitizerUnavailableError();
  ensureHooks();
  return String(DOMPurify.sanitize(html, SANITIZE_CONFIG));
}
