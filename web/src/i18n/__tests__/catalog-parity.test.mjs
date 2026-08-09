/**
 * A PROVA ESTRUTURAL DO CATALOGO — o que o `tsc` nao ve.
 *
 *   node --test web/src/i18n/__tests__/catalog-parity.test.mjs
 *
 * O `tsc` ja cobra simetria de CHAVES: `pt` e o mestre sem anotacao, os outros
 * tres sao `Messages = Record<CatalogKey, string>`, entao chave faltando e
 * TS2741 e chave sobrando e TS2353. So que o `AGENTS.md` avisa do buraco real
 * dessa checagem: "tsc catches a removal only if some consumer reads the field,
 * so renaming an unread field passes clean, so check by hand". Renomear uma
 * chave que ninguem le nos QUATRO arquivos ao mesmo tempo passa limpo, e o
 * compilador nao tem nada a dizer sobre VALOR: vazio, placeholder assimetrico e
 * par de plural orfao compilam perfeitamente e quebram na tela do usuario.
 *
 * Este arquivo importa os quatro catalogos como MODULO (o Node roda `.ts` direto
 * com type stripping — nenhum deles tem import de runtime alem de outro arquivo
 * do proprio i18n). O irmao `catalog-source.test.mjs` faz o oposto: le os
 * arquivos como TEXTO, porque duplicata de chave ja colapsou no modulo.
 *
 * Toda mensagem de falha LISTA as chaves divergentes. Um teste que so diz
 * "falhou" transfere meia hora de garimpo para quem for consertar.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { en } from "../locales/en.ts";
import { es } from "../locales/es.ts";
import { pt } from "../locales/pt.ts";
import { zh } from "../locales/zh.ts";
import { LOCALES } from "../types.ts";

/** `pt` primeiro: ele e o mestre, os outros sao conferidos contra ele. */
const CATALOGS = { pt, en, es, zh };
const MASTER = "pt";
const OTHERS = ["en", "es", "zh"];

const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

/**
 * Formato de chave aceito: `<modulo>.<contexto>.<coisa>` em camelCase, com
 * `_one`/`_other` so como sufixo final. Um espaco a mais, um acento ou uma
 * maiuscula no inicio denunciam o erro de digitacao que, em `pt`, VIRA o
 * contrato — e o `tsc` entao exige o erro nos outros tres idiomas.
 */
const KEY_SHAPE = /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+(?:_one|_other)?$/;

/** Lista legivel e cortada: 20 chaves ja bastam para achar o padrao do erro. */
function listKeys(keys) {
  const shown = keys.slice(0, 20).join("\n  ");
  const rest = keys.length > 20 ? `\n  … e mais ${keys.length - 20}` : "";
  return `\n  ${shown}${rest}`;
}

const namesOf = (value) => new Set([...value.matchAll(PLACEHOLDER)].map((m) => m[1]));

test("os quatro catalogos tem EXATAMENTE o mesmo conjunto de chaves", () => {
  const master = Object.keys(CATALOGS[MASTER]);
  const masterSet = new Set(master);

  for (const locale of OTHERS) {
    const keys = Object.keys(CATALOGS[locale]);
    const set = new Set(keys);

    const missing = master.filter((k) => !set.has(k));
    const extra = keys.filter((k) => !masterSet.has(k));

    assert.equal(
      missing.length,
      0,
      `${locale}.ts nao tem ${missing.length} chave(s) que existem em ${MASTER}.ts:${listKeys(missing)}`,
    );
    assert.equal(
      extra.length,
      0,
      `${locale}.ts tem ${extra.length} chave(s) que nao existem em ${MASTER}.ts:${listKeys(extra)}`,
    );
    assert.equal(keys.length, master.length, `${locale}.ts: ${keys.length} chaves, ${MASTER}.ts: ${master.length}`);
  }
});

test("todo idioma declarado em LOCALES tem catalogo conferido aqui", () => {
  // Sem isto, acrescentar um quinto idioma ao union `Locale` e esquecer o
  // arquivo passaria por este teste sem ninguem notar: `store.ts` monta
  // `CATALOGS: Record<Locale, Messages>` e quebraria so em runtime.
  assert.deepEqual([...LOCALES].sort(), Object.keys(CATALOGS).sort());
});

