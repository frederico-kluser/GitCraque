/**
 * Ponta a ponta pela porta: sobe o servidor de verdade contra um repositorio de
 * fixture e exercita a superficie REST do contrato, o WebSocket e a troca de
 * worktree por `process.chdir`.
 */
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PIPE_SUBJECT, git, makeFixtureRepo } from "./helpers/repo.mjs";
import { bootServer } from "./helpers/server.mjs";
import { translate } from "../src/i18n.mjs";

let fixture;
let api;
const cwdOriginal = process.cwd();

before(async () => {
  fixture = makeFixtureRepo("gitcraque-api-");
  api = await bootServer(fixture.root, { port: 5391 });
});

after(async () => {
  await api?.close();
  process.chdir(cwdOriginal);
  fixture?.cleanup();
});

test("GET /api/health", async () => {
  const { status, json } = await api.get("/api/health");
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.version, "0.0.0-test");
});

test("GET /api/repo devolve o RepoPayload do contrato", async () => {
  const { status, json } = await api.get("/api/repo");
  assert.equal(status, 200);
  assert.equal(json.isRepo, true);
  assert.equal(json.cwd, fixture.root);
  assert.equal(json.root, fixture.root);
  assert.equal(json.name, path.basename(fixture.root));
  assert.equal(json.head.branch, "main");
  assert.equal(json.head.detached, false);
  assert.equal(json.head.pending, null);
  assert.equal(json.worktrees.length, 2);
  assert.ok(json.gitVersion.length > 0);
  assert.ok(json.gitCommonDir.endsWith(".git"));
  assert.deepEqual(json.remotes, []);
});

/* So a LEITURA passa pela porta aqui: desfazer de verdade mexeria no HEAD do
 * fixture e os testes seguintes deste arquivo contam com o historico intacto.
 * O comportamento do cursor esta em `undo.test.mjs`, contra repo proprio. */
test("GET /api/undo/state devolve o UndoStatePayload do contrato", async () => {
  const { status, json } = await api.get("/api/undo/state");
  assert.equal(status, 200);
  assert.equal(json.canUndo, true, "o fixture tem historico: da para desfazer");
  assert.equal(json.canRedo, false, "nada foi desfeito ainda");
  assert.equal(json.blocked, null);
  assert.equal(typeof json.undoLabel, "string", "o rotulo vem do reflog");
  assert.equal(json.redoLabel, null);
});

test("GET /api/log traz o commit com | com o assunto INTEIRO", async () => {
  const { status, json } = await api.get("/api/log");
  assert.equal(status, 200);
  assert.equal(json.empty, false);
  assert.ok(json.total >= 7);
  assert.equal(json.skip, 0);
  assert.equal(json.cwd, fixture.root);

  const comPipe = json.commits.find((c) => c.hash === fixture.hashes.pipe);
  assert.equal(comPipe.subject, PIPE_SUBJECT);
  assert.equal(comPipe.authorName, "Teste GitCraque");
  assert.equal(comPipe.parents.length, 1);
  assert.ok(comPipe.refs.some((r) => r.kind === "tag" && r.name === "v1.0"));

  const head = json.commits.find((c) => c.refs.some((r) => r.kind === "head"));
  assert.ok(head, "algum commit tem de carregar o HEAD");
  assert.ok(head.refs.some((r) => r.kind === "localBranch" && r.name === "main" && r.isHead));
});

test("GET /api/log?q= busca por texto na mensagem", async () => {
  const { status, json } = await api.get(`/api/log?q=${encodeURIComponent("login")}`);
  assert.equal(status, 200);
  assert.ok(json.commits.length >= 2, "deve encontrar feat: tela de login e fix: valida a senha");
  assert.ok(json.commits.every((c) => c.subject.toLowerCase().includes("login")), "todos os resultados contem login");
});

test("GET /api/log?author= filtra por autor", async () => {
  const { status, json } = await api.get("/api/log?author=Teste GitCraque");
  assert.equal(status, 200);
  assert.ok(json.commits.length >= 7, "todos os commits do fixture sao do Teste GitCraque");
  assert.ok(json.commits.every((c) => c.authorName === "Teste GitCraque"));
});

test("GET /api/log?author= sem resultados", async () => {
  const { status, json } = await api.get("/api/log?author=Fulano Ausente");
  assert.equal(status, 200);
  assert.equal(json.commits.length, 0);
  assert.equal(json.empty, false, "o repositorio NAO esta vazio, so a busca e que e");
  // total e o rev-list --all --count, que ignora os filtros de busca
  assert.ok(json.total > 0, "o total sem filtro e maior que zero");
});

