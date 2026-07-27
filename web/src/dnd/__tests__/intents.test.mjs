/**
 * A matriz de intencoes do motor semantico de drag-and-drop.
 *
 *   node --test web/src/dnd/__tests__/intents.test.mjs
 *
 * `intents.ts` nao tem um unico import de RUNTIME (so `import type`), entao o
 * Node roda o TypeScript direto com type stripping — sem bundler, sem alias.
 *
 * A ultima suite e a que mais importa: ela confere, LENDO `web/src/lib/api.ts`,
 * que todo `endpoint` que o motor emite existe de verdade e que todo campo de
 * `body` esta declarado na assinatura correspondente. Um erro desses nao aparece
 * em typecheck (o body e `Record<string, unknown>`) — so em runtime, no clique
 * do usuario.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { INTENT_ENDPOINTS, resolveDragIntent } from "../intents.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API_FILE = path.resolve(HERE, "../../lib/api.ts");

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const commit = (key = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0", label = "feat: algo") => ({
  type: "commit",
  key,
  label,
  detail: label,
});

const branchDrag = (key, label = key) => ({ type: "branch", key, label });
const branchDrop = (key, label = key) => ({ type: "branch", key, label });
const remoteBranchDrop = (key, remote = "origin") => ({
  type: "remoteBranch",
  key,
  label: key,
  remote,
});

const mkBranch = (name, extra = {}) => ({
  name,
  fullName: `refs/heads/${name}`,
  target: "0".repeat(40),
  isHead: false,
  ahead: 0,
  behind: 0,
  ...extra,
});

const ctx = (branches = ["main", "feature", "outra"], headBranch = "main") => ({
  refs: {
    head: { branch: headBranch, hash: "0".repeat(40), detached: false, pending: null },
    branches: branches.map((b) => mkBranch(b, { isHead: b === headBranch })),
    remoteBranches: [],
    tags: [],
    remotes: [],
    stashes: [],
  },
  headBranch,
});

/* ------------------------------------------------------------------ */
/* As regras duras                                                     */
/* ------------------------------------------------------------------ */

test("commit sobre ramo => cherry-pick, com uma opcao so", () => {
  const intent = resolveDragIntent(commit(), branchDrop("feature"), ctx());

  assert.equal(intent.kind, "cherry-pick");
  assert.equal(intent.allowed, true);
  assert.equal(intent.options.length, 1, "confirmacao simples: uma opcao");

  const [op] = intent.options;
  assert.equal(op.endpoint, INTENT_ENDPOINTS.cherryPick);
  assert.equal(op.preview[0], "cherry-pick", "a UI mostra o comando cru antes de executar");
  assert.ok(Array.isArray(op.body.commits), "o corpo leva os commits");
  assert.equal(op.body.commits.length, 1);
  assert.ok(intent.title.length > 0 && intent.description.length > 0);
});

test("ramo sobre ramo => exatamente merge e rebase, nesta ordem de intencao", () => {
  const intent = resolveDragIntent(branchDrag("feature"), branchDrop("main"), ctx());

  assert.equal(intent.allowed, true);
  assert.equal(intent.options.length, 2, "a intencao e ambigua: o usuario escolhe");

  const kinds = intent.options.map((o) => o.id).sort();
  assert.deepEqual(kinds, ["merge", "rebase"]);

  const merge = intent.options.find((o) => o.id === "merge");
  const rebase = intent.options.find((o) => o.id === "rebase");

  assert.equal(merge.endpoint, INTENT_ENDPOINTS.merge);
  assert.equal(rebase.endpoint, INTENT_ENDPOINTS.rebase);
  assert.equal(merge.preview[0], "merge");
  assert.equal(rebase.preview[0], "rebase");
});

