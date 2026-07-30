/**
 * Backend falso, SO para desenvolvimento da casca.
 *
 * Enquanto o `server/**` esta sendo escrito por outra frente, `?mock=1` liga
 * este modulo, que intercepta `fetch` e `WebSocket` e serve os payloads
 * capturados de um repositorio git de verdade (`fixtures.ts`). Assim da para
 * OLHAR a interface — e ver o console encher de comandos — sem inventar rota
 * nem tocar em `lib/api.ts` ou `lib/ws.ts`, que sao congelados.
 *
 * Fora do `?mock=1` este arquivo nunca e importado: o `main.tsx` so faz o
 * import dinamico quando a flag esta na url.
 */
import { selectCommit } from "@/state/store";
import type { GitCommandResult, ServerEvent } from "@/types/git";
import { MOCK, type MockData } from "./fixtures";

/* ------------------------------------------------------------------ */
/* Estado mutavel do repositorio falso                                 */
/* ------------------------------------------------------------------ */

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const state: MockData = clone(MOCK);

const listeners = new Set<(event: ServerEvent) => void>();
const emit = (event: ServerEvent) => {
  for (const l of listeners) l(event);
};

let commandSeq = 0;

/** Publica o ciclo start → stdout → exit de um comando, como o backend faria. */
function announce(argv: string[], stdout = "", exitCode = 0, durationMs = 12 + Math.round(Math.random() * 90)) {
  const id = `mock-${commandSeq++}`;
  const result: GitCommandResult = {
    ok: exitCode === 0,
    argv,
    cwd: state.repo.cwd,
    stdout,
    stderr: "",
    exitCode,
    signal: null,
    durationMs,
  };
  emit({ type: "git:command", id, phase: "start", argv, cwd: state.repo.cwd });
  if (stdout) emit({ type: "git:command", id, phase: "stdout", chunk: stdout });
  emit({ type: "git:command", id, phase: "exit", result });
  return result;
}

const recompute = () => {
  state.status.clean = state.status.entries.length === 0;
};

/* ------------------------------------------------------------------ */
/* Rotas                                                               */
/* ------------------------------------------------------------------ */

type Handler = (body: Record<string, unknown>, query: URLSearchParams) => unknown;

const GET: Record<string, Handler> = {
  "/health": () => ({ ok: true, version: "0.1.0-mock" }),
  "/repo": () => state.repo,
  "/log": () => state.log,
  "/refs": () => state.refs,
  "/status": () => state.status,
  "/worktrees": () => state.worktrees,
  "/remotes": () => ({ remotes: state.repo.remotes }),
  "/credentials": () => ({ entries: [{ host: "github.com", username: "ana", masked: "ghp_••••", createdAt: Date.now() }] }),
  "/diff": (_body, query) => {
    const hash = query.get("hash");
    if (hash) return state.commitDiffs[hash] ?? [];
    return query.get("staged") === "true" ? state.stagedDiff : state.worktreeDiff;
  },
};

