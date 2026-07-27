/**
 * Worktrees. A rota de switch e a mais sensivel do backend inteiro: ela muda o
 * `process.cwd()` de um processo que executa comandos git.
 */
import {
  addWorktree,
  getWorktreesPayload,
  pruneWorktrees,
  removeWorktree,
  switchWorktree,
} from "../git/worktree.mjs";
import { bodyOf, commandResult } from "./_util.mjs";

/**
 * @param {import("../router.mjs").Router} router
 * @param {{onCwdChanged?: (worktree: object, payload: object) => void}} deps
 */
export function registerWorktreeRoutes(router, deps = {}) {
  router.add("GET", "/worktrees", () => getWorktreesPayload());

  router.add("POST", "/worktrees/switch", async (ctx) => {
    const body = bodyOf(ctx);
    // NAO faz `git checkout`: valida contra a lista e chama process.chdir().
    const { payload, worktree } = await switchWorktree(body.path);
    await deps.onCwdChanged?.(worktree, payload);
    return payload;
  });

  router.add("POST", "/worktrees/add", async (ctx) =>
    commandResult(await addWorktree(bodyOf(ctx))),
  );

  router.add("POST", "/worktrees/remove", async (ctx) =>
    commandResult(await removeWorktree(bodyOf(ctx))),
  );

  router.add("POST", "/worktrees/prune", async () => commandResult(await pruneWorktrees()));
}
