/**
 * MARKDOWN -> HTML — a PRIMEIRA das duas camadas de sanitizacao.
 *
 * Nao ha peca de markdown no catalogo do Motion UI; o `marked` faz o parse e
 * este arquivo escreve, tag por tag, o HTML que sai dele.
 *
 * A escolha que define o modulo: **o renderer nao repassa NADA cru**. Todo
 * token de HTML do markdown (`<script>`, `<img onerror>`, `<iframe>`) e
 * escapado e vira texto visivel, e todo `href`/`src` passa por
 * `classifyUrl`. O resultado e um HTML montado por nos, elemento por elemento,
 * a partir de texto escapado — nao um HTML alheio "limpado depois".
 *
 * Por que isso importa: a segunda camada (`sanitize.ts`, o DOMPurify) precisa
 * de DOM para rodar. Esta aqui e string pura, roda em qualquer lugar, e e
 * exatamente por isso que `__tests__/sanitize.test.mjs` consegue provar no
 * `node --test` que os vetores ja saem mortos daqui — o DOMPurify e a rede de
 * baixo, nao a unica.
 *
 * A tabela de classes esta em `prose.ts`.
 */
import { Marked, type RendererObject, type Tokens } from "marked";
import { PROSE } from "./prose.ts";
import { classifyUrl, escapeHtml } from "./url-policy.ts";

/* ------------------------------------------------------------------ */
/* Renderer                                                            */
/* ------------------------------------------------------------------ */

const HEADINGS = [PROSE.h1, PROSE.h2, PROSE.h3, PROSE.h4, PROSE.h5, PROSE.h6];

/** `title="..."`, escapado, ou nada. */
const titleAttr = (title?: string | null) => (title ? ` title="${escapeHtml(title)}"` : "");

