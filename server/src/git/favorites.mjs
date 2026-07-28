/**
 * Projetos favoritos — irmaos dos recentes de `discover.mjs`, com semantica
 * DELIBERADAMENTE oposta:
 *
 *              recentes                       favoritos
 *   origem     automatica (abriu, entrou)     explicita (o usuario fixou)
 *   ordem      cronologica, o ultimo no topo  manual, so muda quando pedem
 *   teto       RECENT_LIMIT, rotativo         nenhum
 *   sumir      cai sozinho da lista           so sai quando removem
 *
 * Dai as tres consequencias que o codigo abaixo protege:
 *
 *  1. `add` repetido NAO reordena. Reordenar por causa de um clique repetido
 *     jogaria fora o arranjo que a pessoa montou na mao — que e justamente o
 *     que diferencia favorito de recente. Repetir so atualiza o rotulo.
 *  2. Favorito novo entra no FIM, pelo mesmo motivo: entrar no topo empurraria
 *     a lista inteira.
 *  3. `remove` nao valida se o caminho ainda e um repositorio. A pasta pode ter
 *     sumido — e e exatamente ai que remover mais importa.
 *
 * A gravacao atomica e a mesma dos recentes e mora em `store.mjs`; duas copias
 * dela seria a receita para uma envelhecer mais fraca que a outra.
 */
import fs from "node:fs";
import path from "node:path";

import { branchOf, detectRepoKind, expandUserPath, resolveRepoDir } from "./discover.mjs";
import { readStore, storePath, writeStore } from "./store.mjs";

/** `~/.config/gitcraque/favorites.json` (respeita XDG_CONFIG_HOME). */
export function favoritesFile() {
  return storePath("favorites.json");
}

/* ------------------------------------------------------------------ *
 * Leitura
 * ------------------------------------------------------------------ */

/**
 * Dois caminhos apontam para a mesma pasta?
 *
 * Compara o texto primeiro e so cai no `realpath` quando precisa: a UI devolve
 * o `path` que o GET mandou, entao o caminho rapido acerta quase sempre. O
 * `realpath` cobre quem digitou o caminho por um symlink.
 */
function samePath(a, b) {
  if (a === b) return true;
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return false; // pasta sumida so casa por texto — e ja tentamos isso
  }
}

/** Entrada crua do disco -> entrada saneada. Arquivo editado na mao acontece. */
function sanitize(raw, index) {
  const resolved = path.resolve(String(raw.path));
  return {
    path: resolved,
    label: typeof raw.label === "string" ? raw.label : "",
    name:
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name
        : path.basename(resolved) || resolved,
    branch: typeof raw.branch === "string" ? raw.branch : null,
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index,
    addedAt: Number.isFinite(Number(raw.addedAt)) ? Number(raw.addedAt) : 0,
  };
}

/** A lista persistida, saneada, sem duplicata e ja na ordem manual. */
async function readFavorites() {
  const cru = await readStore(favoritesFile());
  const saneadas = cru
    .filter((e) => e && typeof e.path === "string" && e.path.trim())
    .map(sanitize)
    .sort((a, b) => a.order - b.order || a.addedAt - b.addedAt);

  // Dedup defensivo: o arquivo pode ter sido editado na mao.
  const vistos = new Set();
  const entries = [];
  for (const entry of saneadas) {
    if (vistos.has(entry.path)) continue;
    vistos.add(entry.path);
    entries.push(entry);
  }
  // `order` denso a partir daqui: reordenar depois vira so trocar de posicao.
  return entries.map((entry, i) => ({ ...entry, order: i }));
}

/**
 * GET /api/repos/favorites — `exists` e `branch` recalculados a cada leitura,
 * porque a pasta pode ter sido movida, apagada ou trocado de ramo desde a
 * ultima vez que alguem olhou.
 *
 * @returns {Promise<import("../types.mjs").FavoritesPayload>}
 */
