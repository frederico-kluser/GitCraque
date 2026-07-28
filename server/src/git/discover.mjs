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

import { db, dbFile, quieto } from "./db.mjs";
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

/** `~/caminho` -> absoluto. Nao exige que o caminho exista. */
export function expandUserPath(target) {
  let dir = String(target).trim();
  if (dir.startsWith("~")) dir = path.join(os.homedir(), dir.slice(1));
  return path.resolve(dir);
}

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
export async function branchOf(dir) {
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
  const dir = expandUserPath(typeof target === "string" && target.trim() ? target : home);

  let stat;
  try {
    stat = await fsp.stat(dir);
  } catch (err) {
    const error = new Error("error.pathUnreadable");
    error.status = 404;
    error.detail = `${dir}: ${err.code ?? err.message}`;
    throw error;
  }
  if (!stat.isDirectory()) {
    const error = new Error("error.notADirectory");
    error.status = 400;
    error.detail = dir;
    throw error;
  }

  let dirents;
  try {
    dirents = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    const error = new Error("error.dirNoPermission");
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

  // Navegar tambem e descobrir: cada repositorio avistado aqui entra no
  // historico, e e assim que a busca acha um git interno que varredura nenhuma
  // listaria. Sem ramo de proposito — seria um `git` por subpasta a cada
  // listagem, e `rememberDiscovered` preserva o ramo que ja souber.
  const self = detectRepoKind(dir);
  rememberDiscoveredMany(
    entries
      // O proprio `.git` casa com a deteccao de repositorio bare (tem HEAD,
      // objects e refs), e a listagem o mostra como tal. Ele nao pode entrar no
      // historico: ninguem procura o `.git` de um projeto na busca de projetos,
      // e uma entrada dessas por repositorio afogaria a lista. A varredura ja
      // barra o mesmo caso por SKIP_DIRS.
      .filter((e) => e.isRepo && e.name !== ".git")
      .map((e) => ({
        path: e.path,
        name: e.name,
        bare: e.isBare,
        linkedWorktree: e.isWorktree,
        nested: self.isRepo,
        parentRepo: self.isRepo ? dir : null,
      })),
    "browse",
  );

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
        fila.push({ dir: real, depth: 0, repoPai: null });
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
    const { dir, depth, repoPai } = fila.shift();
    scanned += 1;

    // Qual repositorio envolve o que for encontrado abaixo daqui. Comeca no que
    // veio da fila e passa a ser ESTE quando este e um repositorio: assim um
    // git interno aponta para quem o contem de imediato, nao para a raiz mais
    // distante.
    let envolvente = repoPai;
    if (detectRepoKind(dir).isRepo) {
      achados.push({ dir, nested: Boolean(repoPai), parentRepo: repoPai ?? null });
      envolvente = dir;
      // CONTINUA DESCENDO, de proposito. Ate 2026-07 este ramo tinha um
      // `continue` aqui, com o argumento de que o que ha dentro pertence ao
      // repositorio pai. So que projeto com git interno existe — submodulo,
      // worktree, pasta de terceiro versionada a parte — e um repositorio que
      // a varredura nunca lista e um repositorio que a busca nunca acha. Os
      // internos entram marcados com `nested`, e quem nao quiser ve-los filtra
      // por isso. O custo fica contido pelos mesmos tres tetos de sempre
      // (profundidade, resultados, tempo) e por SKIP_DIRS, que ja barra `.git`
      // e as arvores grandes de dependencia.
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
      fila.push({ dir: full, depth: depth + 1, repoPai: envolvente });
    }
  }

  const repos = await Promise.all(
    achados.map(async (achado) => ({
      ...(await describeRepo(achado.dir)),
      nested: achado.nested,
      parentRepo: achado.parentRepo,
    })),
  );
  // Pai antes do filho quando os dois aparecem: uma lista que mostra o interno
  // solto, longe do repositorio que o contem, nao explica o que esta vendo.
  repos.sort(
    (a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }) ||
      a.path.localeCompare(b.path),
  );

  // Toda varredura alimenta o historico: e dele que a busca do seletor vive.
  rememberDiscoveredMany(repos, "scan");

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

/** Onde os recentes moram hoje: `~/.config/gitcraque/gitcraque.db`. */
function recentFile() {
  return dbFile();
}

/**
 * As linhas cruas, ja no formato da API.
 *
 * Do banco, mas com a MESMA postura tolerante de quando eram JSON: banco
 * ilegivel devolve lista vazia em vez de derrubar o seletor — o historico e
 * efeito colateral, nao a razao de o app existir.
 */
const readRecentRaw = () =>
  quieto(() =>
    db()
      .prepare("SELECT * FROM recents ORDER BY last_opened_at DESC")
      .all()
      .map((linha) => ({
        path: linha.path,
        name: linha.name,
        branch: linha.branch ?? null,
        lastOpenedAt: linha.last_opened_at,
      })),
  ) ?? [];

/**
 * GET /api/repos/recent — os ultimos repositorios abertos, com `exists`
 * recalculado (a pasta pode ter sido movida ou apagada desde a ultima vez).
 */
