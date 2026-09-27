/**
 * Realce de sintaxe LEVE — scanner de regex, zero dependencias.
 *
 * Cinco cores apenas: comentario, string, numero, palavra-chave e funcao. Nao
 * e um parser: e o suficiente para o olho separar as coisas num diff. O que e
 * comum a todas as linguagens fica a cargo do modo "plain" (texto sem span — o
 * DOM dos testes de render do diff nao muda por causa disto).
 *
 * ESTADO ENTRE LINHAS: comentarios de bloco (`/* *\/`, `<!-- -->`, `"""`) e
 * template strings atravessam linhas, entao `highlightLines` carrega o modo de
 * uma linha para a seguinte — um hunk que comeca no meio de um comentario de
 * bloco continua pintado como comentario.
 *
 * REGRAS DE TYPE STRIPPING (este ficheiro e carregado pelo test:viewer sob
 * Node): sem imports de runtime via `@/`, imports relativos com `.ts`
 * explicito, sem enum/namespace/decorators. Por isso aqui nao ha imports.
 */

export type CodeKind = "comment" | "string" | "number" | "keyword" | "function" | "plain";

export interface CodeToken {
  text: string;
  kind: CodeKind;
}

export type Lang = "c" | "json" | "css" | "html" | "python" | "plain";

const EXT_LANG: Record<string, Lang> = {
  js: "c",
  mjs: "c",
  cjs: "c",
  jsx: "c",
  ts: "c",
  mts: "c",
  cts: "c",
  tsx: "c",
  json: "json",
  jsonc: "json",
  css: "css",
  scss: "css",
  html: "html",
  htm: "html",
  vue: "html",
  svg: "html",
  py: "python",
};

/** Pela extensao do caminho. Sem extensao conhecida, texto puro. */
export function detectLang(path: string): Lang {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return "plain";
  return EXT_LANG[path.slice(dot + 1).toLowerCase()] ?? "plain";
}

/* ------------------------------------------------------------------ */
/* Vocabulario                                                         */
/* ------------------------------------------------------------------ */

const C_KEYWORDS = new Set([
  "as", "async", "await", "break", "case", "catch", "class", "const", "continue",
  "default", "delete", "do", "else", "enum", "export", "extends", "finally",
  "for", "from", "function", "get", "if", "implements", "import", "in",
  "instanceof", "interface", "is", "keyof", "let", "namespace", "new", "of",
  "private", "protected", "public", "readonly", "return", "satisfies", "set",
  "static", "super", "switch", "this", "throw", "try", "type", "typeof",
  "undefined", "var", "void", "while", "with", "yield",
  // literais tambem merecem cor
  "false", "null", "true",
]);

const PY_KEYWORDS = new Set([
  "and", "as", "assert", "async", "await", "break", "class", "continue", "def",
  "del", "elif", "else", "except", "finally", "for", "from", "global", "if",
  "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise",
  "return", "try", "while", "with", "yield",
  "False", "None", "True", "self",
]);

const JSON_KEYWORDS = new Set(["true", "false", "null"]);

/* ------------------------------------------------------------------ */
/* Scanner                                                             */
/* ------------------------------------------------------------------ */

/** O que atravessa linhas. */
interface ScanState {
  /** dentro de `/* *\/`, `<!-- -->` ou `#|` (css) — fechado pelo terminador */
  block: "none" | "c" | "html" | "triple";
  /** dentro de uma template string c-like sem fechar */
  template: boolean;
}

function freshState(): ScanState {
  return { block: "none", template: false };
}

const IDENT_START = /[A-Za-z_$]/;
const IDENT_CHAR = /[A-Za-z0-9_$]/;

function isIdentStart(ch: string): boolean {
  return IDENT_START.test(ch);
}

function isIdentChar(ch: string): boolean {
  return ch !== "" && IDENT_CHAR.test(ch);
}

/** Espaco em branco e resto da linha, acumulados em runs "plain". */
function pushPlain(out: CodeToken[], text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.kind === "plain") last.text += text;
  else out.push({ text, kind: "plain" });
}

function push(out: CodeToken[], text: string, kind: CodeKind) {
  if (!text) return;
  out.push({ text, kind });
}

/**
 * Uma linha da familia c (js/ts/jsx/tsx). `keywords` decide se o identificador
 * e palavra-chave; json passa o conjunto dele.
 */
