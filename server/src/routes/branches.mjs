/**
 * Branches, checkout e tags.
 */
import {
  checkout,
  createBranch,
  createTag,
  deleteBranchLocal,
  deleteBranchRemote,
  deleteTag,
  renameBranch,
} from "../git/ops.mjs";
import { bodyOf, commandResult } from "./_util.mjs";

export function registerBranchRoutes(router) {
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

  router.add("POST", "/branch/rename", async (ctx) =>
    commandResult(await renameBranch(bodyOf(ctx))),
  );

  router.add("POST", "/checkout", async (ctx) => commandResult(await checkout(bodyOf(ctx))));

  router.add("POST", "/tag/create", async (ctx) => commandResult(await createTag(bodyOf(ctx))));
  router.add("POST", "/tag/delete", async (ctx) => commandResult(await deleteTag(bodyOf(ctx))));
}
