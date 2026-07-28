/**
 * Descoberta e abertura de repositorios da maquina.
 *
 * Existe porque, sem isto, subir o `gitcraque` fora de um repositorio e um beco
 * sem saida: a interface so sabe dizer "este diretorio nao e um repositorio git".
 *
 * Tres capacidades, e a diferenca entre elas importa:
 *
 *   listDirectory  navegar a arvore de diretorios, marcando quais sao repos
 *   scanForRepos   varrer raizes conhecidas procurando `.git`, com orcamento
 *   openRepository trocar o repositorio ativo — `process.chdir()`, como a troca
 *                  de worktree, mas para OUTRO repositorio
 *
 * POSTURA DE SEGURANCA. O `switchWorktree` so aceita caminho que esteja em
 * `git worktree list` justamente porque aceitar caminho arbitrario seria
 * entregar o processo. Aqui o caminho vem do usuario, entao as garantias sao
 * outras:
 *
 *   1. `openRepository` SO aceita diretorio que seja um repositorio git de
 *      verdade (`git rev-parse --git-dir` roda dentro dele). Nao da para levar o
 *      servidor para um diretorio qualquer.
 *   2. `listDirectory` devolve APENAS nomes de diretorio. Nunca nomes de
 *      arquivo, nunca conteudo. A superficie de vazamento fica no minimo
 *      necessario para escolher uma pasta.
 *   3. A varredura tem teto de profundidade, de resultados e de tempo, e
 *      resolve symlink para nao entrar em ciclo.
 *
 * Isso vale porque o servidor ja escuta so em 127.0.0.1 e recusa `Host`/`Origin`
 * de outra origem — sem essas duas guardas, nada aqui seria aceitavel.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { execGit, readGitLine } from "./exec.mjs";
import { getWorktreesPayload } from "./worktree.mjs";

/* ------------------------------------------------------------------ */
/* Limites                                                             */
/* ------------------------------------------------------------------ */

/** Profundidade maxima da varredura a partir de cada raiz. */
export const SCAN_MAX_DEPTH = 5;
/** Teto de repositorios devolvidos por varredura. */
export const SCAN_MAX_RESULTS = 300;
/** Orcamento de tempo: estourou, devolve o que achou com `truncated: true`. */
export const SCAN_TIME_BUDGET_MS = 6_000;
/** Teto de entradas listadas num diretorio (pasta com 100k arquivos existe). */
export const LIST_MAX_ENTRIES = 2_000;
/** Quantos repositorios recentes ficam guardados. */
export const RECENT_LIMIT = 20;

/**
 * Diretorios em que nunca vale a pena descer. Nao e seguranca — e nao gastar o
 * orcamento de varredura com arvores enormes que nunca guardam repositorio do
 * usuario.
 */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  ".cache",
  ".npm",
  ".pnpm-store",
  ".yarn",
  ".bun",
  ".nvm",
  ".cargo",
  ".rustup",
  ".gradle",
  ".m2",
  ".venv",
  "venv",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".tox",
  "dist",
  "build",
  "target",
  "vendor",
  "Library",
  "AppData",
  "snap",
  ".steam",
  ".local",
  ".Trash",
  ".trash",
  "$RECYCLE.BIN",
  "System Volume Information",
]);

/* ------------------------------------------------------------------ */
/* Deteccao                                                            */
/* ------------------------------------------------------------------ */

/**
 * O que este diretorio e, do ponto de vista do git.
 *
 * `.git` como DIRETORIO  = repositorio comum.
 * `.git` como ARQUIVO    = worktree ligada (o arquivo aponta para o git-dir).
 * HEAD + objects + refs  = repositorio bare.
 *
 * Sincrono de proposito: roda dentro do laco de listagem, e um `statSync` custa
 * menos que o overhead de milhares de promises.
 * @param {string} dir
 * @returns {{isRepo: boolean, isBare: boolean, isWorktree: boolean}}
 */
export function detectRepoKind(dir) {
  let dotGit;
  try {
    dotGit = fs.lstatSync(path.join(dir, ".git"));
  } catch {
    dotGit = null;
  }
  if (dotGit) {
    return { isRepo: true, isBare: false, isWorktree: dotGit.isFile() };
  }
  // bare: o conteudo do git-dir mora na propria pasta
  const bare =
    fs.existsSync(path.join(dir, "HEAD")) &&
    fs.existsSync(path.join(dir, "objects")) &&
    fs.existsSync(path.join(dir, "refs"));
  return { isRepo: bare, isBare: bare, isWorktree: false };
}

/** Nome do ramo atual de um repositorio arbitrario, sem mexer no cwd. */
async function branchOf(dir) {
  try {
    const branch = await readGitLine(["symbolic-ref", "--short", "-q", "HEAD"], { cwd: dir });
    if (branch) return branch;
    const hash = await readGitLine(["rev-parse", "--short", "HEAD"], { cwd: dir });
    return hash ? `(detached ${hash})` : null;
  } catch {
    return null;
  }
}

