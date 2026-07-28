/**
 * Seletor de repositorios da maquina, projetos favoritos e leitura de arquivo.
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
import { addFavorite, getFavorites, removeFavorite, reorderFavorites } from "../git/favorites.mjs";
import { getFileContent } from "../git/file.mjs";
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

  /* --- favoritos ---
   * Irmaos dos recentes acima, com semantica oposta: recente e historico
   * automatico e rotativo; favorito e escolha explicita, permanente, sem teto e
   * com ordem manual. As tres mutacoes devolvem o payload inteiro para a UI
   * nunca precisar remontar a lista na mao. */

  router.add("GET", "/repos/favorites", () => getFavorites());

  router.add("POST", "/repos/favorites/add", (ctx) => {
    const body = bodyOf(ctx);
    return addFavorite({ path: body.path, label: body.label });
  });

  router.add("POST", "/repos/favorites/remove", (ctx) => removeFavorite(bodyOf(ctx).path));

  router.add("POST", "/repos/favorites/reorder", (ctx) => reorderFavorites(bodyOf(ctx).paths));

  /* --- conteudo de arquivo ---
   * `hash` ausente = working tree. A guarda contra caminho que escapa da raiz
   * do repositorio esta em `git/file.mjs` e nao e opcional: sem ela esta rota
   * vira leitura arbitraria da maquina por HTTP. */

  router.add("GET", "/file", (ctx) =>
    getFileContent({ path: ctx.query.path, hash: ctx.query.hash }),
  );

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
