/**
 * Remotos e comandos de rede.
 *
 * Fetch/pull/push passam pelo trampolim `GIT_ASKPASS` (montado em
 * `git/exec.mjs`): nenhum deles pode travar num prompt de senha.
 */
import { execGit, readGit } from "./exec.mjs";

/**
 * Parser puro de `git remote -v`:
 *   origin\thttps://github.com/u/r.git (fetch)
 *   origin\thttps://github.com/u/r.git (push)
 * @param {string} stdout
 * @returns {import("../types.mjs").Remote[]}
 */
export function parseRemotes(stdout) {
  /** @type {Map<string, {fetchUrl: string, pushUrl: string}>} */
  const map = new Map();
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.replace(/\r$/, "").trim();
    if (!line) continue;
    const match = /^(\S+)\s+(.+?)\s+\((fetch|push)\)$/.exec(line);
    if (!match) continue;
    const [, name, url, kind] = match;
    const entry = map.get(name) ?? { fetchUrl: "", pushUrl: "" };
    if (kind === "fetch") entry.fetchUrl = url;
    else entry.pushUrl = url;
    map.set(name, entry);
  }

  return [...map.entries()].map(([name, { fetchUrl, pushUrl }]) => {
    const url = fetchUrl || pushUrl;
    const host = remoteHost(url);
    /** @type {import("../types.mjs").Remote} */
    const remote = {
      name,
      fetchUrl: fetchUrl || pushUrl,
      pushUrl: pushUrl || fetchUrl,
      https: /^https?:\/\//i.test(url),
    };
    if (host) remote.host = host;
    return remote;
  });
}

/**
 * Extrai o host de uma URL de remoto — a chave do cofre de credenciais.
 * Cobre https://host/x, ssh://git@host:22/x, git@host:x e file://.
 * @param {string} url
 * @returns {string}
 */
export function remoteHost(url) {
  if (!url) return "";
  const scp = /^[^/]+@([^:/]+):/.exec(url); // git@github.com:user/repo.git
  if (scp && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return scp[1];
  try {
    const parsed = new URL(url);
    return parsed.hostname || "";
  } catch {
    return "";
  }
}

/** GET /api/remotes */
export async function getRemotes(cwd = process.cwd()) {
  const result = await readGit(["remote", "-v"], { cwd });
  if (!result.ok) return [];
  return parseRemotes(result.stdout);
}

export function addRemote({ name, url } = {}) {
  requireName(name, "name");
  requireName(url, "url");
  return execGit(["remote", "add", name, url], { mutating: true });
}

export function removeRemote({ name } = {}) {
  requireName(name, "name");
  return execGit(["remote", "remove", name], { mutating: true });
}

export function setRemoteUrl({ name, url, push } = {}) {
  requireName(name, "name");
  requireName(url, "url");
  const args = ["remote", "set-url"];
  if (push) args.push("--push");
  args.push(name, url);
  return execGit(args, { mutating: true });
}

/* ------------------------------------------------------------------ *
 * Rede — tudo com o trampolim ligado
 * ------------------------------------------------------------------ */

export function gitFetch({ remote, all, prune, tags } = {}) {
  const args = ["fetch"];
  if (all) args.push("--all");
  if (prune) args.push("--prune");
  if (tags) args.push("--tags");
  args.push("--progress");
  if (remote && !all) args.push(remote);
  return execGit(args, { mutating: true, progressOp: "fetch" });
}

export function gitPull({ remote, branch, rebase } = {}) {
  const args = ["pull"];
  if (rebase) args.push("--rebase");
  args.push("--progress");
  if (remote) args.push(remote);
  if (remote && branch) args.push(branch);
  return execGit(args, { mutating: true, progressOp: "pull" });
}

export function gitPush({
  remote,
  branch,
  force,
  forceWithLease,
  setUpstream,
  tags,
  deleteRef,
} = {}) {
  requireName(remote, "remote");
  const args = ["push"];
  // --force-with-lease e sempre preferivel: recusa se alguem publicou por cima.
  if (forceWithLease) args.push("--force-with-lease");
  else if (force) args.push("--force");
  if (setUpstream) args.push("--set-upstream");
  if (tags) args.push("--tags");
  if (deleteRef) args.push("--delete");
  args.push("--progress", remote);
  if (branch) args.push(branch);
  return execGit(args, { mutating: true, progressOp: "push" });
}

function requireName(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error(`${field} e obrigatorio`);
    error.status = 400;
    throw error;
  }
}
