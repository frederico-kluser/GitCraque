# Backend reference — injected environment and security guards

Loaded on demand by `orchestrating-git-backend`. Kept out of the skill body so
the skill stays at reading size.

## Contents

- [Injected git environment](#injected-git-environment)
- [Command result and failure modes](#command-result-and-failure-modes)
- [Security guards](#security-guards)
- [Storage on disk](#storage-on-disk)

## Injected git environment

Every invocation goes through `gitEnv()` (`server/src/git/exec.mjs:34-52`).
There is no `exec` with a shell string anywhere in the project: always
`spawn(gitBin, argvArray)`, never `shell: true`.

| Variable | Value | Why |
|---|---|---|
| `GIT_TERMINAL_PROMPT` | `0` | forbids git opening a prompt on the inherited tty |
| `GIT_ASKPASS` | trampoline | the only way a credential enters |
| `SSH_ASKPASS` / `SSH_ASKPASS_REQUIRE` | trampoline / `force` | same for SSH. **Set only if the vault actually started** (`:47-49`) |
| `GIT_EDITOR` | `true` | no command may open an editor |
| `GIT_PAGER` / `PAGER` | `cat` | no command may paginate |
| `LC_ALL` / `LANG` | `C` | stable output for the parser — and why `%ar` arrives in English |
| `GIT_OPTIONAL_LOCKS` | `0` | reading must not touch the index |

The `LC_ALL=C` pin is load-bearing beyond parsing: `useCommitActivity`
(`web/src/hooks/useCommitActivity.ts:31-42`) parses the English `%ar` string to
build the sparkline, because the log payload carries no absolute date. Guarded by
`server/test/exec-watcher.test.mjs:149`.

## Command result and failure modes

- Every command emits `git:command` (start → stdout/stderr → exit) and resolves a
  `GitCommandResult`. Default timeout 120 s, max buffer 64 MB.
- Timeout sends SIGTERM then SIGKILL after a 3 s grace; buffer overflow also
  hard-kills. Both append a `gitcraque:` note to stderr.
- `friendlyError` takes the first stderr/stdout line that is not `hint:` or
  `warning:` and strips the `fatal:`/`error:` prefix (`server/src/git/exec.mjs:294`).
- `isNotARepoError` also matches `detected dubious ownership`
  (`server/src/git/exec.mjs:389`). Running outside a repository is a legitimate
  state, not a 500: `GET /log` and `GET /status` return empty payloads so the
  repository picker does not open under a red toast carrying a stack trace.

## Security guards

**Path escape** — `resolveInsideRoot` (`server/src/git/file.mjs:67-89`) rejects
non-string, empty, NUL byte, absolute, `C:\`-style, leading `~`, and any
post-`normalize` `..`. It is lexical only, so disk reads re-run the check after
`fsp.realpath` (`:220-244`). That second pass is what catches a symlinked
*directory*: in `symlinked-dir/file`, an `lstat` on the leaf sees nothing wrong.
The worktree root is itself realpath'd first. Escapes answer **400, never 403** —
the response must not reveal whether a path exists outside the root.

Beyond the guard: a binary file (NUL byte in the first 8 KB) returns
`content: ""`; over 1 MB returns the head with `truncated: true` and the real
`size`, cut on a UTF-8 character boundary; a file absent from that commit is 404.

**Host / Origin** — `originDenial` (`server/src/server.mjs:208-226`): a missing
`Host` is denied; the hostname must be `localhost`, `*.localhost`, `::1` or
`127.x.x.x`; an `Origin`, when present and not `"null"`, must also be local.
Applied to HTTP *and* the WebSocket upgrade.

**Askpass vault** — a 24-byte hex nonce per session; unix socket chmod 0600 in a
0700 directory; the nonce is the only authentication; request buffer capped at
8192 bytes (`server/src/trampoline/vault.mjs:128-215`). The token never touches
disk and never enters the git process environment, where `/proc` would expose it.
On timeout (120 s) the askpass exits 1 and git fails cleanly instead of hanging.

**Ref injection** — `assertRef` (`server/src/git/ops.mjs:23-37`) rejects any user
value starting with `-`. An argv array prevents shell injection but not
`--upload-pack=curl`.

**Raw command** — `POST /raw` still builds argv arrays, and
`RAW_BLOCKLIST = {gui, citool, difftool, mergetool, daemon, gitk}`
(`server/src/git/ops.mjs:450-470`).

## Storage on disk

`writeStore` (`server/src/git/store.mjs:58-86`) writes
`${file}.${process.pid}.tmp` at mode 0600 then renames — the pid in the name
stops two gitcraque instances colliding. Reads tolerate a corrupt file.

The asymmetry is deliberate: a failed write of **recents** is swallowed (history
is a side effect and must not sink a git operation), while a failed write of
**favourites** throws (there, the write *is* the requested operation).
`XDG_CONFIG_HOME` is read on every call, never cached at module load.