/** Data relativa do ultimo commit ("3 days ago"), ou null em repo vazio. */
async function lastCommitOf(dir) {
  try {
    return (await readGitLine(["log", "-1", "--pretty=%ar"], { cwd: dir })) || null;
  } catch {
    return null;
  }
}

/**
 * Enriquece um caminho com o que a UI mostra em cada linha da lista.
 * @param {string} dir
 */
export async function describeRepo(dir) {
  const kind = detectRepoKind(dir);
  const [branch, lastCommitRelative] = await Promise.all([
    kind.isBare ? Promise.resolve(null) : branchOf(dir),
    kind.isBare ? Promise.resolve(null) : lastCommitOf(dir),
  ]);
  return {
    path: dir,
    name: path.basename(dir) || dir,
    branch,
    lastCommitRelative,
    bare: kind.isBare,
    linkedWorktree: kind.isWorktree,
  };
}

/* ------------------------------------------------------------------ */
/* Navegacao                                                           */
/* ------------------------------------------------------------------ */

/**
 * GET /api/fs/list — os SUBDIRETORIOS de um caminho, marcando quais sao repos.
 *
 * Nunca devolve nome de arquivo: quem escolhe repositorio escolhe pasta.
 * @param {string} target
 */
export async function listDirectory(target) {
  const home = os.homedir();
  let dir = typeof target === "string" && target.trim() ? target.trim() : home;
  if (dir.startsWith("~")) dir = path.join(home, dir.slice(1));
  dir = path.resolve(dir);

  let stat;
  try {
    stat = await fsp.stat(dir);
  } catch (err) {
    const error = new Error("caminho nao existe ou nao pode ser lido");
    error.status = 404;
    error.detail = `${dir}: ${err.code ?? err.message}`;
    throw error;
  }
  if (!stat.isDirectory()) {
    const error = new Error("o caminho nao e um diretorio");
    error.status = 400;
    error.detail = dir;
    throw error;
  }

  let dirents;
  try {
    dirents = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    const error = new Error("sem permissao para listar este diretorio");
    error.status = 403;
    error.detail = `${dir}: ${err.code ?? err.message}`;
    throw error;
  }

  const entries = [];
  let truncated = false;
  for (const dirent of dirents) {
    // Symlink para diretorio conta como diretorio; o resto e ignorado.
    let isDir = dirent.isDirectory();
    if (!isDir && dirent.isSymbolicLink()) {
      try {
        isDir = (await fsp.stat(path.join(dir, dirent.name))).isDirectory();
      } catch {
        isDir = false;
      }
    }
    if (!isDir) continue;
    if (entries.length >= LIST_MAX_ENTRIES) {
      truncated = true;
      break;
    }
    const full = path.join(dir, dirent.name);
    const kind = detectRepoKind(full);
    entries.push({
      name: dirent.name,
      path: full,
      isRepo: kind.isRepo,
      isBare: kind.isBare,
      isWorktree: kind.isWorktree,
      hidden: dirent.name.startsWith("."),
      symlink: dirent.isSymbolicLink(),
    });
  }

  // repos primeiro, depois pastas visiveis, ocultas por ultimo; A-Z dentro de cada grupo
  entries.sort((a, b) => {
    if (a.isRepo !== b.isRepo) return a.isRepo ? -1 : 1;
    if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
    return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
  });

  const parent = path.dirname(dir);
  return {
    path: dir,
    parent: parent === dir ? null : parent,
    home,
    separator: path.sep,
    self: detectRepoKind(dir),
    entries,
    truncated,
  };
}

/**
 * GET /api/fs/roots — os pontos de partida sugeridos que existem nesta maquina.
 */
export async function listRoots() {
  const home = os.homedir();
  const candidatos = [
    { path: home, label: "Pasta pessoal" },
    { path: path.join(home, "Projects"), label: "Projects" },
    { path: path.join(home, "projects"), label: "projects" },
    { path: path.join(home, "Documents"), label: "Documentos" },
    { path: path.join(home, "Documentos"), label: "Documentos" },
    { path: path.join(home, "code"), label: "code" },
    { path: path.join(home, "Code"), label: "Code" },
    { path: path.join(home, "src"), label: "src" },
    { path: path.join(home, "dev"), label: "dev" },
    { path: path.join(home, "repos"), label: "repos" },
    { path: path.join(home, "workspace"), label: "workspace" },
    { path: path.join(home, "git"), label: "git" },
    { path: "/opt", label: "/opt" },
    { path: "/srv", label: "/srv" },
  ];

  const vistos = new Set();
  const roots = [];
  for (const c of candidatos) {
    const resolved = path.resolve(c.path);
    if (vistos.has(resolved)) continue;
    vistos.add(resolved);
    try {
      if ((await fsp.stat(resolved)).isDirectory()) {
        roots.push({ ...c, path: resolved, isRepo: detectRepoKind(resolved).isRepo });
      }
    } catch {
      /* nao existe nesta maquina */
    }
  }
  return { home, separator: path.sep, roots, cwd: process.cwd() };
}

