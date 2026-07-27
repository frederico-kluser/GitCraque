/**
 * Working tree, staging e diffs.
 *
 * O status sai de `git status --porcelain=v2 --branch -z --untracked-files=all`.
 * O `-z` nao e detalhe: sem ele o git cita e escapa nomes de arquivo com espaco,
 * acento ou aspas, e o parser vira um inferno de unquoting. Com `-z` os campos
 * vem crus, separados por NUL.
 */
import { execGit, readGit, withMutationLock } from "./exec.mjs";
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
 * @param {{hash?: string, path?: string, staged?: boolean|string, against?: string}} query
 */
export async function getDiff(query = {}, cwd = process.cwd()) {
  const staged = query.staged === true || query.staged === "true" || query.staged === "1";
  const args = [];

  if (query.hash) {
    if (query.against) {
      // Comparacao explicita entre duas revisoes.
      args.push("diff", "--no-color", "-M", query.against, query.hash);
    } else {
      // O patch do proprio commit. `-m` faz merge commit render em vez de vazio.
      args.push("show", "--no-color", "-M", "--format=", "--patch", "-m", query.hash);
    }
  } else if (staged) {
    args.push("diff", "--no-color", "-M", "--cached");
    if (query.against) args.push(query.against);
  } else {
    args.push("diff", "--no-color", "-M");
    if (query.against) args.push(query.against);
  }

  if (query.path) args.push("--", query.path);

  const result = await readGit(args, { cwd });
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
    const error = new Error("paths e obrigatorio e nao pode ser vazio");
    error.status = 400;
    throw error;
  }
  if (paths.some((p) => typeof p !== "string" || !p.length)) {
    const error = new Error("paths so aceita strings nao vazias");
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
    const error = new Error("message e obrigatorio");
    error.status = 400;
    throw error;
  }
  const args = ["commit"];
  if (amend) args.push("--amend");
  if (signoff) args.push("--signoff");
  if (typeof message === "string" && message.length) args.push("-m", message);
  else if (amend) args.push("--no-edit");
  return execGit(args, { mutating: true });
}
