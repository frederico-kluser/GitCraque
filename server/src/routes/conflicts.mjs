/**
 * Deteccao e resolucao de conflitos de merge.
 *
 * Tres rotas:
 *  - GET  /api/conflicts          — estado atual: arquivos unmerged e kind da operacao.
 *  - GET  /api/conflicts/file     — parseia arquivo com marcadores <<<<<<< em regioes.
 *  - POST /api/conflicts/resolve  — reconstrói arquivo com resolucoes e faz git add.
 *
 * POSTURA DE SEGURANCA. GET /api/conflicts/file le arquivo do disco como
 * GET /api/file (server/src/git/file.mjs): o caminho passa por resolveInsideRoot
 * com realpath. Sem essa guarda, a rota seria leitura arbitraria por HTTP.
 */
import fsp from "node:fs/promises";

import { execGit, readGit } from "../git/exec.mjs";
import { getHeadState } from "../git/refs.mjs";
import { getWorktreeRoot } from "../git/worktree.mjs";
import { resolveInsideRoot, isInside } from "../git/file.mjs";
import { HttpError } from "../router.mjs";
import { bodyOf, commandResult } from "./_util.mjs";

/**
 * @param {import("../router.mjs").Router} router
 */
export function registerConflictRoutes(router) {
  router.add("GET", "/conflicts", async () => getConflicts());
  router.add("GET", "/conflicts/file", async (ctx) => getConflictFile(ctx.query));
  router.add("POST", "/conflicts/resolve", async (ctx) =>
    commandResult(await resolveConflict(bodyOf(ctx))),
  );
}

/* ------------------------------------------------------------------ *
 * GET /api/conflicts
 * ------------------------------------------------------------------ */

/**
 * Detecta o estado de conflito do repositorio:
 *  - que tipo de operacao esta pendente (merge, rebase, cherry-pick, revert);
 *  - quais arquivos tem marcadores de conflito (unmerged).
 *
 * @returns {Promise<import("../../web/src/types/git").ConflictState>}
 */
export async function getConflicts() {
  const head = await getHeadState();
  if (!head.pending) {
    throw new HttpError(400, "error.noConflictState");
  }

  // git diff --diff-filter=U lista todos os arquivos unmerged
  const diffResult = await readGit(["diff", "--name-only", "--diff-filter=U"]);
  const conflictFiles = diffResult.ok
    ? diffResult.stdout.trim().split("\n").filter((l) => l.length > 0)
    : [];

  return {
    kind: head.pending.kind,
    step: head.pending.step,
    total: head.pending.total,
    current: head.pending.current,
    conflicts: conflictFiles,
    branch: head.branch,
  };
}

/* ------------------------------------------------------------------ *
 * GET /api/conflicts/file
 * ------------------------------------------------------------------ */

/**
 * Le um arquivo em conflito do disco e extrai as regioes delimitadas pelos
 * marcadores `<<<<<<<`, `=======`, `>>>>>>>`.
 *
 * @param {{path?: string}} query
 * @returns {Promise<import("../../web/src/types/git").ConflictFile>}
 */
export async function getConflictFile(query = {}) {
  const root = await getWorktreeRoot();
  const { relative, absolute } = resolveInsideRoot(root, query.path);

  // realpath + guarda refeita -- mesma postura de file.mjs
  let real;
  try {
    real = await fsp.realpath(absolute);
  } catch (err) {
    throw new HttpError(404, "error.fileMissing", "error.fileMissingDetail", {
      path: relative,
      code: err.code ?? err.message,
    });
  }

  if (!isInside(root, real)) {
    throw new HttpError(400, "error.pathOutsideRoot", "error.pathOutsideRootDetail", {
      path: relative,
    });
  }

  const content = await fsp.readFile(real, "utf8");

  /** @type {import("../../web/src/types/git").ConflictRegion[]} */
  const regions = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^<<<<<<</.test(line)) {
      const start = i;
      const oursLabel = line.replace(/^<<<<<<<\s*/, "").trim();
      i++;

      /** @type {string[]} */ const oursLines = [];
      /** @type {string[]} */ const baseLines = [];
      let hasBase = false;

      while (i < lines.length && !/^=======/.test(lines[i]) && !/^>>>>>>>/.test(lines[i])) {
        // diff3: ||||||| marker separa "nosso" da "base"
        if (/^\|{7}/.test(lines[i])) {
          hasBase = true;
          i++;
          while (i < lines.length && !/^=======/.test(lines[i]) && !/^>>>>>>>/.test(lines[i])) {
            baseLines.push(lines[i]);
            i++;
          }
          break;
        }
        oursLines.push(lines[i]);
        i++;
      }

      if (i >= lines.length) {
        // marcador sem fechamento — resto do arquivo e nosso
        regions.push({
          ours: oursLines.join("\n"),
          theirs: "",
          separator: null,
          end: null,
          oursLabel,
          theirsLabel: "",
          startLine: start,
          endLine: lines.length - 1,
          resolved: false,
        });
        break;
      }

      // Se paramos no |||||||, precisamos achar o =======
      if (hasBase && /^\|{7}/.test(lines[i])) {
        // ja consumiu o |||||||
      }

      // pula =======
      const separatorLine = i;
      i++;

      /** @type {string[]} */ const theirsLines = [];
      while (i < lines.length && !/^>>>>>>>/.test(lines[i])) {
        theirsLines.push(lines[i]);
        i++;
      }

      const endLine = i < lines.length ? i : lines.length - 1;
      const theirsLabel = i < lines.length ? lines[i].replace(/^>>>>>>>\s*/, "").trim() : "";

      // Se tem diff3, concatena base no ours (mostra os dois)
      const oursContent = hasBase
        ? oursLines.join("\n") + (baseLines.length ? "\n" + baseLines.join("\n") : "")
        : oursLines.join("\n");

      regions.push({
        ours: oursContent,
        theirs: theirsLines.join("\n"),
        separator: separatorLine,
        end: endLine < lines.length ? endLine : null,
        oursLabel,
        theirsLabel,
        startLine: start,
        endLine,
        resolved: false,
      });

      i++; // pula >>>>>>>
    } else {
      i++;
    }
  }

  return {
    path: relative,
    regions,
    totalRegions: regions.length,
  };
}

