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

**Repo-detection trap.** `detectRepoKind` calls a directory a **bare repo**
whenever it holds `HEAD` + `objects` + `refs` (`server/src/git/discover.mjs:130-134`).
A project's own `.git` satisfies that, so `listDirectory` reports `.git` with
`isRepo: true, isBare: true`. Any consumer that reads `isRepo` as "this is a
project" must filter `.git` by name — `scanForRepos` gets it free via
`SKIP_DIRS`, the browse path does not. Nothing errors; you just get one junk
entry per repository (`server/test/repo-memory.test.mjs`, "o proprio .git NAO
entra no historico").

**Parsing trap.** The log format is mandatory and `%s` may contain `|`. The
parser takes **four fields from the left and two from the right**; whatever
remains in the middle is the subject (`server/src/git/log.mjs:17-51`). A plain
`split("|")` desynchronises on the first commit with a pipe in its message.

**Selection trap.** `--exclude=<glob>` for refs applies only to the selectors
that come **after** it in argv — git's own doc says "the next `--all`,
`--branches`, ..." — and before the subcommand it dies with "unknown option".
When assembling a `log`/`rev-list` argv, the exclude must sit between the
subcommand and `--all` (`server/src/git/log.mjs:173-177`). A wrong order ships
ghost commits silently: `git log --all --exclude=...` still lists them (proven
on git 2.43.0; `server/test/log-exclude-archive.test.mjs` pins the ordering).

**Word-diff trap.** `git diff --word-diff=porcelain` does NOT emit
`[-...-]`/`{+...+}` — that is `--word-diff=plain`. Porcelain emits marker
lines (` ` / `+` / `-`) plus a `~` line after each piece that ended a source
line, and its context chunks come from the NEW-side buffer, so the removed
side's inter-word gaps are unrecoverable (an insertion doubles a space in any
reconstruction of the old line). Word-diff therefore runs TWO commands per
file and merges (`mergeWordDiff` / `parseWordDiffPorcelain`,
`server/src/git/status.mjs:285,506`): the plain patch provides structure,
numbers and content, the porcelain only the word pieces, assigned by absolute
line position per hunk. Also: `--word-diff` must sit AFTER the subcommand in
argv — before `diff`/`show` it is an unknown GLOBAL option and dies.

**A watcher without an `error` listener kills the server.** The Linux recursive
`fs.watch` walks the tree itself and emits `error` when a directory vanishes
between the event and the scandir — an ENOENT on `refs/remotes/<remote>` right
after a `push --delete`, for instance. An `error` with no listener becomes an
`uncaughtException`, and the process that dies is the one running git on the
user's machine. Every `fs.watch` handle goes through `Watcher.#keep`, which
attaches a swallowing handler (`server/src/watcher.mjs:120-131`); a directory
that evaporates is the daily life of a git-dir, not an incident.

**Tests: one server per file, and a port no other file uses.** `runtime` is a
process-wide singleton and `createServer()` overwrites it, so a second server in
the same file silently hijacks the first one's hub, watcher and vault
(`server/src/runtime.mjs:8-14`). The port rule is separate and easier to trip:
`node --test` runs the files **in parallel**, and `listen` walks forward up to
`PORT_FALLBACK_TRIES` (10) on `EADDRINUSE` (`server/src/server.mjs:159-184`). So
a duplicated port does not fail — it silently lands the server on the next free
one, possibly the port another file is asserting against, and the failure
surfaces in that innocent file. Grep `bootServer(.*port` before choosing one;
`5393` is already claimed twice, by `ai-routes` and `empty-repo`.
Helpers: `server/test/helpers/repo.mjs` (`makeFixtureRepo()` builds a real repo
in `os.tmpdir()` with global/system git config neutralised, and deliberately
includes a pipe-subject commit, a merge, tags and a second worktree) and
`server/test/helpers/server.mjs` (`bootServer()`, `TEST_PORT=5391`, always sends
`x-gitcraque-lang: pt`, so assertions compare against `translate("pt", key)`).

**Blind spot to hold in mind:** `server/**` has no tsconfig at all. `npm run
typecheck` never touches the backend, so a typo here is a runtime error only.
The tests are the entire safety net.

**The CLI entry guard must compare REALPATHS.** `server/bin/gitcraque.mjs` runs
`main()` only when it was invoked as a command rather than imported by a test.
That check has to be `fs.realpathSync(process.argv[1]) === fs.realpathSync(self)`
— `path.resolve` does **not** undo a symlink. `npm i -g` installs the bin as a
symlink at `<prefix>/bin/gitcraque` pointing into
`lib/node_modules/gitcraque/server/bin/`, so `argv[1]` is the link and
`import.meta.url` is the target. With `path.resolve` the two never matched,
`main()` never ran, and the installed command exited **0 with no output at all**
— no help, no version, no server. Nothing in the repo catches this: it only
appears once the package is packed and installed, which is why
`server/test/cli.test.mjs` now runs the binary through a symlink on purpose.

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