test("rebase e marcado como destrutivo; merge nao", () => {
  const intent = resolveDragIntent(branchDrag("feature"), branchDrop("main"), ctx());
  const merge = intent.options.find((o) => o.id === "merge");
  const rebase = intent.options.find((o) => o.id === "rebase");

  assert.equal(rebase.destructive, true, "reescreve historico: a UI exige hold-to-confirm");
  assert.equal(merge.destructive, false);
});

test("a descricao do rebase diz QUEM e reescrito", () => {
  // A confusao classica: arrastar `feature` sobre `main` rebaseia FEATURE.
  const intent = resolveDragIntent(branchDrag("feature"), branchDrop("main"), ctx());
  const rebase = intent.options.find((o) => o.id === "rebase");
  const texto = `${rebase.label} ${rebase.description}`.toLowerCase();

  assert.match(texto, /feature/, "o texto tem de nomear o ramo reescrito");
  assert.equal(rebase.body.source, "feature", "source e quem move");
  assert.equal(rebase.body.onto, "main", "onto e a base nova");
});

test("soltar em si mesmo e recusado, com motivo legivel", () => {
  const intent = resolveDragIntent(branchDrag("main"), branchDrop("main"), ctx());

  assert.equal(intent.allowed, false);
  assert.equal(intent.options.length, 0, "recusa nao oferece opcao");
  assert.ok(intent.reason && intent.reason.length > 0, "a UI mostra o motivo no hover");
});

test("commit sobre commit e recusado", () => {
  const alvo = { type: "commit", key: "f".repeat(40), label: "outro commit" };
  const intent = resolveDragIntent(commit(), alvo, ctx());

  assert.equal(intent.allowed, false);
  assert.equal(intent.options.length, 0);
  assert.ok(intent.reason.length > 0);
});

test("commit direto sobre ramo remoto e recusado (nao se aplica commit num remoto)", () => {
  const intent = resolveDragIntent(commit(), remoteBranchDrop("origin/main"), ctx());

  assert.equal(intent.allowed, false);
  assert.ok(intent.reason.length > 0);
});

test("tag arrastada nao vira operacao", () => {
  const tag = { type: "tag", key: "v1.0.0", label: "v1.0.0" };
  const intent = resolveDragIntent(tag, branchDrop("main"), ctx());

  assert.equal(intent.allowed, false);
  assert.ok(intent.reason.length > 0);
});

test("ramo preso em outra worktree recusa a operacao, e diz onde ele esta", () => {
  const contexto = ctx();
  contexto.refs.branches = contexto.refs.branches.map((b) =>
    b.name === "feature" ? { ...b, checkedOutIn: "/tmp/outra-worktree" } : b,
  );

  const intent = resolveDragIntent(commit(), branchDrop("feature"), contexto);

  assert.equal(intent.allowed, false, "o cherry-pick precisaria de checkout do ramo preso");
  assert.match(intent.reason, /worktree/i);
  assert.match(intent.reason, /outra-worktree/);
});

