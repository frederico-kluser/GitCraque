/**
 * Estado geral, historico, refs e working tree.
 */
import path from "node:path";

import { runtime } from "../runtime.mjs";
import { getCommitDetail, getLog } from "../git/log.mjs";
import { getRefsPayload, getHeadState } from "../git/refs.mjs";
import { getDiff, getStatus } from "../git/status.mjs";
import { getGitCommonDir, getWorktreeRoot, listWorktrees } from "../git/worktree.mjs";
import { getRemotes } from "../git/remotes.mjs";
import { boolParam, intParam } from "./_util.mjs";

export function registerRepoRoutes(router) {
  router.add("GET", "/health", () => ({ ok: true, version: runtime.version }));

  router.add("GET", "/repo", () => getRepoPayload());

  router.add("GET", "/log", (ctx) =>
    getLog({
      limit: intParam(ctx.query.limit),
      skip: intParam(ctx.query.skip),
      cwd: process.cwd(),
    }),
  );

  router.add("GET", "/commit/:hash", (ctx) => getCommitDetail(ctx.params.hash));

  router.add("GET", "/diff", (ctx) =>
    getDiff({
      hash: ctx.query.hash,
      path: ctx.query.path,
      staged: boolParam(ctx.query.staged),
      against: ctx.query.against,
    }),
  );

  router.add("GET", "/refs", () => getRefsPayload());
  router.add("GET", "/status", () => getStatus());
}

/** GET /api/repo — o retrato que a UI carrega no boot e a cada `cwd:changed`. */
export async function getRepoPayload() {
  const cwd = process.cwd();
  const [root, gitCommonDir, head, worktrees, remotes] = await Promise.all([
    getWorktreeRoot(cwd),
    getGitCommonDir(cwd),
    getHeadState(cwd),
    listWorktrees(cwd),
    getRemotes(cwd),
  ]);
  return {
    cwd,
    root,
    gitCommonDir,
    isRepo: Boolean(gitCommonDir),
    head,
    worktrees,
    remotes,
    gitVersion: runtime.gitVersion,
    name: path.basename(root || cwd),
  };
}