/* ------------------------------------------------------------------ *
 * POST /api/conflicts/resolve
 * ------------------------------------------------------------------ */

/**
 * Recebe resolucoes por regiao, reconstrói o arquivo e faz git add.
 *
 * Corpo:
 *   { path: string, resolutions: { region: number, resolution: "ours"|"theirs"|"both" }[] }
 *
 * A reconstrucao:
 *  1. Le o arquivo como esta no disco.
 *  2. Re-parseia os marcadores para saber os intervalos de linha.
 *  3. Para cada regiao com resolucao, substitui o intervalo pela escolha.
 *  4. Para "ours": fica o conteudo entre <<<<<<< e =======.
 *  5. Para "theirs": fica o conteudo entre ======= e >>>>>>>.
 *  6. Para "both": fica os dois blocos concatenados (sem os marcadores).
 *  7. Remove regioes sem resolucao (deixa vazio).
 *  8. Escreve o arquivo e roda git add.
 *
 * @param {object} body
 * @returns {Promise<import("../types.mjs").GitCommandResult>}
 */
export async function resolveConflict(body) {
  const { path: reqPath, resolutions } = body;

  if (!Array.isArray(resolutions) || resolutions.length === 0) {
    throw new HttpError(400, "error.resolutionsRequired");
  }

  const root = await getWorktreeRoot();
  const { relative, absolute } = resolveInsideRoot(root, reqPath);

  let real;
  try {
    real = await fsp.realpath(absolute);
  } catch (err) {
    throw new HttpError(404, "error.fileMissing", "error.fileMissingDetail", {
      path: relative,
      code: err.code ?? err.message,
    });
  }

  const content = await fsp.readFile(real, "utf8");
  const lines = content.split("\n");

  // Re-parseia para obter as regioes.
  // Guarda cada regiao como { startLine, sepLine, endLine }.
  /** @type {{start: number, sep: number, end: number}[]} */
  const parsedRegions = [];
  let i = 0;
  while (i < lines.length) {
    if (/^<<<<<<</.test(lines[i])) {
      const start = i;
      i++;
      // Avanca ate =======, pulando diff3 ||||||| e seu conteudo
      while (i < lines.length && !/^=======/.test(lines[i]) && !/^>>>>>>>/.test(lines[i])) {
        if (/^\|{7}/.test(lines[i])) {
          // diff3: pula o ||||||| e o bloco base ate =======
          i++;
          while (i < lines.length && !/^=======/.test(lines[i]) && !/^>>>>>>>/.test(lines[i])) i++;
          break;
        }
        i++;
      }
      const sep = i;
      i++;
      while (i < lines.length && !/^>>>>>>>/.test(lines[i])) i++;
      const end = i < lines.length ? i : lines.length - 1;
      parsedRegions.push({ start, sep, end });
      i++; // pula >>>>>>>
    } else {
      i++;
    }
  }

  // Mapa de resolucoes por indice de regiao
  /** @type {Map<number, "ours"|"theirs"|"both">} */
  const resMap = new Map();
  for (const r of resolutions) {
    if (typeof r.region !== "number" || r.region < 0 || r.region >= parsedRegions.length) {
      throw new HttpError(400, "error.invalidRegion", "error.invalidRegionDetail", {
        index: String(r.region),
        total: String(parsedRegions.length),
      });
    }
    if (!["ours", "theirs", "both"].includes(r.resolution)) {
      throw new HttpError(400, "error.invalidResolution", "error.invalidResolutionDetail", {
        resolution: String(r.resolution),
      });
    }
    resMap.set(r.region, r.resolution);
  }

  // Reconstrói: pega as linhas antes, entre e apos as regioes.
  /** @type {string[]} */
  const result = [];

  let cursor = 0;
  for (let regionIdx = 0; regionIdx < parsedRegions.length; regionIdx++) {
    const { start, sep, end } = parsedRegions[regionIdx];
    const resolution = resMap.get(regionIdx);

    // Linhas antes desta regiao
    for (let j = cursor; j < start; j++) result.push(lines[j]);

    if (resolution) {
      const oursSlice = lines.slice(start + 1, sep);
      const theirsSlice = lines.slice(sep + 1, end);

      switch (resolution) {
        case "ours":
          result.push(...oursSlice);
          break;
        case "theirs":
          result.push(...theirsSlice);
          break;
        case "both":
          result.push(...oursSlice);
          result.push(...theirsSlice);
          break;
      }
    }
    // Sem resolucao: a regiao some (deixa vazio).

    cursor = end + 1;
  }

  // Linhas depois da ultima regiao
  for (let j = cursor; j < lines.length; j++) result.push(lines[j]);

  const resolved = result.join("\n");

  // Escreve o arquivo resolvido
  await fsp.writeFile(real, resolved, "utf8");

  // git add — mutante, passa pelo lock serial
  const addResult = await execGit(["add", "--", relative], { mutating: true });

  if (!addResult.ok) return addResult;

  // Re-detectar conflitos restantes
  const remaining = await getConflicts().catch(() => ({ conflicts: [] }));

  return {
    ...addResult,
    path: relative,
    resolvedRegions: resolutions.length,
    remainingConflicts: remaining.conflicts.length,
  };
}
