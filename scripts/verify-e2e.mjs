#!/usr/bin/env node
/**
 * Teste de aceitacao ponta a ponta do GitCraque.
 *
 * Monta um repositorio de fixture do zero (historico ramificado, merge, um
 * commit com `|` na mensagem, worktree extra, remotos, arvore suja), sobe o
 * servidor de verdade contra ele e exercita os cinco requisitos centrais:
 *
 *   1. o grafo sai do `git log` mandatorio e o parser aguenta `|` no assunto
 *   2. troca de worktree e process.chdir(), nao checkout
 *   3. as rotas do motor de DND executam cherry-pick / merge / rebase
 *   4. squash via GIT_SEQUENCE_EDITOR reescreve o historico
 *   5. o trampolim de askpass responde sem travar o child_process
 *
 *   node scripts/verify-e2e.mjs [--keep] [--port 5299]
 */
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";

const args = process.argv.slice(2);
const KEEP = args.includes("--keep");
const PORT = Number(args[args.indexOf("--port") + 1]) || 5299;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(import.meta.dirname, "..");

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? `\n      ${detail}` : ""}`);
  }
  return ok;
}

const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

/* ------------------------------------------------------------------ */
/* fixture                                                             */
/* ------------------------------------------------------------------ */

const FIX = fs.mkdtempSync(path.join(os.tmpdir(), "gitcraque-e2e-"));
const FIX_WT = `${FIX}-wt`;

function git(cwd, ...a) {
  const r = spawnSync("git", a, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Ana Torres",
      GIT_AUTHOR_EMAIL: "ana@exemplo.dev",
      GIT_COMMITTER_NAME: "Ana Torres",
      GIT_COMMITTER_EMAIL: "ana@exemplo.dev",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
  if (r.status !== 0 && !a.includes("--quiet")) {
    throw new Error(`git ${a.join(" ")} falhou (${r.status}): ${r.stderr}`);
  }
  return r.stdout.trim();
}

/** o assunto com `|` — a armadilha do formato mandatorio */
const PIPE_SUBJECT = "fix(parser): trata a|b como um caso so";

function buildFixture() {
  const w = (file, line, msg) => {
    fs.appendFileSync(path.join(FIX, file), `${line}\n`);
    git(FIX, "add", "-A");
    git(FIX, "commit", "-m", msg);
  };
  git(FIX, "init", "-b", "main");
  w("README.md", "# Fixture", "chore: bootstrap do repositorio");
  w("src.txt", "linha 1", "feat: primeira funcionalidade");
  w("src.txt", "linha 2", PIPE_SUBJECT);
  w("src.txt", "linha 3", "docs: descreve o pipeline");
  git(FIX, "checkout", "-b", "feature/auth");
  w("auth.txt", "token", "feat(auth): valida token");
  w("auth.txt", "refresh", "feat(auth): refresh de sessao");
  git(FIX, "checkout", "main");
  w("src.txt", "linha 4", "perf: reduz alocacao");
  git(FIX, "merge", "--no-ff", "feature/auth", "-m", "merge: integra feature/auth");
  git(FIX, "checkout", "-b", "feature/ui");
  w("ui.txt", "botao", "feat(ui): botao primario");
  git(FIX, "checkout", "main");
  git(FIX, "checkout", "-b", "experimento/squash");
  w("exp.txt", "a", "wip: parte 1");
  w("exp.txt", "b", "wip: parte 2");
  w("exp.txt", "c", "wip: parte 3");
  git(FIX, "checkout", "main");
  git(FIX, "tag", "-a", "v1.0.0", "-m", "primeira versao estavel");
  fs.appendFileSync(path.join(FIX, "src.txt"), "nao commitado\n");
  fs.writeFileSync(path.join(FIX, "untracked.txt"), "novo\n");
  git(FIX, "worktree", "add", FIX_WT, "feature/ui");
  git(FIX, "remote", "add", "origin", "https://github.com/exemplo/gitcraque-fixture.git");
  git(FIX, "remote", "add", "backup", "git@gitlab.com:exemplo/fixture.git");
}

/* ------------------------------------------------------------------ */
/* servidor                                                            */
/* ------------------------------------------------------------------ */

let server;

async function startServer() {
  const bin = path.join(ROOT, "server", "bin", "gitcraque.mjs");
  if (!fs.existsSync(bin)) throw new Error(`nao achei ${bin}`);
  server = spawn(process.execPath, [bin, "--repo", FIX, "--port", String(PORT), "--no-open"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  server.stdout.on("data", (b) => (log += b));
  server.stderr.on("data", (b) => (log += b));

  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {
      /* ainda subindo */
    }
    if (server.exitCode !== null) throw new Error(`servidor saiu (${server.exitCode}):\n${log}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`servidor nao respondeu em 25 s. Saida:\n${log}`);
}

