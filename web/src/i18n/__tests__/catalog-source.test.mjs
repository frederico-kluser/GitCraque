/**
 * O QUE SO SE VE LENDO O ARQUIVO, nao o modulo.
 *
 *   node --test web/src/i18n/__tests__/catalog-source.test.mjs
 *
 * Duas familias de defeito escapam de qualquer teste que importe o catalogo:
 *
 *  1. **Chave duplicada dentro do mesmo literal de objeto.** `{"a": 1, "a": 2}`
 *     colapsa em silencio e a SEGUNDA vence. Nao ha erro de `tsc`, nao ha aviso
 *     do Node, e o modulo importado ja perdeu a evidencia — a unica prova possivel
 *     e ler o arquivo como TEXTO. O sintoma na tela e o texto errado numa chave
 *     que "obviamente" esta certa no arquivo, algumas centenas de linhas acima.
 *
 *  2. **Violacao de type stripping.** Tudo sob `web/src/i18n/**` e carregado CRU
 *     pelo Node, sem bundler, por `test:viewer` e `test:dnd` (o motor puro de DND
 *     recebe o tradutor de fora). O Node nao resolve o alias `@/`, nao adivinha
 *     extensao e recusa `.tsx`. Um import de aparencia normal aqui passa no `tsc`,
 *     passa na revisao, e derruba DUAS suites inteiras no carregamento — nao um
 *     teste, a suite toda. O checador do projeto ja cobre isso linha a linha;
 *     aqui a varredura e sobre o arquivo inteiro, entao um import quebrado em
 *     varias linhas (existe um em `store.ts:23`) tambem e conferido.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { en } from "../locales/en.ts";
import { es } from "../locales/es.ts";
import { pt } from "../locales/pt.ts";
import { zh } from "../locales/zh.ts";

const I18N_DIR = fileURLToPath(new URL("..", import.meta.url));
const CATALOGS = { pt, en, es, zh };

/** Linha de chave: `  "modulo.coisa":` — o valor pode ficar na linha de baixo. */
const KEY_LINE = /^[ \t]*"([^"\\]+)":/gm;

/**
 * `import`/`export ... from "spec"`. O miolo e `[^;]*?` de proposito: sem o
 * ponto-e-virgula o casamento nao consegue atravessar uma declaracao inteira
 * para roubar o `from` da seguinte, e ainda assim cruza quebras de linha — que e
 * exatamente o caso do import multilinha de `store.ts`.
 */
const IMPORT_FROM = /^[ \t]*(import|export)\b([^;]*?)\bfrom\s*["']([^"']+)["']/gm;
/** `import("...")` e runtime por definicao — nao existe `import type(...)`. */
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']/g;

const RUNTIME_EXT = /\.(ts|mjs|js|json)$/;

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    // O proprio diretorio de teste fica de fora: `.mjs` nao passa por type
    // stripping e nao e carregado por test:viewer nem por test:dnd.
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out.sort();
}

const relative = (file) => file.slice(I18N_DIR.length);

test("nenhuma chave duplicada dentro do mesmo arquivo de catalogo", () => {
  const problems = [];
  for (const locale of Object.keys(CATALOGS)) {
    const src = readFileSync(join(I18N_DIR, "locales", `${locale}.ts`), "utf8");
    const found = [...src.matchAll(KEY_LINE)].map((m) => m[1]);

    const seen = new Set();
    const duplicated = new Set();
    for (const key of found) {
      if (seen.has(key)) duplicated.add(key);
      seen.add(key);
    }
    for (const key of duplicated) problems.push(`${locale}.ts: "${key}" aparece mais de uma vez — a ULTIMA vence`);

    // Auto-conferencia do parser: se o texto e o modulo divergem, o teste acima
    // esta olhando para a coisa errada e nao vale nada. Isto e o que impede a
    // varredura por regex de virar uma falsa sensacao de seguranca.
    const fromModule = new Set(Object.keys(CATALOGS[locale]));
    const unreadable = [...fromModule].filter((k) => !seen.has(k));
    const phantom = [...seen].filter((k) => !fromModule.has(k));
    assert.deepEqual(
      { unreadable, phantom },
      { unreadable: [], phantom: [] },
      `o leitor de texto de ${locale}.ts nao bate com o modulo — conserte o parser deste teste antes de acreditar nele`,
    );
  }
  assert.equal(problems.length, 0, `chave duplicada:\n  ${problems.join("\n  ")}`);
});

test("web/src/i18n/** sobrevive ao type stripping do Node", () => {
  const files = sourceFiles(I18N_DIR);
  // Guarda contra varredura vazia: um diretorio renomeado deixaria este teste
  // passando sem ler nada.
  assert.ok(files.length >= 6, `esperava varrer o modulo inteiro, achei ${files.length} arquivo(s)`);

  const problems = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const where = relative(file);

    const specs = [];
    for (const m of src.matchAll(IMPORT_FROM)) {
      // So `import type` / `export type` inteiro e apagado. `import { type X }`
      // continua sendo um import de RUNTIME: o Node apaga o `type X`, nao a
      // declaracao.
      specs.push({ spec: m[3], typeOnly: /^\s*type\b/.test(m[2]) });
    }
    for (const m of src.matchAll(DYNAMIC_IMPORT)) specs.push({ spec: m[1], typeOnly: false });

    for (const { spec, typeOnly } of specs) {
      if (typeOnly) continue;
      if (spec.startsWith("@/")) {
        problems.push(`${where}: import de runtime por alias "${spec}" — o Node nao le paths do tsconfig`);
      } else if (spec.startsWith(".")) {
        if (spec.endsWith(".tsx")) {
          problems.push(`${where}: import de runtime de "${spec}" — o Node recusa .tsx (ERR_UNKNOWN_FILE_EXTENSION)`);
        } else if (!RUNTIME_EXT.test(spec)) {
          problems.push(`${where}: import relativo sem extensao "${spec}" — o Node nao completa o caminho`);
        }
      }
    }

    for (const [index, line] of codeLines(src)) {
      if (/^\s*(?:export\s+)?(?:declare\s+)?(?:const\s+)?enum\s/.test(line)) {
        problems.push(`${where}:${index + 1}: \`enum\` nao e sintaxe apagavel`);
      }
      if (/^\s*(?:export\s+)?(?:declare\s+)?namespace\s/.test(line)) {
        problems.push(`${where}:${index + 1}: \`namespace\` nao e sintaxe apagavel`);
      }
      if (/^\s*@[A-Za-z_$][\w$]*\s*[({]?\s*$/.test(line)) {
        problems.push(`${where}:${index + 1}: decorator nao e sintaxe apagavel`);
      }
    }
  }

  assert.equal(problems.length, 0, `isto passa no tsc e derruba test:viewer e test:dnd inteiras:\n  ${problems.join("\n  ")}`);
});

/**
 * Linhas de CODIGO — comentario fora. Sem isto, um JSDoc que MENCIONA `enum`
 * (o proprio `verifying-changes` menciona) viraria falso positivo. Nao se
 * remove comentario no meio da linha: `https://` dentro de um texto do catalogo
 * seria cortado como se fosse `//`.
 */
function* codeLines(src) {
  let inBlock = false;
  const lines = src.split("\n");
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes("*/")) inBlock = false;
      continue;
    }
    if (trimmed.startsWith("//")) continue;
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlock = true;
      continue;
    }
    yield [index, line];
  }
}
