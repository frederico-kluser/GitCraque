/**
 * Working tree, staging e diffs.
 *
 * O status sai de `git status --porcelain=v2 --branch -z --untracked-files=all`.
 * O `-z` nao e detalhe: sem ele o git cita e escapa nomes de arquivo com espaco,
 * acento ou aspas, e o parser vira um inferno de unquoting. Com `-z` os campos
 * vem crus, separados por NUL.
 */
import { execGit, isNotARepoError, readGit, withMutationLock } from "./exec.mjs";
import { statusFromLetter } from "./log.mjs";

/**
 * Parser puro do porcelain v2 com -z.
 *
 * Formato das linhas:
 *   # branch.oid <sha> | # branch.head <nome> | # branch.upstream <nome> | # branch.ab +N -M
 *   1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
 *   2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <Xscore> <path> NUL <origPath>
 *   u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
 *   ? <path>
 *   ! <path>
 *
 * @param {string} stdout
 * @returns {import("../types.mjs").StatusPayload}
 */
export function parseStatusV2(stdout) {
  const tokens = stdout.split("\0");
  /** @type {import("../types.mjs").StatusEntry[]} */
  const entries = [];
  let branch = null;
  let upstream;
  let ahead = 0;
  let behind = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) continue;

    if (token.startsWith("# ")) {
      const header = token.slice(2);
      if (header.startsWith("branch.head ")) {
        const value = header.slice("branch.head ".length).trim();
        branch = value === "(detached)" ? null : value;
      } else if (header.startsWith("branch.upstream ")) {
        upstream = header.slice("branch.upstream ".length).trim();
      } else if (header.startsWith("branch.ab ")) {
        const value = header.slice("branch.ab ".length).trim();
        const match = /^\+(-?\d+)\s+-(-?\d+)$/.exec(value);
        if (match) {
          ahead = Number.parseInt(match[1], 10) || 0;
          behind = Number.parseInt(match[2], 10) || 0;
        }
      }
      continue;
    }

    const kind = token[0];

    if (kind === "1") {
      const fields = token.split(" ");
      const code = fields[1] ?? "..";
      const path = fields.slice(8).join(" ");
      entries.push(entryFromCode(code, path));
      continue;
    }

    if (kind === "2") {
      const fields = token.split(" ");
      const code = fields[1] ?? "..";
      const path = fields.slice(9).join(" ");
      // Em -z, o caminho de origem da rename vem no PROXIMO token.
      const oldPath = tokens[i + 1] ?? "";
      i += 1;
      entries.push({ ...entryFromCode(code, path), oldPath });
      continue;
    }

    if (kind === "u") {
      const fields = token.split(" ");
      const code = fields[1] ?? "UU";
      const path = fields.slice(10).join(" ");
      entries.push({
        path,
        code,
        indexStatus: "unmerged",
        worktreeStatus: "unmerged",
        staged: false,
        unstaged: true,
        untracked: false,
        conflicted: true,
      });
      continue;
    }

    if (kind === "?") {
      const path = token.slice(2);
      entries.push({
        path,
        code: "??",
        indexStatus: null,
        worktreeStatus: "untracked",
        staged: false,
        unstaged: true,
        untracked: true,
        conflicted: false,
      });
      continue;
    }

    // "!" (ignorado) nao entra no payload: a UI nao lista ignorados.
  }

  return {
    branch,
    ...(upstream ? { upstream } : {}),
    ahead,
    behind,
    entries,
    clean: entries.length === 0,
    cwd: process.cwd(),
  };
}

/** XY do porcelain v2 -> StatusEntry. `.` significa "sem mudanca daquele lado". */
function entryFromCode(code, path) {
  const x = code[0] ?? ".";
  const y = code[1] ?? ".";
  const indexStatus = x === "." ? null : statusFromLetter(x);
  const worktreeStatus = y === "." ? null : statusFromLetter(y);
  return {
    path,
    code,
    indexStatus,
    worktreeStatus,
    staged: x !== ".",
    unstaged: y !== ".",
    untracked: false,
    conflicted: x === "U" || y === "U",
  };
}