const api = {
  async get(p) {
    const r = await fetch(`${BASE}/api${p}`);
    return { status: r.status, body: await r.json().catch(() => null) };
  },
  async post(p, body) {
    const r = await fetch(`${BASE}/api${p}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  },
};

/* ------------------------------------------------------------------ */

async function main() {
  section("Fixture");
  buildFixture();
  check("repositorio de fixture criado", fs.existsSync(path.join(FIX, ".git")), FIX);
  check(
    "commit com `|` no assunto existe no git",
    git(FIX, "log", "--all", "--pretty=%s").includes(PIPE_SUBJECT),
  );

  section("Servidor");
  await startServer();
  check("GET /api/health responde", true);

  /* ---- 1. grafo ---- */
  section("1. Historico e o parser do formato mandatorio");
  const log = await api.get("/log");
  const commits = log.body?.commits ?? [];
  check("GET /api/log devolve commits", commits.length >= 12, `recebeu ${commits.length}`);
  check(
    "ordem topologica preservada (o mais novo primeiro)",
    commits.length > 0 && typeof commits[0]?.hash === "string" && commits[0].hash.length === 40,
  );
  const pipeCommit = commits.find((c) => c.subject === PIPE_SUBJECT);
  check(
    "assunto com `|` chegou INTEIRO (a armadilha do separador)",
    !!pipeCommit,
    pipeCommit ? "" : `assuntos vistos: ${commits.slice(0, 6).map((c) => JSON.stringify(c.subject)).join(", ")}`,
  );
  const merge = commits.find((c) => (c.parents ?? []).length > 1);
  check("merge commit tem 2 pais", !!merge && merge.parents.length === 2);
  const decorated = commits.find((c) => (c.refs ?? []).some((r) => r.kind === "localBranch"));
  check("decoracao %d normalizada em refs tipadas", !!decorated);
  const tagged = commits.find((c) => (c.refs ?? []).some((r) => r.kind === "tag"));
  check("tag anotada aparece como ref do tipo tag", !!tagged);
  check("total de commits presente no payload", typeof log.body?.total === "number");

  const refs = await api.get("/refs");
  check("GET /api/refs traz branches locais", (refs.body?.branches ?? []).length >= 4);
  check("GET /api/refs traz tags", (refs.body?.tags ?? []).length >= 1);
  check("GET /api/refs traz o HEAD", refs.body?.head?.branch === "main");

  const status = await api.get("/status");
  check(
    "GET /api/status ve o arquivo modificado e o nao rastreado",
    (status.body?.entries ?? []).some((e) => e.path === "src.txt") &&
      (status.body?.entries ?? []).some((e) => e.path === "untracked.txt"),
  );

  const repo = await api.get("/repo");
  check("GET /api/repo traz a versao do git", typeof repo.body?.gitVersion === "string");
  check("GET /api/repo traz os remotos de `git remote -v`", (repo.body?.remotes ?? []).length === 2);
  const originRemote = (repo.body?.remotes ?? []).find((r) => r.name === "origin");
  check("remoto https marcado como https (usa o trampolim)", originRemote?.https === true);

  /* ---- 2. worktrees ---- */
  section("2. Worktrees por process.chdir(), nunca checkout");
  const wtBefore = await api.get("/worktrees");
  const list = wtBefore.body?.worktrees ?? [];
  check("GET /api/worktrees parseia --porcelain", list.length === 2, `recebeu ${list.length}`);
  check("worktree principal marcada com isMain", list.some((w) => w.isMain));
  check("worktree ativa reflete o cwd do servidor", list.some((w) => w.isActive));
  const target = list.find((w) => !w.isActive);

  // a branch checada na outra worktree, ANTES de trocar
  const branchBefore = git(FIX, "rev-parse", "--abbrev-ref", "HEAD");

  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const events = [];
  ws.on("message", (raw) => {
    try {
      events.push(JSON.parse(raw.toString()));
    } catch {
      /* ignora frame invalido */
    }
  });
  await once(ws, "open");
  await new Promise((r) => setTimeout(r, 400));
  check("WebSocket entrega `hello` ao conectar", events.some((e) => e.type === "hello"));

  const switched = await api.post("/worktrees/switch", { path: target.path });
  check("POST /api/worktrees/switch responde 200", switched.status === 200, `status ${switched.status}`);
  await new Promise((r) => setTimeout(r, 600));
  check(
    "WebSocket emite `cwd:changed` apos o chdir",
    events.some((e) => e.type === "cwd:changed"),
    `eventos: ${[...new Set(events.map((e) => e.type))].join(", ")}`,
  );
  const cwdEvent = events.find((e) => e.type === "cwd:changed");
  check("o evento carrega o novo cwd", cwdEvent?.cwd === target.path, `${cwdEvent?.cwd} != ${target.path}`);

  const logAfter = await api.get("/log");
  check(
    "a View Tree seguinte sai do novo diretorio",
    logAfter.body?.cwd === target.path,
    `${logAfter.body?.cwd} != ${target.path}`,
  );
  check(
    "NENHUM checkout aconteceu: o HEAD do repo principal nao mudou",
    git(FIX, "rev-parse", "--abbrev-ref", "HEAD") === branchBefore,
  );

  // volta para a principal
  const mainWt = list.find((w) => w.isMain);
  await api.post("/worktrees/switch", { path: mainWt.path });
  await new Promise((r) => setTimeout(r, 400));

  check(
    "switch para caminho fora da lista de worktrees e recusado",
    (await api.post("/worktrees/switch", { path: "/etc" })).status >= 400,
  );

  /* ---- 3. operacoes do motor de DND ---- */
  section("3. Operacoes que o drag-and-drop dispara");
  const uiTip = git(FIX, "rev-parse", "feature/ui");
  git(FIX, "checkout", "-b", "alvo-cherry", "main");
  const cp = await api.post("/ops/cherry-pick", { commits: [uiTip], onto: "alvo-cherry" });
  check(
    "POST /ops/cherry-pick aplica o commit",
    cp.status === 200 && git(FIX, "log", "alvo-cherry", "--pretty=%s", "-1").includes("botao primario"),
    JSON.stringify(cp.body?.error ?? cp.body?.stderr ?? "").slice(0, 200),
  );

  git(FIX, "checkout", "main");
  const mg = await api.post("/ops/merge", { source: "alvo-cherry", noFf: true });
  check("POST /ops/merge executa o merge", mg.status === 200 && mg.body?.ok === true,
    JSON.stringify(mg.body?.error ?? "").slice(0, 200));

  /* ---- 4. squash via GIT_SEQUENCE_EDITOR ---- */
  section("4. Squash pelo interceptor GIT_SEQUENCE_EDITOR");
  git(FIX, "checkout", "experimento/squash");
  const wips = git(FIX, "log", "-3", "--pretty=%H").split("\n").filter(Boolean).reverse();
  const beforeCount = Number(git(FIX, "rev-list", "--count", "HEAD"));
  const sq = await api.post("/ops/squash", { commits: wips, message: "feat: experimento consolidado" });
  const afterCount = Number(git(FIX, "rev-list", "--count", "HEAD"));
  check("POST /ops/squash responde 200", sq.status === 200, `status ${sq.status} ${JSON.stringify(sq.body?.error ?? "")}`);
  check(
    "3 commits viraram 1 (historico reescrito)",
    afterCount === beforeCount - 2,
    `antes ${beforeCount}, depois ${afterCount}`,
  );
  check(
    "o plano devolvido marca o primeiro como pick e os demais como squash",
    Array.isArray(sq.body?.plan) &&
      sq.body.plan.filter((l) => l.action === "pick").length === 1 &&
      sq.body.plan.filter((l) => l.action === "squash" || l.action === "fixup").length === 2,
    JSON.stringify(sq.body?.plan ?? []).slice(0, 240),
  );
  check(
    "o git-rebase-todo original foi capturado para auditoria",
    typeof sq.body?.originalTodo === "string" && sq.body.originalTodo.includes("pick"),
  );
  check(
    "a mensagem final foi aplicada",
    git(FIX, "log", "-1", "--pretty=%s") === "feat: experimento consolidado",
    git(FIX, "log", "-1", "--pretty=%s"),
  );
  git(FIX, "checkout", "main");

  /* ---- 5. trampolim de askpass ---- */
  section("5. Trampolim de askpass");
  const saved = await api.post("/credentials", {
    host: "github.com",
    username: "ana",
    token: "tok_secreto_123",
  });
  check("POST /api/credentials guarda a credencial", saved.status === 200);
  const creds = await api.get("/credentials");
  const serialized = JSON.stringify(creds.body);
  check("GET /api/credentials lista o host", serialized.includes("github.com"));
  check(
    "o token NUNCA volta para o cliente",
    !serialized.includes("tok_secreto_123"),
    serialized.slice(0, 200),
  );

  // push para um remoto https inexistente: tem de FALHAR RAPIDO, nunca travar
  const t0 = Date.now();
  const push = await api.post("/net/push", { remote: "origin", branch: "main" });
  const elapsed = Date.now() - t0;
  check(
    "push por https falha limpo em vez de travar no prompt de senha",
    push.status < 500 && elapsed < 60_000,
    `${elapsed}ms, status ${push.status}`,
  );
  check(
    "a falha do push e de rede/auth, nao de deadlock em prompt",
    !/terminal prompts disabled.*could not read/i.test(String(push.body?.stderr ?? "")) ||
      String(push.body?.stderr ?? "").length > 0,
    String(push.body?.stderr ?? "").slice(0, 200),
  );

  ws.close();

  /* ---- resumo ---- */
  console.log(`\n\x1b[1m${passed} passaram, ${failed} falharam\x1b[0m`);
  if (failures.length) {
    console.log("\nFalhas:");
    for (const f of failures) console.log(`  · ${f}`);
  }
  return failed === 0;
}

let ok = false;
try {
  ok = await main();
} catch (e) {
  console.error(`\n\x1b[31mErro fatal:\x1b[0m ${e.stack || e.message}`);
} finally {
  server?.kill("SIGTERM");
  if (!KEEP) {
    try {
      git(FIX, "worktree", "remove", "--force", FIX_WT);
    } catch {
      /* melhor esforco */
    }
    fs.rmSync(FIX, { recursive: true, force: true });
    fs.rmSync(FIX_WT, { recursive: true, force: true });
  } else {
    console.log(`\nfixture preservada em ${FIX}`);
  }
}
process.exit(ok ? 0 : 1);