/* ------------------------------------------------------------------ */
/* Varredura                                                           */
/* ------------------------------------------------------------------ */

/**
 * POST /api/repos/scan — procura repositorios sob as raizes dadas.
 *
 * Largura primeiro, com tres tetos (profundidade, resultados, tempo) porque uma
 * varredura sem limite trava o servidor no primeiro `/` que alguem digitar.
 * Nao desce dentro de um repositorio ja encontrado: submodulo e worktree
 * aninhada aparecem pelo repositorio pai, nao como entradas soltas.
 *
 * @param {{roots?: string[], depth?: number, limit?: number, budgetMs?: number}} options
 */
export async function scanForRepos(options = {}) {
  const started = Date.now();
  const depthMax = clamp(options.depth ?? 4, 1, SCAN_MAX_DEPTH);
  const limit = clamp(options.limit ?? 120, 1, SCAN_MAX_RESULTS);
  const budget = clamp(options.budgetMs ?? SCAN_TIME_BUDGET_MS, 500, 30_000);

  const raizes =
    Array.isArray(options.roots) && options.roots.length
      ? options.roots
      : (await listRoots()).roots.map((r) => r.path);

  const fila = [];
  const visitados = new Set();
  for (const raiz of raizes) {
    try {
      const real = await fsp.realpath(path.resolve(raiz));
      if (!visitados.has(real)) {
        visitados.add(real);
        fila.push({ dir: real, depth: 0 });
      }
    } catch {
      /* raiz inexistente e so ignorada */
    }
  }

  const achados = [];
  let scanned = 0;
  let truncated = false;

  while (fila.length) {
    if (achados.length >= limit || Date.now() - started > budget) {
      truncated = fila.length > 0;
      break;
    }
    const { dir, depth } = fila.shift();
    scanned += 1;

    if (detectRepoKind(dir).isRepo) {
      achados.push(dir);
      // nao desce: o que ha dentro pertence a este repositorio
      continue;
    }
    if (depth >= depthMax) continue;

    let dirents;
    try {
      dirents = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue; // sem permissao: segue a vida
    }

    for (const dirent of dirents) {
      if (!dirent.isDirectory() && !dirent.isSymbolicLink()) continue;
      if (SKIP_DIRS.has(dirent.name)) continue;
      // pastas ocultas so na raiz do scan seriam ruido puro
      if (dirent.name.startsWith(".")) continue;
      const full = path.join(dir, dirent.name);
      let real;
      try {
        const st = await fsp.stat(full);
        if (!st.isDirectory()) continue;
        real = await fsp.realpath(full);
      } catch {
        continue;
      }
      if (visitados.has(real)) continue; // symlink circular
      visitados.add(real);
      fila.push({ dir: full, depth: depth + 1 });
    }
  }

  const repos = await Promise.all(achados.map((dir) => describeRepo(dir)));
  repos.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

  return {
    repos,
    roots: raizes,
    scanned,
    truncated,
    elapsedMs: Date.now() - started,
  };
}

/* ------------------------------------------------------------------ */
/* Recentes                                                            */
/* ------------------------------------------------------------------ */

function recentFile() {
  const base =
    process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME.trim()
      ? process.env.XDG_CONFIG_HOME
      : path.join(os.homedir(), ".config");
  return path.join(base, "gitcraque", "recent.json");
}

async function readRecentRaw() {
  try {
    const text = await fsp.readFile(recentFile(), "utf8");
    const parsed = JSON.parse(text);
    return Array.isArray(parsed?.entries) ? parsed.entries : [];
  } catch {
    return []; // arquivo ausente ou corrompido: comeca do zero, sem barulho
  }
}