/** GET /api/status */
export async function getStatus(cwd = process.cwd()) {
  const result = await readGit(
    ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"],
    { cwd },
  );
  if (!result.ok) {
    // Fora de um repositorio, "sem alteracoes" e a resposta honesta — nao 500.
    // A interface esta mostrando o seletor de repositorios nessa hora.
    if (isNotARepoError(result.stderr)) {
      return { branch: null, ahead: 0, behind: 0, entries: [], clean: true, cwd };
    }
    const error = new Error(result.error || "git status falhou");
    error.command = result;
    throw error;
  }
  return { ...parseStatusV2(result.stdout), cwd };
}

/* ------------------------------------------------------------------ *
 * Diff
 * ------------------------------------------------------------------ */

/**
 * Parser de patch unificado -> DiffPayload[] (um por arquivo).
 *
 * A numeracao de linha e o ponto delicado: o contador do lado velho anda em
 * contexto e remocao, o do lado novo anda em contexto e adicao.
 *
 * @param {string} patch
 * @returns {import("../types.mjs").DiffPayload[]}
 */
export function parseUnifiedDiff(patch) {
  /** @type {import("../types.mjs").DiffPayload[]} */
  const files = [];
  if (!patch) return files;

  const lines = patch.split("\n");
  /** @type {import("../types.mjs").DiffPayload | null} */ let file = null;
  /** @type {string[]} */ let rawLines = [];
  /** @type {import("../types.mjs").DiffHunk | null} */ let hunk = null;
  let oldNumber = 0;
  let newNumber = 0;

  const closeFile = () => {
    if (file) {
      file.raw = rawLines.join("\n");
      files.push(file);
    }
    file = null;
    hunk = null;
    rawLines = [];
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      closeFile();
      const { a, b } = parseDiffGitHeader(line);
      file = { path: b || a, binary: false, hunks: [], raw: "" };
      if (a && b && a !== b) file.oldPath = a;
      rawLines = [line];
      continue;
    }
    if (!file) continue;
    rawLines.push(line);

    if (line.startsWith("rename from ")) {
      file.oldPath = line.slice("rename from ".length);
      continue;
    }
    if (line.startsWith("rename to ")) {
      file.path = line.slice("rename to ".length);
      continue;
    }
    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      file.binary = true;
      continue;
    }
    if (line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("index ")) {
      continue;
    }

    if (line.startsWith("@@")) {
      const parsed = parseHunkHeader(line);
      if (!parsed) continue;
      hunk = {
        header: line,
        oldStart: parsed.oldStart,
        oldLines: parsed.oldLines,
        newStart: parsed.newStart,
        newLines: parsed.newLines,
        lines: [],
      };
      file.hunks.push(hunk);
      oldNumber = parsed.oldStart;
      newNumber = parsed.newStart;
      continue;
    }

    if (!hunk) continue;

    const marker = line[0];
    if (marker === "+") {
      hunk.lines.push({ kind: "add", content: line.slice(1), oldNumber: null, newNumber });
      newNumber += 1;
    } else if (marker === "-") {
      hunk.lines.push({ kind: "del", content: line.slice(1), oldNumber, newNumber: null });
      oldNumber += 1;
    } else if (marker === " ") {
      hunk.lines.push({ kind: "context", content: line.slice(1), oldNumber, newNumber });
      oldNumber += 1;
      newNumber += 1;
    } else if (marker === "\\") {
      // "\ No newline at end of file" — nao consome numero de linha nenhum.
      hunk.lines.push({ kind: "meta", content: line.slice(2), oldNumber: null, newNumber: null });
    }
  }
  closeFile();
  return files;
}

/**
 * Parser do patch emitido por `git diff --word-diff=porcelain`.
 *
 * O formato porcelain NAO e o `[-...-]`/`{+...+}` do plain: o git emite os
 * pedacos de palavra em linhas com marcador ` ` (contexto), `+` (adicionado)
 * ou `-` (removido), e uma linha `~` DEPOIS de cada pedaco que terminava a
 * linha de origem (vem do `diff.c` v2.43: o "newline" do chunk e `~\n`).
 * Linhas de contexto inteiras saem como ` texto` + `~`. O marcador
 * `\ No newline at end of file` e engolido pelo proprio git (nunca chega).
 *
 * Reconstrucao de linhas logicas: um pedaco SEM `~` em seguida continua a
 * linha corrente do lado (removido/adicionado); um `~` fecha a linha corrente
 * dos DOIS lados (contexto alimenta os dois; `+` so o adicionado; `-` so o
 * removido). Linha so-add nao cria linha no lado removido nem so-del no
 * adicionado; `~` sem pedaco anterior e um chunk que era so "\n" — uma linha
 * vazia nos dois lados. Depois, linhas so de contexto que empatam por indice
 * viram UMA linha de contexto com os dois numeros; o resto sai como del/add
 * do lado correspondente. A numeracao segue os cabecalhos @@ do proprio git,
 * entao os dois lados ficam consistentes.
 *
 * @param {string} patch
 * @returns {import("../types.mjs").DiffPayload[]}
 */
