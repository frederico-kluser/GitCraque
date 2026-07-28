/**
 * Busca no historico de repositorios — `GET /api/repos/search?q=`.
 *
 * A caixa de busca do seletor filtrava apenas o que ja estava na tela da aba
 * visivel. Quem tem projeto fora das raizes padrao, ou um git interno que so
 * apareceu numa navegacao, nao tinha como chegar nele digitando o nome. Esta
 * rota le a tabela `discovered` (`db.mjs`), que acumula toda pasta git que a
 * varredura, a navegacao ou uma abertura ja avistaram.
 *
 * O que ela NAO faz: tocar no disco. E leitura de indice, nao varredura — a
 * varredura continua sendo `POST /repos/scan`, explicita e com orcamento. Por
 * isso responde em tempo de tecla.
 *
 * `exists` sai do disco mesmo assim (`detectRepoKind` e um par de `statSync`),
 * porque uma lista que oferece pasta apagada e uma lista que mente.
 */
import path from "node:path";

import { db, quieto } from "./db.mjs";
import { branchOf, detectRepoKind } from "./discover.mjs";

/** Teto de resultados. Ninguem escolhe projeto numa lista de 500 linhas. */
export const SEARCH_LIMIT = 50;

/**
 * Escapa `%`, `_` e `\` para o `LIKE`.
 *
 * Sem isto, digitar `_` casa com qualquer caractere e a busca por `meu_projeto`
 * traz `meuXprojeto` — nao e falha de seguranca (o valor vai por parametro
 * ligado, nunca concatenado), e sim resultado errado.
 */
const escaparLike = (texto) => texto.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * GET /api/repos/search?q=&limit=
 *
 * Ordem: nome que COMECA com o termo primeiro (e o que a pessoa quase sempre
 * quer), depois nome que so contem, depois o resto; dentro de cada grupo, o
 * visto mais recentemente na frente.
 *
 * @param {{q?: string, limit?: number}} options
 */
export async function searchRepos(options = {}) {
  const termo = typeof options.q === "string" ? options.q.trim() : "";
  const limite = Number.isFinite(Number(options.limit))
    ? Math.max(1, Math.min(SEARCH_LIMIT, Number(options.limit)))
    : SEARCH_LIMIT;

  const linhas =
    quieto(() => {
      const conexao = db();
      // Termo vazio: os ultimos vistos. A aba abre util antes de digitar.
      if (!termo) {
        return conexao
          .prepare("SELECT * FROM discovered ORDER BY last_seen_at DESC LIMIT ?")
          .all(limite);
      }
      const alvo = `%${escaparLike(termo.toLowerCase())}%`;
      const prefixo = `${escaparLike(termo.toLowerCase())}%`;
      return conexao
        .prepare(
          `SELECT * FROM discovered
            WHERE LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(path) LIKE ? ESCAPE '\\'
            ORDER BY
              CASE WHEN LOWER(name) LIKE ? ESCAPE '\\' THEN 0
                   WHEN LOWER(name) LIKE ? ESCAPE '\\' THEN 1
                   ELSE 2 END,
              last_seen_at DESC
            LIMIT ?`,
        )
        .all(alvo, alvo, prefixo, alvo, limite);
    }) ?? [];

  const entries = await Promise.all(
    linhas.map(async (linha) => {
      const exists = detectRepoKind(linha.path).isRepo;
      return {
        path: linha.path,
        name: linha.name || path.basename(linha.path) || linha.path,
        // Sumiu: mantem o ultimo ramo conhecido em vez de zerar a linha da UI.
        branch: exists ? await branchOf(linha.path) : (linha.branch ?? null),
        bare: linha.bare === 1,
        linkedWorktree: linha.linked_worktree === 1,
        nested: linha.nested === 1,
        parentRepo: linha.parent_repo ?? null,
        source: linha.source,
        firstSeenAt: linha.first_seen_at,
        lastSeenAt: linha.last_seen_at,
        exists,
      };
    }),
  );

  const total = quieto(() => db().prepare("SELECT COUNT(*) AS n FROM discovered").get().n) ?? 0;
  return { entries, query: termo, total, truncated: entries.length >= limite };
}
