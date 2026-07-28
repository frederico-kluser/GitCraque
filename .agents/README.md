# `.agents/` — the knowledge-skill system

Project knowledge, packaged as skills an agent loads on demand instead of
re-reading the docs and re-scanning the tree every session. Every task enters
through one router; skills update themselves only when something outside the
model says they should.

## Layout

```
.agents/
  README.md                  this file
  project-analysis.md        phase 1: what the repo is, what is guaranteed vs prose
  skill-map.md               phase 2: why the library is split the way it is
  validation-report.md       phase 5: evidence that the machinery works
  hooks/
    bootstrap-stop.mjs       blocks ending a turn while a bootstrap phase is red
    skill-write-gate.mjs     blocks editing a live SKILL.md without a green receipt
    security-guard.mjs       blocks secrets and unrecoverable commands
  skills/
    catalog.md               the index the router reads
    .bootstrap-state.json    phase state -- the mission backbone
    project-router/          entry point for every task
    <six task skills>/
    meta-skill-evolution/    the memory pipeline
    meta-skill-consolidate/  periodic garbage collection
    scripts/
      lint-skills.mjs        form: frontmatter, budget, provenance, <evolution>
      record-validation.mjs  runs a skill's declared signal, writes a receipt if green
      check-project-rules.mjs  9 GitCraque rules that had no guard before
    evals/
      cases.json             routing + knowledge cases
      run-evals.mjs          the regression gate for skill updates
```

`.claude/skills` is a symlink to `.agents/skills`, and `CLAUDE.md` imports
`AGENTS.md`. One source of truth, portable to other agent tools; only the
`.claude/settings.json` glue is Claude Code specific.

## The idea in one paragraph

Cleanliness and correctness are independent. A skill entry can be perfectly
lean, minimal and well-cited while being false — and a false entry is worse than
no entry, because it gets retrieved on the next similar task, followed, and its
error reproduced. The model cannot referee its own mistakes, so confidence never
authorises a write. Something external does: a test, a typecheck, an eval, or the
user saying so. That rule is enforced by a hook rather than requested in prose.

## The three gates

| Hook | Event | Blocks | Fails |
|---|---|---|---|
| `bootstrap-stop.mjs` | Stop | ending the turn while a phase is red | **open** — a broken hook must never trap a session; also gives up after 12 blocks |
| `skill-write-gate.mjs` | PreToolUse | editing an existing `SKILL.md` with no fresh green receipt | **closed** — the blast radius is one file pattern |
| `security-guard.mjs` | PreToolUse | secret reads; `rm -rf /`, force-push, `filter-branch`, `curl \| sh` | **closed** |

Creating a *new* `SKILL.md` is allowed: a new skill is a draft for human review,
not a silent mutation of knowledge the agent already relies on.

The security guard is calibrated for a git client. It deliberately allows
`git rebase -i`, `git reset --hard`, `--force-with-lease` and force-pushes
against fixtures under `/tmp`, because that is how this project's own suite
works. A guard that blocked the project's real work would be switched off within
a day and protect nothing.

### Removing them

`bootstrap-stop.mjs` is a no-op once every phase is green; delete its `Stop`
entry from `.claude/settings.json` to remove it entirely. The other two are
independent — remove either `PreToolUse` entry on its own. Nothing else in the
system depends on a hook being installed.

## Updating a skill by hand

The write-gate applies to you too:

```bash
node .agents/skills/scripts/record-validation.mjs <skill-name>   # runs its signal
# edit the SKILL.md
node .agents/skills/scripts/lint-skills.mjs <skill-name>
node .agents/skills/evals/run-evals.mjs <skill-name>
```

`record-validation.mjs` will only run a command from an allowlist. The signal is
read from a file in the repo, so without that allowlist the gate meant to
constrain writes would itself be arbitrary code execution.

## Adding a skill

Answer first: **which single command validates updates to it?** A skill whose
knowledge no signal can check cannot evolve safely, and is usually a sign the
knowledge belongs in an existing skill. Then follow `meta-skill-evolution` — a
new skill is emitted as a draft for review, never published directly.