export function parseWordDiffPorcelain(patch) {
  /** @type {import("../types.mjs").DiffPayload[]} */
  const files = [];
  if (!patch) return files;

  const lines = patch.split("\n");
  /** @type {import("../types.mjs").DiffPayload | null} */ let file = null;
  /** @type {string[]} */ let rawLines = [];
  /** @type {import("../types.mjs").DiffHunk | null} */ let hunk = null;
  /** @type {{lines: Array, current: {segments: Array, text: string}}} */ let removedSide = null;
  /** @type {{lines: Array, current: {segments: Array, text: string}}} */ let addedSide = null;
  /** @type {null | " " | "+" | "-"} */ let lastMarker = null;

  const makeSide = () => ({ lines: [], current: { segments: [], text: "" } });

  const applyPiece = (side, kind, text) => {
    side.current.segments.push({ kind, text });
    side.current.text += text;
  };

  /** Fecha a linha corrente. `pushEmpty` registra mesmo a vazia (chunk "\n"). */
  const finalizeSide = (side, pushEmpty) => {
    if (side.current.segments.length > 0 || pushEmpty) {
      side.lines.push(side.current);
      side.current = { segments: [], text: "" };
    }
  };

  /** Um `~` fecha a linha corrente dos DOIS lados: cada lado acumula, desde
   * o `~` anterior, os pedacos que lhe pertencem (removido: contexto+del;
   * adicionado: contexto+add) e o `~` delimita a linha logica do par. Fechar
   * so o lado do ultimo pedaco deixava a linha do OUTRO lado aberta — uma
   * linha so-add antes de uma del fundia linhas removidas que nao existem.
   * `pushEmpty` registra a vazia (chunk que era so "\n"). */
  const finalizeSides = (pushEmpty) => {
    finalizeSide(removedSide, pushEmpty);
    finalizeSide(addedSide, pushEmpty);
  };

  /** Junta os dois lados num DiffLine[] numerado e fecha o hunk atual. */
  const flushHunk = () => {
    if (!hunk || !removedSide || !addedSide) return;
    // Seguranca: o ultimo `~` ja fechou as linhas dos dois lados; so resta
    // algo aberto se o hunk terminar no meio de um pedaco (nunca visto).
    finalizeSide(removedSide, false);
    finalizeSide(addedSide, false);
    hunk.lines = mergePorcelainSides(removedSide.lines, addedSide.lines, hunk.oldStart, hunk.newStart);
    // Os lados crus ficam no hunk para o merge hibrido com o patch classico
    // (`mergeWordDiff`) — o conteudo removido reconstruido de chunks de
    // contexto duplica espacos (os chunks de contexto vem do buffer do lado
    // NOVO), entao a estrutura e o conteudo exatos saem do patch classico.
    hunk.removedLines = removedSide.lines;
    hunk.addedLines = addedSide.lines;
    hunk = null;
    removedSide = null;
    addedSide = null;
    lastMarker = null;
  };

  const closeFile = () => {
    if (file) {
      flushHunk();
      file.raw = rawLines.join("\n");
      files.push(file);
    }
    file = null;
    rawLines = [];
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      closeFile();
      const { a, b } = parseDiffGitHeader(line);
      file = { path: b || a, binary: false, hunks: [], raw: "" };
      if (a && b && a !== b) file.oldPath = a;
      rawLines = [line];
      continue;
    }
    if (!file) continue;
    rawLines.push(line);

    if (line.startsWith("rename from ")) {
      file.oldPath = line.slice("rename from ".length);
      continue;
    }
    if (line.startsWith("rename to ")) {
      file.path = line.slice("rename to ".length);
      continue;
    }
    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      file.binary = true;
      continue;
    }
    if (line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("index ")) {
      continue;
    }

    if (line.startsWith("@@")) {
      const parsed = parseHunkHeader(line);
      if (!parsed) continue;
      flushHunk();
      hunk = {
        header: line,
        oldStart: parsed.oldStart,
        oldLines: parsed.oldLines,
        newStart: parsed.newStart,
        newLines: parsed.newLines,
        lines: [],
      };
      file.hunks.push(hunk);
      removedSide = makeSide();
      addedSide = makeSide();
      continue;
    }
    if (!hunk) continue;

    if (line === "~") {
      // Sem pedaco anterior: chunk que era so "\n" — linha vazia nos dois lados.
      finalizeSides(lastMarker === null);
      lastMarker = null;
      continue;
    }

    const marker = line[0];
    if (marker !== " " && marker !== "+" && marker !== "-") continue;
    const text = line.slice(1);
    if (text === "") continue;
    lastMarker = marker;
    if (marker === "-") applyPiece(removedSide, "del", text);
    else if (marker === "+") applyPiece(addedSide, "add", text);
    else {
      applyPiece(removedSide, "context", text);
      applyPiece(addedSide, "context", text);
    }
  }
  closeFile();
  return files;
}

