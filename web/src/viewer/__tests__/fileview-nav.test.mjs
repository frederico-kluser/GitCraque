/**
 * NAVEGACAO PREV/NEXT — ver `fileview-nav.domtest.tsx` (hooks reais) e
 * `fileview-nav-matrix.domtest.tsx` (stub de hook injetado via alias do
 * esbuild, para a matriz completa de posicoes na lista).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleAndImport } from "./domtest.mjs";

const here = dirname(fileURLToPath(import.meta.url));

await bundleAndImport([
  { input: "fileview-nav.domtest.tsx" },
  {
    input: "fileview-nav-matrix.domtest.tsx",
    alias: { "@/hooks": join(here, "hooks-stub.ts") },
  },
]);
