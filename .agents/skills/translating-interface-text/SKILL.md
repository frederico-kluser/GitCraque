---
name: translating-interface-text
description: "Injects GitCraque's four-language catalogue rules: pt.ts is the master that defines every key, tsc enforces the other three in both directions, and web/src/i18n/** must stay free of runtime @/ imports. Use whenever a task adds, changes or removes ANY user-facing string, label, toast, dialog copy, menu entry, error message or plural — in the front-end or the backend — even when the user just says 'add a button that says X' and never mentions i18n or skills."
metadata:
  type: task
  verification_signal: npm run typecheck
---

# Translating interface text

## When to use

Any task that adds or changes text a human reads: labels, toasts, dialogs, menu
entries, empty states, backend error messages. Transversal — every front reads
this skill (`CLAUDE.md:74-75`).

## Injected knowledge

**`web/src/i18n/locales/pt.ts` is the master catalogue.** It is the only locale
with no type annotation (`export const pt = {…} as const`), so it *defines* the
key set: `CatalogKey = keyof typeof pt` → `Messages = Record<CatalogKey, string>`
(`web/src/i18n/types.ts:35,49`). The other three are annotated
`export const en: Messages = {` (`locales/en.ts:7`).

**`tsc` enforces this in both directions**, verified by deleting a key and
compiling: a **missing** key is `TS2741`, a **stray** key is `TS2353` via
object-literal excess-property checking. A bogus key passed to `t()` is `TS2345`,
because `MessageKey` is a literal union. So: add the key to `pt.ts` first, run
`npm run typecheck`, and let the compiler tell you the other three.

**What `tsc` does NOT catch — this is the useful part:**
- **A typo in a `pt` key silently redefines the contract.** Nothing constrains
  `pt`, so `rail.branchs.title` becomes the truth and the compiler then demands
  the typo in the other three locales. Re-read the key you added.
- **Orphan plural pairs.** `PluralBase` is derived from `_one` only
  (`web/src/i18n/types.ts:43`), so `foo_one` without `foo_other` compiles, and
  `t("foo", {count: 2})` renders the raw key string to the user.
- **`t("<plural base>")` without `count` compiles clean** and renders the literal
  key. `params` is optional.
- **Backend catalogue parity.** `server/src/i18n.mjs` is plain objects with no
  type guard; a key missing from pt/es/zh silently falls back to English
  (`server/src/i18n.mjs:325`). Currently 56 keys × 4 with zero drift — keep it
  that way by hand.

**`t` is a module singleton, not React context** (`web/src/i18n/store.ts:52`),
because half the app's text is born outside components: `app/actions.ts` builds
dialogs, `state/store.ts` emits toasts, `dialogs/executors.ts` reports results. A
`useTranslation()` hook would force threading `t` through all of that. Idiom:
`import { t } from "@/i18n"; t("rail.branches.title")`.

The price: a component that only calls `t()` has no subscription and cannot know
to re-render. `<LocaleBoundary>` solves it bluntly — it is
`<Fragment key={locale}>` (`web/src/i18n/index.tsx:46-49`), so switching language
remounts the whole tree. Repository state survives because it lives in a module,
not in React.

**Plurals** are the `_one` / `_other` pair chosen by `count`, deliberately not
`Intl.PluralRules` (`web/src/i18n/translate.ts:34`). Chinese repeats the same
sentence in both variants on purpose.

**Markup inside a sentence uses `<Rich>`, never concatenation**, because word
order changes per language:
`<Rich k="app.emptyRepo.body" nodes={{ command: <code>git log</code> }} />`. It
works because `interpolate` leaves unknown placeholders intact
(`web/src/i18n/translate.ts:25`) — that is the deliberate seam.

**Numbers, dates and sizes come from `@/i18n`** (`formatDateTime`,
`formatNumber`, `formatBytes`), never `new Intl.X("pt-BR")` or
`toLocaleString` with a hardcoded locale (`web/src/i18n/format.ts:4-7`).
`formatRelativeTime` reads from the catalogue rather than
`Intl.RelativeTimeFormat` — the exact wording was a product choice.

**What is deliberately never translated:** git command names, flags like
`--force-with-lease`, `HEAD`, `origin`, git's own stderr, and the `%ar` field.
`%ar` arrives in English because the backend pins `LC_ALL=C`
(`server/src/git/exec.mjs:42`), and `useCommitActivity` parses that English
string to build the sparkline — the log payload carries no absolute date.
`formatGitRelativeDate` reformats it **for display only**, leaving the payload
intact, and falls back to raw English for compound phrases rather than
half-translating.

**Backend text carries a key, not a phrase.** Throw
`new HttpError(413, "error.bodyTooLarge", …)`; translation happens once at the
edge in `sendError` via `translate(locale, text, params) ?? text`
(`server/src/server.mjs:324-328`). That `??` is why raw git stderr passes through
untouched. Locale is per **request** — `x-gitcraque-lang` then `accept-language`
then `en` — never process state, because one local server may serve several tabs
in different languages.

**The rule with the widest blast radius:** `web/src/i18n/**` must contain
**zero runtime `@/` imports**. Both `npm run test:viewer` and `npm run test:dnd`
load these files raw under Node type stripping, which resolves neither the `@/`
alias nor extensionless specifiers. Files import each other relatively with an
explicit `.ts` extension (`../i18n/store.ts`, documented inline at
`web/src/viewer/markdown.ts:22-24`). One ordinary-looking import here passes
`tsc` and takes two whole test suites from passing to *cannot load*. The rule
checker guards this.

**Known debt:** roughly a dozen backend errors carry literal Portuguese instead
of a key — `server/src/git/ops.mjs:25,41,129,212,466`, `git/file.mjs:69,74,76`,
`git/squash.mjs:117,199`. They reach the UI untranslated in all four locales.
Do not add more; fixing one you touch is welcome.

## Procedure

1. Add the key and Portuguese text to `web/src/i18n/locales/pt.ts`.
2. Run `npm run typecheck` and let `TS2741` list the other three locales.
3. Fill `en.ts`, `es.ts`, `zh.ts`. For plurals add **both** `_one` and `_other`
   in all four.
4. Use `t("key")` at the call site; `t("key", {count})` for plurals; `<Rich>` if
   the sentence contains markup. In menu builders call `t()` **inside** the
   builder, never at module scope.
5. Backend string: add the key to all four locales in `server/src/i18n.mjs` and
   throw the key, never the phrase.
6. Run `npm run typecheck` again — it must be clean.

## References

`docs/UI.md:82-112` and `docs/ARCHITECTURE.md:397-461` for the design rationale.

## <evolution>

On completion, run the memory pipeline in `meta-skill-evolution`. Update this
file only when the learning is important **and** `npm run typecheck` went green,
recorded via
`node .agents/skills/scripts/record-validation.mjs translating-interface-text`.
Note that a green typecheck proves catalogue completeness but says nothing about
whether the *wording* is right — do not record wording claims as verified.
