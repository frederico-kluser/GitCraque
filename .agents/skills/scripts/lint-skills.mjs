#!/usr/bin/env node
/*
 * Skill linter -- the deterministic gate for skill authoring.
 *
 * Prose cannot guarantee that a skill stays lean, triggerable and cited.
 * This script can. It is the objective pass/fail signal for phase 3 and for
 * every later edit to the skill library.
 *
 * Usage:
 *   node .agents/skills/scripts/lint-skills.mjs            # lint every skill
 *   node .agents/skills/scripts/lint-skills.mjs <name>      # lint one skill
 *   node .agents/skills/scripts/lint-skills.mjs --json      # machine readable
 *
 * Exit 0 = all skills pass. Exit 1 = at least one ERROR. Warnings never fail
 * the build: a heuristic that over-fires would push authors to write worse
 * skills just to silence it.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/* Limits come from the skill-authoring contract. Body budget is a hard 500
   lines; the token budget is a soft target because chars/4 is an estimate. */
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;
const MAX_BODY_LINES = 500;
const MAX_BODY_TOKENS = 5000;
const TARGET_MEDIAN_TOKENS = 1400;
const MAX_REFERENCE_LINES_WITHOUT_TOC = 100;

const VALID_TYPES = new Set(["knowledge", "task", "router", "meta"]);

/* These three names are fixed by the system design (the router is addressed by
   name from AGENTS.md; the meta skills are addressed by name from the router),
   so they are exempt from the gerund rule rather than renamed. */
const NAME_EXEMPT = new Set(["project-router", "meta-skill-evolution", "meta-skill-consolidate"]);

/* ---------- minimal frontmatter parser (no dependencies on purpose) -------- */

function parseFrontmatter(raw) {
  if (!raw.startsWith("---\n")) return { error: "file does not start with '---' frontmatter" };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { error: "frontmatter is never closed with '---'" };

  const block = raw.slice(4, end);
  const body = raw.slice(raw.indexOf("\n", end + 1) + 1);

  const data = {};
  let currentNest = null;

  for (const line of block.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const indented = /^\s{2,}\S/.test(line);
    const colon = line.indexOf(":");
    if (colon === -1) return { error: `frontmatter line is not 'key: value': ${line.trim()}` };

    const key = line.slice(0, colon).trim();
    const value = unquote(line.slice(colon + 1).trim());

    if (indented && currentNest) {
      data[currentNest][key] = value;
    } else if (value === "") {
      currentNest = key;
      data[key] = {};
    } else {
      currentNest = null;
      data[key] = value;
    }
  }

  return { data, body };
}

function unquote(v) {
  if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) {
    return v.slice(1, -1).replace(/\\"/g, '"');
  }
  return v;
}

const estimateTokens = (text) => Math.round(text.length / 4);

/* ---------------------------------- rules --------------------------------- */