function scanC(line: string, state: ScanState, keywords: Set<string>): CodeToken[] {
  const out: CodeToken[] = [];
  let i = 0;
  let plain = "";

  const flush = () => {
    if (plain) {
      pushPlain(out, plain);
      plain = "";
    }
  };

  while (i < line.length) {
    // comentario de bloco aberto na linha anterior
    if (state.block === "c") {
      const end = line.indexOf("*/", i);
      flush();
      if (end === -1) {
        push(out, line.slice(i), "comment");
        i = line.length;
      } else {
        push(out, line.slice(i, end + 2), "comment");
        state.block = "none";
        i = end + 2;
      }
      continue;
    }

    // template string aberta na linha anterior
    if (state.template) {
      const end = findQuoteEnd(line, i, "`");
      flush();
      if (end === -1) {
        push(out, line.slice(i), "string");
        i = line.length;
      } else {
        push(out, line.slice(i, end + 1), "string");
        state.template = false;
        i = end + 1;
      }
      continue;
    }

    const ch = line[i];
    const next = line[i + 1] ?? "";

    if (ch === "/" && next === "/") {
      flush();
      push(out, line.slice(i), "comment");
      i = line.length;
      continue;
    }
    if (ch === "/" && next === "*") {
      flush();
      const end = line.indexOf("*/", i + 2);
      if (end === -1) {
        push(out, line.slice(i), "comment");
        state.block = "c";
        i = line.length;
      } else {
        push(out, line.slice(i, end + 2), "comment");
        i = end + 2;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      flush();
      const end = findQuoteEnd(line, i + 1, ch);
      if (end === -1) {
        push(out, line.slice(i), "string");
        if (ch === "`") state.template = true;
        i = line.length;
      } else {
        push(out, line.slice(i, end + 1), "string");
        i = end + 1;
      }
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      flush();
      let j = i;
      while (j < line.length && /[0-9a-fA-FxXoObBnN._eE+-]/.test(line[j])) {
        // o sinal so conta a seguir a expoente
        if ((line[j] === "+" || line[j] === "-") && !/[eE]/.test(line[j - 1])) break;
        j += 1;
      }
      push(out, line.slice(i, j), "number");
      i = j;
      continue;
    }
    if (isIdentStart(ch)) {
      let j = i;
      while (j < line.length && isIdentChar(line[j])) j += 1;
      const word = line.slice(i, j);
      flush();
      if (keywords.has(word)) push(out, word, "keyword");
      else if (line[j] === "(") push(out, word, "function");
      else plain = word;
      i = j;
      continue;
    }
    plain += ch;
    i += 1;
  }
  flush();
  return out;
}

/** Fim de aspa/` respeitando `\` de escape. Devolve o indice da fechada ou -1. */
function findQuoteEnd(line: string, from: number, quote: string): number {
  let j = from;
  while (j < line.length) {
    if (line[j] === "\\") j += 2;
    else if (line[j] === quote) return j;
    else j += 1;
  }
  return -1;
}

function scanPython(line: string, state: ScanState): CodeToken[] {
  const out: CodeToken[] = [];
  let i = 0;
  let plain = "";

  const flush = () => {
    if (plain) {
      pushPlain(out, plain);
      plain = "";
    }
  };

  while (i < line.length) {
    if (state.block === "triple") {
      const end = line.indexOf('"""', i);
      flush();
      if (end === -1) {
        push(out, line.slice(i), "string");
        i = line.length;
      } else {
        push(out, line.slice(i, end + 3), "string");
        state.block = "none";
        i = end + 3;
      }
      continue;
    }

    const ch = line[i];
    const next = line[i + 1] ?? "";

    if (ch === "#") {
      flush();
      push(out, line.slice(i), "comment");
      i = line.length;
      continue;
    }
    if (ch === '"' && next === '"' && (line[i + 2] ?? "") === '"') {
      flush();
      const end = line.indexOf('"""', i + 3);
      if (end === -1) {
        push(out, line.slice(i), "string");
        state.block = "triple";
        i = line.length;
      } else {
        push(out, line.slice(i, end + 3), "string");
        i = end + 3;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      flush();
      const end = findQuoteEnd(line, i + 1, ch);
      if (end === -1) {
        push(out, line.slice(i), "string");
        i = line.length;
      } else {
        push(out, line.slice(i, end + 1), "string");
        i = end + 1;
      }
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      flush();
      let j = i;
      while (j < line.length && /[0-9._eE+-]/.test(line[j])) {
        if ((line[j] === "+" || line[j] === "-") && !/[eE]/.test(line[j - 1])) break;
        j += 1;
      }
      push(out, line.slice(i, j), "number");
      i = j;
      continue;
    }
    if (isIdentStart(ch)) {
      let j = i;
      while (j < line.length && isIdentChar(line[j])) j += 1;
      const word = line.slice(i, j);
      flush();
      if (PY_KEYWORDS.has(word)) push(out, word, "keyword");
      else if (line[j] === "(") push(out, word, "function");
      else plain = word;
      i = j;
      continue;
    }
    plain += ch;
    i += 1;
  }
  flush();
  return out;
}

function scanCss(line: string, state: ScanState): CodeToken[] {
  const out: CodeToken[] = [];
  let i = 0;
  let plain = "";

  const flush = () => {
    if (plain) {
      pushPlain(out, plain);
      plain = "";
    }
  };

  while (i < line.length) {
    if (state.block === "c") {
      const end = line.indexOf("*/", i);
      flush();
      if (end === -1) {
        push(out, line.slice(i), "comment");
        i = line.length;
      } else {
        push(out, line.slice(i, end + 2), "comment");
        state.block = "none";
        i = end + 2;
      }
      continue;
    }

    const ch = line[i];
    const next = line[i + 1] ?? "";

    if (ch === "/" && next === "*") {
      flush();
      const end = line.indexOf("*/", i + 2);
      if (end === -1) {
        push(out, line.slice(i), "comment");
        state.block = "c";
        i = line.length;
      } else {
        push(out, line.slice(i, end + 2), "comment");
        i = end + 2;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      flush();
      const end = findQuoteEnd(line, i + 1, ch);
      if (end === -1) {
        push(out, line.slice(i), "string");
        i = line.length;
      } else {
        push(out, line.slice(i, end + 1), "string");
        i = end + 1;
      }
      continue;
    }
    if (ch === "@") {
      flush();
      let j = i + 1;
      while (j < line.length && isIdentChar(line[j])) j += 1;
      push(out, line.slice(i, j), "keyword");
      i = j;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      flush();
      let j = i;
      while (j < line.length && /[0-9.]/.test(line[j])) j += 1;
      // unidade (px, rem, %, oklch...) acompanha o numero
      while (j < line.length && isIdentChar(line[j])) j += 1;
      if (line[j] === "%") j += 1;
      push(out, line.slice(i, j), "number");
      i = j;
      continue;
    }
    plain += ch;
    i += 1;
  }
  flush();
  return out;
}

function scanHtml(line: string, state: ScanState): CodeToken[] {
  const out: CodeToken[] = [];
  let i = 0;
  let plain = "";

  const flush = () => {
    if (plain) {
      pushPlain(out, plain);
      plain = "";
    }
  };

  while (i < line.length) {
    if (state.block === "html") {
      const end = line.indexOf("-->", i);
      flush();
      if (end === -1) {
        push(out, line.slice(i), "comment");
        i = line.length;
      } else {
        push(out, line.slice(i, end + 3), "comment");
        state.block = "none";
        i = end + 3;
      }
      continue;
    }

    if (line.startsWith("<!--", i)) {
      flush();
      const end = line.indexOf("-->", i + 4);
      if (end === -1) {
        push(out, line.slice(i), "comment");
        state.block = "html";
        i = line.length;
      } else {
        push(out, line.slice(i, end + 3), "comment");
        i = end + 3;
      }
      continue;
    }
    const ch = line[i];
    if (ch === "<") {
      flush();
      let j = i + 1;
      if (line[j] === "/") j += 1;
      while (j < line.length && isIdentChar(line[j])) j += 1;
      if (j > i + 1) {
        push(out, line.slice(i, j), "keyword");
        i = j;
        continue;
      }
    }
    if (ch === '"' || ch === "'") {
      flush();
      const end = findQuoteEnd(line, i + 1, ch);
      if (end === -1) {
        push(out, line.slice(i), "string");
        i = line.length;
      } else {
        push(out, line.slice(i, end + 1), "string");
        i = end + 1;
      }
      continue;
    }
    plain += ch;
    i += 1;
  }
  flush();
  return out;
}

/** Uma linha, com estado novo — para segmentos de word-diff e usos avulsos. */
export function tokenizeLine(line: string, lang: Lang): CodeToken[] {
  return highlightLines([line], lang)[0];
}

/**
 * Varias linhas com estado carregado entre elas. `plain` nao gera span — quem
 * renderiza so envolve os tokens coloridos.
 */
export function highlightLines(lines: string[], lang: Lang): CodeToken[][] {
  const state = freshState();
  return lines.map((line) => {
    if (!line) return [];
    switch (lang) {
      case "c":
        return scanC(line, state, C_KEYWORDS);
      case "json":
        return scanC(line, state, JSON_KEYWORDS);
      case "python":
        return scanPython(line, state);
      case "css":
        return scanCss(line, state);
      case "html":
        return scanHtml(line, state);
      default:
        return line ? [{ text: line, kind: "plain" }] : [];
    }
  });
}
