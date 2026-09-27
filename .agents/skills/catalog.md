# Skill catalogue — GitCraque

Index the router reads to select skills. Source of truth is `.agents/skills/`;
`.claude/skills` is a symlink to it.

**Every task goes through `project-router` first.** It asks its clarifying
questions in Brazilian Portuguese, writes `TASK_PLAN.md`, selects from the list
below, and deletes the plan file when the work is done.

## Task skills — the work surface

| Skill | Select it when the task touches | Verification signal |
|---|---|---|
| [`verifying-changes`](verifying-changes/SKILL.md) | closing **every** task; a failing or flaky suite; adding a test; changing imports in graph, dnd, viewer or i18n | `npm test` |

## Domain knowledge — the local CoALA memory

The six knowledge skills were consolidated into the local CoALA memory on
2026-09-27 and deleted — the knowledge lives **only** there now, as `knowledge/*`
records. Recover it before writing code:

```
python3 .agents/gitcraque-coala-memory-agent-skill/scripts/coala.py recall "<tarefa>" --budget 1500
python3 .agents/gitcraque-coala-memory-agent-skill/scripts/coala.py search "<termos>" --tags knowledge,<skill> --limit 5
```

| Domain | Directories | Memory keys | Verification signal |
|---|---|---|---|
| backend | `server/**` | `knowledge/orchestrating-git-backend` | `npm run test:server` |
| graph layout | `web/src/graph/**` — lanes, edges, rows, virtualization | `knowledge/laying-out-commit-graph` | `npm run test:graph` |
| graph painting | `web/src/graph/paint.ts` — how the graph looks | `knowledge/painting-graph-column` | `npm run test:graph` |
| dnd | `web/src/dnd/**`, `web/src/dialogs/**` | `knowledge/resolving-drag-intents` | `npm run test:dnd` |
| shell | `web/src/app/**`, `web/src/panels/**`, `web/src/hooks/**` | `knowledge/composing-shell-interface` | `npm run typecheck` + `check-project-rules.mjs` |
| i18n | any user-facing string, front-end or backend | `knowledge/translating-interface-text` | `npm run typecheck` |

## Routing rules

- **Domain first.** On ambiguity prefer the most specific domain; a task in
  `server/**` is a backend task even when it is "about the graph".
- **Inside the graph, split by question.** "Which lane / which edge / does it
  scroll" → graph layout. "How big / how round / what colour / does it react to
  the pointer" → graph painting. A task that moves a number in `paint.ts` needs
  only the painting records; a task that changes both loads both.
- **i18n is a dependency, not an alternative.** Any task adding user-facing text
  also recovers `knowledge/translating-interface-text`, in addition to its domain.
- **`verifying-changes` always runs last**, and its commands run one at a time.
- **Parallel is safe across domains, never across the catalogue.** The four
  fronts may run in separate subagents; their edits to
  `web/src/i18n/locales/pt.ts` may not.
- **No domain covers the task?** Do not improvise a permanent rule. Record it in
  the local CoALA memory (`coala.py add`) as a draft for human review.

## Always-on context

`AGENTS.md` at the repository root holds what must be true for every task:
exact commands, the six frozen contract files, and the security lines. `CLAUDE.md`
imports it so both agents read one source.

## Non-negotiable, regardless of skill

These come from the `AGENTS.md` Rules section and are enforced by
`node .agents/skills/scripts/check-project-rules.mjs`:

1. No gitgraph library — the layout algorithm is the product.
2. History comes from the exact `LOG_ARGS` command and no other.
3. Switching worktree is `process.chdir()`, never `git checkout`.
4. Drag-and-drop is `@dnd-kit/core`; no HTML5 drag events.
5. Squash is `GIT_SEQUENCE_EDITOR` + proxy-editor; no terminal emulator.
6. Network goes through the `GIT_ASKPASS` trampoline; nothing may block on a prompt.
7. `spawn` with an argv array, never `shell: true`.
8. No interface text hardcoded in the source.