test("toda recusa carrega motivo e nenhuma opcao; toda permissao carrega ao menos uma", () => {
  const tipos = [
    [commit(), branchDrop("feature")],
    [commit(), { type: "commit", key: "f".repeat(40), label: "x" }],
    [branchDrag("feature"), branchDrop("main")],
    [branchDrag("main"), branchDrop("main")],
    [branchDrag("feature"), remoteBranchDrop("origin/main")],
    [{ type: "tag", key: "v1", label: "v1" }, branchDrop("main")],
    [{ type: "stash", key: "stash@{0}", label: "stash@{0}" }, branchDrop("main")],
  ];

  for (const [source, target] of tipos) {
    const intent = resolveDragIntent(source, target, ctx());
    const onde = `${source.type} -> ${target.type}`;
    if (intent.allowed) {
      assert.ok(intent.options.length > 0, `${onde}: permitido tem de oferecer opcao`);
      for (const op of intent.options) {
        assert.ok(op.preview.length > 0, `${onde}: toda opcao mostra o argv cru`);
        assert.ok(op.endpoint.startsWith("/"), `${onde}: endpoint absoluto`);
        assert.equal(typeof op.destructive, "boolean", `${onde}: destructive declarado`);
      }
    } else {
      assert.equal(intent.options.length, 0, `${onde}: recusa nao oferece opcao`);
      assert.ok(intent.reason?.length > 0, `${onde}: recusa tem motivo`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* O contrato com `lib/api.ts` — o erro que so aparece em runtime      */
/* ------------------------------------------------------------------ */

/**
 * Extrai de `api.ts`, para cada caminho REST, os nomes de campo declarados na
 * assinatura do `body`. Ex.:
 *
 *   merge: (body: { source: string; into?: string; noFf?: boolean }) =>
 *     post<GitCommandResult>("/ops/merge", body),
 *
 * devolve { "/ops/merge": Set{source, into, noFf} }.
 */
function readApiSignatures() {
  const src = fs.readFileSync(API_FILE, "utf8");
  const mapa = new Map();

  // Cada metodo comeca em `nome: (body: {` e termina no `post<...>("/caminho"`.
  const re = /\(body:\s*\{([^}]*)\}[^)]*\)\s*=>\s*\w+<[^>]*>\(\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    const campos = new Set(
      m[1]
        .split(";")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => p.split(/[?:]/)[0].trim())
        .filter((p) => /^[a-zA-Z_$][\w$]*$/.test(p)),
    );
    mapa.set(m[2], campos);
  }
  return mapa;
}

test("todo endpoint do motor existe em lib/api.ts", () => {
  const assinaturas = readApiSignatures();
  assert.ok(assinaturas.size > 5, "o parser de api.ts encontrou assinaturas");

  for (const [nome, caminho] of Object.entries(INTENT_ENDPOINTS)) {
    assert.ok(
      assinaturas.has(caminho),
      `INTENT_ENDPOINTS.${nome} aponta para ${caminho}, que nao existe em lib/api.ts`,
    );
  }
});

test("todo campo de body que o motor emite esta declarado em lib/api.ts", () => {
  const assinaturas = readApiSignatures();

  // Varre a matriz inteira e coleta todas as opcoes que o motor consegue gerar.
  const fontes = [
    commit(),
    branchDrag("feature"),
    branchDrag("main"),
    { type: "remoteBranch", key: "origin/main", label: "origin/main", remote: "origin" },
    { type: "tag", key: "v1", label: "v1" },
    { type: "stash", key: "stash@{0}", label: "stash@{0}" },
  ];
  const alvos = [
    branchDrop("main"),
    branchDrop("feature"),
    remoteBranchDrop("origin/main"),
    { type: "commit", key: "f".repeat(40), label: "commit alvo" },
    { type: "tag", key: "v2", label: "v2" },
    { type: "trash", key: "trash", label: "lixeira" },
  ];

  let conferidas = 0;
  for (const source of fontes) {
    for (const target of alvos) {
      const intent = resolveDragIntent(source, target, ctx());
      if (!intent.allowed) continue;
      for (const op of intent.options) {
        const declarados = assinaturas.get(op.endpoint);
        assert.ok(declarados, `${op.endpoint} nao existe em lib/api.ts`);
        for (const campo of Object.keys(op.body)) {
          assert.ok(
            declarados.has(campo),
            `${source.type} -> ${target.type} (${op.id}) manda "${campo}" para ${op.endpoint}, ` +
              `que so aceita: ${[...declarados].join(", ")}`,
          );
        }
        conferidas += 1;
      }
    }
  }

  assert.ok(conferidas >= 3, `conferiu poucas opcoes (${conferidas}) — a matriz mudou?`);
  console.log(`      ${conferidas} opcoes conferidas campo a campo contra lib/api.ts`);
});

test("o motor e puro: a mesma entrada devolve o mesmo resultado", () => {
  const a = resolveDragIntent(branchDrag("feature"), branchDrop("main"), ctx());
  const b = resolveDragIntent(branchDrag("feature"), branchDrop("main"), ctx());
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});