test("nenhum valor vazio ou so com espaco, em nenhum idioma", () => {
  const empty = [];
  for (const [locale, catalog] of Object.entries(CATALOGS)) {
    for (const [key, value] of Object.entries(catalog)) {
      if (typeof value !== "string" || value.trim() === "") empty.push(`${locale}: ${key}`);
    }
  }
  assert.equal(empty.length, 0, `valor vazio ou so com espaco — a tela mostra um buraco:${listKeys(empty)}`);
});

test("os placeholders {nome} sao os MESMOS nos quatro idiomas", () => {
  // Comparacao por CONJUNTO, nunca por contagem. Um placeholder que existe em
  // `pt` e nao em `zh` vira texto faltando; um que existe so em `zh` chega a
  // tela como `{panel}` literal, porque `interpolate` deixa o desconhecido
  // INTACTO de proposito (translate.ts:25) para o `<Rich>` usar depois.
  //
  // Repeticao e legitima e nao e divergencia: `action.branch.deleteBoth.
  // description` usa `{name}` duas vezes no chines e tres nos outros tres
  // idiomas — a frase chinesa reordena e repete o nome da branch. Comparar
  // contagens transformaria essa traducao correta em falso positivo eterno.
  const problems = [];
  for (const key of Object.keys(CATALOGS[MASTER])) {
    const master = namesOf(CATALOGS[MASTER][key]);
    for (const locale of OTHERS) {
      const other = namesOf(CATALOGS[locale][key]);
      const missing = [...master].filter((n) => !other.has(n));
      const extra = [...other].filter((n) => !master.has(n));
      if (missing.length) problems.push(`${key} [${locale}] nao interpola: ${missing.map((n) => `{${n}}`).join(" ")}`);
      if (extra.length) problems.push(`${key} [${locale}] inventa: ${extra.map((n) => `{${n}}`).join(" ")}`);
    }
  }
  assert.equal(problems.length, 0, `placeholder assimetrico:${listKeys(problems)}`);
});

test("nenhuma chave { } malformada — so o que o interpolate reconhece", () => {
  // `interpolate` casa /\{([a-zA-Z0-9_]+)\}/. Uma chave `{ name }` com espaco,
  // um `{}` vazio ou uma chave sem fechar nunca sao substituidos e vao para a
  // tela como estao.
  const problems = [];
  for (const [locale, catalog] of Object.entries(CATALOGS)) {
    for (const [key, value] of Object.entries(catalog)) {
      const rest = value.replace(PLACEHOLDER, "");
      if (rest.includes("{") || rest.includes("}")) problems.push(`${locale}: ${key} — ${JSON.stringify(value)}`);
    }
  }
  assert.equal(problems.length, 0, `chave de interpolacao malformada:${listKeys(problems)}`);
});

test("todo `_one` tem `_other` e vice-versa, nos quatro idiomas", () => {
  // `PluralBase` em types.ts:43 sai APENAS do `_one`, entao `foo_one` sem
  // `foo_other` compila; `t("foo", {count: 2})` nao acha a variante e o
  // tradutor devolve a propria chave — o usuario le `changes.staged` na tela.
  const problems = [];
  let pairs = 0;
  for (const [locale, catalog] of Object.entries(CATALOGS)) {
    const keys = Object.keys(catalog);
    const set = new Set(keys);
    for (const key of keys) {
      if (key.endsWith("_one")) {
        pairs += 1;
        const other = `${key.slice(0, -"_one".length)}_other`;
        if (!set.has(other)) problems.push(`${locale}: ${key} sem ${other}`);
      } else if (key.endsWith("_other")) {
        const one = `${key.slice(0, -"_other".length)}_one`;
        if (!set.has(one)) problems.push(`${locale}: ${key} sem ${one}`);
      }
    }
  }
  assert.equal(problems.length, 0, `par de plural orfao:${listKeys(problems)}`);
  // Guarda contra teste vazio: se alguem trocar a convencao de plural, o laco
  // acima passaria sem conferir nada.
  assert.ok(pairs > 0, "nenhuma chave `_one` encontrada — a convencao de plural mudou?");
});

test("toda chave respeita o formato do catalogo", () => {
  const bad = Object.keys(CATALOGS[MASTER]).filter((k) => !KEY_SHAPE.test(k));
  assert.equal(bad.length, 0, `chave fora do formato <modulo>.<contexto>.<coisa>:${listKeys(bad.map(JSON.stringify))}`);
});
