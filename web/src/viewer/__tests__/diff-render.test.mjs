/**
 * O RENDER DO DIFF — ver `diff-render.domtest.tsx` para o que se prova.
 *
 * O entry e JSX, entao passa pelo esbuild do projeto (padrao do grafo) e os
 * testes registram neste MESMO processo do `node --test` — o glob
 * `*.test.mjs` continua sendo a porta unica da suite.
 */
import { bundleAndImport } from "./domtest.mjs";

await bundleAndImport([{ input: "diff-render.domtest.tsx" }]);
