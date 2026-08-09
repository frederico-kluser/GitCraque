/**
 * PONTE DE TESTE: resolve import relativo SEM extensao para `.ts`.
 *
 * NAO e um teste (o glob da suite e `*.test.mjs`) e NAO toca em codigo de
 * producao. Existe por causa de uma violacao da disciplina de type stripping
 * que entrou na onda 2A: `useShellStore.ts` importa `./useLongPress` e
 * `useLayoutMode.ts` importa `./useShellStore` e `./useViewport` — sem o
 * `.ts` explicito que o AGENTS.md exige para import relativo em runtime.
 * A violacao passa no `tsc` (o tsc resolve sozinho) e derruba a suíte
 * inteira no carregamento, exatamente como o AGENTS.md avisa.
 *
 * Uso:
 *
 *   node --loader web/src/hooks/__tests__/ts-loader.mjs --test \
 *        web/src/hooks/__tests__/useShellStore.test.mjs
 *
 * Quando a producao ganhar o `.ts` (mudanca de UMA letra por import), este
 * arquivo vira letra morta: a resolucao normal cobre tudo. Nada neste
 * arquivo altera o comportamento do modulo — so completa o nome do arquivo
 * que o autor ja apontou.
 */
export async function resolve(specifier, context, nextResolve) {
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  if (!relative || specifier.endsWith(".ts") || specifier.endsWith(".tsx")) {
    return nextResolve(specifier, context);
  }
  try {
    return await nextResolve(specifier, context);
  } catch {
    return nextResolve(`${specifier}.ts`, context);
  }
}
