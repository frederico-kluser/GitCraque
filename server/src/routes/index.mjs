/**
 * Registro de TODAS as rotas.
 *
 * A tabela canonica e `ROUTES` de `contract.mjs`: se um par (metodo, caminho)
 * nao esta la, ele nao existe. O registro abaixo e conferido contra ela no boot
 * — rota registrada fora do contrato, ou rota do contrato sem handler, derruba
 * o servidor na hora em vez de virar 404 misterioso em producao.
 */
import { API_PREFIX, ROUTES } from "../contract.mjs";
import { Router } from "../router.mjs";

import { registerRepoRoutes } from "./repo.mjs";
import { registerRepoPickerRoutes } from "./repos.mjs";
import { registerWorktreeRoutes } from "./worktrees.mjs";
import { registerBranchRoutes } from "./branches.mjs";
import { registerRemoteRoutes } from "./remotes.mjs";
import { registerOpsRoutes } from "./ops.mjs";
import { registerCredentialRoutes } from "./credentials.mjs";
import { registerAiRoutes } from "./ai.mjs";

export { API_PREFIX };

/**
 * @param {object} deps
 * @returns {Router}
 */
export function buildRouter(deps = {}) {
  const router = new Router();
  registerRepoRoutes(router, deps);
  registerRepoPickerRoutes(router, deps);
  registerWorktreeRoutes(router, deps);
  registerBranchRoutes(router, deps);
  registerRemoteRoutes(router, deps);
  registerOpsRoutes(router, deps);
  registerCredentialRoutes(router, deps);
  registerAiRoutes(router, deps);
  assertContract(router);
  return router;
}

/** O roteador e o contrato tem de ser a mesma tabela, nos dois sentidos. */
export function assertContract(router) {
  const registered = new Set();
  for (const [method, byLength] of router.table) {
    for (const [, bucket] of byLength) {
      for (const route of bucket) registered.add(`${method} ${route.pattern}`);
    }
  }
  const expected = new Set(ROUTES.map(([method, pattern]) => `${method} ${pattern}`));

  const faltando = [...expected].filter((key) => !registered.has(key));
  const sobrando = [...registered].filter((key) => !expected.has(key));
  if (faltando.length || sobrando.length) {
    const detail = [
      faltando.length ? `sem handler: ${faltando.join(", ")}` : "",
      sobrando.length ? `fora do contrato: ${sobrando.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
    throw new Error(`rotas divergem de contract.mjs -> ${detail}`);
  }
}