/**
 * Reconstroi o DiffLine[] de um hunk porcelain a partir dos dois lados.
 *
 * Linhas so de contexto empatam por INDICE (os dois lados nascem da MESMA
 * sequencia de chunks de contexto, e o xdiff de palavras preserva ordem):
 * a k-esima linha so-contexto do lado removido casa com a k-esima do lado
 * adicionado e vira uma linha "context" com os dois numeros. O que sobra do
 * lado removido sai como "del"; o que sobra do adicionado, como "add".
 *
 * `words` so e preenchido quando a linha tem segmento de adicao/remocao —
 * contexto puro nao precisa de highlight. As linhas sem `words` seguem o
 * caminho classico de render.
 */
function mergePorcelainSides(removedLines, addedLines, oldStart, newStart) {
  const hasChange = (line) => line.segments.some((s) => s.kind !== "context");
  const removedCtxCount = removedLines.filter((l) => !hasChange(l)).length;
  const addedCtxCount = addedLines.filter((l) => !hasChange(l)).length;
  const pairCount = Math.min(removedCtxCount, addedCtxCount);

  /** @type {import("../types.mjs").DiffLine[]} */
  const out = [];
  let oldNumber = oldStart;
  let newNumber = newStart;
  let removedCtxSeen = 0;
  let addedCtxSeen = 0;

  const wordsOf = (line) => {
    if (!hasChange(line)) return undefined;
    return line.segments;
  };

  // Primeiro o lado removido, na ordem do arquivo antigo.
  for (const line of removedLines) {
    if (!hasChange(line) && removedCtxSeen < pairCount) {
      const pairIndex = removedCtxSeen;
      removedCtxSeen += 1;
      out.push({ kind: "context", content: line.text, oldNumber, newNumber: null, pairIndex });
    } else {
      out.push({ kind: "del", content: line.text, oldNumber, newNumber: null, words: wordsOf(line) });
    }
    oldNumber += 1;
  }
  // Depois o adicionado; a linha de contexto empatada ja saiu — so completa o numero novo.
  for (const line of addedLines) {
    if (!hasChange(line) && addedCtxSeen < pairCount) {
      const pairIndex = addedCtxSeen;
      addedCtxSeen += 1;
      const pending = out.find((l) => l.kind === "context" && l.pairIndex === pairIndex);
      if (pending) {
        pending.newNumber = newNumber;
      } else {
        out.push({ kind: "add", content: line.text, oldNumber: null, newNumber, words: wordsOf(line) });
      }
    } else {
      out.push({ kind: "add", content: line.text, oldNumber: null, newNumber, words: wordsOf(line) });
    }
    newNumber += 1;
  }
  // `pairIndex` e estado interno do merge, nao viaja no payload.
  for (const line of out) delete line.pairIndex;
  return out;
}