const renderer: RendererObject = {
  /**
   * O coracao da camada: HTML cru do markdown NUNCA e HTML na saida.
   * Cobre o token de bloco (`<script>alert(1)</script>` numa linha sozinha) e
   * o inline (`texto <img src=x onerror=...> texto`).
   */
  html({ text, block }: Tokens.HTML | Tokens.Tag) {
    const escaped = escapeHtml(text);
    // Bloco inteiro de HTML cru ganha caixa propria: o leitor precisa ver que
    // aquilo e o TEXTO do arquivo, nao um paragrafo que o markdown produziu.
    return block ? `<div class="${PROSE.rawHtml}">${escaped}</div>\n` : escaped;
  },

  /**
   * O `marked` marca `escaped: true` no texto que esta dentro de um bloco cru
   * (`<pre>`, `<script>`) e devolveria esse texto sem escapar. Como aqui bloco
   * cru nao existe — a tag virou texto —, o conteudo tambem e so texto.
   */
  text(token: Tokens.Text | Tokens.Escape) {
    if ("tokens" in token && token.tokens?.length) return this.parser.parseInline(token.tokens);
    return escapeHtml(token.text);
  },

  heading({ tokens, depth }: Tokens.Heading) {
    const level = Math.min(Math.max(depth, 1), 6);
    return `<h${level} class="${HEADINGS[level - 1]}">${this.parser.parseInline(tokens)}</h${level}>\n`;
  },

  paragraph({ tokens }: Tokens.Paragraph) {
    return `<p class="${PROSE.p}">${this.parser.parseInline(tokens)}</p>\n`;
  },

  hr() {
    return `<hr class="${PROSE.hr}">\n`;
  },

  blockquote({ tokens }: Tokens.Blockquote) {
    return `<blockquote class="${PROSE.blockquote}">${this.parser.parse(tokens)}</blockquote>\n`;
  },

  code({ text, lang, escaped }: Tokens.Code) {
    const language = (lang ?? "").trim().split(/\s+/)[0] ?? "";
    const head = language
      ? `<div class="${PROSE.codeLang}">${escapeHtml(language)}</div>`
      : "";
    // `escaped` so vem true de extensao que ja emitiu HTML; sem extensao
    // instalada nunca acontece, e escapar de novo seria pior do que nao
    // escapar — entao respeita a flag, como o renderer padrao faz.
    const body = escaped ? text : escapeHtml(text);
    return `<div class="${PROSE.codeBlock}">${head}<pre class="${PROSE.pre}"><code class="${PROSE.preCode}">${body}\n</code></pre></div>\n`;
  },

  codespan({ text }: Tokens.Codespan) {
    return `<code class="${PROSE.code}">${escapeHtml(text)}</code>`;
  },

  list(token: Tokens.List) {
    const tag = token.ordered ? "ol" : "ul";
    const start =
      token.ordered && token.start !== "" && token.start !== 1
        ? ` start="${Number(token.start)}"`
        : "";
    const items = token.items.map((item) => this.listitem(item)).join("");
    return `<${tag} class="${token.ordered ? PROSE.ol : PROSE.ul}"${start}>\n${items}</${tag}>\n`;
  },

  listitem(item: Tokens.ListItem) {
    // O glifo do checklist NAO sai daqui: o `marked` ja emite um token
    // `checkbox` dentro de `item.tokens`, e o renderer abaixo o desenha.
    const body = this.parser.parse(item.tokens);
    return `<li class="${item.task ? PROSE.taskItem : PROSE.li}">${body}</li>\n`;
  },

  checkbox({ checked }: Tokens.Checkbox) {
    return `<span class="${PROSE.task}" aria-hidden="true">${checked ? "☑" : "☐"}</span>`;
  },

  table(token: Tokens.Table) {
    const head = token.header.map((cell) => this.tablecell(cell)).join("");
    const body = token.rows
      .map((row) => `<tr class="${PROSE.tr}">${row.map((cell) => this.tablecell(cell)).join("")}</tr>\n`)
      .join("");
    return `<div class="${PROSE.tableWrap}"><table class="${PROSE.table}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>\n`;
  },

  tablecell(token: Tokens.TableCell) {
    const tag = token.header ? "th" : "td";
    const align = token.align ? ` align="${token.align}"` : "";
    const cls = token.header ? PROSE.th : PROSE.td;
    return `<${tag} class="${cls}"${align}>${this.parser.parseInline(token.tokens)}</${tag}>`;
  },

  strong({ tokens }: Tokens.Strong) {
    return `<strong class="${PROSE.strong}">${this.parser.parseInline(tokens)}</strong>`;
  },

  em({ tokens }: Tokens.Em) {
    return `<em class="${PROSE.em}">${this.parser.parseInline(tokens)}</em>`;
  },

  del({ tokens }: Tokens.Del) {
    return `<del class="${PROSE.del}">${this.parser.parseInline(tokens)}</del>`;
  },

  br() {
    return "<br>";
  },

  /**
   * Link: so http/https (aba nova, `rel="noreferrer noopener"`), mailto e
   * ancora do proprio documento viram `<a>`. Caminho relativo nao resolve —
   * nao ha servidor de blobs — e esquema recusado (`javascript:`, `data:`)
   * nunca vira href: os dois degradam para texto com explicacao no `title`.
   */
  link({ href, title, tokens }: Tokens.Link) {
    const label = this.parser.parseInline(tokens);
    const url = classifyUrl(href);
    if (url.kind === "external") {
      return `<a class="${PROSE.a}" href="${escapeHtml(url.href)}" target="_blank" rel="noreferrer noopener"${titleAttr(title)}>${label}</a>`;
    }
    if (url.kind === "mail" || url.kind === "fragment") {
      return `<a class="${PROSE.a}" href="${escapeHtml(url.href)}"${titleAttr(title)}>${label}</a>`;
    }
    const motivo =
      url.kind === "blocked"
        ? `link recusado (esquema ${url.scheme ?? "desconhecido"})`
        : `caminho relativo ao repositorio — nao resolvido: ${href}`;
    return `<span class="${PROSE.deadLink}" title="${escapeHtml(motivo)}">${label}</span>`;
  },

  /**
   * Imagem: so http/https carrega. Relativa (o caso comum num README) vira um
   * placeholder discreto com o alt e o caminho, nunca o icone quebrado do
   * navegador.
   */
  image({ href, title, text, tokens }: Tokens.Image) {
    const alt = tokens?.length
      ? this.parser.parseInline(tokens, this.parser.textRenderer)
      : text;
    const url = classifyUrl(href);
    if (url.kind === "external") {
      return `<img class="${PROSE.img}" src="${escapeHtml(url.href)}" alt="${escapeHtml(alt)}" loading="lazy" referrerpolicy="no-referrer"${titleAttr(title)}>`;
    }
    const rotulo = alt.trim() || "imagem";
    return `<span class="${PROSE.imagePlaceholder}" title="${escapeHtml(href)}"><span class="${PROSE.imagePlaceholderAlt}">${escapeHtml(rotulo)}</span><span class="${PROSE.imagePlaceholderNote}">· imagem nao resolvida</span></span>`;
  },

  /** Definicao de link de referencia nao imprime nada. */
  def() {
    return "";
  },
};

/* ------------------------------------------------------------------ */
/* Motor                                                               */
/* ------------------------------------------------------------------ */

/**
 * Instancia propria (nao a global do `marked`): configuracao de um modulo
 * nunca deve vazar para outro que importe o mesmo pacote.
 */
const engine = new Marked({
  gfm: true,
  breaks: false,
  pedantic: false,
  silent: false,
  async: false,
});
engine.use({ renderer });

/**
 * Markdown -> HTML ja seguro por construcao (camada 1 de 2).
 *
 * O `MarkdownView` ainda passa o resultado pelo DOMPurify antes de montar no
 * DOM; esta funcao sozinha nao e a fronteira final, e sim a que garante que a
 * fronteira final nao tenha trabalho.
 */
export function markdownToSafeHtml(source: string): string {
  const html = engine.parse(source ?? "", { async: false });
  return typeof html === "string" ? html : "";
}
