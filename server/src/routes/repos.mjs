/**
 * Seletor de repositorios da maquina.
 *
 * `POST /repos/open` e irma de `POST /worktrees/switch`: as duas trocam o
 * `process.cwd()` do servidor e disparam `cwd:changed`, e nenhuma das duas
 * executa `git checkout`. A diferenca esta em quem autoriza o caminho — a de
 * worktree confere contra `git worktree list`, esta exige que o diretorio seja
 * um repositorio git de verdade. Ver a nota de seguranca em `git/discover.mjs`.
 */
import {
  forgetRepo,
  getRecentRepos,
  initRepository,
  listDirectory,
  listRoots,
  openRepository,
  scanForRepos,
} from "../git/discover.mjs";
import { getRepoPayload } from "./repo.mjs";
import { bodyOf, commandResult, intParam } from "./_util.mjs";

/**
 * @param {import("../router.mjs").Router} router
 * @param {{onCwdChanged?: (worktree: object, payload: object) => void}} deps
 */
export function registerRepoPickerRoutes(router, deps = {}) {
  /* --- navegacao --- */

  router.add("GET", "/fs/roots", () => listRoots());

  router.add("GET", "/fs/list", (ctx) => listDirectory(ctx.query.path));

  /* --- recentes --- */

  router.add("GET", "/repos/recent", () => getRecentRepos());

  router.add("POST", "/repos/recent/remove", async (ctx) => forgetRepo(bodyOf(ctx).path));

  /* --- varredura --- */

  router.add("POST", "/repos/scan", (ctx) => {
    const body = bodyOf(ctx);
    return scanForRepos({
      roots: Array.isArray(body.roots) ? body.roots : undefined,
      depth: intParam(body.depth),
      limit: intParam(body.limit),
      budgetMs: intParam(body.budgetMs),
    });
  });

  /* --- abertura --- */

  router.add("POST", "/repos/open", async (ctx) => {
    const { payload, worktree } = await openRepository(bodyOf(ctx).path);
    // Mesmo caminho da troca de worktree: reinicia o watcher e avisa a UI, que
    // descarta a View Tree inteira e recarrega do novo diretorio.
    await deps.onCwdChanged?.(worktree, payload);
    return getRepoPayload();
  });

  router.add("POST", "/repos/init", async (ctx) => {
    const body = bodyOf(ctx);
    const { result, opened } = await initRepository(body.path, {
      bare: body.bare === true,
      initialBranch: typeof body.initialBranch === "string" ? body.initialBranch : undefined,
    });
    commandResult(result); // `git init` que falha vira 409 com o comando inteiro
    if (opened) await deps.onCwdChanged?.(opened.worktree, opened.payload);
    return getRepoPayload();
  });
}