/**
 * Casa o patch classico (estrutura, numeros e conteudo EXATOS) com o
 * porcelain (palavras do git). Vencedora e a estrutura classica; as palavras
 * sao atribuidas POR ESTRUTURA de linhas: a k-esima linha del do classico
 * recebe os pedacos del da k-esima linha mudada do lado removido do
 * porcelain (a k-esima add, da k-esima linha mudada do lado adicionado).
 * Quando as contagens divergem — o xdiff de palavras funde N linhas antigas
 * e M novas numa regiao so (uma linha so-add antes de uma del deixa o lado
 * removido sem `~` de fechamento, e o porcelain nao reconstroi a fronteira)
 * — a atribuicao cai no CONTEUDO: cada pedaco vai para a primeira linha
 * classica que o contem, respeitando a ordem; pedaco sem dono e descartado
 * (highlight perdido e melhor que palavra renderizada na linha errada).
 *
 * Os segmentos de contexto sao reconstruidos do proprio content classico:
 * os chunks de contexto do porcelain vem do buffer do lado NOVO, entao
 * reproduzir o texto removido por eles duplica espacos entre palavras —
 * visivel e errado. So os pedacos del/add viajam; o resto da linha e o
 * conteudo classico, byte a byte.
 *
 * @param {import("../types.mjs").DiffPayload[]} plainFiles
 * @param {import("../types.mjs").DiffPayload[]} wordFiles
 * @returns {import("../types.mjs").DiffPayload[]} plainFiles com `words`
 */
export function mergeWordDiff(plainFiles, wordFiles) {
  if (!wordFiles?.length) return plainFiles;
  plainFiles.forEach((file, fileIndex) => {
    const wordFile = wordFiles[fileIndex] ?? wordFiles.find((f) => f.path === file.path);
    if (!wordFile || wordFile.hunks.length !== file.hunks.length) return;
    file.hunks.forEach((hunk, hunkIndex) => {
      const wordHunk = wordFile.hunks[hunkIndex];
      if (!wordHunk) return;
      const delPieces = assignWordPieces(wordHunk.removedLines ?? [], hunk.lines, "del");
      const addPieces = assignWordPieces(wordHunk.addedLines ?? [], hunk.lines, "add");
      let delAt = 0;
      let addAt = 0;
      for (const line of hunk.lines) {
        if (line.kind === "del") {
          const pieces = delPieces[delAt] ?? [];
          delAt += 1;
          if (pieces.length > 0) line.words = positionWords(line.content, pieces);
        } else if (line.kind === "add") {
          const pieces = addPieces[addAt] ?? [];
          addAt += 1;
          if (pieces.length > 0) line.words = positionWords(line.content, pieces);
        }
        // meta nao consome posicao em nenhum lado.
      }
    });
  });
  return plainFiles;
}

/**
 * Atribui os pedacos `kind` ("del"/"add") de um lado do porcelain as linhas
 * `kind` do hunk classico, em ordem de arquivo. Quando o numero de linhas
 * mudadas coincide com o de linhas classicas, a correspondencia e 1:1 por
 * ordem; quando diverge (regiao fundida), casa por conteudo — cada pedaco
 * vai para a primeira linha classica que o contem, a partir da linha do
 * pedaco anterior (uma linha pode receber varios pedacos).
 *
 * @param {Array<{segments?: Array}>} sideLines linhas de um lado do porcelain
 * @param {Array<{kind: string, content: string}>} hunkLines linhas do hunk classico
 * @param {"del" | "add"} kind
 * @returns {Array<Array<{kind: string, text: string}>>} pedacos por linha classica
 */
function assignWordPieces(sideLines, hunkLines, kind) {
  const classicLines = hunkLines.filter((l) => l.kind === kind);
  const piecesByLine = sideLines.map((l) => (l.segments ?? []).filter((s) => s.kind === kind));
  const changed = piecesByLine.filter((p) => p.length > 0);
  if (changed.length === classicLines.length) {
    // Estrutura alinhada: a k-esima linha classica casa com a k-esima linha mudada.
    return classicLines.map((_, i) => changed[i] ?? []);
  }
  const byContent = classicLines.map(() => []);
  let lastHit = 0;
  for (const pieces of piecesByLine) {
    for (const piece of pieces) {
      let hit = -1;
      for (let i = lastHit; i < classicLines.length; i += 1) {
        if (classicLines[i].content.includes(piece.text)) {
          hit = i;
          break;
        }
      }
      if (hit === -1) continue; // Sem dono: descarta — highlight perdido, nunca na linha errada.
      byContent[hit].push(piece);
      lastHit = hit;
    }
  }
  return byContent;
}

/**
 * Distribui pedacos del/add sobre o content exato: acha cada pedaco em ordem
 * e preenche os vaos com segmentos de contexto. Os pedacos sao substrings do
 * content por construcao (nascem do mesmo buffer); se algo nao casar, devolve
 * so os pedacos — pior caso, o highlight sai sem o contexto ao redor.
 */
