/**
 * A PROVA DA SANITIZACAO — o teste mais importante do modulo do visualizador.
 *
 *   node --test web/src/viewer/__tests__/sanitize.test.mjs
 *
 * `markdown.ts` e `url-policy.ts` nao tem import de runtime alem do `marked`,
 * entao o Node roda o TypeScript direto com type stripping — sem bundler.
 *
 * ── Como este arquivo prova o que diz ──────────────────────────────────
 *
 * O visualizador tem DUAS camadas: o renderer do `marked` (string pura) e o
 * DOMPurify (precisa de DOM). O DOMPurify NAO roda aqui: sem `jsdom` instalado
 * — e nao instalamos dependencia nova — ele se declara `isSupported === false`
 * e nem expoe `sanitize`. Entao o que este teste faz e mais forte do que rodar
 * as duas: prova que **a saida ja e livre de vetor ANTES do DOMPurify**, ou
 * seja, que a rede de baixo esta ali para o dia em que a de cima falhar, e nao
 * porque a de cima depende dela. Em cima disso, audita a configuracao do
 * DOMPurify como dado (allowlist e regexp sao valores; da para conferir sem
 * DOM) e cruza as duas camadas: tudo que o renderer emite tem de caber na
 * allowlist, senao o DOMPurify apagaria conteudo legitimo em silencio.
 *
 * A conferencia nao e `indexOf("<script")`. Isso daria falso positivo: a saida
 * CONTEM, de proposito, o texto `onerror=` — escapado, visivel, inerte. O que
 * o arquivo faz e varrer a saida como TAGS:
 *
 *   1. todo `<` da saida tem de abrir uma tag bem formada (se o escape falhou
 *      em qualquer ponto, sobra um `<` solto e a varredura acusa);
 *   2. toda tag encontrada tem de estar na allowlist;
 *   3. todo atributo encontrado tem de estar na allowlist (e por isso que
 *      NENHUM `on*` passa: a lista e fechada, nao ha o que enumerar);
 *   4. todo atributo de url so pode conter esquema aceito.
 *
 * Para um HTML gerado pelo nosso proprio renderer — nunca um HTML alheio — essa
 * varredura e uma prova, nao uma heuristica.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { markdownToSafeHtml } from "../markdown.ts";
/* O texto vem do catalogo, nao cravado: o renderer e traduzido, e o que o
 * teste prova e o COMPORTAMENTO (degrada para texto), nao o idioma. */
import { t } from "../../i18n/store.ts";
import { classifyUrl, escapeHtml, normalizeUrl, SAFE_URI_REGEXP } from "../url-policy.ts";
import {
  ALLOWED_ATTR,
  ALLOWED_TAGS,
  FORBID_ATTR,
  FORBID_TAGS,
  SANITIZE_CONFIG,
  URI_SAFE_ATTR,
} from "../sanitize.ts";

/* ------------------------------------------------------------------ */
/* Varredura de tags                                                   */
/* ------------------------------------------------------------------ */

