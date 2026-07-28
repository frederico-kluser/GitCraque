# Skill catalogue — GitCraque

Index the router reads to select skills. Source of truth is `.agents/skills/`;
`.claude/skills` is a symlink to it.

**Every task goes through `project-router` first.** It asks its clarifying
questions in Brazilian Portuguese, writes `TASK_PLAN.md`, selects from the list
below, and deletes the plan file when the work is done.

## Task skills — the work surface

| Skill | Select it when the task touches | Verification signal |
|---|---|---|
| [`orchestrating-git-backend`](orchestrating-git-backend/SKILL.md) | `server/**` — REST routes, WebSocket events, running or parsing git, `contract.mjs`, worktrees, credentials, the askpass/sequence-editor trampolines | `npm run test:server` |
| [`laying-out-commit-graph`](laying-out-commit-graph/SKILL.md) | `web/src/graph/**` — lanes, edges, Bezier paths, commit rows, react-window virtualization, reveal/scroll-to-commit, the graph's custom test runner | `npm run test:graph` |
| [`resolving-drag-intents`](resolving-drag-intents/SKILL.md) | `web/src/dnd/**`, `web/src/dialogs/**` — the intent matrix, drag ids, drop targets, confirmation dialogs, executors, hold-to-confirm | `npm run test:dnd` |
| [`composing-shell-interface`](composing-shell-interface/SKILL.md) | `web/src/app/**`, `web/src/panels/**`, `web/src/hooks/**` — toolbar, rail, panels, dock, footer, context menus, hotkeys, theming, any new React component | `npm run typecheck` + `check-project-rules.mjs` |
| [`translating-interface-text`](translating-interface-text/SKILL.md) | any user-facing string, front-end or backend: labels, toasts, dialog copy, menu entries, plurals, error messages | `npm run typecheck` |
| [`verifying-changes`](verifying-changes/SKILL.md) | closing **every** task; a failing or flaky suite; adding a test; changing imports in graph, dnd, viewer or i18n | `npm test` |

## Meta skills

| Skill | Purpose |
|---|---|
| [`meta-skill-evolution`](meta-skill-evolution/SKILL.md) | Runs the memory pipeline at task completion: decides whether a learning is important **and** externally verified, and updates the owning SKILL.md directly — or discards it. |
| [`meta-skill-consolidate`](meta-skill-consolidate/SKILL.md) | Periodic garbage collection: deduplication, conflict resolution, staleness by provenance, token budget. Deletions need a second opinion. |

## Routing rules

- **Domain first.** On ambiguity prefer the most specific skill; a task in
  `server/**` is a backend task even when it is "about the graph".
- **`translating-interface-text` is a dependency, not an alternative.** Any task
  adding user-facing text loads it *in addition to* its domain skill.
- **`verifying-changes` always runs last**, and its commands run one at a time.
- **Parallel is safe across domains, never across the catalogue.** The four
  fronts may run in separate subagents; their edits to
  `web/src/i18n/locales/pt.ts` may not.
- **No skill covers the task?** Do not improvise a permanent rule. Invoke
  `meta-skill-evolution`, which proposes a new skill as a draft for human review.

## Always-on context

`AGENTS.md` at the repository root holds what must be true for every task:
exact commands, the six frozen contract files, and the security lines. `CLAUDE.md`
imports it so both agents read one source.

## Non-negotiable, regardless of skill

These come from `CLAUDE.md:24-38` and are enforced by
`node .agents/skills/scripts/check-project-rules.mjs`:

1. No gitgraph library — the layout algorithm is the product.
2. History comes from the exact `LOG_ARGS` command and no other.
3. Switching worktree is `process.chdir()`, never `git checkout`.
4. Drag-and-drop is `@dnd-kit/core`; no HTML5 drag events.
5. Squash is `GIT_SEQUENCE_EDITOR` + proxy-editor; no terminal emulator.
6. Network goes through the `GIT_ASKPASS` trampoline; nothing may block on a prompt.
7. `spawn` with an argv array, never `shell: true`.
8. No interface text hardcoded in the source.