test("GET /api/log?path= filtra por caminho", async () => {
  const { status, json } = await api.get(`/api/log?path=${encodeURIComponent("src/login.js")}`);
  assert.equal(status, 200);
  assert.ok(json.commits.length >= 2, "deve encontrar os commits de login");
  assert.ok(json.commits.every((c) => c.subject.includes("login") || c.subject.includes("valida")), "resultados tocam src/login.js");
});

test("GET /api/log?q= e ?path= combinados", async () => {
  const { status, json } = await api.get(`/api/log?q=tela&path=${encodeURIComponent("src/login.js")}`);
  assert.equal(status, 200);
  assert.equal(json.commits.length, 1);
  assert.equal(json.commits[0].subject, "feat: tela de login");
});

test("GET /api/log?limit=&skip= pagina", async () => {
  const primeira = await api.get("/api/log?limit=2");
  assert.equal(primeira.json.commits.length, 2);
  const segunda = await api.get("/api/log?limit=2&skip=2");
  assert.equal(segunda.json.skip, 2);
  assert.notEqual(primeira.json.commits[0].hash, segunda.json.commits[0].hash);
});

test("GET /api/commit/:hash devolve CommitDetail com arquivos e stats", async () => {
  const { status, json } = await api.get(`/api/commit/${fixture.hashes.pipe}`);
  assert.equal(status, 200);
  assert.equal(json.hash, fixture.hashes.pipe);
  assert.equal(json.subject, PIPE_SUBJECT);
  assert.ok(json.abbrevHash.length >= 7);
  assert.equal(json.authorEmail, "teste@gitcraque.dev");
  assert.ok(json.authorDate.includes("T"), "data ISO");
  assert.equal(json.files.length, 1);
  assert.equal(json.files[0].path, "src/app.js");
  assert.equal(json.files[0].status, "added");
  assert.equal(json.stats.filesChanged, 1);
  assert.ok(json.stats.insertions >= 1);
});