const TAG = /<\/?([a-zA-Z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)\/?>/y;
const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseAttrs(source) {
  const attrs = [];
  ATTR.lastIndex = 0;
  let match;
  while ((match = ATTR.exec(source)) !== null) {
    if (!match[0].trim()) continue;
    attrs.push({
      name: match[1].toLowerCase(),
      value: match[2] ?? match[3] ?? match[4] ?? "",
    });
  }
  return attrs;
}

/**
 * Enumera as tags da saida. Falha se algum `<` NAO abrir tag — o que so
 * acontece se o escape de HTML cru tiver vazado.
 */
function scanTags(html) {
  const tags = [];
  let cursor = 0;
  for (;;) {
    const open = html.indexOf("<", cursor);
    if (open < 0) break;
    TAG.lastIndex = open;
    const match = TAG.exec(html);
    assert.ok(
      match,
      `'<' que nao abre tag na posicao ${open} — escape vazou: ${JSON.stringify(html.slice(open, open + 80))}`,
    );
    tags.push({ name: match[1].toLowerCase(), attrs: parseAttrs(match[2] ?? "") });
    cursor = open + match[0].length;
  }
  return tags;
}

const URL_ATTRS = new Set(["href", "src", "xlink:href", "action", "formaction", "srcdoc", "data"]);

/** O criterio unico: tag na lista, atributo na lista, url com esquema aceito. */
function assertSemVetor(html, contexto) {
  for (const tag of scanTags(html)) {
    assert.ok(
      ALLOWED_TAGS.includes(tag.name),
      `${contexto}: tag <${tag.name}> fora da allowlist`,
    );
    for (const attr of tag.attrs) {
      assert.ok(
        !/^on/i.test(attr.name),
        `${contexto}: handler de evento ${attr.name} em <${tag.name}>`,
      );
      assert.ok(
        ALLOWED_ATTR.includes(attr.name),
        `${contexto}: atributo ${attr.name} de <${tag.name}> fora da allowlist`,
      );
      if (URL_ATTRS.has(attr.name)) {
        assert.match(
          attr.value,
          SAFE_URI_REGEXP,
          `${contexto}: url recusada em ${tag.name}[${attr.name}]`,
        );
      }
    }
  }
}

/** Renderiza e ja passa a saida pelo criterio acima. */
function render(markdown, contexto = markdown.slice(0, 40)) {
  const html = markdownToSafeHtml(markdown);
  assertSemVetor(html, contexto);
  return html;
}

/* ------------------------------------------------------------------ */
/* 1. Os tres vetores que o requisito nomeia                           */
/* ------------------------------------------------------------------ */

test("<script>alert(1)</script> sai sem o vetor", () => {
  const html = render("<script>alert(1)</script>");

  assert.ok(!/<script/i.test(html), "sobrou uma tag script de verdade");
  assert.equal(scanTags(html).filter((t) => t.name === "script").length, 0);
  // O texto continua visivel — o arquivo mostra o que ele tem, so que inerte.
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), html);
});

test("<img src=x onerror=alert(1)> sai sem o vetor", () => {
  const html = render("<img src=x onerror=alert(1)>");

  assert.equal(scanTags(html).filter((t) => t.name === "img").length, 0, "virou <img> de verdade");
  assert.ok(!/<img/i.test(html));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"), html);
});

test("[x](javascript:alert(1)) sai sem o vetor", () => {
  const html = render("[x](javascript:alert(1))");

  assert.equal(scanTags(html).filter((t) => t.name === "a").length, 0, "virou link navegavel");
  assert.ok(!/href/i.test(html), "sobrou um href");
  // O rotulo do link sobrevive como texto: recusar o destino nao e apagar
  // o conteudo do arquivo.
  assert.ok(html.includes(">x<"), html);
});

/* ------------------------------------------------------------------ */
/* 2. As variacoes dos mesmos vetores                                  */
/* ------------------------------------------------------------------ */

