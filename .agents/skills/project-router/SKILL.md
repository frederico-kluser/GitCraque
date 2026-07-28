---
name: project-router
description: "Routes EVERY implementation task in the GitCraque codebase to the right skills before any step is taken: asks clarifying questions in Brazilian Portuguese, writes TASK_PLAN.md, checks the frozen contracts, assembles the skill chain and runs the evolution step at the end. Use whenever the user asks for any change, fix, feature, refactor, investigation or analysis in this repository, even if they never mention skills, routing or planning."
metadata:
  type: router
  verification_signal: node .agents/skills/evals/run-evals.mjs
---

# Project router

**Every question you ask the user is in Brazilian Portuguese.** The developer who
uses this router is a Portuguese speaker; this is a functional requirement, not a
style preference. `TASK_PLAN.md` is written in Portuguese for the same reason.
Skill bodies and code stay in English.

## When to use

Before the first step of any task in this repository — change, fix, feature,
refactor, or investigation. This is the entry point; nothing else runs first.

## Protocol

### 1. Ask, in Portuguese, until the task is unambiguous

Ask several questions before doing anything. The expensive failure in this repo
is starting work in the wrong module or against a frozen contract, and both are
cheap to prevent with a question. Adapt these to the request; do not read them
out mechanically.

- **Escopo.** Qual parte do app? Backend (`server/**`), grafo
  (`web/src/graph/**`), drag-and-drop e diálogos (`web/src/dnd/**`,
  `web/src/dialogs/**`), ou a casca — toolbar, rail, painéis, menus
  (`web/src/app/**`, `web/src/panels/**`)?
- **Comportamento.** O que exatamente deve acontecer? Qual a entrada e qual a
  saída esperada, em termos concretos?
- **Tipo.** É correção de bug, funcionalidade nova, refatoração ou investigação?
  Se for bug: como reproduzir?
- **Contrato.** Isso mexe em algum dos arquivos congelados
  (`web/src/types/git.ts`, `types/modules.ts`, `lib/api.ts`, `lib/ws.ts`,
  `state/store.ts`, `server/src/contract.mjs`)? Se sim, o campo é **acréscimo**
  ou mudança do que já existe?
- **Texto.** Aparece texto novo na interface? Ele precisa existir nos quatro
  idiomas (pt, en, es, zh).
- **Aceitação.** Qual comando precisa ficar verde para você considerar pronto?
  (`npm test`, `npm run typecheck`, uma suíte específica, o app rodando?)
- **Fora de escopo.** O que você explicitamente **não** quer que eu mexa?
- **Bordas.** Vale considerar repositório vazio, branch presa em outra worktree,
  conflito no meio da operação, ou repositório com dezenas de milhares de
  commits?

Keep asking while an answer would change what you build. Do not start on a
"probably".

### 2. Write `TASK_PLAN.md`

In Portuguese, at the repository root: objective, agreed scope, out-of-scope,
step-by-step plan, the files you expect to touch, acceptance criteria, and the
exact commands that must go green. It is the shared contract for this task.

### 3. Frozen-contract pre-flight

Six files are the contract between fronts (`docs/ARCHITECTURE.md:41-48`):
`web/src/types/git.ts`, `types/modules.ts`, `lib/api.ts`, `lib/ws.ts`,
`state/store.ts`, `server/src/contract.mjs`. Plus
`web/src/components/motion-ui/**`, which the shadcn CLI owns and overwrites.

Changes here are **additive only** — add fields, never remove or rename — and
must be called out in the commit. A route that is not in `web/src/lib/api.ts`
does not exist to the front-end. `tsc` catches a removal only if some consumer
reads the field, so renaming an unread field passes clean: check by hand.

### 4. Classify and select

Read `catalog.md`. Pick the domain skill by directory, add
`translating-interface-text` if any user-facing text is involved, and always
finish with `verifying-changes`. On ambiguity prefer the most specific skill.

### 5. Assemble the chain

The four domain skills are independent and may run in parallel subagents.
Their edits to `web/src/i18n/locales/pt.ts` may **not** — all four fronts write
that one file. Verification runs last, alone, one command at a time.

### 6. Load the knowledge, then execute

Read the selected skills **before** writing code, then follow `TASK_PLAN.md`.

### 7. On completion

1. Run `verifying-changes`: the relevant suites one at a time, `npm run
   typecheck`, and `node .agents/skills/scripts/check-project-rules.mjs`.
2. Run the `<evolution>` step of every task skill that was involved, following
   `meta-skill-evolution`. Most tasks correctly record nothing.
3. **Delete `TASK_PLAN.md`.** It is disposable and must not stay in the repo.

## Rules

- **Never skip the evolution step, and never leave `TASK_PLAN.md` behind.**
- **Never delete the bootstrap artifacts**: `.agents/project-analysis.md`,
  `.agents/skill-map.md`, `.agents/validation-report.md`,
  `.agents/skills/catalog.md`, `.agents/skills/.bootstrap-state.json`. Only
  `TASK_PLAN.md` is disposable.
- **No skill covers the task?** Do not invent a durable rule on the spot. Invoke
  `meta-skill-evolution`, which proposes a new skill as a **draft for human
  review**, never a direct publish.
- **Broad side effects need confirmation.** Anything that rewrites history,
  pushes, deletes a remote branch, or restructures directories is not
  auto-invocable — ask first, in Portuguese.
- **Report honestly.** If a suite fails, say so with the output. If part of the
  scope was left out, say which part and why.

## References

`catalog.md` for the skill index; `AGENTS.md` for the always-on rules;
`.agents/project-analysis.md` for what is guaranteed by tooling versus prose.