test("GET /api/commit/:hash de hash inexistente e 404", async () => {
  const { status, json } = await api.get("/api/commit/deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
  assert.equal(status, 404);
  assert.ok(json.error.length > 0, "erro no envelope ApiError");
});

test("GET /api/refs devolve o RefsPayload", async () => {
  const { status, json } = await api.get("/api/refs");
  assert.equal(status, 200);
  assert.equal(json.head.branch, "main");
  assert.deepEqual(
    json.branches.map((b) => b.name).sort(),
    ["feature/login", "main", "squash-me", "trabalho-paralelo"],
  );
  assert.equal(json.branches.find((b) => b.name === "main").isHead, true);
  assert.equal(
    json.branches.find((b) => b.name === "trabalho-paralelo").checkedOutIn,
    fixture.worktree,
  );
  assert.deepEqual(json.tags.map((t) => t.name).sort(), ["leve", "v1.0"]);
  assert.deepEqual(json.remoteBranches, []);
  assert.deepEqual(json.stashes, []);
});

test("GET /api/status devolve o StatusPayload", async () => {
  const { status, json } = await api.get("/api/status");
  assert.equal(status, 200);
  assert.equal(json.branch, "main");
  assert.equal(json.clean, true);
  assert.equal(json.cwd, fixture.root);
  assert.deepEqual(json.entries, []);
});

test("GET /api/worktrees devolve o WorktreesPayload", async () => {
  const { status, json } = await api.get("/api/worktrees");
  assert.equal(status, 200);
  assert.equal(json.worktrees.length, 2);
  assert.equal(json.cwd, fixture.root);
  assert.equal(json.mainRoot, fixture.root);
  const principal = json.worktrees.find((w) => w.isMain);
  assert.equal(principal.isActive, true);
  assert.equal(principal.branch, "main");
  const extra = json.worktrees.find((w) => !w.isMain);
  assert.equal(extra.path, fixture.worktree);
  assert.equal(extra.branch, "trabalho-paralelo");
  assert.equal(extra.isActive, false);
});

test("GET /api/remotes", async () => {
  const { status, json } = await api.get("/api/remotes");
  assert.equal(status, 200);
  assert.deepEqual(json.remotes, []);
});

test("POST /api/worktrees/switch faz chdir, emite cwd:changed e muda o log", async () => {
  const ws = api.connectWs();
  await ws.open();

  // O hello chega assim que a conexao abre.
  const hello = await ws.waitFor("hello");
  assert.equal(hello.cwd, fixture.root);
  assert.equal(hello.mainRoot, fixture.root);
  assert.equal(hello.pid, process.pid);
  assert.equal(hello.version, "0.0.0-test");

  const antes = await api.get("/api/log");
  const temParalelo = (payload) =>
    payload.commits.some((c) => c.subject === "chore: commit na worktree extra");
  assert.equal(
    antes.json.commits.find((c) => c.refs.some((r) => r.kind === "head")).subject,
    "merge: feature/login na main",
    "na worktree principal o HEAD esta no merge da main",
  );

  const trocado = await api.post("/api/worktrees/switch", { path: fixture.worktree });
  assert.equal(trocado.status, 200);
  assert.equal(trocado.json.cwd, fixture.worktree, "o payload ja vem do diretorio novo");
  assert.equal(trocado.json.worktrees.find((w) => w.isActive).path, fixture.worktree);

  const evento = await ws.waitFor("cwd:changed");
  assert.equal(evento.cwd, fixture.worktree);
  assert.equal(evento.worktree.branch, "trabalho-paralelo");
  assert.equal(evento.mainRoot, fixture.root);

  const depois = await api.get("/api/log");
  assert.equal(depois.json.cwd, fixture.worktree, "o log seguinte sai da outra worktree");
  const headDepois = depois.json.commits.find((c) => c.refs.some((r) => r.kind === "head"));
  assert.equal(headDepois.subject, "chore: commit na worktree extra");
  assert.ok(temParalelo(depois.json));

  const status = await api.get("/api/status");
  assert.equal(status.json.branch, "trabalho-paralelo");

  // volta para a principal para nao contaminar os testes seguintes
  const voltou = await api.post("/api/worktrees/switch", { path: fixture.root });
  assert.equal(voltou.json.cwd, fixture.root);
  await ws.close();
});

test("POST /api/worktrees/switch recusa caminho fora da lista", async () => {
  const { status, json } = await api.post("/api/worktrees/switch", { path: "/etc" });
  assert.equal(status, 400);
  assert.equal(json.error, translate("pt", "error.notAWorktree"));
  assert.equal(process.cwd(), fixture.root, "o cwd nao pode ter mudado");
});

test("POST /api/worktrees/switch sem path e 400", async () => {
  const { status, json } = await api.post("/api/worktrees/switch", {});
  assert.equal(status, 400);
  assert.equal(json.error, translate("pt", "error.pathRequired"));
});

test("ciclo completo de branch: criar, renomear, checkout, deletar", async () => {
  const criada = await api.post("/api/branch/create", { name: "temporaria", startPoint: "main" });
  assert.equal(criada.status, 200);
  assert.equal(criada.json.ok, true);
  assert.deepEqual(criada.json.argv.slice(0, 2), ["git", "branch"]);

  const renomeada = await api.post("/api/branch/rename", { from: "temporaria", to: "renomeada" });
  assert.equal(renomeada.json.ok, true);

  const checkout = await api.post("/api/checkout", { ref: "renomeada" });
  assert.equal(checkout.json.ok, true);
  assert.equal((await api.get("/api/refs")).json.head.branch, "renomeada");

  await api.post("/api/checkout", { ref: "main" });
  const deletada = await api.post("/api/branch/delete-local", { name: "renomeada", force: true });
  assert.equal(deletada.json.ok, true);
  assert.ok(!(await api.get("/api/refs")).json.branches.some((b) => b.name === "renomeada"));
});

test("nome de branch comecando com - e recusado antes de virar comando", async () => {
  const { status, json } = await api.post("/api/branch/create", { name: "--upload-pack=curl" });
  assert.equal(status, 400);
  assert.equal(json.error, translate("pt", "error.argsDash", { field: "name" }));
});

test("stage, commit e unstage", async () => {
  fs.writeFileSync(path.join(fixture.root, "novo.txt"), "conteudo\n");

  const staged = await api.post("/api/stage", { paths: ["novo.txt"] });
  assert.equal(staged.json.ok, true);
  const comStage = await api.get("/api/status");
  assert.equal(comStage.json.entries.find((e) => e.path === "novo.txt").staged, true);

  const unstaged = await api.post("/api/unstage", { paths: ["novo.txt"] });
  assert.equal(unstaged.json.ok, true);
  assert.equal(
    (await api.get("/api/status")).json.entries.find((e) => e.path === "novo.txt").untracked,
    true,
  );

  await api.post("/api/stage", { paths: ["novo.txt"] });
  const commitado = await api.post("/api/commit", { message: "feat: arquivo novo pela API" });
  assert.equal(commitado.json.ok, true);
  assert.equal((await api.get("/api/status")).json.clean, true);

  const log = await api.get("/api/log?limit=1");
  assert.equal(log.json.commits[0].subject, "feat: arquivo novo pela API");
});

test("POST /api/commit sem mensagem e 400", async () => {
  const { status, json } = await api.post("/api/commit", {});
  assert.equal(status, 400);
  assert.equal(json.error, translate("pt", "error.messageRequired"));
});

test("stash: push, listagem e drop", async () => {
  fs.writeFileSync(path.join(fixture.root, "README.md"), "# fixture mexida\n");

  const guardado = await api.post("/api/stash/push", { message: "mexida no readme" });
  assert.equal(guardado.json.ok, true);
  assert.equal((await api.get("/api/status")).json.clean, true);

  const refs = await api.get("/api/refs");
  assert.equal(refs.json.stashes.length, 1);
  assert.equal(refs.json.stashes[0].ref, "stash@{0}");
  assert.equal(refs.json.stashes[0].message, "mexida no readme");
  assert.equal(refs.json.stashes[0].branch, "main");

  const aplicado = await api.post("/api/stash/apply", { ref: "stash@{0}", pop: true });
  assert.equal(aplicado.json.ok, true);
  assert.equal((await api.get("/api/status")).json.clean, false);

  await api.post("/api/discard", { paths: ["README.md"] });
  assert.equal((await api.get("/api/status")).json.clean, true);
});

test("tag: criar anotada e deletar", async () => {
  const criada = await api.post("/api/tag/create", {
    name: "v9.9",
    ref: "main",
    message: "tag pela API",
  });
  assert.equal(criada.json.ok, true);

  const refs = await api.get("/api/refs");
  const tag = refs.json.tags.find((t) => t.name === "v9.9");
  assert.equal(tag.annotated, true);
  assert.equal(tag.message, "tag pela API");

  const deletada = await api.post("/api/tag/delete", { name: "v9.9" });
  assert.equal(deletada.json.ok, true);
  assert.ok(!(await api.get("/api/refs")).json.tags.some((t) => t.name === "v9.9"));
});

test("cherry-pick reordena os hashes na ordem topologica", async () => {
  // A branch sai do commit RAIZ: os dois commits de login ainda nao existem la.
  await api.post("/api/branch/create", {
    name: "alvo-cherry",
    startPoint: fixture.hashes.primeiro,
    checkout: true,
  });

  // Manda na ordem ERRADA de proposito. Sem reordenacao, aplicar login2 antes
  // de login1 daria conflito: o arquivo que ele altera ainda nem existe.
  const resultado = await api.post("/api/ops/cherry-pick", {
    commits: [fixture.hashes.login2, fixture.hashes.login1],
  });
  assert.equal(resultado.status, 200);
  assert.equal(resultado.json.ok, true, resultado.json.stderr);

  // O /api/log e `--all`: para conferir a ordem DESTA branch, olha so ela.
  const daBranch = await api.post("/api/raw", {
    args: ["log", "--format=%s", "alvo-cherry"],
  });
  assert.deepEqual(daBranch.json.stdout.trim().split("\n"), [
    "fix: valida a senha",
    "feat: tela de login",
    "primeiro commit",
  ]);

  await api.post("/api/checkout", { ref: "main" });
  await api.post("/api/branch/delete-local", { name: "alvo-cherry", force: true });
});

test("merge --no-ff cria commit de merge", async () => {
  await api.post("/api/branch/create", { name: "para-merge", startPoint: "main", checkout: true });
  fs.writeFileSync(path.join(fixture.root, "merge.txt"), "a\n");
  await api.post("/api/stage", { paths: ["merge.txt"] });
  await api.post("/api/commit", { message: "feat: alvo do merge" });

  const merged = await api.post("/api/ops/merge", {
    source: "para-merge",
    into: "main",
    noFf: true,
    message: "merge: para-merge",
  });
  assert.equal(merged.json.ok, true, merged.json.stderr);

  const log = await api.get("/api/log?limit=1");
  assert.equal(log.json.commits[0].subject, "merge: para-merge");
  assert.equal(log.json.commits[0].parents.length, 2);
});

test("conflito responde 200 com ok:false e pending preenchido", async () => {
  // Duas branches mexendo na MESMA linha do MESMO arquivo.
  git(fixture.root, "checkout", "-q", "-b", "conflito-a", "main");
  fs.writeFileSync(path.join(fixture.root, "briga.txt"), "lado A\n");
  git(fixture.root, "add", "-A");
  git(fixture.root, "commit", "-q", "-m", "lado A");

  git(fixture.root, "checkout", "-q", "-b", "conflito-b", "main");
  fs.writeFileSync(path.join(fixture.root, "briga.txt"), "lado B\n");
  git(fixture.root, "add", "-A");
  git(fixture.root, "commit", "-q", "-m", "lado B");

  const resultado = await api.post("/api/ops/merge", { source: "conflito-a" });
  assert.equal(resultado.status, 200, "conflito NAO e erro de servidor");
  assert.equal(resultado.json.ok, false);
  assert.ok(resultado.json.pending, "pending tem de vir preenchido");
  assert.equal(resultado.json.pending.kind, "merge");
  assert.deepEqual(resultado.json.pending.conflicts, ["briga.txt"]);

  const refs = await api.get("/api/refs");
  assert.equal(refs.json.head.pending.kind, "merge");
  assert.deepEqual(refs.json.head.pending.conflicts, ["briga.txt"]);

  const abortado = await api.post("/api/ops/abort", { kind: "merge" });
  assert.equal(abortado.json.ok, true);
  assert.equal((await api.get("/api/refs")).json.head.pending, null);

  await api.post("/api/checkout", { ref: "main" });
});

test("comando git que falha de verdade vira 409 com o command no envelope", async () => {
  const { status, json } = await api.post("/api/checkout", { ref: "branch-que-nao-existe" });
  assert.equal(status, 409);
  assert.ok(json.error.length > 0);
  assert.ok(json.command, "o ApiError carrega o GitCommandResult");
  assert.equal(json.command.ok, false);
  assert.deepEqual(json.command.argv.slice(0, 2), ["git", "checkout"]);
  assert.ok(json.command.stderr.length > 0);
});

test("POST /api/ops/reset volta o HEAD", async () => {
  const antes = await api.get("/api/log?limit=2");
  const alvo = antes.json.commits[1].hash;
  const resultado = await api.post("/api/ops/reset", { ref: alvo, mode: "hard" });
  assert.equal(resultado.json.ok, true);
  assert.equal((await api.get("/api/refs")).json.head.hash, alvo);
});

test("POST /api/ops/reset com mode invalido e 400", async () => {
  const { status, json } = await api.post("/api/ops/reset", { ref: "HEAD", mode: "meio-termo" });
  assert.equal(status, 400);
  assert.match(json.error, /soft, mixed ou hard/);
});

test("POST /api/raw executa comando cru e bloqueia os que travariam", async () => {
  const ok = await api.post("/api/raw", { args: ["rev-parse", "--abbrev-ref", "HEAD"] });
  assert.equal(ok.json.ok, true);
  assert.equal(ok.json.stdout.trim(), "main");

  const bloqueado = await api.post("/api/raw", { args: ["mergetool"] });
  assert.equal(bloqueado.status, 400);
  assert.match(bloqueado.json.error, /nao pode rodar/);
});

test("worktree add, prune e remove", async () => {
  const novo = path.join(fixture.base, "wt-api");
  const adicionada = await api.post("/api/worktrees/add", { path: novo, newBranch: "via-api" });
  assert.equal(adicionada.json.ok, true, adicionada.json.stderr);
  assert.equal((await api.get("/api/worktrees")).json.worktrees.length, 3);

  const removida = await api.post("/api/worktrees/remove", { path: novo, force: true });
  assert.equal(removida.json.ok, true);
  assert.equal((await api.get("/api/worktrees")).json.worktrees.length, 2);

  const podada = await api.post("/api/worktrees/prune");
  assert.equal(podada.json.ok, true);
});

test("nao da para remover a worktree em que o servidor esta", async () => {
  const { status, json } = await api.post("/api/worktrees/remove", { path: fixture.root });
  assert.equal(status, 409);
  assert.equal(json.error, translate("pt", "error.removeCurrentWorktree"));
});

test("credenciais: GET nunca devolve o token", async () => {
  const salvo = await api.post("/api/credentials", {
    host: "github.com",
    username: "fulano",
    token: "ghp_super_secreto_1234",
  });
  assert.equal(salvo.status, 200);

  const listado = await api.get("/api/credentials");
  assert.equal(listado.json.entries.length, 1);
  assert.equal(listado.json.entries[0].host, "github.com");
  assert.equal(listado.json.entries[0].username, "fulano");
  assert.equal(listado.json.entries[0].token, undefined, "o token NUNCA volta");
  assert.ok(!listado.text.includes("ghp_super_secreto_1234"), "nem no corpo cru");

  const removido = await api.del("/api/credentials/github.com");
  assert.equal(removido.status, 200);
  assert.equal((await api.get("/api/credentials")).json.entries.length, 0);
});

test("rota inexistente e 404 no envelope ApiError", async () => {
  const { status, json } = await api.get("/api/nao-existe");
  assert.equal(status, 404);
  assert.match(json.error, new RegExp(translate("pt", "error.routeMissing", { method: "GET", path: "/nao-existe" })));
});

test("metodo errado e 405 com header Allow", async () => {
  const res = await api.fetchRaw("/api/log", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("allow"), "GET");
});

test("POST com content-type errado e 415", async () => {
  const res = await api.fetchRaw("/api/stage", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "paths=1",
  });
  assert.equal(res.status, 415);
  const json = await res.json();
  assert.match(json.error, /content-type/);
});