export async function getRecentRepos() {
  const entries = readRecentRaw();
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

/**
 * Poe (ou promove) um repositorio no topo dos recentes.
 *
 * O teto rotativo (`RECENT_LIMIT`) e aplicado na escrita, como sempre foi: sem
 * ele a tabela cresceria para sempre e a lista deixaria de ser "recentes".
 * A escrita engole erro de proposito — nao poder gravar o historico nunca pode
 * derrubar uma operacao de git.
 */
export async function rememberRepo(dir) {
  const resolved = path.resolve(dir);
  const ramo = await branchOf(resolved);
  quieto(() => {
    const conexao = db();
    conexao
      .prepare(
        `INSERT INTO recents (path, name, branch, last_opened_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           name = excluded.name,
           branch = excluded.branch,
           last_opened_at = excluded.last_opened_at`,
      )
      .run(resolved, path.basename(resolved) || resolved, ramo, Date.now());
    conexao
      .prepare(
        `DELETE FROM recents WHERE path NOT IN (
           SELECT path FROM recents ORDER BY last_opened_at DESC LIMIT ?
         )`,
      )
      .run(RECENT_LIMIT);
  });
  // Abrir um repositorio tambem e uma forma de descobri-lo.
  rememberDiscovered(
    { path: resolved, name: path.basename(resolved) || resolved, branch: ramo },
    "open",
  );
}

/** POST /api/repos/recent/remove */
export async function forgetRepo(dir) {
  if (typeof dir !== "string" || !dir.trim()) {
    const error = new Error("error.pathRequired");
    error.status = 400;
    throw error;
  }
  const resolved = path.resolve(dir);
  quieto(() => db().prepare("DELETE FROM recents WHERE path = ?").run(resolved));
  return getRecentRepos();
}

/* ------------------------------------------------------------------ */
/* Historico de descobertas                                            */
/* ------------------------------------------------------------------ */

/**
 * Registra que uma pasta git foi VISTA — pela varredura, pela navegacao ou por
 * uma abertura.
 *
 * E a terceira lista, e a unica sem teto: e ela que faz a busca do seletor
 * achar um repositorio interno que so a navegacao revelou uma vez, semanas
 * atras. `first_seen_at` nunca e reescrito; `last_seen_at` sim, e e por ele que
 * a busca desempata.
 *
 * Nunca lanca: descobrir e efeito colateral de navegar, e navegar nao pode
 * quebrar porque o banco esta ocupado.
 *
 * @param {{path: string, name?: string, branch?: string|null, bare?: boolean,
 *          linkedWorktree?: boolean, nested?: boolean, parentRepo?: string|null}} repo
 * @param {"scan"|"browse"|"open"} source
 */
export function rememberDiscovered(repo, source) {
  if (!repo || typeof repo.path !== "string" || !repo.path.trim()) return;
  const alvo = path.resolve(repo.path);
  const agora = Date.now();
  quieto(() =>
    db()
      .prepare(
        `INSERT INTO discovered
           (path, name, branch, bare, linked_worktree, nested, parent_repo,
            source, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           name = excluded.name,
           -- COALESCE, nao atribuicao: a navegacao registra sem ramo (seria um
           -- git por subpasta a cada listagem). Sobrescrever com null apagaria
           -- o ramo que a varredura ja tinha descoberto.
           branch = COALESCE(excluded.branch, branch),
           bare = excluded.bare,
           linked_worktree = excluded.linked_worktree,
           nested = excluded.nested,
           parent_repo = excluded.parent_repo,
           source = excluded.source,
           last_seen_at = excluded.last_seen_at`,
      )
      .run(
        alvo,
        repo.name || path.basename(alvo) || alvo,
        repo.branch ?? null,
        repo.bare ? 1 : 0,
        repo.linkedWorktree ? 1 : 0,
        repo.nested ? 1 : 0,
        repo.parentRepo ?? null,
        source,
        agora,
        agora,
      ),
  );
}

/** O mesmo para uma lista inteira, numa transacao so. */
export function rememberDiscoveredMany(repos, source) {
  if (!repos?.length) return;
  quieto(() => {
    const conexao = db();
    conexao.exec("BEGIN");
    try {
      for (const repo of repos) rememberDiscovered(repo, source);
      conexao.exec("COMMIT");
    } catch (err) {
      conexao.exec("ROLLBACK");
      throw err;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Abertura                                                           */
/* ------------------------------------------------------------------ */

/**
 * A GUARDA que segura toda rota que aceita caminho arbitrario do usuario.
 *
 * Vive separada de `openRepository` porque os favoritos precisam EXATAMENTE da
 * mesma checagem sem trocar o `process.cwd()` — duas versoes dela seria a
 * receita para uma delas envelhecer mais fraca que a outra.
 *
 * @param {string} target
 * @returns {Promise<{dir: string, root: string, gitDir: string}>} `root` e a raiz
 *   da worktree (`--show-toplevel`), nao a subpasta que o usuario digitou.
 */
export async function resolveRepoDir(target) {
  if (typeof target !== "string" || !target.trim()) {
    const error = new Error("error.pathRequired");
    error.status = 400;
    throw error;
  }

  const dir = expandUserPath(target);

  let stat;
  try {
    stat = await fsp.stat(dir);
  } catch (err) {
    const error = new Error("error.pathMissing");
    error.status = 404;
    error.detail = `${dir}: ${err.code ?? err.message}`;
    throw error;
  }
  if (!stat.isDirectory()) {
    const error = new Error("error.notADirectory");
    error.status = 400;
    error.detail = dir;
    throw error;
  }

  // O git tem de reconhecer o diretorio. Sem isto, qualquer pasta da maquina
  // viraria destino valido.
  let gitDir = "";
  try {
    gitDir = await readGitLine(["rev-parse", "--git-dir"], { cwd: dir });
  } catch {
    gitDir = "";
  }
  if (!gitDir) {
    const error = new Error("error.notARepository");
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

  return { dir, root, gitDir };
}

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
  const { root } = await resolveRepoDir(target);

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
    const error = new Error("error.pathRequired");
    error.status = 400;
    throw error;
  }
  const dir = expandUserPath(target);

  if (detectRepoKind(dir).isRepo) {
    const error = new Error("error.alreadyRepository");
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
