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
 * A persistencia mora em `db.mjs` (tabela `favorites`), compartilhada com os
 * recentes e com o historico de descobertas. Ao contrario dos recentes, a
 * escrita aqui PROPAGA erro: fixar um projeto e a operacao que a pessoa pediu,
 * entao a UI precisa saber quando ela falha, senao mostra como salvo o que nao
 * foi.
 */
import fs from "node:fs";
import path from "node:path";

import { db, dbFile } from "./db.mjs";
import { branchOf, detectRepoKind, expandUserPath, resolveRepoDir } from "./discover.mjs";

/** Onde os favoritos moram hoje: `~/.config/gitcraque/gitcraque.db`. */
export function favoritesFile() {
  return dbFile();
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

/** A linha crua do banco -> entrada da API. `order` sai denso da leitura. */
const daLinha = (linha, i) => ({
  path: linha.path,
  label: linha.label ?? "",
  name: linha.name || path.basename(linha.path) || linha.path,
  branch: linha.branch ?? null,
  order: i,
  addedAt: linha.added_at,
});

/** A lista persistida, na ordem manual. */
function readFavorites() {
  return db()
    .prepare("SELECT * FROM favorites ORDER BY position ASC, added_at ASC")
    .all()
    .map(daLinha);
}

/**
 * O caminho GRAVADO que corresponde ao alvo pedido, ou null.
 *
 * A chave primaria ja garante que nao ha duplicata por texto, mas nao enxerga
 * symlink: `~/atalho` e `~/code/projeto` sao chaves diferentes para a mesma
 * pasta. Por isso a busca exata vem primeiro (o caso normal, indexado) e o
 * `realpath` so entra quando ela falha.
 * @param {string} alvo ja expandido
 */
function encontrarPath(alvo) {
  const exato = db().prepare("SELECT path FROM favorites WHERE path = ?").get(alvo);
  if (exato) return exato.path;
  for (const linha of db().prepare("SELECT path FROM favorites").all()) {
    if (samePath(linha.path, alvo)) return linha.path;
  }
  return null;
}

/**
 * GET /api/repos/favorites — `exists` e `branch` recalculados a cada leitura,
 * porque a pasta pode ter sido movida, apagada ou trocado de ramo desde a
 * ultima vez que alguem olhou.
 *
 * @returns {Promise<import("../types.mjs").FavoritesPayload>}
 */
export async function getFavorites() {
  const entries = readFavorites();
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

/**
 * Toda escrita de favorito passa por aqui. Uma falha de banco vira 500 com a
 * causa no `detail` — e a operacao que a pessoa pediu, nao um efeito colateral.
 * @template T
 * @param {() => T} fn
 */
function gravando(fn) {
  try {
    return fn();
  } catch (err) {
    const error = new Error("error.favoritesWriteFailed");
    error.status = 500;
    error.detail = `${dbFile()}: ${err.code ?? err.message}`;
    throw error;
  }
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
    const error = new Error("error.labelText");
    error.status = 400;
    throw error;
  }
  const rotulo = typeof body.label === "string" ? body.label.trim() : "";

  // Guarda a raiz da worktree, nao a subpasta digitada: senao o mesmo repo
  // entraria duas vezes por dois caminhos diferentes.
  const { root } = await resolveRepoDir(body.path);
  const nome = path.basename(root) || root;
  const ramo = await branchOf(root);

  gravando(() => {
    const existente = encontrarPath(root);
    if (existente) {
      // Ja e favorito: NAO reordena (ver o cabecalho). So atualiza o que
      // envelhece, e o rotulo apenas quando veio um novo.
      db()
        .prepare(
          `UPDATE favorites
              SET name = ?, branch = ?, label = CASE WHEN ? <> '' THEN ? ELSE label END
            WHERE path = ?`,
        )
        .run(nome, ramo, rotulo, rotulo, existente);
      return;
    }
    const fim = db().prepare("SELECT COALESCE(MAX(position), -1) AS m FROM favorites").get().m;
    db()
      .prepare(
        `INSERT INTO favorites (path, label, name, branch, position, added_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(root, rotulo, nome, ramo, fim + 1, Date.now());
  });

  return getFavorites();
}

/**
 * POST /api/repos/favorites/remove — sem validar repositorio de proposito: a
 * pasta pode ter sumido, e e ai que remover mais importa.
 * @param {string} target
 */
export async function removeFavorite(target) {
  if (typeof target !== "string" || !target.trim()) {
    const error = new Error("error.pathRequired");
    error.status = 400;
    throw error;
  }
  const alvo = expandUserPath(target);
  gravando(() => {
    const gravado = encontrarPath(alvo);
    if (gravado) db().prepare("DELETE FROM favorites WHERE path = ?").run(gravado);
  });
  return getFavorites();
}

/**
 * POST /api/repos/favorites/reorder — reescreve `position` na ordem recebida.
 *
 * Tolerante nas duas pontas, porque a lista do cliente pode estar velha:
 * caminho desconhecido e ignorado, e favorito que a lista nao citou mantem a
 * ordem relativa que tinha, no fim. Nada some por causa de um reorder.
 *
 * @param {string[]} paths
 */
export async function reorderFavorites(paths) {
  if (!Array.isArray(paths) || paths.some((p) => typeof p !== "string")) {
    const error = new Error("error.pathsRequired");
    error.status = 400;
    throw error;
  }

  gravando(() => {
    const restantes = readFavorites().map((f) => f.path);
    const ordenados = [];
    for (const alvo of paths) {
      if (!alvo.trim()) continue;
      const resolvido = expandUserPath(alvo);
      const i = restantes.findIndex((p) => samePath(p, resolvido));
      if (i === -1) continue; // caminho desconhecido: ignorado, nao e erro
      ordenados.push(restantes.splice(i, 1)[0]);
    }
    ordenados.push(...restantes); // os ausentes mantem a ordem relativa, no fim

    // Numa transacao so: um reorder pela metade deixaria duas linhas com a
    // mesma posicao, e a lista mudaria de ordem sozinha na proxima leitura.
    const conexao = db();
    const mover = conexao.prepare("UPDATE favorites SET position = ? WHERE path = ?");
    conexao.exec("BEGIN");
    try {
      ordenados.forEach((p, i) => mover.run(i, p));
      conexao.exec("COMMIT");
    } catch (err) {
      conexao.exec("ROLLBACK");
      throw err;
    }
  });

  return getFavorites();
}