test("corpo acima de 4 MB e 413", async () => {
  const grande = JSON.stringify({ message: "x".repeat(5 * 1024 * 1024) });
  const res = await api.fetchRaw("/api/commit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: grande,
  });
  assert.equal(res.status, 413);
});

test("guarda de origem: Host remoto e 403", async () => {
  const res = await api.rawRequest("/api/repo", { headers: { host: "evil.example.com" } });
  assert.equal(res.status, 403, "DNS rebinding: o dominio resolve para 127.0.0.1, o Host nao mente");
  assert.equal(res.json.error, translate("en", "error.originRefused"));

  // Com Host local a mesma requisicao crua passa.
  const ok = await api.rawRequest("/api/repo", { headers: { host: `127.0.0.1:${api.port}` } });
  assert.equal(ok.status, 200);
});

test("guarda de origem: Origin de outro site e 403", async () => {
  const res = await api.fetchRaw("/api/repo", { headers: { origin: "https://evil.example.com" } });
  assert.equal(res.status, 403);
});

test("WebSocket: ping responde pong e refresh emite repo:changed", async () => {
  const ws = api.connectWs();
  await ws.open();
  await ws.waitFor("hello");

  ws.send({ type: "ping", ts: 123 });
  const pong = await ws.waitFor("pong");
  assert.ok(pong.ts > 0);

  ws.send({ type: "refresh", what: "manual" });
  const mudou = await ws.waitFor("repo:changed");
  assert.equal(mudou.reason, "manual");

  await ws.close();
});