export async function getFavorites() {
  const entries = await readFavorites();
  const enriquecidos = await Promise.all(
    entries.map(async (entry) => {
      const exists = detectRepoKind(entry.path).isRepo;
      // Sumiu: mantem o ultimo ramo conhecido em vez de zerar a linha da UI.
      if (!exists) return { ...entry, exists: false, branch: entry.branch ?? null };
      return { ...entry, exists: true, branch: await branchOf(entry.path) };
    }),
  );
  return { entries: enriquecidos, file: favoritesFile() };
}

/** Grava com `order` denso na ordem do array e devolve o payload ja fresco. */
async function persist(entries) {
  await writeStore(
    favoritesFile(),
    entries.map((entry, i) => ({
      path: entry.path,
      label: entry.label,
      name: entry.name,
      branch: entry.branch,
      order: i,
      addedAt: entry.addedAt,
    })),
  );
  return getFavorites();
}

/* ------------------------------------------------------------------ *
 * Mutacoes
 * ------------------------------------------------------------------ */

/**
 * POST /api/repos/favorites/add
 *
 * A guarda e a MESMA de `openRepository` (`resolveRepoDir`): so vira favorito o
 * que o git reconhece como repositorio. Fixar `/etc` seria fixar um atalho para
 * mandar o servidor para la depois.
 *
 * @param {{path?: string, label?: string}} body
 */
export async function addFavorite(body = {}) {
  if (body.label !== undefined && typeof body.label !== "string") {
    const error = new Error("label tem de ser texto");
    error.status = 400;
    throw error;
  }
  const rotulo = typeof body.label === "string" ? body.label.trim() : "";

  // Guarda a raiz da worktree, nao a subpasta digitada: senao o mesmo repo
  // entraria duas vezes por dois caminhos diferentes.
  const { root } = await resolveRepoDir(body.path);

  const entries = await readFavorites();
  const existente = entries.find((entry) => samePath(entry.path, root));
  if (existente) {
    // Ja e favorito: NAO reordena (ver o cabecalho). So atualiza o que envelhece.
    if (rotulo) existente.label = rotulo;
    existente.name = path.basename(root) || root;
    existente.branch = await branchOf(root);
    return persist(entries);
  }

  entries.push({
    path: root,
    label: rotulo,
    name: path.basename(root) || root,
    branch: await branchOf(root),
    order: entries.length,
    addedAt: Date.now(),
  });
  return persist(entries);
}

/**
 * POST /api/repos/favorites/remove — sem validar repositorio de proposito: a
 * pasta pode ter sumido, e e ai que remover mais importa.
 * @param {string} target
 */
export async function removeFavorite(target) {
  if (typeof target !== "string" || !target.trim()) {
    const error = new Error("path e obrigatorio");
    error.status = 400;
    throw error;
  }
  const alvo = expandUserPath(target);
  const entries = await readFavorites();
  return persist(entries.filter((entry) => !samePath(entry.path, alvo)));
}

/**
 * POST /api/repos/favorites/reorder — reescreve `order` na ordem recebida.
 *
 * Tolerante nas duas pontas, porque a lista do cliente pode estar velha:
 * caminho desconhecido e ignorado, e favorito que a lista nao citou mantem a
 * ordem relativa que tinha, no fim. Nada some por causa de um reorder.
 *
 * @param {string[]} paths
 */
export async function reorderFavorites(paths) {
  if (!Array.isArray(paths) || paths.some((p) => typeof p !== "string")) {
    const error = new Error("paths e obrigatorio e so aceita strings");
    error.status = 400;
    throw error;
  }

  const restantes = await readFavorites();
  const ordenados = [];
  for (const alvo of paths) {
    if (!alvo.trim()) continue;
    const resolvido = expandUserPath(alvo);
    const i = restantes.findIndex((entry) => samePath(entry.path, resolvido));
    if (i === -1) continue; // caminho desconhecido: ignorado, nao e erro
    ordenados.push(restantes.splice(i, 1)[0]);
  }
  ordenados.push(...restantes); // os ausentes mantem a ordem relativa, no fim
  return persist(ordenados);
}
