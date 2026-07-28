/**
 * A `prose` da casa — escrita a mao, tag por tag.
 *
 * O catalogo do Motion UI nao tem componente de tipografia de documento (e o
 * projeto nao tem `@tailwindcss/typography`, nem vai ter), entao o vocabulario
 * visual do markdown renderizado mora aqui: um mapa de classes Tailwind
 * SEMANTICAS que o renderer do `marked` costura no HTML que emite.
 *
 * Por que classe por tag e nao um seletor descendente num arquivo CSS: o HTML
 * do markdown e gerado por nos, elemento por elemento, entao da para etiquetar
 * cada um na origem — e o Tailwind ve as strings literais deste arquivo no
 * scan. Zero CSS novo, zero dependencia nova.
 *
 * Regra dura: so token semantico (`text-foreground`, `border-border`,
 * `bg-surface-inset`). Nenhum hex, nenhuma cor crua da paleta do Tailwind.
 */
export const PROSE = {
  /** o container que o `MarkdownView` poe em volta do HTML gerado */
  root: "text-sm leading-relaxed text-foreground",

  h1: "mt-8 mb-4 border-b border-border pb-2 text-xl font-semibold tracking-tight text-foreground first:mt-0",
  h2: "mt-8 mb-3 border-b border-border pb-1.5 text-lg font-semibold tracking-tight text-foreground first:mt-0",
  h3: "mt-6 mb-2 text-base font-semibold tracking-tight text-foreground first:mt-0",
  h4: "mt-5 mb-2 text-sm font-semibold text-foreground first:mt-0",
  h5: "mt-4 mb-1.5 text-sm font-semibold text-muted-foreground first:mt-0",
  h6: "mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:mt-0",

  p: "my-3 leading-relaxed first:mt-0 last:mb-0",
  hr: "my-6 border-0 border-t border-border",

  /** link navegavel (http/https/mailto/#) */
  a: "text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary",
  /** link que nao resolve (caminho relativo) ou esquema recusado */
  deadLink: "cursor-help text-muted-foreground underline decoration-dotted underline-offset-2",

  ul: "my-3 list-disc space-y-1 pl-6 marker:text-muted-foreground",
  ol: "my-3 list-decimal space-y-1 pl-6 marker:text-muted-foreground",
  li: "leading-relaxed",
  /** item de checklist: sem bolinha, o glifo faz o papel */
  taskItem: "-ml-6 list-none leading-relaxed",
  task: "mr-1.5 inline-block text-muted-foreground",

  /**
   * HTML cru do arquivo, escapado: nao e HTML na tela, e o texto do arquivo.
   * Precisa PARECER isso — mono e recuado, nunca disfarcado de paragrafo.
   */
  rawHtml:
    "my-3 overflow-x-auto rounded-md border border-dashed border-border bg-surface-inset px-3 py-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground",

  blockquote:
    "my-4 border-l-2 border-primary/40 bg-surface-inset py-2 pl-4 text-muted-foreground italic",

  tableWrap: "my-4 overflow-x-auto rounded-md border border-border",
  table: "w-full border-collapse text-left text-xs",
  th: "border-b border-border bg-surface-inset px-3 py-2 font-semibold text-foreground",
  td: "border-b border-border px-3 py-2 align-top text-muted-foreground",
  tr: "[&:last-child>td]:border-b-0",

  code: "rounded-sm border border-border bg-surface-inset px-1 py-0.5 font-mono text-xs text-foreground",
  codeBlock: "my-4 overflow-hidden rounded-md border border-border bg-surface-inset",
  codeLang:
    "border-b border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground",
  pre: "overflow-x-auto p-3",
  preCode: "font-mono text-xs leading-relaxed text-foreground",

  strong: "font-semibold text-foreground",
  em: "italic",
  del: "text-muted-foreground line-through",

  img: "my-3 max-w-full rounded-md border border-border",
  /**
   * Caminho relativo nao resolve — nao ha servidor de blobs. Placeholder
   * discreto no lugar do icone quebrado, com o caminho no `title`.
   */
  imagePlaceholder:
    "my-3 inline-flex max-w-full items-center gap-2 rounded-md border border-dashed border-border bg-surface-inset px-3 py-2 align-middle font-mono text-xs text-muted-foreground",
  imagePlaceholderAlt: "truncate text-foreground",
  imagePlaceholderNote: "shrink-0 opacity-70",
} as const;