test("WebSocket: git:command faz streaming de start ate exit", async () => {
  const ws = api.connectWs();
  await ws.open();
  await ws.waitFor("hello");

  await api.post("/api/raw", { args: ["log", "-1", "--format=%s"] });

  const start = ws.received.find((e) => e.type === "git:command" && e.phase === "start");
  assert.ok(start, "o console da UI precisa do argv");
  assert.deepEqual(start.argv.slice(0, 2), ["git", "log"]);
  assert.equal(start.cwd, fixture.root);

  const exit = ws.received.find((e) => e.type === "git:command" && e.phase === "exit");
  assert.ok(exit, "e do resultado completo no fim");
  assert.equal(exit.id, start.id);
  assert.equal(exit.result.ok, true);
  assert.ok(exit.result.durationMs >= 0);

  await ws.close();
});

test("comando de rede emite op:progress", async () => {
  const ws = api.connectWs();
  await ws.open();
  await ws.waitFor("hello");

  // Remoto que nao existe: o fetch falha, mas o git ainda escreve progresso.
  await api.post("/api/remotes/add", {
    name: "fantasma",
    url: path.join(fixture.base, "nao-existe.git"),
  });
  await api.post("/api/net/fetch", { remote: "fantasma" }).catch(() => {});
  await new Promise((r) => setTimeout(r, 150));

  const progresso = ws.received.filter((e) => e.type === "op:progress");
  assert.ok(progresso.length > 0, "a UI precisa de op:progress para a barra");
  assert.equal(progresso[0].op, "fetch");
  assert.ok(progresso[0].message.length > 0);

  await api.post("/api/remotes/remove", { name: "fantasma" });
  await ws.close();
});

