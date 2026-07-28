/**
 * Branches, checkout e tags.
 */
import {
  checkout,
  createBranch,
  createTag,
  deleteBranchAll,
  deleteBranchLocal,
  deleteBranchRemote,
  deleteTag,
  renameBranch,
} from "../git/ops.mjs";
import { getWorktreesPayload } from "../git/worktree.mjs";
import { bodyOf, commandResult } from "./_util.mjs";

/**
 * @param {import("../router.mjs").Router} router
 * @param {{onCwdChanged?: (worktree: object, payload: object) => void}} deps
 */
export function registerBranchRoutes(router, deps = {}) {
  router.add("POST", "/branch/create", async (ctx) =>
    commandResult(await createBranch(bodyOf(ctx))),
  );

  router.add("POST", "/branch/delete-local", async (ctx) =>
    commandResult(await deleteBranchLocal(bodyOf(ctx))),
  );

  // Deletar branch remota e `git push <remote> --delete <name>`: passa pelo
  // trampolim de askpass como qualquer outro comando de rede.
  router.add("POST", "/branch/delete-remote", async (ctx) =>
    commandResult(await deleteBranchRemote(bodyOf(ctx))),
  );

  // Exclusao em cascata: worktree + codigo nao commitado + local + remoto.
  // Quando a branch estava presa na worktree ATIVA, a operacao muda o
  // `process.cwd()` do servidor — e ai vale o mesmo protocolo do switch:
  // reiniciar o watcher e anunciar `cwd:changed`, senao a UI continua olhando
  // para um diretorio que nao existe mais.
  router.add("POST", "/branch/delete-all", async (ctx) => {
    const result = await deleteBranchAll(bodyOf(ctx));
    if (result.cwdChanged) {
      const payload = await getWorktreesPayload(process.cwd());
      const ativa = payload.worktrees.find((wt) => wt.isActive) ?? null;
      await deps.onCwdChanged?.(ativa, payload);
    }
    return commandResult(result);
  });

  router.add("POST", "/branch/rename", async (ctx) =>
    commandResult(await renameBranch(bodyOf(ctx))),
  );

  router.add("POST", "/checkout", async (ctx) => commandResult(await checkout(bodyOf(ctx))));

  router.add("POST", "/tag/create", async (ctx) => commandResult(await createTag(bodyOf(ctx))));
  router.add("POST", "/tag/delete", async (ctx) => commandResult(await deleteTag(bodyOf(ctx))));
}