function positionWords(content, pieces) {
  const words = [];
  let pos = 0;
  for (const piece of pieces) {
    const at = content.indexOf(piece.text, pos);
    if (at === -1) return pieces;
    if (at > pos) words.push({ kind: "context", text: content.slice(pos, at) });
    words.push(piece);
    pos = at + piece.text.length;
  }
  if (pos < content.length) words.push({ kind: "context", text: content.slice(pos) });
  return words;
}

/** `diff --git a/x b/y` — os prefixos a/ e b/ saem fora. */
export function parseDiffGitHeader(line) {
  const rest = line.slice("diff --git ".length);
  // Com aspas quando o nome tem caractere especial: "a/meu arquivo"
  const quoted = /^"(.*)" "(.*)"$/.exec(rest);
  if (quoted) return { a: stripPrefix(unquote(quoted[1])), b: stripPrefix(unquote(quoted[2])) };

  // Sem aspas: o caminho pode ter espaco, entao procuramos " b/" a partir do meio.
  const half = Math.floor(rest.length / 2);
  const sep = rest.indexOf(" b/", half - 1) !== -1 ? rest.indexOf(" b/", half - 1) : rest.indexOf(" b/");
  if (sep !== -1) {
    return { a: stripPrefix(rest.slice(0, sep)), b: stripPrefix(rest.slice(sep + 1)) };
  }
  const parts = rest.split(" ");
  return { a: stripPrefix(parts[0] ?? ""), b: stripPrefix(parts[1] ?? parts[0] ?? "") };
}

function stripPrefix(p) {
  if (p.startsWith("a/") || p.startsWith("b/")) return p.slice(2);
  return p;
}

function unquote(s) {
  return s.replace(/\\(.)/g, "$1");
}

/** `@@ -1,7 +1,9 @@ contexto` */
export function parseHunkHeader(line) {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
  if (!match) return null;
  return {
    oldStart: Number.parseInt(match[1], 10),
    oldLines: match[2] === undefined ? 1 : Number.parseInt(match[2], 10),
    newStart: Number.parseInt(match[3], 10),
    newLines: match[4] === undefined ? 1 : Number.parseInt(match[4], 10),
  };
}

/**
 * GET /api/diff — os parametros vem de `api.diff` no front-end.
 *
 * `wordDiff` liga o highlight intra-linha: roda, POR ARQUIVO, um comando
 * SEPARADO com `--word-diff=porcelain` alem do classico, e casa os dois
 * (`mergeWordDiff`). O porcelain NAO usa `[-...-]`/`{+...+}` (isso e o
 * plain): emite marcadores ` ` / `+` / `-` com linhas `~` estruturais, e os
 * chunks de contexto vem do buffer do lado NOVO — entao a estrutura e o
 * conteudo exatos saem do patch classico, e o porcelain contribui so com as
 * palavras. So faz sentido POR ARQUIVO — sem `path` o endpoint cai no
 * caminho classico, que os consumidores atuais (diffUntracked, diff do commit
 * inteiro) continuam usando byte a byte.
 * @param {{hash?: string, path?: string, staged?: boolean|string, against?: string, wordDiff?: boolean|string}} query
 */
