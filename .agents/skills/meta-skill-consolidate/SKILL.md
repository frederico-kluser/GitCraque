---
name: meta-skill-consolidate
description: "Periodic garbage collection for the skill library: deduplicates repeated content, resolves contradictions, detects passages gone stale against the code they cite, enforces the token budget and retires dead knowledge. Use on a scheduled sweep, when a skill grows past its budget, when the eval suite reports a stale citation, after a large refactor, or when two skills appear to disagree."
metadata:
  type: meta
  verification_signal: node .agents/skills/scripts/lint-skills.mjs
---

# Consolidating skills

## When to use

On a periodic sweep; after a refactor large enough to move the ground under
several skills; when `lint-skills.mjs` warns about size; when
`run-evals.mjs` reports a knowledge case failing; or when two skills seem to
contradict each other.

## Why it is separate from evolution

Evolution decides what enters. Consolidation decides what stays. Unbounded
growth degrades a memory even when every individual entry was added correctly:
near-duplicates compete at retrieval time, and a passage that was true when
written keeps being retrieved long after the code moved. Pruning is not
housekeeping — it is part of staying correct.

Deletion, though, is the one irreversible-feeling operation here, so it carries
the heaviest procedure: a second opinion and a reviewable diff.

## What a sweep does

### 1. Staleness by provenance — start here

This is the highest-yield pass and it is already mechanical:

```
node .agents/skills/evals/run-evals.mjs
```

Every knowledge case asserts that a claim written in a skill still matches the
file it cites. A red case means a cited symbol moved, was renamed, or is gone —
the skill is now telling the next agent something false. For each failure:
re-verify against the current code, then **rewrite the passage** or **retire
it**. Never silently relax the eval to make it green; that converts a staleness
alarm into a blindfold.

Also re-check citations the evals do not cover: a `file:line` that no longer
points at the claimed thing is stale even when the file still exists.

### 2. Duplication

Look for the same rule stated in more than one skill. Two kinds, treated
differently:

- **Accidental duplication** — the same fact drifting into two skills. Keep it
  in the skill whose verification signal can actually check it, and leave a
  one-line pointer in the other.
- **Deliberate scoped repetition** — for example, the no-runtime-`@/`-import rule
  appearing in the graph, dnd, i18n and verification skills. That is **correct**
  and must be kept: each copy carries the scope its reader needs, and a reader of
  the graph skill will not have opened the verification skill. Do not collapse
  these into one distant reference.

The test: would removing this copy leave a reader of *this* skill missing a
constraint they need right now? If yes, it stays.

### 3. Contradictions

Where two passages disagree, decide which is current — by checking the code, not
by preferring the newer text — and delete the loser. Record the resolution in the
commit message rather than in the file.

### 4. Token budget

```
node .agents/skills/scripts/lint-skills.mjs
```

Body under 500 lines, ~1400-token median, 5000 hard ceiling. Over budget, move
detail into `references/*.md` (one level deep, table of contents if over 100
lines) and leave the decision-relevant summary in `SKILL.md`. Prefer cutting the
inferable: if a competent model would work it out from the code in seconds, it
does not need to be in the skill.

### 5. Retirement

Knowledge about deleted code, a workaround for a fixed bug, a rule whose
enforcing check now exists — all should go. When a convention becomes
mechanically enforced, replace the prose with a pointer to the check; that is a
strict improvement, since the check cannot go stale silently.

## Deletion requires a second opinion

Before removing any passage a human might still want:

1. Get an independent review from a fresh-context subagent. Ask it specifically:
   *is this knowledge still true, still non-obvious, and is it covered elsewhere?*
   Ask it to defend keeping the passage, not to approve removing it.
2. Emit the change as a **diff for review**, not a silent merge.
3. Commit consolidation separately from any content change, so a revert is one
   command.

Rewriting or moving is a local, reversible edit — do it freely. Wholesale
deletion of a skill, or of a section a human wrote, waits for confirmation.

## Procedure

1. `node .agents/skills/evals/run-evals.mjs` — fix or retire every stale claim.
2. `node .agents/skills/scripts/lint-skills.mjs` — check budgets and form.
3. Read the skills side by side for duplication and contradiction.
4. For each removal: second opinion, then diff.
5. Re-run both scripts; both must exit 0.
6. Commit separately, describing what was merged, retired, and why.

## References

`.agents/skill-map.md` for the intended boundary of each skill — a passage that
has drifted outside its skill's scope usually belongs to a neighbour, not to the
bin.