test("leitura silenciosa NAO polui o console da UI", async () => {
  const ws = api.connectWs();
  await ws.open();
  await ws.waitFor("hello");

  // Refresh automatico: log + refs + status sao leituras puras.
  await api.get("/api/log");
  await api.get("/api/refs");
  await api.get("/api/status");
  await new Promise((r) => setTimeout(r, 120));

  const comandos = ws.received.filter((e) => e.type === "git:command");
  assert.equal(comandos.length, 0, "senao o console vira ruido a cada refresh do watcher");

  await ws.close();
});

test("o watcher emite repo:changed quando o .git muda por fora", async () => {
  const ws = api.connectWs();
  await ws.open();
  await ws.waitFor("hello");

  // Mudanca por FORA do servidor: nao ha janela de supressao ativa.
  git(fixture.root, "branch", "vinda-de-fora");

  const evento = await ws.waitFor("repo:changed", 8_000);
  assert.ok(["refs", "head", "index", "worktree", "config", "rebase-state"].includes(evento.reason));

  await ws.close();
  git(fixture.root, "branch", "-D", "vinda-de-fora");
});

/* ------------------------------------------------------------------ *
 * Blame — `git blame --porcelain`
 * ------------------------------------------------------------------ */

test("GET /api/blame devolve BlamePayload para um arquivo de texto", async () => {
  const { status, json } = await api.get("/api/blame?path=README.md");
  assert.equal(status, 200);
  assert.equal(json.path, "README.md");
  assert.equal(typeof json.hash, "string", "resolveu para o hash de HEAD");
  assert.ok(json.hash.length === 40);
  assert.ok(json.lines.length > 0, "o README tem pelo menos uma linha");

  const primeira = json.lines[0];
  assert.equal(primeira.lineNumber, 1);
  assert.equal(typeof primeira.hash, "string");
  assert.ok(primeira.hash.length === 40);
  assert.equal(typeof primeira.author, "string", "campo author presente");
  assert.equal(typeof primeira.email, "string", "campo email presente");
  assert.equal(typeof primeira.date, "number", "timestamp Unix");
  assert.ok(primeira.date > 0);
  assert.equal(typeof primeira.tz, "string");
  assert.equal(typeof primeira.summary, "string");
  assert.equal(typeof primeira.content, "string", "a linha veio");
});

