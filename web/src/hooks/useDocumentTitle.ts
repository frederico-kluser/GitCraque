/**
 * O titulo da aba diz ONDE voce esta: `repo/ramo - GC`.
 *
 * Com varias janelas abertas em varias worktrees, "GitCraque" chumbado no
 * `index.html` nao distinguia uma da outra — a barra de abas do navegador
 * mostrava quatro vezes a mesma palavra. Aqui ela passa a carregar o dado que
 * a toolbar ja mostra: o nome da worktree ativa e o ramo em que ela esta.
 *
 * `repo.name` e `path.basename(root)` no servidor (`server/src/routes/repo.mjs`),
 * ou seja o nome da WORKTREE, nao o do repositorio comum. E isso mesmo que se
 * quer: trocar de worktree e `process.chdir()`, o payload recarrega e o titulo
 * acompanha sozinho.
 *
 * Nada aqui vira chave de catalogo: nome de repo, ramo e hash sao DADO, e `- GC`
 * e a marca — nao se traduz, do mesmo jeito que o "GitCraque" de `Toolbar.tsx`.
 */
import { useEffect } from "react";
import { useAppState } from "@/state/store";
import { short } from "@/lib/utils";

/** Sufixo da marca. So acompanha o titulo quando ha ramo (ou hash) para mostrar. */
const SUFFIX = " - GC";

/** Titulo de repouso: sem repositorio aberto, a aba volta a ser so o produto. */
const APP_NAME = "GitCraque";

/**
 * Monta o titulo a partir do retrato do repositorio.
 *
 * Exportada para poder ser lida de uma vez, sem montar React: a regra das bordas
 * (detached, repo vazio, sem repositorio) e o que tem substancia aqui.
 */
export function buildDocumentTitle(repo: {
  isRepo: boolean;
  name: string | null;
  branch: string | null;
  detached: boolean;
  hash: string | null;
}): string {
  if (!repo.isRepo || !repo.name) return APP_NAME;
  // Detached HEAD nao tem ramo, mas tem posicao — e a posicao e o que importa.
  if (repo.detached && repo.hash) return `${repo.name}/${short(repo.hash)}${SUFFIX}`;
  if (repo.branch) return `${repo.name}/${repo.branch}${SUFFIX}`;
  // Repo vazio ou bare: sem ramo nao ha par para separar, entao fica so o nome.
  return repo.name;
}

/** Efeito unico do shell: mantem `document.title` colado no estado do repo. */
export function useDocumentTitle(): void {
  // Um seletor por campo, e todos PRIMITIVOS: o comparador do store e
  // `Object.is`, entao devolver um objeto montado aqui re-renderizaria sempre.
  const isRepo = useAppState((s) => s.repo?.isRepo ?? false);
  const name = useAppState((s) => s.repo?.name ?? null);
  const branch = useAppState((s) => s.repo?.head.branch ?? null);
  const detached = useAppState((s) => s.repo?.head.detached ?? false);
  const hash = useAppState((s) => s.repo?.head.hash ?? null);

  useEffect(() => {
    document.title = buildDocumentTitle({ isRepo, name, branch, detached, hash });
  }, [isRepo, name, branch, detached, hash]);
}