const POST: Record<string, Handler> = {
  "/worktrees/switch": (body) => {
    const path = String(body.path);
    for (const wt of state.worktrees.worktrees) wt.isActive = wt.path === path;
    state.worktrees.cwd = path;
    state.repo.cwd = path;
    state.log.cwd = path;
    state.status.cwd = path;
    const worktree = state.worktrees.worktrees.find((w) => w.path === path) ?? null;
    if (worktree?.branch) {
      state.repo.head.branch = worktree.branch;
      state.refs.head.branch = worktree.branch;
      state.status.branch = worktree.branch;
      for (const b of state.refs.branches) b.isHead = b.name === worktree.branch;
    }
    announce(["worktree", "list", "--porcelain"], `worktree ${path}\n`);
    setTimeout(() => emit({ type: "cwd:changed", cwd: path, worktree, mainRoot: state.worktrees.mainRoot }), 60);
    return state.worktrees;
  },
  "/stage": (body) => {
    const paths = (body.paths as string[]) ?? [];
    for (const entry of state.status.entries) {
      if (!paths.includes(entry.path)) continue;
      entry.staged = true;
      entry.unstaged = false;
      entry.untracked = false;
      entry.indexStatus = entry.indexStatus ?? entry.worktreeStatus ?? "modified";
      entry.code = `${entry.code[0] === "." ? "M" : entry.code[0]}.`;
    }
    recompute();
    return announce(["add", "--", ...paths]);
  },
  "/unstage": (body) => {
    const paths = (body.paths as string[]) ?? [];
    for (const entry of state.status.entries) {
      if (!paths.includes(entry.path)) continue;
      entry.staged = false;
      entry.unstaged = true;
      entry.code = `.${entry.code[1] === "." ? "M" : entry.code[1]}`;
    }
    recompute();
    return announce(["restore", "--staged", "--", ...paths]);
  },
  "/discard": (body) => {
    const paths = (body.paths as string[]) ?? [];
    state.status.entries = state.status.entries.filter((e) => !paths.includes(e.path));
    recompute();
    return announce(["checkout", "--", ...paths]);
  },
  "/commit": (body) => {
    const message = String(body.message ?? "");
    const staged = state.status.entries.filter((e) => e.staged);
    state.status.entries = state.status.entries.filter((e) => !e.staged);
    recompute();
    const hash = `${Date.now().toString(16).padStart(40, "0")}`.slice(-40);
    state.log.commits.unshift({
      hash,
      parents: [state.repo.head.hash ?? ""],
      authorName: "Ana Ribeiro",
      authorEmail: "ana@exemplo.dev",
      subject: message.split("\n")[0] || "(sem assunto)",
      relativeDate: "just now",
      decorationRaw: ` (HEAD -> ${state.repo.head.branch})`,
      refs: [
        {
          kind: "localBranch",
          name: state.repo.head.branch ?? "HEAD",
          fullName: `refs/heads/${state.repo.head.branch}`,
          isHead: true,
        },
      ],
    });
    state.log.total += 1;
    state.log.empty = false;
    state.repo.head.hash = hash;
    state.refs.head.hash = hash;
    return announce(["commit", "-m", message], `[${state.repo.head.branch} ${hash.slice(0, 7)}] ${message}\n ${staged.length} files changed\n`);
  },
  "/net/fetch": () => announce(["fetch", "--all", "--prune"], "Fetching origin\n"),
  "/net/pull": () => announce(["pull"], "Already up to date.\n"),
  "/net/push": (body) =>
    announce(["push", String(body.remote ?? "origin"), String(body.branch ?? "")], "Everything up-to-date\n"),
  "/branch/create": (body) => {
    const name = String(body.name);
    state.refs.branches.push({
      name,
      fullName: `refs/heads/${name}`,
      target: state.repo.head.hash ?? "",
      isHead: false,
      ahead: 0,
      behind: 0,
    });
    return announce(["branch", name]);
  },
  "/branch/delete-local": (body) => {
    const name = String(body.name);
    state.refs.branches = state.refs.branches.filter((b) => b.name !== name);
    return announce(["branch", body.force ? "-D" : "-d", name], `Deleted branch ${name}\n`);
  },
  "/branch/delete-remote": (body) =>
    announce(["push", String(body.remote), "--delete", String(body.name)], ` - [deleted]  ${body.name}\n`),
  "/branch/rename": (body) => {
    const from = String(body.from);
    const to = String(body.to);
    for (const b of state.refs.branches) {
      if (b.name !== from) continue;
      b.name = to;
      b.fullName = `refs/heads/${to}`;
    }
    return announce(["branch", "-m", from, to]);
  },
  "/checkout": (body) => {
    const ref = String(body.ref);
    for (const b of state.refs.branches) b.isHead = b.name === ref;
    state.repo.head.branch = ref;
    state.refs.head.branch = ref;
    state.status.branch = ref;
    return announce(["checkout", ref], `Switched to branch '${ref}'\n`);
  },
  "/remotes/add": (body) => {
    const remote = { name: String(body.name), fetchUrl: String(body.url), pushUrl: String(body.url), https: /^https/.test(String(body.url)) };
    state.repo.remotes.push(remote);
    state.refs.remotes.push(remote);
    return announce(["remote", "add", remote.name, remote.fetchUrl]);
  },
  "/remotes/remove": (body) => {
    const name = String(body.name);
    state.repo.remotes = state.repo.remotes.filter((r) => r.name !== name);
    state.refs.remotes = state.refs.remotes.filter((r) => r.name !== name);
    return announce(["remote", "remove", name]);
  },
  "/remotes/set-url": (body) => announce(["remote", "set-url", String(body.name), String(body.url)]),
  "/stash/push": (body) => {
    state.refs.stashes.unshift({
      index: 0,
      ref: `stash@{${state.refs.stashes.length}}`,
      message: String(body.message ?? "rascunho"),
      branch: state.repo.head.branch ?? "main",
      hash: state.repo.head.hash ?? "",
      relativeDate: "just now",
    });
    state.status.entries = [];
    recompute();
    return announce(["stash", "push"]);
  },
  "/stash/apply": (body) => announce(["stash", body.pop ? "pop" : "apply", String(body.ref)]),
  "/stash/drop": (body) => {
    state.refs.stashes = state.refs.stashes.filter((s) => s.ref !== body.ref);
    return announce(["stash", "drop", String(body.ref)]);
  },
  "/stash/show": () => [],
  "/tag/create": (body) => {
    const name = String(body.name);
    state.refs.tags.push({
      name,
      fullName: `refs/tags/${name}`,
      target: state.repo.head.hash ?? "",
      annotated: Boolean(body.message),
      message: body.message ? String(body.message) : undefined,
    });
    return announce(["tag", name]);
  },
  "/tag/delete": (body) => {
    state.refs.tags = state.refs.tags.filter((t) => t.name !== body.name);
    return announce(["tag", "-d", String(body.name)]);
  },
  "/ops/squash": (body) => {
    const commits = (body.commits as string[]) ?? [];
    const result = announce(["rebase", "-i", `${commits[commits.length - 1]?.slice(0, 7)}^`], "Successfully rebased.\n");
    return {
      ...result,
      plan: commits.map((hash, i) => ({
        action: i === commits.length - 1 ? "pick" : "squash",
        hash,
        subject: state.log.commits.find((c) => c.hash === hash)?.subject ?? "",
        rewritten: i !== commits.length - 1,
      })),
      originalTodo: commits.map((h) => `pick ${h.slice(0, 7)}`).join("\n"),
      rewrittenTodo: commits.map((h, i) => `${i === commits.length - 1 ? "pick" : "squash"} ${h.slice(0, 7)}`).join("\n"),
    };
  },
};

