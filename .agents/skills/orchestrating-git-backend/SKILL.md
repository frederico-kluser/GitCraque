---
name: orchestrating-git-backend
description: "Injects the invariants of the GitCraque Node backend under server/**: the boot-time route contract, the single git spawn point, the non-reentrant mutation lock, i18n error keys and the security guards. Use whenever a task touches server/**, adds or changes a REST route, endpoint, response payload or WebSocket event, runs a git command from Node, parses git log output (pipe-delimited, where a commit subject may itself contain the separator), refs or status, works on worktree switching, credentials, the askpass or sequence-editor trampolines, or edits contract.mjs or the typed REST client in web/src/lib/api.ts — even when the user never mentions skills, the backend, or a file name."
metadata:
  type: task
  verification_signal: npm run test:server
---

# Orchestrating the git backend

## When to use

Any task under `server/**`: new or changed route, new git operation, changed
parsing, WebSocket event, credentials, worktrees, the trampolines. Also when a
front-end task needs a payload the API does not yet return — the field starts
here.

## Injected knowledge

**The route table is executable, not documentation.** A pair in `ROUTES` with no
handler, or a handler outside `ROUTES`, **throws at boot**
(`server/src/routes/index.mjs:40-59`). So a half-added route fails immediately
and loudly rather than 404-ing in production. Adding a route means editing
`server/src/contract.mjs` *and* a `routes/*.mjs`, always additively.

**`execGit` never rejects on a non-zero exit** (`server/src/git/exec.mjs:104-114`).
It resolves a `GitCommandResult`; callers branch on `.ok`. Writing
`try/catch` around it and expecting the catch to fire is the standard mistake.

**Reads go through `readGit` / `execGitLines` / `readGitLine`**
(`server/src/git/exec.mjs:312-323`). They force `silent: true` and prepend
`--no-optional-locks`. Using plain `execGit` for a refresh read floods the user's
command console with noise it never asked for.

**The mutation lock is serial and NOT reentrant.** Inside a `tx()` you must call
the non-locking `step()` (`server/src/git/ops.mjs:137-146`). Calling
`execGit({mutating:true})` from inside a transaction deadlocks the queue.

**The lock also silences the watcher, so it is the wrong tool for a long-held
gate.** `withMutationLock` calls `watcher.beginSuppression()` for its whole
duration (`server/src/git/exec.mjs:71-77`) — correct for a single command, since
the caller reloads when the REST reply lands. But holding it across a
long-running operation (an external process mutating the repo, a batch) freezes
the UI for the entire window in which most changes happen: no `repo:changed`
gets out. When you need to bar UI-originated writes without blinding the view,
gate separately and leave the lock alone — `server/src/ai/session.mjs` does this,
and `server/test/ai-routes.test.mjs` pins both halves (mutation refused with
409, reads still answering).

**Errors carry an i18n key, never a phrase.** Throw
`new HttpError(413, "error.bodyTooLarge", "error.bodyLimit", { bytes })`
(`server/src/router.mjs:95-103`). Translation happens only at the edge in
`sendError` via `translate(locale, text, params) ?? text`
(`server/src/server.mjs:324-328`). That `??` is the whole design: `translate`
returns `undefined` for anything that is not a key, so **git's own English
stderr passes through untouched for free**. A new key must be added to all four
locales in `server/src/i18n.mjs` — nothing checks this, and a missing key
silently degrades to English (`server/src/i18n.mjs:325`).

**A conflict is not an error.** `isConflict` matches the command's own output
(`server/src/git/ops.mjs:74-79`) and those responses return **200 with
`ok: false` and `pending` filled in**. Only real failures become 409.

**Autostash lies about success.** git announces the stash on stdout and the pop
on stderr, and a *conflicted* pop still exits 0 while printing "Successfully
rebased". `withAutostashState` forces `ok:false` and synthesizes `pending`
(`server/src/git/ops.mjs:120-134`). `--autostash` is default-on for rebase
because in a GUI the working tree is almost never clean.

**Security invariants that are load-bearing, not decorative:**
- `assertRef` rejects any user value starting with `-`
  (`server/src/git/ops.mjs:23-37`). An argv array stops shell injection but not
  `--upload-pack=curl`.
- `resolveInsideRoot` is lexical (`server/src/git/file.mjs:67-89`); disk reads
  **re-run the check after `realpath`** (`:220-244`), because in
  `symlinked-dir/file` the escape is the middle directory, which an `lstat` on
  the leaf never sees. Escapes answer 400, never 403 — the response must not
  confirm that a path exists outside the root.
- The askpass token travels only over a 0600 unix socket with a single-use
  nonce; it never enters the git process env, argv, or disk
  (`server/src/trampoline/vault.mjs:128-215`).

**Parsing trap.** The log format is mandatory and `%s` may contain `|`. The
parser takes **four fields from the left and two from the right**; whatever
remains in the middle is the subject (`server/src/git/log.mjs:17-51`). A plain
`split("|")` desynchronises on the first commit with a pipe in its message.

**Tests: one server per file.** `runtime` is a process-wide singleton and
`createServer()` overwrites it, so a second server in the same file silently
hijacks the first one's hub, watcher and vault (`server/src/runtime.mjs:8-14`).
Helpers: `server/test/helpers/repo.mjs` (`makeFixtureRepo()` builds a real repo
in `os.tmpdir()` with global/system git config neutralised, and deliberately
includes a pipe-subject commit, a merge, tags and a second worktree) and
`server/test/helpers/server.mjs` (`bootServer()`, `TEST_PORT=5391`, always sends
`x-gitcraque-lang: pt`, so assertions compare against `translate("pt", key)`).

**Blind spot to hold in mind:** `server/**` has no tsconfig at all. `npm run
typecheck` never touches the backend, so a typo here is a runtime error only.
The 223 tests are the entire safety net.

## Procedure

1. **Read `server/src/contract.mjs` first.** It is the frozen mirror of the API.
2. Add the `[method, pattern]` pair to `ROUTES` — additive, never renaming.
3. Register the handler in the domain's `registerXRoutes(router, deps)`; wire it
   into `buildRouter` (`server/src/routes/index.mjs:26-37`) only if the file is new.
4. Read the body through `bodyOf(ctx)`; wrap every git result in
   `commandResult()` (`server/src/routes/_util.mjs:18-23`).
5. For any new error, add the key to **all four** locales in `server/src/i18n.mjs`.
6. Mirror the payload additively in `web/src/types/git.ts` and add the client
   call to `web/src/lib/api.ts` — a route absent from `api.ts` does not exist to
   the front-end.
7. Add a test in `server/test/*.test.mjs` using both helpers; one server per file.
8. Run `npm run test:server`. Run it alone (see `verifying-changes`).

## References

`docs/ARCHITECTURE.md:50-242` for the full module tour;
`references/env-and-guards.md` for the complete injected-env table and the
security guard list.

## <evolution>

On completion, run the memory pipeline in `meta-skill-evolution`. Update this
file directly only when the learning is important **and** `npm run test:server`
went green on the change that produced it — record the receipt with
`node .agents/skills/scripts/record-validation.mjs orchestrating-git-backend`.
Replace the passage it contradicts rather than appending a competing rule. If
the signal cannot pass, discard the learning: a wrong entry here is retrieved
and followed on every future backend task.