export async function getDiff(query = {}, cwd = process.cwd()) {
  const staged = query.staged === true || query.staged === "true" || query.staged === "1";
  // Word-diff e opcao do SUBCOMANDO (depois de "diff"/"show"), nao do git global.
  const wordDiff =
    (query.wordDiff === true || query.wordDiff === "true" || query.wordDiff === "1") && Boolean(query.path);

  const base = query.hash
    ? query.against
      ? ["diff", "--no-color", "-M"]
      : ["show", "--no-color", "-M"]
    : ["diff", "--no-color", "-M"];

  /** O resto do argv, comum aos dois comandos. */
  const tail = () => {
    const rest = [];
    if (query.hash) {
      if (query.against) {
        // Comparacao explicita entre duas revisoes.
        rest.push(query.against, query.hash);
      } else {
        // O patch do proprio commit. `-m` faz merge commit render em vez de vazio.
        rest.push("--format=", "--patch", "-m", query.hash);
      }
    } else if (staged) {
      rest.push("--cached");
      if (query.against) rest.push(query.against);
    } else if (query.against) {
      rest.push(query.against);
    }
    if (query.path) rest.push("--", query.path);
    return rest;
  };

  if (wordDiff) {
    const plainArgs = [...base, ...tail()];
    const wordArgs = [...base, "--word-diff=porcelain", ...tail()];
    const [plainResult, wordResult] = await Promise.all([
      readGit(plainArgs, { cwd }),
      readGit(wordArgs, { cwd }),
    ]);
    if (!plainResult.ok || !wordResult.ok) {
      const failed = !plainResult.ok ? plainResult : wordResult;
      const error = new Error(failed.error || "git diff falhou");
      error.command = failed;
      throw error;
    }
    const files = mergeWordDiff(parseUnifiedDiff(plainResult.stdout), parseWordDiffPorcelain(wordResult.stdout));
    // Arquivo novo ainda nao rastreado nao aparece em `git diff`: mostra o
    // conteudo. Untracked nao tem lado antigo para difereca de palavras — o
    // fallback e o classico, sem words.
    if (!files.length && query.path && !query.hash && !staged) {
      const untracked = await diffUntracked(query.path, cwd);
      if (untracked) return [untracked];
    }
    return files;
  }

  const result = await readGit([...base, ...tail()], { cwd });
  if (!result.ok) {
    const error = new Error(result.error || "git diff falhou");
    error.command = result;
    throw error;
  }

  const files = parseUnifiedDiff(result.stdout);
  // Arquivo novo ainda nao rastreado nao aparece em `git diff`: mostra o conteudo.
  if (!files.length && query.path && !query.hash && !staged) {
    const untracked = await diffUntracked(query.path, cwd);
    if (untracked) return [untracked];
  }
  return files;
}

/** Diff sintetico de um arquivo untracked (`git diff` ignora esses). */
async function diffUntracked(target, cwd) {
  const result = await readGit(
    ["diff", "--no-color", "--no-index", "-M", "--", nullDevice(), target],
    { cwd },
  );
  // --no-index sai com 1 quando ha diferenca: isso e sucesso para nos.
  if (!result.stdout) return null;
  const files = parseUnifiedDiff(result.stdout);
  return files[0] ?? null;
}

function nullDevice() {
  return process.platform === "win32" ? "NUL" : "/dev/null";
}

/* ------------------------------------------------------------------ *
 * Staging e commit
 * ------------------------------------------------------------------ */

function requirePaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    const error = new Error("error.pathsNotEmpty");
    error.status = 400;
    throw error;
  }
  if (paths.some((p) => typeof p !== "string" || !p.length)) {
    const error = new Error("error.pathsStrings");
    error.status = 400;
    throw error;
  }
  return paths;
}

export function stage({ paths } = {}) {
  requirePaths(paths);
  return execGit(["add", "--", ...paths], { mutating: true });
}

export function unstage({ paths } = {}) {
  requirePaths(paths);
  return execGit(["restore", "--staged", "--", ...paths], { mutating: true });
}

/**
 * Descarta modificacoes: restaura o rastreado e apaga o nao rastreado.
 * Os dois comandos correm sob UM lock so — meio descarte e pior que nenhum.
 */
export async function discard({ paths } = {}) {
  requirePaths(paths);
  return withMutationLock(async () => {
    const restored = await execGit(["restore", "--worktree", "--", ...paths]);
    const cleaned = await execGit(["clean", "-fd", "--", ...paths]);
    // O resultado exibido e o do restore, com a saida do clean anexada.
    return {
      ...restored,
      ok: restored.ok && cleaned.ok,
      stdout: `${restored.stdout}${cleaned.stdout}`,
      stderr: `${restored.stderr}${cleaned.stderr}`,
      argv: restored.argv,
    };
  });
}

export function commit({ message, amend, signoff } = {}) {
  if (!amend && (typeof message !== "string" || !message.trim())) {
    const error = new Error("error.messageRequired");
    error.status = 400;
    throw error;
  }
  const args = ["commit"];
  if (amend) args.push("--amend");
  if (signoff) args.push("--signoff");
  // amend: true sem message → --no-edit (comportamento intencional: reusa a mensagem do commit anterior)
  if (typeof message === "string" && message.length) args.push("-m", message);
  else if (amend) args.push("--no-edit");
  return execGit(args, { mutating: true });
}