test("GET /api/blame com hash especifico devolve blame daquele commit", async () => {
  const primeiro = fixture.hashes.primeiro;
  const { status, json } = await api.get(`/api/blame?path=README.md&hash=${primeiro}`);
  assert.equal(status, 200);
  assert.equal(json.hash, primeiro);
  // O primeiro commit so tem uma linha: "# fixture"
  assert.equal(json.lines.length, 1);
  assert.equal(json.lines[0].content, "# fixture");
  assert.equal(json.lines[0].author, "Teste GitCraque");
});

test("GET /api/blame em arquivo que nao existe da 404", async () => {
  const { status, json } = await api.get("/api/blame?path=arquivo-que-nao-existe.txt");
  assert.equal(status, 404);
  assert.ok(json.error);
});

test("GET /api/blame sem path da erro de validacao", async () => {
  const { status, json } = await api.get("/api/blame");
  assert.equal(status, 400);
});

test("GET /api/blame com hash que nao existe da 404", async () => {
  const { status, json } = await api.get("/api/blame?path=README.md&hash=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
  assert.equal(status, 404);
});

/* ------------------------------------------------------------------ *
 * Idioma da resposta de erro
 *
 * O backend nao guarda idioma: ele o escolhe POR REQUISICAO. Um processo
 * local pode ter varias abas abertas, cada uma na sua lingua.
 * ------------------------------------------------------------------ */

/** A mesma rota inexistente em cada idioma, sem reiniciar nada. */
const erroEmIdioma = (headers) =>
  api
    .rawRequest("/api/worktrees/switch", {
      method: "POST",
      headers: { host: `127.0.0.1:${api.port}`, "content-type": "application/json", ...headers },
      body: JSON.stringify({}),
    })
    .then((res) => res.json.error);

test("o erro sai no idioma que a requisicao pediu", async () => {
  assert.equal(await erroEmIdioma({ "x-gitcraque-lang": "pt" }), translate("pt", "error.pathRequired"));
  assert.equal(await erroEmIdioma({ "x-gitcraque-lang": "es" }), translate("es", "error.pathRequired"));
  assert.equal(await erroEmIdioma({ "x-gitcraque-lang": "zh" }), translate("zh", "error.pathRequired"));
  assert.equal(await erroEmIdioma({ "x-gitcraque-lang": "en" }), translate("en", "error.pathRequired"));
});

test("sem o cabecalho explicito, vale o accept-language do navegador", async () => {
  assert.equal(
    await erroEmIdioma({ "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" }),
    translate("pt", "error.pathRequired"),
  );
  // Ordem de `q`, nao ordem de escrita: o espanhol ganha do ingles aqui.
  assert.equal(
    await erroEmIdioma({ "accept-language": "en;q=0.3,es;q=0.9" }),
    translate("es", "error.pathRequired"),
  );
});

test("idioma que o servidor nao fala cai no ingles", async () => {
  assert.equal(await erroEmIdioma({ "accept-language": "fi-FI,fi" }), translate("en", "error.pathRequired"));
  assert.equal(await erroEmIdioma({}), translate("en", "error.pathRequired"));
});

test("a escolha da interface ganha do accept-language do navegador", async () => {
  assert.equal(
    await erroEmIdioma({ "accept-language": "en-US,en", "x-gitcraque-lang": "zh" }),
    translate("zh", "error.pathRequired"),
  );
});

test("mensagem do PROPRIO git nunca e traduzida — passa como o git a emitiu", async () => {
  const res = await api.post("/api/checkout", { ref: "nao-existe-esta-branch" });
  assert.equal(res.status, 409);
  // O texto vem do stderr do git, em ingles, e nao casa com chave nenhuma do
  // catalogo: `translate` devolve undefined e a borda usa a string crua.
  assert.doesNotMatch(res.json.error, /^error\./, "a chave crua vazou para a UI");
  assert.match(res.json.error, /nao-existe-esta-branch/);
});

/* ------------------------------------------------------------------ *
 * Clone
 * ------------------------------------------------------------------ */

test("POST /api/repos/clone clona um repo local e ja o abre", async () => {
  const destino = path.join(os.tmpdir(), `gitcraque-clone-ok-${Date.now()}`);
  try {
    const ws = api.connectWs();
    await ws.open();
    await ws.waitFor("hello");

    // Clona o fixture como se fosse um remoto local
    const res = await api.post("/api/repos/clone", {
      url: fixture.root,
      path: destino,
    });
    assert.equal(res.status, 200, res.json.error);
    assert.equal(res.json.isRepo, true);
    assert.equal(res.json.cwd, destino);
    assert.equal(res.json.name, path.basename(destino));
    assert.ok(fs.existsSync(path.join(destino, ".git")), "o .git tem de existir");

    // O cwd:changed chega porque o clone abre o repo
    const evento = await ws.waitFor("cwd:changed");
    assert.equal(evento.cwd, destino);

    // Volta para o fixture para nao contaminar os testes seguintes.
    // O clone deixa o servidor num repositorio DIFERENTE: a volta e via
    // POST /repos/open, nao /worktrees/switch (que so troca entre worktrees
    // do MESMO repo).
    const voltou = await api.post("/api/repos/open", { path: fixture.root });
    assert.equal(voltou.status, 200);
    await ws.close();
  } finally {
    fs.rmSync(destino, { recursive: true, force: true });
  }
});

test("POST /api/repos/clone recusa destino que ja existe", async () => {
  const destino = path.join(os.tmpdir(), `gitcraque-clone-exists-${Date.now()}`);
  fs.mkdirSync(destino);
  try {
    const res = await api.post("/api/repos/clone", {
      url: fixture.root,
      path: destino,
    });
    assert.equal(res.status, 409);
    assert.equal(res.json.error, translate("pt", "error.cloneTargetExists"));
  } finally {
    fs.rmSync(destino, { recursive: true, force: true });
  }
});

test("POST /api/repos/clone sem url e 400", async () => {
  const res = await api.post("/api/repos/clone", {
    path: path.join(os.tmpdir(), `gitcraque-clone-sem-url-${Date.now()}`),
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, translate("pt", "error.urlRequired"));
});

test("POST /api/repos/clone sem path e 400", async () => {
  const res = await api.post("/api/repos/clone", { url: fixture.root });
  assert.equal(res.status, 400);
  assert.equal(res.json.error, translate("pt", "error.pathRequired"));
});

test("POST /api/repos/clone com url invalida retorna 409 com o comando", async () => {
  const destino = path.join(os.tmpdir(), `gitcraque-clone-invalido-${Date.now()}`);
  try {
    const res = await api.post("/api/repos/clone", {
      url: "/caminho/que/nao/existe.git",
      path: destino,
    });
    assert.equal(res.status, 409);
    assert.ok(res.json.command, "o ApiError carrega o GitCommandResult");
    assert.equal(res.json.command.ok, false);
    assert.ok(res.json.command.stderr.length > 0);
  } finally {
    fs.rmSync(destino, { recursive: true, force: true });
  }
});