async function writeRecentRaw(entries) {
  const file = recentFile();
  try {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    // grava em temporario e renomeia: nunca deixa o arquivo pela metade
    const tmp = `${file}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify({ version: 1, entries }, null, 2), { mode: 0o600 });
    await fsp.rename(tmp, file);
  } catch {
    /* nao poder gravar recentes nunca pode derrubar uma operacao de git */
  }
}

/**
 * GET /api/repos/recent — os ultimos repositorios abertos, com `exists`
 * recalculado (a pasta pode ter sido movida ou apagada desde a ultima vez).
 */
export async function getRecentRepos() {
  const entries = await readRecentRaw();
  const enriquecidos = await Promise.all(
    entries.map(async (e) => {
      const exists = detectRepoKind(e.path).isRepo;
      if (!exists) {
        return { ...e, exists: false, branch: e.branch ?? null };
      }
      return { ...e, exists: true, branch: await branchOf(e.path) };
    }),
  );
  return { entries: enriquecidos, file: recentFile() };
}

/** Poe (ou promove) um repositorio no topo dos recentes. */
export async function rememberRepo(dir) {
  const entries = await readRecentRaw();
  const resolved = path.resolve(dir);
  const sem = entries.filter((e) => path.resolve(e.path) !== resolved);
  sem.unshift({
    path: resolved,
    name: path.basename(resolved) || resolved,
    branch: await branchOf(resolved),
    lastOpenedAt: Date.now(),
  });
  await writeRecentRaw(sem.slice(0, RECENT_LIMIT));
}

/** POST /api/repos/recent/remove */
export async function forgetRepo(dir) {
  if (typeof dir !== "string" || !dir.trim()) {
    const error = new Error("path e obrigatorio");
    error.status = 400;
    throw error;
  }
  const entries = await readRecentRaw();
  const resolved = path.resolve(dir);
  await writeRecentRaw(entries.filter((e) => path.resolve(e.path) !== resolved));
  return getRecentRepos();
}

/* ------------------------------------------------------------------ */
/* Abertura                                                           */
/* ------------------------------------------------------------------ */

/**
 * POST /api/repos/open — troca o repositorio ativo do servidor.
 *
 * Irma da troca de worktree: tambem e `process.chdir()`, nunca `git checkout`.
 * A guarda aqui e outra, porque o caminho vem do usuario: SO abre se o
 * diretorio for mesmo um repositorio git. Um caminho qualquer e recusado.
 *
 * @param {string} target
 */
export async function openRepository(target) {
  if (typeof target !== "string" || !target.trim()) {
    const error = new Error("path e obrigatorio");
    error.status = 400;
    throw error;
  }

  const home = os.homedir();
  let dir = target.trim();
  if (dir.startsWith("~")) dir = path.join(home, dir.slice(1));
  dir = path.resolve(dir);

  let stat;
  try {
    stat = await fsp.stat(dir);
  } catch (err) {
    const error = new Error("caminho nao existe");
    error.status = 404;
    error.detail = `${dir}: ${err.code ?? err.message}`;
    throw error;
  }
  if (!stat.isDirectory()) {
    const error = new Error("o caminho nao e um diretorio");
    error.status = 400;
    error.detail = dir;
    throw error;
  }

  // A guarda que segura tudo: o git tem de reconhecer o diretorio.
  let gitDir = "";
  try {
    gitDir = await readGitLine(["rev-parse", "--git-dir"], { cwd: dir });
  } catch {
    gitDir = "";
  }
  if (!gitDir) {
    const error = new Error("o diretorio nao e um repositorio git");
    error.status = 400;
    error.detail = `${dir} nao tem .git — escolha outra pasta ou inicialize um repositorio nela`;
    throw error;
  }

  // Entra pela RAIZ da worktree, nao por uma subpasta qualquer dela.
  let root = dir;
  try {
    const top = await readGitLine(["rev-parse", "--show-toplevel"], { cwd: dir });
    if (top) root = top;
  } catch {
    /* repo bare nao tem toplevel: fica no proprio dir */
  }

  process.chdir(root);
  await rememberRepo(root);

  const payload = await getWorktreesPayload(process.cwd());
  const active = payload.worktrees.find((w) => w.isActive) ?? null;
  return { payload, worktree: active, root };
}

/**
 * POST /api/repos/init — `git init` numa pasta e abre em seguida.
 *
 * A tela de "isto nao e um repositorio" sugere `git init`; sem esta rota, a
 * sugestao obriga o usuario a sair do app e voltar ao terminal.
 */
export async function initRepository(target, { bare = false, initialBranch } = {}) {
  if (typeof target !== "string" || !target.trim()) {
    const error = new Error("path e obrigatorio");
    error.status = 400;
    throw error;
  }
  const home = os.homedir();
  let dir = target.trim();
  if (dir.startsWith("~")) dir = path.join(home, dir.slice(1));
  dir = path.resolve(dir);

  if (detectRepoKind(dir).isRepo) {
    const error = new Error("ja existe um repositorio git nesta pasta");
    error.status = 409;
    error.detail = dir;
    throw error;
  }

  await fsp.mkdir(dir, { recursive: true });

  const args = ["init"];
  if (bare) args.push("--bare");
  if (initialBranch) args.push("--initial-branch", initialBranch);
  args.push(dir);

  const result = await execGit(args, { mutating: true });
  if (!result.ok) return { result, opened: null };

  const opened = await openRepository(dir);
  return { result, opened };
}

/* ------------------------------------------------------------------ */

const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || min));
