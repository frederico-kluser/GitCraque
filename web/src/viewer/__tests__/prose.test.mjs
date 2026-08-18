/**
 * A PROSE DO MARKDOWN — invariantes de tipografia do mapa de classes.
 *
 * `prose.ts` e TypeScript puro, sem import de runtime: o Node roda direto com
 * type stripping, sem bundler.
 *
 * O que se prova: cada classe do mapa e TOKEN SEMANTICO — nunca hex, nunca
 * cor crua de paleta numerada do Tailwind. E o contrato do proprio arquivo
 * ("Regra dura: so token semantico"), conferido como dado, igual ao
 * `sanitize.test.mjs` auditar a allowlist do DOMPurify.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { PROSE } from "../prose.ts";

const TODAS = Object.values(PROSE);

test("toda entrada da prose existe e e string de classes", () => {
  assert.ok(TODAS.length >= 20, `poucas entradas para valer como cobertura: ${TODAS.length}`);
  for (const [nome, classes] of Object.entries(PROSE)) {
    assert.equal(typeof classes, "string", `${nome} nao e string`);
    assert.ok(classes.trim().length > 0, `${nome} esta vazia`);
  }
});

test("nenhum hex nem funcao de cor na prose", () => {
  for (const classes of TODAS) {
    assert.doesNotMatch(classes, /#[0-9a-fA-F]{3,8}\b/, `hex em: ${classes}`);
    assert.doesNotMatch(classes, /rgb\(|hsl\(/, `funcao de cor em: ${classes}`);
  }
});

test("nenhuma cor crua de paleta numerada na prose", () => {
  const PALETA = [
    "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal",
    "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink",
    "rose", "stone", "neutral", "zinc", "gray", "grey", "slate", "black", "white",
  ];
  for (const classes of TODAS) {
    for (const cor of PALETA) {
      assert.doesNotMatch(classes, new RegExp(`-(?:${cor})-`, "i"), `paleta ${cor} em: ${classes}`);
    }
  }
});

test("as fontes e tamanhos sao fixos e semanticos", () => {
  // Mono para codigo, sans para documento — os dois via token/utilitario
  // proprio, nunca fonte numerada por cor.
  assert.ok(PROSE.code.includes("font-mono"));
  assert.ok(PROSE.root.includes("text-foreground"));
  // O container raiz respira e quebra palavra longa (URL em link).
  assert.ok(PROSE.root.includes("break-words"));
});

test("link navegavel tem underline e primaria; link morto degrada discreto", () => {
  assert.ok(PROSE.a.includes("text-primary"));
  assert.ok(PROSE.a.includes("underline"));
  assert.ok(PROSE.deadLink.includes("text-muted-foreground"));
  assert.ok(!PROSE.deadLink.includes("text-primary"), "link morto nao pode parecer navegavel");
});
