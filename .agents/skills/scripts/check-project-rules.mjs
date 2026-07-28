#!/usr/bin/env node
/*
 * Project-rule checker.
 *
 * GitCraque has no ESLint, no Prettier and no CI. Its hardest rules -- the
 * "regras invioláveis" in CLAUDE.md and the style cascade in docs/UI.md -- are
 * enforced by prose alone, which means nothing catches a regression until a
 * human reads the diff.
 *
 * This script turns the greppable subset of those rules into a pass/fail
 * signal. It is calibrated against the tree as of 98abad9, where every rule
 * below is clean: it must stay silent on good code and fail loudly on the
 * first violation. It does NOT replace tsc or the test suites; it covers the
 * class of mistake they structurally cannot see.
 *
 * Usage: node .agents/skills/scripts/check-project-rules.mjs [--json]
 * Exit 0 = clean, 1 = at least one violation.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const violations = [];
const report = (rule, file, line, detail) =>
  violations.push({ rule, file: relative(ROOT, file), line, detail });

/* ------------------------------- file walk -------------------------------- */

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".vite", ".build", "__tests__"]);

function* walk(dir, { includeTests = false } = {}) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (SKIP_DIRS.has(entry) && !(includeTests && entry === "__tests__")) continue;
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full, { includeTests });
    else yield full;
  }
}

const SRC_EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".css"]);
const isSource = (f) => SRC_EXT.has(extname(f));

/* Vendor tree: the shadcn CLI owns it and overwrites on the next `add`, so its
   contents are not ours to police (docs/UI.md rule 5). */
const isVendor = (f) => f.includes("/components/motion-ui/");
/* Where design tokens are legitimately DEFINED rather than consumed. */
const isTokenSource = (f) => f.includes("/web/src/styles/");

const lines = (file) => readFileSync(file, "utf8").split("\n");

/* A rule quoted inside a comment is documentation, not a violation. Without
   this, exec.mjs:136 ("NUNCA shell: true") would be flagged for saying the
   very thing the rule demands. */
const isComment = (text) => /^\s*(\/\/|\*|\/\*)/.test(text);
const codeOnly = (text) => (isComment(text) ? "" : text.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, ""));

/* --------------------- rule 1: no gitgraph library, ever ------------------- */
/* CLAUDE.md "Regras invioláveis" #1 -- the layout algorithm is the product. */

