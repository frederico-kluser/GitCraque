/**
 * A DISCIPLINA DO VOCABULARIO DE TOQUE.
 *
 *   node --test web/src/i18n/__tests__/touch-vocabulary.test.mjs
 *
 * As chaves de gesto existem por UM motivo: o texto original ensina um gesto de
 * mouse — "clique duas vezes", "botao direito", "arraste" — e num aparelho sem
 * ponteiro fino essa instrucao e literalmente impossivel de seguir. Uma variante
 * de toque que volte a falar de clique nao e uma traducao imperfeita: e a chave
 * inteira perdendo a razao de existir, e ninguem percebe, porque o texto continua
 * bem escrito e o `tsc` continua verde.
 *
 * Duas convencoes marcam essas chaves (documentadas em `locales/pt.ts`, na secao
 * "Toque e tela estreita"): o namespace `touch.*` para o vocabulario de gesto, e
 * o sufixo `.touch` para a variante de um texto que JA EXISTIA. Mais
 * `commit.button.touchTitle`, que e a dica do botao de commit quando nao ha
 * teclado fisico para o atalho servir de dica.
 *
 * `settings.layout.touchTargets.hint` NAO entra nesta conferencia, e a exclusao e
 * deliberada: ela fala de mouse DE PROPOSITO nos quatro idiomas ("aumenta os
 * alvos mesmo quando ha mouse"), porque e uma preferencia de layout — nao uma
 * instrucao de gesto. Ela nao e `touch.*` nem termina em `.touch`, entao o
 * recorte abaixo ja a deixa de fora sem excecao cravada.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { en } from "../locales/en.ts";
import { es } from "../locales/es.ts";
import { pt } from "../locales/pt.ts";
import { zh } from "../locales/zh.ts";

const CATALOGS = { pt, en, es, zh };

const TOUCH_SUFFIX = ".touch";

/** O recorte: namespace de gesto, variante de gesto, e a dica do botao commit. */
const isGestureKey = (key) =>
  key.startsWith("touch.") || key.endsWith(TOUCH_SUFFIX) || key === "commit.button.touchTitle";

/**
 * Vocabulario de ponteiro fino nos quatro idiomas. Tudo em minusculas — a
 * comparacao abaixa o texto antes. As duas grafias do espanhol e do portugues
 * estao aqui porque um texto pode chegar sem acento.
 */
const POINTER_WORDS = [
  "mouse",
  "click",
  "right-click",
  "clic",
  "clique",
  "clicar",
  "ratón",
  "raton",
  "botón derecho",
  "botão direito",
  "botao direito",
  "鼠标",
  "右键",
  "点击",
];

test("nenhuma chave de gesto menciona mouse, clique ou botao direito", () => {
  const gestureKeys = Object.keys(CATALOGS.pt).filter(isGestureKey);
  // Guarda contra teste vazio: renomear a convencao deixaria o laco sem nada
  // para conferir e o teste passaria verde sobre zero chave.
  assert.ok(gestureKeys.length >= 10, `esperava o vocabulario de toque inteiro, achei ${gestureKeys.length} chave(s)`);

  const problems = [];
  for (const key of gestureKeys) {
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      const value = catalog[key];
      if (typeof value !== "string") continue;
      const haystack = value.toLowerCase();
      const hits = POINTER_WORDS.filter((word) => haystack.includes(word));
      if (hits.length) problems.push(`${locale}: ${key} fala de ${hits.join(", ")} — ${JSON.stringify(value)}`);
    }
  }
  assert.equal(
    problems.length,
    0,
    `chave de gesto ensinando gesto de mouse — ela existe justamente para nao fazer isso:\n  ${problems.join("\n  ")}`,
  );
});

test("toda chave `.touch` tem a irma sem o sufixo", () => {
  // `X.touch` so significa alguma coisa como VARIANTE de `X`: o componente
  // escolhe entre as duas por `isTouch`. Uma `.touch` orfa e chave morta —
  // ninguem a encontra procurando pela original, e o `tsc` nao tem opiniao.
  const problems = [];
  for (const [locale, catalog] of Object.entries(CATALOGS)) {
    const keys = Object.keys(catalog);
    const set = new Set(keys);
    for (const key of keys) {
      if (!key.endsWith(TOUCH_SUFFIX)) continue;
      const sibling = key.slice(0, -TOUCH_SUFFIX.length);
      if (!set.has(sibling)) problems.push(`${locale}: ${key} sem a original ${sibling}`);
    }
  }
  assert.equal(problems.length, 0, `variante de toque orfa:\n  ${problems.join("\n  ")}`);
});
