/**
 * Parser do formato de log MANDATORIO do projeto.
 *
 *   git log --pretty=format:"%H|%P|%an|%ae|%s|%ar|%d" --all --topo-order
 *
 * A armadilha: `%s` (assunto) pode conter o proprio separador `|`. Uma divisao
 * ingenua por `split("|")` desalinha tudo a partir do primeiro commit com pipe
 * na mensagem. A regra e:
 *
 *   - os QUATRO primeiros campos (hash, pais, autor, email) saem pela ESQUERDA;
 *   - os DOIS ultimos (data relativa, decoracao) saem pela DIREITA;
 *   - o que sobra no meio, inteiro e sem tocar, e o assunto.
 */
import { LOG_ARGS } from "../contract.mjs";
import { execGitLines, isNotARepoError, readGit, readGitLine } from "./exec.mjs";

/** Quantos campos saem pela esquerda e quantos pela direita. */
const LEFT_FIELDS = 4;
const RIGHT_FIELDS = 2;

/**
 * Divide UMA linha do formato mandatorio.
 * @param {string} line
 * @param {Set<string>} [remotes] nomes de remotos conhecidos, para classificar `origin/x`
 * @returns {import("../types.mjs").RawCommit | null}
 */
export function parseCommitLine(line, remotes) {
  if (!line) return null;

  // 4 campos pela esquerda: split com limite nao serve em JS, entao fatiamos.
  const left = [];
  let rest = line;
  for (let i = 0; i < LEFT_FIELDS; i += 1) {
    const at = rest.indexOf("|");
    if (at === -1) return null; // linha truncada: nao e uma linha do formato
    left.push(rest.slice(0, at));
    rest = rest.slice(at + 1);
  }

  // 2 campos pela direita, sobre o que sobrou.
  const right = [];
  for (let i = 0; i < RIGHT_FIELDS; i += 1) {
    const at = rest.lastIndexOf("|");
    if (at === -1) return null;
    right.unshift(rest.slice(at + 1));
    rest = rest.slice(0, at);
  }

  const [hash, parentsRaw, authorName, authorEmail] = left;
  const [relativeDate, decorationRaw] = right;
  const subject = rest; // tudo que sobrou no meio, com os `|` que tiver

  return {
    hash,
    parents: parentsRaw.length ? parentsRaw.split(" ").filter(Boolean) : [],
    authorName,
    authorEmail,
    subject,
    relativeDate,
    decorationRaw,
    refs: parseDecoration(decorationRaw, remotes),
  };
}

/**
 * Normaliza `%d` em refs tipados.
 *
 * Exemplos de entrada:
 *   " (HEAD -> main, origin/main, tag: v1.0)"
 *   " (HEAD, origin/HEAD)"           <- detached
 *   " (tag: v1, tag: light)"
 *   ""                               <- sem decoracao
 *
 * @param {string} raw
 * @param {Set<string>} [remotes]
 * @returns {import("../types.mjs").CommitRef[]}
 */
export function parseDecoration(raw, remotes) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return [];

  const inner = trimmed.startsWith("(") && trimmed.endsWith(")")
    ? trimmed.slice(1, -1)
    : trimmed;
  if (!inner.trim()) return [];

  /** @type {import("../types.mjs").CommitRef[]} */
  const refs = [];
  for (const piece of inner.split(",")) {
    const item = piece.trim();
    if (!item) continue;

    // "HEAD -> main": o HEAD e a branch que ele aponta, os dois marcados.
    const arrow = item.indexOf(" -> ");
    if (arrow !== -1) {
      const headName = item.slice(0, arrow).trim();
      const branchName = item.slice(arrow + 4).trim();
      refs.push({ kind: "head", name: headName, isHead: true });
      refs.push(refFromName(branchName, true, remotes));
      continue;
    }

    // "tag: v1.0"
    if (item.startsWith("tag: ")) {
      const name = item.slice(5).trim();
      refs.push({ kind: "tag", name, fullName: `refs/tags/${name}`, isHead: false });
      continue;
    }

    // "HEAD" sozinho: detached, e um ref legitimo.
    if (item === "HEAD") {
      refs.push({ kind: "head", name: "HEAD", isHead: true });
      continue;
    }

    refs.push(refFromName(item, false, remotes));
  }
  return refs;
}

