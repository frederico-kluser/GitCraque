/**
 * Operacoes semanticas do drag-and-drop, staging/commit e stash.
 */
import {
  abortOp,
  cherryPick,
  continueOp,
  merge,
  raw,
  rebase,
  reset,
  revert,
  stashApply,
  stashDrop,
  stashPush,
} from "../git/ops.mjs";
import { squash } from "../git/squash.mjs";
import { commit, discard, stage, unstage } from "../git/status.mjs";
import { bodyOf, commandResult } from "./_util.mjs";

export function registerOpsRoutes(router) {
  router.add("POST", "/ops/cherry-pick", async (ctx) =>
    commandResult(await cherryPick(bodyOf(ctx))),
  );
  router.add("POST", "/ops/merge", async (ctx) => commandResult(await merge(bodyOf(ctx))));
  router.add("POST", "/ops/rebase", async (ctx) => commandResult(await rebase(bodyOf(ctx))));
  router.add("POST", "/ops/reset", async (ctx) => commandResult(await reset(bodyOf(ctx))));
  router.add("POST", "/ops/revert", async (ctx) => commandResult(await revert(bodyOf(ctx))));

  // O squash devolve SquashResult (GitCommandResult + plan/originalTodo/
  // rewrittenTodo). Conflito continua sendo 200 com ok:false, como nas demais.
  router.add("POST", "/ops/squash", async (ctx) => commandResult(await squash(bodyOf(ctx))));

  router.add("POST", "/ops/abort", async (ctx) => commandResult(await abortOp(bodyOf(ctx))));
  router.add("POST", "/ops/continue", async (ctx) => commandResult(await continueOp(bodyOf(ctx))));

  router.add("POST", "/stage", async (ctx) => commandResult(await stage(bodyOf(ctx))));
  router.add("POST", "/unstage", async (ctx) => commandResult(await unstage(bodyOf(ctx))));
  router.add("POST", "/discard", async (ctx) => commandResult(await discard(bodyOf(ctx))));
  router.add("POST", "/commit", async (ctx) => commandResult(await commit(bodyOf(ctx))));

  router.add("POST", "/stash/push", async (ctx) => commandResult(await stashPush(bodyOf(ctx))));
  router.add("POST", "/stash/apply", async (ctx) => commandResult(await stashApply(bodyOf(ctx))));
  router.add("POST", "/stash/drop", async (ctx) => commandResult(await stashDrop(bodyOf(ctx))));

  router.add("POST", "/raw", async (ctx) => commandResult(await raw(bodyOf(ctx))));
}