for (const file of walk(join(ROOT, "web", "src"), { includeTests: true })) {
  if (!isSource(file)) continue;
  lines(file).forEach((text, i) => {
    if (/@gitgraph\/|['"]gitgraph(\.js)?['"]/.test(codeOnly(text))) {
      report("no-gitgraph-library", file, i + 1, text.trim().slice(0, 90));
    }
  });
}

/* -------------------- rule 2: LOG_ARGS is the exact command ---------------- */
/* CLAUDE.md #2 -- the history comes from this command and no other. */

const contractPath = join(ROOT, "server", "src", "contract.mjs");
if (existsSync(contractPath)) {
  const contract = readFileSync(contractPath, "utf8");
  /* The format lives in LOG_PRETTY_FORMAT and LOG_ARGS interpolates it
     (contract.mjs:19-20), so the tokens are checked separately rather than as
     one concatenated string. */
  const EXPECTED = ["%H|%P|%an|%ae|%s|%ar|%d", "--pretty=format:", '"log"', "--all", "--topo-order"];
  const missing = EXPECTED.filter((tok) => !contract.includes(tok));
  if (missing.length) {
    report("log-args-frozen", contractPath, 0, `LOG_ARGS no longer contains: ${missing.join(" , ")}`);
  }
} else {
  report("log-args-frozen", contractPath, 0, "server/src/contract.mjs is missing");
}

/* ------------------ rule 3: git spawns argv, never a shell ---------------- */
/* CLAUDE.md conventions -- `spawn` with an array, never shell:true, never
   interpolating user input into a command string. */

for (const file of walk(join(ROOT, "server", "src"))) {
  if (!isSource(file)) continue;
  lines(file).forEach((text, i) => {
    const code = codeOnly(text);
    if (/shell\s*:\s*true/.test(code)) {
      report("no-shell-true", file, i + 1, text.trim().slice(0, 90));
    }
    /*
     * Detect the shell-string APIs at the IMPORT, not at the call site.
     * `exec(` as a call pattern collides with RegExp.prototype.exec, which this
     * codebase uses constantly for parsing git output -- 14 false positives on
     * a clean tree. The import is unambiguous: today only `spawn` is imported
     * (server/src/git/exec.mjs:14).
     */
    const imp = code.match(/from\s+['"]node:child_process['"]/) ? code : "";
    if (imp && /\b(exec|execSync)\b/.test(imp.split("from")[0] ?? "")) {
      report("no-shell-exec", file, i + 1, text.trim().slice(0, 90));
    }
  });
}

/* ----------------------- rule 4: never import framer-motion --------------- */
/* docs/UI.md hard rule 1 -- only `motion/react`. */

for (const file of walk(join(ROOT, "web", "src"), { includeTests: true })) {
  if (!isSource(file)) continue;
  lines(file).forEach((text, i) => {
    if (/from\s+['"]framer-motion['"]|require\(['"]framer-motion['"]\)/.test(codeOnly(text))) {
      report("no-framer-motion", file, i + 1, text.trim().slice(0, 90));
    }
  });
}

/* ------------- rule 5: colour and spacing come from semantic tokens ------- */
/* docs/UI.md hard rule 3 -- no hex, no numbered Tailwind palette. */

const NUMBERED_PALETTE = /\b(?:bg|text|border|ring|fill|stroke|from|to|via|shadow|decoration|outline|accent|caret|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;

for (const file of walk(join(ROOT, "web", "src"))) {
  if (!isSource(file) || isVendor(file) || isTokenSource(file)) continue;
  lines(file).forEach((text, i) => {
    /* A hex in prose is documentation. url-policy.ts explains an entity attack
       using `&#106;`, which is not a colour. */
    const code = codeOnly(text);
    if (HEX_COLOR.test(code)) report("tokens-not-hex", file, i + 1, code.trim().slice(0, 90));
    if (NUMBERED_PALETTE.test(code)) report("tokens-not-palette", file, i + 1, code.trim().slice(0, 90));
  });
}

/* ------------- rule 6: animate transform/opacity/filter only -------------- */
/* docs/UI.md hard rule 4 -- box changes use the `layout` prop. `transition-all`
   is the Tailwind equivalent of the same mistake: it animates every property,
   including the ones that force layout. */

for (const file of walk(join(ROOT, "web", "src"))) {
  if (!isSource(file) || isVendor(file)) continue;
  lines(file).forEach((text, i) => {
    if (/\btransition-all\b/.test(codeOnly(text))) {
      report("no-transition-all", file, i + 1, text.trim().slice(0, 90));
    }
  });
}

/* ------- rule 7: the no-bundler files must stay loadable by node --test ---- */
/*
 * This is the highest-value check here, and the least visible failure mode.
 * Three of the five test suites load .ts sources directly under Node's type
 * stripping. Node erases `import type`, but it does NOT resolve the `@/` alias
 * and does NOT resolve extensionless specifiers. So a single ordinary-looking
 * import added to one of these files does not fail typecheck, does not fail
 * review, and silently takes an entire suite from "passing" to "cannot load".
 */

const NO_BUNDLER = [
  "web/src/graph/layout.ts",
  "web/src/graph/bezier.ts",
  "web/src/graph/reveal.ts",
  "web/src/dnd/intents.ts",
  "web/src/dnd/ids.ts",
  "web/src/viewer/markdown.ts",
  "web/src/viewer/sanitize.ts",
  "web/src/viewer/url-policy.ts",
  "web/src/viewer/prose.ts",
];

/* Every file under i18n is transitively loaded by test:viewer and test:dnd. */
for (const f of walk(join(ROOT, "web", "src", "i18n"))) {
  if (extname(f) === ".ts") NO_BUNDLER.push(relative(ROOT, f));
}

const IMPORT_RE = /^\s*(?:import|export)\s+(type\s+)?[\s\S]*?from\s+['"]([^'"]+)['"]/;

for (const rel of NO_BUNDLER) {
  const file = join(ROOT, rel);
  if (!existsSync(file)) {
    report("no-bundler-imports", file, 0, "file listed as no-bundler but missing -- update this checker");
    continue;
  }
  lines(file).forEach((text, i) => {
    const m = text.match(IMPORT_RE);
    if (!m) return;
    const isTypeOnly = Boolean(m[1]) || /^\s*import\s+type\b/.test(text);
    const spec = m[2];

    if (spec.startsWith("@/") && !isTypeOnly) {
      report("no-bundler-imports", file, i + 1, `runtime import of alias '${spec}' -- Node cannot resolve @/; use a relative path with an explicit extension`);
    }
    if (spec.startsWith(".") && !isTypeOnly && !/\.(ts|tsx|mjs|js|json)$/.test(spec)) {
      report("no-bundler-imports", file, i + 1, `extensionless relative import '${spec}' -- Node needs the explicit extension`);
    }
    if (spec.endsWith(".tsx") && !isTypeOnly) {
      report("no-bundler-imports", file, i + 1, `runtime import of '${spec}' -- Node refuses .tsx (ERR_UNKNOWN_FILE_EXTENSION)`);
    }
  });
}

/* --------------------------------- output --------------------------------- */

const RULE_WHY = {
  "no-gitgraph-library": "CLAUDE.md #1: the graph layout is the product, not a dependency",
  "log-args-frozen": "CLAUDE.md #2: history comes from that exact command",
  "no-shell-true": "CLAUDE.md conventions: spawn takes an argv array; a shell string is an injection surface",
  "no-shell-exec": "CLAUDE.md conventions: exec() with a command string is an injection surface",
  "no-framer-motion": "docs/UI.md rule 1: only motion/react",
  "tokens-not-hex": "docs/UI.md rule 3: colour comes from semantic tokens so themes stay coherent",
  "tokens-not-palette": "docs/UI.md rule 3: numbered Tailwind palettes bypass the theme",
  "no-transition-all": "docs/UI.md rule 4: animate transform/opacity/filter; transition-all animates layout too",
  "no-bundler-imports": "3 of 5 test suites load these files raw under node --test; an alias or missing extension breaks the whole suite",
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ ok: violations.length === 0, violations }, null, 2));
  process.exit(violations.length === 0 ? 0 : 1);
}

if (violations.length === 0) {
  console.log("check-project-rules: clean (9 rules, 0 violations)");
  process.exit(0);
}

const byRule = new Map();
for (const v of violations) {
  if (!byRule.has(v.rule)) byRule.set(v.rule, []);
  byRule.get(v.rule).push(v);
}

for (const [rule, list] of byRule) {
  console.log(`\n${rule} -- ${RULE_WHY[rule] ?? ""}`);
  for (const v of list) console.log(`  ${v.file}:${v.line}  ${v.detail}`);
}
console.log(`\n${violations.length} violation(s).`);
process.exit(1);