function lintSkill(name, dir) {
  const errors = [];
  const warnings = [];
  const file = join(dir, "SKILL.md");

  if (!existsSync(file)) return { name, errors: [`missing SKILL.md`], warnings, tokens: 0 };

  const raw = readFileSync(file, "utf8");
  const parsed = parseFrontmatter(raw);
  if (parsed.error) return { name, errors: [parsed.error], warnings, tokens: 0 };

  const { data, body } = parsed;
  const bodyLines = body.split("\n").length;
  const tokens = estimateTokens(body);

  /* -- name -- */
  if (!data.name) {
    errors.push("frontmatter has no 'name'");
  } else {
    if (data.name !== name) errors.push(`frontmatter name '${data.name}' != directory '${name}'`);
    if (data.name.length > MAX_NAME) errors.push(`name is ${data.name.length} chars (max ${MAX_NAME})`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.name)) {
      errors.push(`name '${data.name}' must be lowercase letters/numbers/hyphens only`);
    }
    const head = data.name.split("-")[0];
    if (!NAME_EXEMPT.has(data.name) && !head.endsWith("ing")) {
      errors.push(`name '${data.name}' must start with a gerund (verb+ing), e.g. 'orchestrating-...'`);
    }
  }

  /* -- description: the ONLY signal the model has at selection time -- */
  if (!data.description) {
    errors.push("frontmatter has no 'description'");
  } else {
    if (data.description.length > MAX_DESCRIPTION) {
      errors.push(`description is ${data.description.length} chars (max ${MAX_DESCRIPTION})`);
    }
    if (!/\buse\b/i.test(data.description)) {
      errors.push("description must say WHEN to use the skill (no 'Use ...' clause found)");
    }
    if (/^(I |You |This skill will help you)/.test(data.description)) {
      warnings.push("description should be third person ('Routes ...', not 'You can ...')");
    }
    if (data.description.length < 80) {
      warnings.push(`description is only ${data.description.length} chars -- likely too thin on triggers`);
    }
  }

  /* -- frontmatter surface: name + description + metadata only, for portability -- */
  for (const key of Object.keys(data)) {
    if (!["name", "description", "metadata"].includes(key)) {
      errors.push(`frontmatter key '${key}' is not portable (only name, description, metadata allowed)`);
    }
  }

  /* -- metadata -- */
  const meta = data.metadata;
  if (!meta || typeof meta !== "object") {
    errors.push("frontmatter has no 'metadata' block");
  } else {
    if (!VALID_TYPES.has(meta.type)) {
      errors.push(`metadata.type '${meta.type}' must be one of ${[...VALID_TYPES].join("|")}`);
    }
    if (meta.type !== "router" && !meta.verification_signal) {
      errors.push("metadata.verification_signal is required (which command validates updates to this skill)");
    }
  }

  /* -- body budget: progressive disclosure, not a manual -- */
  if (bodyLines > MAX_BODY_LINES) errors.push(`body is ${bodyLines} lines (max ${MAX_BODY_LINES})`);
  if (tokens > MAX_BODY_TOKENS) errors.push(`body is ~${tokens} tokens (max ${MAX_BODY_TOKENS})`);
  if (tokens > TARGET_MEDIAN_TOKENS * 2) {
    warnings.push(`body is ~${tokens} tokens; consider moving detail to references/ (target median ~${TARGET_MEDIAN_TOKENS})`);
  }

  /* -- structure -- */
  if (!/^##\s+When to use/m.test(body)) errors.push("body needs a '## When to use' section");

  /* -- evolution contract: a task skill that cannot learn is a dead end -- */
  if (meta?.type === "task" && !/<evolution>/.test(body)) {
    errors.push("task skills must end with an <evolution> section");
  }

  /* -- provenance: every knowledge claim must be checkable against the repo -- */
  const hasProvenance = /`[\w./-]+\.(mjs|ts|tsx|json|md):\d+/.test(body) || /`[\w./-]+\.(mjs|ts|tsx|json|md)`/.test(body);
  if ((meta?.type === "knowledge" || meta?.type === "task") && !hasProvenance) {
    errors.push("no provenance found: cite sources as `path/file.ts:line`");
  }

  /* -- unexplained shouting: advisory only, caps are sometimes the right call -- */
  const shouted = body.match(/\b(MUST|ALWAYS|NEVER)\b/g) ?? [];
  if (shouted.length > 8) {
    warnings.push(`${shouted.length} ALL-CAPS imperatives; prefer explaining the WHY over shouting`);
  }

  /* -- reference files: long ones need a table of contents -- */
  const refDir = join(dir, "references");
  if (existsSync(refDir)) {
    for (const ref of readdirSync(refDir).filter((f) => f.endsWith(".md"))) {
      const refRaw = readFileSync(join(refDir, ref), "utf8");
      const lines = refRaw.split("\n").length;
      if (lines > MAX_REFERENCE_LINES_WITHOUT_TOC && !/^#{1,3}\s*(Contents|Table of contents|Index)/im.test(refRaw)) {
        errors.push(`references/${ref} is ${lines} lines and has no table of contents`);
      }
    }
  }

  return { name, errors, warnings, tokens, bodyLines, type: meta?.type };
}

/* ---------------------------------- main ---------------------------------- */

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const only = args.find((a) => !a.startsWith("--"));

const dirs = readdirSync(SKILLS_DIR)
  .filter((d) => !d.startsWith(".") && d !== "scripts" && d !== "evals")
  .filter((d) => statSync(join(SKILLS_DIR, d)).isDirectory())
  .filter((d) => !only || d === only)
  .sort();

if (dirs.length === 0) {
  console.error(only ? `no skill directory named '${only}'` : "no skills found");
  process.exit(1);
}

const results = dirs.map((d) => lintSkill(d, join(SKILLS_DIR, d)));
const failed = results.filter((r) => r.errors.length > 0);

if (asJson) {
  console.log(JSON.stringify({ results, ok: failed.length === 0 }, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

for (const r of results) {
  const status = r.errors.length ? "FAIL" : "ok  ";
  console.log(`${status} ${r.name.padEnd(34)} ${String(r.tokens).padStart(5)} tok  ${String(r.bodyLines ?? 0).padStart(4)} lines  ${r.type ?? "?"}`);
  for (const e of r.errors) console.log(`       ERROR   ${e}`);
  for (const w of r.warnings) console.log(`       warn    ${w}`);
}

const tokens = results.map((r) => r.tokens).sort((a, b) => a - b);
const median = tokens.length ? tokens[Math.floor(tokens.length / 2)] : 0;
console.log(`\n${results.length} skills, ${failed.length} failing, median ~${median} tokens (target ~${TARGET_MEDIAN_TOKENS}).`);

process.exit(failed.length === 0 ? 0 : 1);