/** Decide se `name` e branch local, branch remota ou stash. */
function refFromName(name, isHead, remotes) {
  if (name === "refs/stash" || name === "stash") {
    return { kind: "stash", name, fullName: "refs/stash", isHead: false };
  }
  const slash = name.indexOf("/");
  if (slash > 0) {
    const remote = name.slice(0, slash);
    // Sem a lista de remotos, `feature/x` viraria remoteBranch por engano.
    if (remotes && remotes.has(remote)) {
      return {
        kind: "remoteBranch",
        name,
        fullName: `refs/remotes/${name}`,
        isHead: false,
        remote,
      };
    }
  }
  return {
    kind: "localBranch",
    name,
    fullName: `refs/heads/${name}`,
    isHead,
  };
}

/** O git usa esta frase quando o repo ainda nao tem commit nenhum. */
function isEmptyRepoError(stderr) {
  return /does not have any commits yet|bad default revision|unknown revision or path not in the working tree/i.test(
    stderr || "",
  );
}

/**
 * GET /api/log
 *
 * Filtros de busca (aditivos — LOG_ARGS nunca muda):
 *  - q:      texto buscado na mensagem (--grep)
 *  - author: nome ou email do autor (--author)
 *  - path:   caminho de arquivo (-- <path>)
 *  - before: data limite (--before)
 *  - after:  data inicial (--after)
 *
 * @param {{limit?: number, skip?: number, q?: string, author?: string, path?: string, before?: string, after?: string, cwd?: string}} [opts]
 * @returns {Promise<import("../types.mjs").LogPayload>}
 */
export async function getLog(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const args = [...LOG_ARGS];

  // Filtros de busca (aditivos: nao alteram LOG_ARGS)
  if (opts.q) args.push(`--grep=${opts.q}`);
  if (opts.author) args.push(`--author=${opts.author}`);
  if (opts.before) args.push(`--before=${opts.before}`);
  if (opts.after) args.push(`--after=${opts.after}`);

  if (Number.isFinite(opts.limit) && opts.limit > 0) args.push("-n", String(Math.floor(opts.limit)));
  if (Number.isFinite(opts.skip) && opts.skip > 0) args.push("--skip", String(Math.floor(opts.skip)));

  // O separador -- so e acrescentado se houver path (-- sozinho afeta o log).
  const hasPath = opts.path && opts.path.length > 0;
  if (hasPath) args.push("--", opts.path);

  const started = Date.now();
  const [result, remotes] = await Promise.all([
    readGit(args, { cwd }),
    execGitLines(["remote"], { cwd }),
  ]);
  const elapsedMs = Date.now() - started;

  if (!result.ok) {
    // Repositorio sem commit nao e erro: e um estado valido do produto.
    // Diretorio que nao e repositorio tambem nao: e o estado de quem acabou de
    // subir o gitcraque fora de um repo e vai escolher um no seletor.
    if (isEmptyRepoError(result.stderr) || isNotARepoError(result.stderr)) {
      return { commits: [], total: 0, skip: opts.skip ?? 0, cwd, empty: true, elapsedMs };
    }
    const error = new Error(result.error || "git log falhou");
    error.command = result;
    throw error;
  }

  const remoteSet = new Set(remotes);
  const commits = [];
  for (const line of result.stdout.split("\n")) {
    const parsed = parseCommitLine(line.replace(/\r$/, ""), remoteSet);
    if (parsed) commits.push(parsed);
  }

  const total = await countCommits(cwd);
  return {
    commits,
    total,
    skip: opts.skip ?? 0,
    cwd,
    empty: total === 0 && commits.length === 0,
    elapsedMs,
  };
}