/** Rotas que existem no contrato e aqui so devolvem "deu certo". */
const GENERIC_POST = [
  "/worktrees/add",
  "/worktrees/remove",
  "/worktrees/prune",
  "/ops/cherry-pick",
  "/ops/merge",
  "/ops/rebase",
  "/ops/reset",
  "/ops/revert",
  "/ops/abort",
  "/ops/continue",
  "/raw",
];

/* ------------------------------------------------------------------ */
/* Intercepcao                                                         */
/* ------------------------------------------------------------------ */

const json = (payload: unknown) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });

function installFetch() {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!raw.includes("/api/")) return original(input, init);

    const url = new URL(raw, location.origin);
    const path = url.pathname.replace(/^\/api/, "");
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    // Latencia curta, so para os estados de carregamento aparecerem de verdade.
    await new Promise((r) => setTimeout(r, 90));

    if (method === "GET") {
      const commit = /^\/commit\/(.+)$/.exec(path);
      if (commit) {
        const detail = state.commitDetails[decodeURIComponent(commit[1])];
        return detail
          ? json(detail)
          : new Response(JSON.stringify({ error: "commit desconhecido no mock" }), { status: 404 });
      }
      const handler = GET[path];
      if (handler) return json(handler(body, url.searchParams));
    }

    if (method === "POST") {
      const handler = POST[path];
      if (handler) return json(handler(body, url.searchParams));
      if (GENERIC_POST.includes(path)) return json(announce(["--mock", path.slice(1)]));
    }

    return new Response(JSON.stringify({ error: `rota ${method} ${path} nao existe no mock` }), { status: 404 });
  };
}

/** WebSocket falso com a mesma superficie que `lib/ws.ts` usa. */
class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  private readonly unsubscribe: () => void;

  constructor(_url: string) {
    const forward = (event: ServerEvent) => this.onmessage?.({ data: JSON.stringify(event) });
    listeners.add(forward);
    this.unsubscribe = () => void listeners.delete(forward);

    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
      forward({
        type: "hello",
        cwd: state.repo.cwd,
        mainRoot: state.worktrees.mainRoot,
        version: "0.1.0-mock",
        pid: 0,
      });
      announce(["log", '--pretty=format:%H|%P|%an|%ae|%s|%ar|%d', "--all", "--topo-order"], `${state.log.commits.length} commits\n`);
      announce(["status", "--porcelain=v2", "--branch"]);
    }, 40);
  }

  send() {
    /* o mock ignora ping e credentials */
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.unsubscribe();
    this.onclose?.();
  }
}

export function installMock() {
  installFetch();
  (window as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket;
  // Punho de desenvolvimento: o motor do grafo e de outra frente e ainda e um
  // stub, entao nao ha onde clicar para selecionar commit. Isto existe so no
  // modo mock, para conferir o painel de detalhe e o resumo da selecao.
  (window as unknown as { __gitcraqueMock: unknown }).__gitcraqueMock = {
    hashes: state.log.commits.map((c) => c.hash),
    selectCommit,
  };
  console.info("[gitcraque] mock ligado — payloads de", state.repo.cwd);
}