const VARIACOES = [
  ["script maiusculo", "<SCRIPT>alert(1)</SCRIPT>"],
  ["script com atributo", '<script type="text/javascript">alert(1)</script>'],
  ["script inline no meio do paragrafo", "texto <script>alert(1)</script> texto"],
  ["script fatiado por comentario", "<scr<!---->ipt>alert(1)</script>"],
  ["img onerror com aspas", '<img src="x" onerror="alert(1)">'],
  ["img onerror sem fechar", "<img src=x onerror=alert(1)"],
  ["svg onload", "<svg onload=alert(1)></svg>"],
  ["body onload", "<body onload=alert(1)>"],
  ["iframe javascript", '<iframe src="javascript:alert(1)"></iframe>'],
  ["iframe srcdoc", '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
  ["object data", '<object data="javascript:alert(1)"></object>'],
  ["form action", '<form action="javascript:alert(1)"><input></form>'],
  ["style expression", "<style>body{background:url(javascript:alert(1))}</style>"],
  ["meta refresh", '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">'],
  ["base href", '<base href="javascript:alert(1)">'],
  ["link maiusculo em javascript", "[x](JaVaScRiPt:alert(1))"],
  ["link com tab no esquema", "[x](java\tscript:alert(1))"],
  ["link com entidade numerica", "[x](&#106;avascript:alert(1))"],
  ["link com entidade hexadecimal", "[x](&#x6a;avascript:alert(1))"],
  ["link com entidade nomeada no dois-pontos", "[x](javascript&colon;alert(1))"],
  ["link com espaco antes do esquema", "[x](   javascript:alert(1))"],
  ["link data html", "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)"],
  ["link vbscript", "[x](vbscript:msgbox(1))"],
  ["link file", "[x](file:///etc/passwd)"],
  ["imagem javascript", "![x](javascript:alert(1))"],
  ["imagem data html", "![x](data:text/html,<script>alert(1)</script>)"],
  ["autolink javascript", "<javascript:alert(1)>"],
  ["referencia javascript", "[x][ref]\n\n[ref]: javascript:alert(1)"],
  ["titulo com aspas quebrando atributo", '[x](https://ok.test "a\\" onmouseover=\\"alert(1)")'],
  ["texto de link quebrando atributo", '[" onmouseover="alert(1)](https://ok.test)'],
  ["codigo com html dentro", "```html\n<script>alert(1)</script>\n```"],
  ["pre cru com conteudo", "<pre><script>alert(1)</script></pre>"],
  ["tabela com html na celula", "| a |\n|---|\n| <img src=x onerror=alert(1)> |"],
  ["citacao com html", "> <script>alert(1)</script>"],
  ["item de lista com html", "- <img src=x onerror=alert(1)>"],
  ["cabecalho com html", "# <script>alert(1)</script>"],
];

for (const [nome, fonte] of VARIACOES) {
  test(`variacao neutralizada: ${nome}`, () => {
    const html = render(fonte, nome);
    assert.ok(!/<script/i.test(html), `${nome}: tag script na saida`);
    assert.ok(!/<iframe/i.test(html), `${nome}: tag iframe na saida`);
    assert.ok(!/<svg/i.test(html), `${nome}: tag svg na saida`);
    assert.ok(!/<style/i.test(html), `${nome}: tag style na saida`);
    assert.ok(!/<form|<input|<object|<embed/i.test(html), `${nome}: tag interativa na saida`);
  });
}

test("nenhum href ou src da saida carrega esquema recusado", () => {
  for (const [nome, fonte] of VARIACOES) {
    const html = markdownToSafeHtml(fonte);
    for (const tag of scanTags(html)) {
      for (const attr of tag.attrs) {
        if (attr.name !== "href" && attr.name !== "src") continue;
        assert.doesNotMatch(
          attr.value.toLowerCase(),
          /javascript|vbscript|data:/,
          `${nome}: ${tag.name}[${attr.name}] = ${attr.value}`,
        );
      }
    }
  }
});

/* ------------------------------------------------------------------ */
/* 3. O que TEM de sobreviver                                          */
/* ------------------------------------------------------------------ */
/* Um sanitizador que devolve string vazia passa em todo teste de XSS.  */

test("link externo vira <a> com target e rel", () => {
  const html = render("[docs](https://exemplo.test/a?b=1&c=2)");
  const [a] = scanTags(html).filter((t) => t.name === "a");
  assert.ok(a, "o link externo sumiu");
  const attr = (name) => a.attrs.find((x) => x.name === name)?.value;
  assert.equal(attr("target"), "_blank");
  assert.equal(attr("rel"), "noreferrer noopener");
  // O `&` do querystring sai escapado — senao vira entidade no parser e a url
  // muda por baixo do pano.
  assert.ok(html.includes("b=1&amp;c=2"), html);
});

test("mailto e ancora do documento continuam navegaveis, sem aba nova", () => {
  const mail = render("[fale](mailto:a@b.test)");
  const [ancoraMail] = scanTags(mail).filter((t) => t.name === "a");
  assert.equal(ancoraMail.attrs.find((x) => x.name === "href")?.value, "mailto:a@b.test");
  assert.ok(!ancoraMail.attrs.some((x) => x.name === "target"));

  const frag = render("[secao](#instalacao)");
  const [ancoraFrag] = scanTags(frag).filter((t) => t.name === "a");
  assert.equal(ancoraFrag.attrs.find((x) => x.name === "href")?.value, "#instalacao");
});

test("link relativo degrada para texto, sem virar ancora quebrada", () => {
  const html = render("[outro](./docs/OUTRO.md)");
  assert.equal(scanTags(html).filter((t) => t.name === "a").length, 0);
  assert.ok(html.includes(">outro<"), html);
  assert.ok(html.includes(t("markdown.relativeLink", { href: "./docs/OUTRO.md" })), html);
});

test("imagem relativa vira placeholder discreto; imagem https carrega", () => {
  const relativa = render("![diagrama](./docs/x.png)");
  assert.equal(scanTags(relativa).filter((t) => t.name === "img").length, 0);
  assert.ok(relativa.includes(t("markdown.imageUnresolved")), relativa);
  assert.ok(relativa.includes("diagrama"), relativa);

  const remota = render("![badge](https://exemplo.test/b.svg)");
  const [img] = scanTags(remota).filter((t) => t.name === "img");
  assert.ok(img, "a imagem remota sumiu");
  assert.equal(img.attrs.find((x) => x.name === "src")?.value, "https://exemplo.test/b.svg");
  assert.equal(img.attrs.find((x) => x.name === "referrerpolicy")?.value, "no-referrer");
});

test("a estrutura do documento sobrevive inteira", () => {
  const html = render(
    [
      "# Titulo",
      "",
      "Paragrafo com **forte**, *enfase*, ~~riscado~~ e `codigo`.",
      "",
      "> citacao",
      "",
      "- um",
      "- dois",
      "",
      "1. primeiro",
      "",
      "| a | b |",
      "|:--|--:|",
      "| 1 | 2 |",
      "",
      "```ts",
      "const x = 1;",
      "```",
      "",
      "---",
    ].join("\n"),
  );

  const nomes = new Set(scanTags(html).map((t) => t.name));
  for (const esperada of [
    "h1",
    "p",
    "strong",
    "em",
    "del",
    "code",
    "blockquote",
    "ul",
    "ol",
    "li",
    "table",
    "th",
    "td",
    "pre",
    "hr",
  ]) {
    assert.ok(nomes.has(esperada), `<${esperada}> sumiu do documento`);
  }
  assert.ok(html.includes("const x = 1;"), "o conteudo do bloco de codigo sumiu");
});

test("bloco de codigo mostra o html como texto, nao como html", () => {
  const html = render("```html\n<b>oi</b>\n```");
  assert.ok(html.includes("&lt;b&gt;oi&lt;/b&gt;"), html);
  assert.equal(scanTags(html).filter((t) => t.name === "b").length, 0);
});

/* ------------------------------------------------------------------ */
/* 4. A politica de url, unidade por unidade                           */
/* ------------------------------------------------------------------ */

const CLASSIFICACOES = [
  ["https://a.test/x", "external"],
  ["http://a.test/x", "external"],
  ["HTTPS://A.TEST", "external"],
  ["mailto:a@b.test", "mail"],
  ["#secao", "fragment"],
  ["./x.md", "relative"],
  ["../x.md", "relative"],
  ["docs/x.md", "relative"],
  ["//a.test/x", "relative"],
  ["", "relative"],
  ["javascript:alert(1)", "blocked"],
  ["JaVaScRiPt:alert(1)", "blocked"],
  ["  javascript:alert(1)", "blocked"],
  ["java\tscript:alert(1)", "blocked"],
  ["java\nscript:alert(1)", "blocked"],
  ["java\u0000script:alert(1)", "blocked"],
  ["java script:alert(1)", "blocked"],
  ["&#106;avascript:alert(1)", "blocked"],
  ["&#x6a;avascript:alert(1)", "blocked"],
  ["javascript&colon;alert(1)", "blocked"],
  ["java&Tab;script:alert(1)", "blocked"],
  ["data:text/html,<script>alert(1)</script>", "blocked"],
  ["data:image/png;base64,AAA", "blocked"],
  ["vbscript:msgbox(1)", "blocked"],
  ["file:///etc/passwd", "blocked"],
  ["tel:+5511999999999", "blocked"],
];

for (const [url, esperado] of CLASSIFICACOES) {
  test(`classifyUrl(${JSON.stringify(url)}) = ${esperado}`, () => {
    assert.equal(classifyUrl(url).kind, esperado);
  });
}

test("url recusada nunca devolve href", () => {
  for (const [url, esperado] of CLASSIFICACOES) {
    if (esperado !== "blocked" && esperado !== "relative") continue;
    assert.equal(classifyUrl(url).href, "", url);
  }
});

test("uma passada so de entidade — &amp;#106; NAO vira j", () => {
  // O parser do navegador tambem decodifica uma vez so: `&amp;#106;` e o TEXTO
  // `&#106;`. Decodificar duas vezes inventaria um ataque que nao existe e
  // recusaria url legitima.
  assert.equal(normalizeUrl("&amp;#106;avascript:alert(1)"), "&#106;avascript:alert(1)");
  assert.equal(classifyUrl("&amp;#106;avascript:alert(1)").kind, "relative");
});

test("escapeHtml fecha os cinco caracteres que quebram markup", () => {
  assert.equal(escapeHtml(`<&>"'`), "&lt;&amp;&gt;&quot;&#39;");
  assert.equal(escapeHtml("a"), "a");
});

test("SAFE_URI_REGEXP aceita o que a classificacao aceita e recusa o resto", () => {
  for (const boa of ["https://a.test", "http://a.test", "mailto:a@b.test", "#x"]) {
    assert.match(boa, SAFE_URI_REGEXP, boa);
  }
  for (const ruim of [
    "javascript:alert(1)",
    "data:text/html,x",
    "vbscript:x",
    "file:///x",
    "./relativo.md",
  ]) {
    assert.doesNotMatch(ruim, SAFE_URI_REGEXP, ruim);
  }
});

/* ------------------------------------------------------------------ */
/* 5. A configuracao do DOMPurify, auditada como dado                  */
/* ------------------------------------------------------------------ */

test("a allowlist de tags nao tem nada executavel", () => {
  for (const proibida of [
    "script",
    "iframe",
    "object",
    "embed",
    "style",
    "form",
    "input",
    "svg",
    "math",
    "link",
    "meta",
    "base",
    "template",
  ]) {
    assert.ok(!ALLOWED_TAGS.includes(proibida), `<${proibida}> na allowlist`);
    assert.ok(FORBID_TAGS.includes(proibida), `<${proibida}> fora do FORBID_TAGS`);
  }
});

test("a allowlist de atributos e fechada e nao admite handler de evento", () => {
  for (const attr of ALLOWED_ATTR) {
    assert.ok(!/^on/i.test(attr), `${attr} parece handler de evento`);
  }
  assert.ok(!ALLOWED_ATTR.includes("style"));
  assert.ok(FORBID_ATTR.includes("style"));
  assert.ok(FORBID_ATTR.includes("srcset"));
  assert.equal(SANITIZE_CONFIG.ALLOW_DATA_ATTR, false);
  assert.equal(SANITIZE_CONFIG.ALLOW_UNKNOWN_PROTOCOLS, false);
  assert.equal(SANITIZE_CONFIG.RETURN_TRUSTED_TYPE, false);
});

test("o DOMPurify usa a MESMA regexp de url da camada de cima", () => {
  assert.equal(SANITIZE_CONFIG.ALLOWED_URI_REGEXP, SAFE_URI_REGEXP);
});

test("os atributos inertes estao isentos da regexp — senao o rel some do link", () => {
  // Apertar o ALLOWED_URI_REGEXP faz o DOMPurify testar TODO atributo que nao
  // seja inerte contra ela. `target="_blank"` nao e url e seria descartado,
  // levando junto a protecao que o `rel` da.
  for (const inerte of ["target", "rel"]) {
    assert.ok(URI_SAFE_ATTR.includes(inerte), `${inerte} seria comido pela regexp`);
  }
  assert.deepEqual(SANITIZE_CONFIG.ADD_URI_SAFE_ATTR, URI_SAFE_ATTR);
  // Nenhum atributo que POSSA carregar url pode estar isento.
  for (const attr of URI_SAFE_ATTR) {
    assert.ok(!URL_ATTRS.has(attr), `${attr} carrega url e nao pode ser isento`);
  }
});

/* ------------------------------------------------------------------ */
/* 6. As duas camadas conferem entre si                                */
/* ------------------------------------------------------------------ */

test("tudo que o renderer emite cabe na allowlist do DOMPurify", () => {
  // Sem este teste, acrescentar uma tag ao renderer (um `<figure>`, um
  // `<details>`) passaria no typecheck e sumiria em silencio na tela: o
  // DOMPurify apagaria o que a allowlist nao reconhece.
  const documento = [
    "# h1",
    "## h2",
    "### h3",
    "#### h4",
    "##### h5",
    "###### h6",
    "",
    "p com **b**, *i*, ~~s~~, `c`, [link](https://a.test), [rel](./x.md), ![i](./x.png),",
    "![r](https://a.test/x.png) e quebra  ",
    "de linha.",
    "",
    "> citacao",
    "",
    "- a",
    "- [x] feito",
    "- [ ] pendente",
    "",
    "3. tres",
    "4. quatro",
    "",
    "| a | b | c |",
    "|:--|:-:|--:|",
    "| 1 | 2 | 3 |",
    "",
    "```js",
    "const a = 1;",
    "```",
    "",
    "    codigo indentado",
    "",
    "<div>html cru</div>",
    "",
    "---",
  ].join("\n");

  const tags = scanTags(markdownToSafeHtml(documento));
  assert.ok(tags.length > 30, `poucas tags para valer como cobertura: ${tags.length}`);

  const vistas = new Set();
  const atributos = new Set();
  for (const tag of tags) {
    vistas.add(tag.name);
    for (const attr of tag.attrs) atributos.add(attr.name);
  }

  for (const nome of vistas) {
    assert.ok(ALLOWED_TAGS.includes(nome), `renderer emite <${nome}>, allowlist nao tem`);
  }
  for (const attr of atributos) {
    assert.ok(
      ALLOWED_ATTR.includes(attr),
      `renderer emite o atributo ${attr}, allowlist nao tem`,
    );
  }
});

test("a saida inteira e HTML bem formado do ponto de vista do escape", () => {
  // `scanTags` falha se qualquer `<` da saida nao abrir tag; rodar sobre uma
  // fonte cheia de sinal solto e a prova de que o escape nao tem furo.
  const fonte = [
    "a < b > c & d \" e ' f",
    "",
    "`< > & \" '`",
    "",
    "```",
    "if (a < b && c > d) {}",
    "```",
    "",
    "<div class=\"x\" data-y='z'>cru</div>",
    "",
    "| < | > |",
    "|---|---|",
    "| & | \" |",
  ].join("\n");

  const html = render(fonte, "escape");
  assert.ok(html.includes("&lt;"), "nada foi escapado, suspeito");
});