/** `git rev-list --all --count` — o total para a virtualizacao paginar. */
export async function countCommits(cwd = process.cwd()) {
  const line = await readGitLine(["rev-list", "--all", "--count"], { cwd });
  const n = Number.parseInt(line ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

/* ------------------------------------------------------------------ *
 * Detalhe de um commit — GET /api/commit/:hash
 * ------------------------------------------------------------------ */

const DETAIL_SEP = "\u001f";
const DETAIL_FORMAT = [
  "%H",
  "%h",
  "%P",
  "%an",
  "%ae",
  "%aI",
  "%cn",
  "%ce",
  "%cI",
  "%d",
  "%s",
  "%b",
].join("%x1f");

/**
 * @param {string} hash
 * @returns {Promise<import("../types.mjs").CommitDetail>}
 */
export async function getCommitDetail(hash, cwd = process.cwd()) {
  // Resolve antes de usar: garante que `hash` e uma revisao, nao um caminho.
  const resolved = await readGitLine(["rev-parse", "--verify", "--quiet", `${hash}^{commit}`], {
    cwd,
  });
  if (!resolved) {
    const error = new Error(`commit ${hash} nao encontrado`);
    error.status = 404;
    throw error;
  }
  const source = await readGit(
    ["show", "--no-patch", `--format=${DETAIL_FORMAT}`, resolved],
    { cwd },
  );
  if (!source.ok) {
    const error = new Error(source.error || `commit ${hash} nao encontrado`);
    error.command = source;
    error.status = 404;
    throw error;
  }

  const fields = source.stdout.split(DETAIL_SEP);
  const [
    fullHash = "",
    abbrevHash = "",
    parentsRaw = "",
    authorName = "",
    authorEmail = "",
    authorDate = "",
    committerName = "",
    committerEmail = "",
    committerDate = "",
    decorationRaw = "",
    subject = "",
    body = "",
  ] = fields;

  const remotes = new Set(await execGitLines(["remote"], { cwd }));
  const files = await getCommitFiles(fullHash.trim(), cwd);
  const stats = files.reduce(
    (acc, f) => ({
      filesChanged: acc.filesChanged + 1,
      insertions: acc.insertions + f.insertions,
      deletions: acc.deletions + f.deletions,
    }),
    { filesChanged: 0, insertions: 0, deletions: 0 },
  );

  return {
    hash: fullHash.trim(),
    abbrevHash: abbrevHash.trim(),
    parents: parentsRaw.trim() ? parentsRaw.trim().split(" ").filter(Boolean) : [],
    authorName,
    authorEmail,
    authorDate,
    committerName,
    committerEmail,
    committerDate,
    subject,
    body: body.replace(/\n+$/, ""),
    refs: parseDecoration(decorationRaw, remotes),
    files,
    stats,
  };
}

/** Status + numstat de um commit, casados por caminho. */
async function getCommitFiles(hash, cwd) {
  // Sem `--no-patch`: o git recusa `-s` junto de `--name-status`. O `--format=`
  // vazio ja tira o cabecalho do commit e deixa so a lista de arquivos.
  const [nameStatus, numstat] = await Promise.all([
    readGit(["show", "--format=", "--name-status", "-M", "-z", hash], { cwd }),
    readGit(["show", "--format=", "--numstat", "-M", "-z", hash], { cwd }),
  ]);

  /** @type {Map<string, {insertions:number, deletions:number, binary:boolean}>} */
  const numbers = new Map();
  if (numstat.ok) {
    const tokens = numstat.stdout.split("\0");
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (!token) continue;
      // "12\t3\tpath" ou, em rename, "12\t3\t" + \0old + \0new
      const parts = token.split("\t");
      if (parts.length < 3) continue;
      const insertions = parts[0] === "-" ? 0 : Number.parseInt(parts[0], 10) || 0;
      const deletions = parts[1] === "-" ? 0 : Number.parseInt(parts[1], 10) || 0;
      const binary = parts[0] === "-" && parts[1] === "-";
      let path = parts.slice(2).join("\t");
      if (path === "") {
        // rename: os dois caminhos vem nos dois tokens seguintes
        const oldPath = tokens[i + 1] ?? "";
        const newPath = tokens[i + 2] ?? "";
        i += 2;
        path = newPath || oldPath;
      }
      numbers.set(path, { insertions, deletions, binary });
    }
  }

  /** @type {import("../types.mjs").CommitFileChange[]} */
  const files = [];
  if (nameStatus.ok) {
    const tokens = nameStatus.stdout.split("\0").filter((t) => t.length > 0);
    for (let i = 0; i < tokens.length; i += 1) {
      const code = tokens[i];
      if (!/^[A-Z]/.test(code)) continue;
      const letter = code[0];
      let path = tokens[i + 1] ?? "";
      let oldPath;
      i += 1;
      if (letter === "R" || letter === "C") {
        oldPath = path;
        path = tokens[i + 1] ?? "";
        i += 1;
      }
      const nums = numbers.get(path) ?? { insertions: 0, deletions: 0, binary: false };
      files.push({
        path,
        ...(oldPath ? { oldPath } : {}),
        status: statusFromLetter(letter),
        insertions: nums.insertions,
        deletions: nums.deletions,
        binary: nums.binary,
      });
    }
  }
  return files;
}

/** Letra do `--name-status` para o `ChangeStatus` do contrato. */
export function statusFromLetter(letter) {
  switch (letter) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "T":
      return "typechange";
    case "U":
      return "unmerged";
    case "?":
      return "untracked";
    default:
      return "unknown";
  }
}
