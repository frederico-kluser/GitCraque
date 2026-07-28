#!/usr/bin/env node
/*
 * Eval runner -- the regression gate for skill updates.
 *
 * The memory pipeline promotes an update only when it causes no correct->wrong
 * flips here. Two case types, deliberately different in strength:
 *
 *   knowledge  Strong. Asserts a claim written in a skill still matches the
 *              repository. This is what turns provenance into staleness
 *              detection: rename a cited symbol and the skill goes red instead
 *              of quietly lying to the next agent.
 *
 *   routing    Weak by construction, and honest about it. Scores a query
 *              against every description by term overlap. It cannot read
 *              meaning and cannot read Portuguese, so it proves only that a
 *              description still carries its trigger vocabulary -- the way
 *              descriptions actually rot. Real routing is semantic; phase 5
 *              checks that live.
 *
 * Usage:
 *   node .agents/skills/evals/run-evals.mjs                # everything
 *   node .agents/skills/evals/run-evals.mjs <skill-name>   # one skill
 *   node .agents/skills/evals/run-evals.mjs --json
 *
 * Exit 0 = all green. Exit 1 = at least one failure.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(HERE, "..");
const ROOT = join(SKILLS_DIR, "..", "..");

const cases = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8"));

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const only = args.find((a) => !a.startsWith("--"));

const results = [];
const pass = (kind, name, detail) => results.push({ kind, name, ok: true, detail });
const fail = (kind, name, detail) => results.push({ kind, name, ok: false, detail });

/* ------------------------- descriptions, for routing ---------------------- */

function loadDescriptions() {
  const out = new Map();
  for (const dir of readdirSync(SKILLS_DIR)) {
    if (dir.startsWith(".") || dir === "scripts" || dir === "evals") continue;
    const full = join(SKILLS_DIR, dir);
    if (!statSync(full).isDirectory()) continue;
    const file = join(full, "SKILL.md");
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, "utf8");
    const m = raw.match(/^\s*description:\s*(.+)$/m);
    if (m) out.set(dir, m[1].trim().replace(/^["']|["']$/g, "").toLowerCase());
  }
  return out;
}

/* Words too common to discriminate between skills in this repo. Without this,
   "the", "and" and "gitcraque" dominate every score equally and the ranking
   turns into noise. */
const STOP = new Set(
  ("a an and are as at be by for from in into is it its of on or that the to use used when whenever with " +
    "gitcraque task tasks skill skills user users even never mention mentions does do change changes " +
    "add adds new")
    .split(" "),
);

/* `/` is a separator, not a word character. Keeping it glued "merge/rebase"
   into a single token that matched nothing, which silently under-scored every
   skill whose description lists alternatives that way. */
const terms = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9*_-]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

function scoreRouting(query, descriptions) {
  const qt = [...new Set(terms(query))];
  const scores = [];
  for (const [skill, desc] of descriptions) {
    const dt = new Set(terms(desc));
    const nameTerms = new Set(skill.split("-"));
    let score = 0;
    for (const t of qt) {
      if (dt.has(t)) score += 1;
      /* A hit in the skill's own name is a stronger signal than one buried in
         a long description, so it counts double. */
      if (nameTerms.has(t)) score += 1;
    }
    scores.push({ skill, score });
  }
  return scores.sort((a, b) => b.score - a.score || a.skill.localeCompare(b.skill));
}

/* --------------------------------- routing -------------------------------- */

const descriptions = loadDescriptions();

for (const c of cases.routing) {
  if (only && c.expect !== only) continue;
  const ranked = scoreRouting(c.query, descriptions);
  const top = ranked[0];
  const name = `routing: "${c.query.slice(0, 52)}..."`;

  if (!top || top.score === 0) {
    fail("routing", name, `no description matched at all; expected ${c.expect}`);
  } else if (top.skill !== c.expect) {
    fail("routing", name, `ranked ${top.skill} (${top.score}) over ${c.expect} (${ranked.find((r) => r.skill === c.expect)?.score ?? 0})`);
  } else {
    const runnerUp = ranked[1];
    const margin = top.score - (runnerUp?.score ?? 0);
    if (margin === 0) {
      fail("routing", name, `tied with ${runnerUp.skill} at ${top.score} -- description does not discriminate`);
    } else {
      pass("routing", name, `${c.expect} (+${margin} over ${runnerUp?.skill ?? "nothing"})`);
    }
  }
}

/* -------------------------------- knowledge ------------------------------- */

for (const c of cases.knowledge) {
  if (only && c.skill !== only) continue;
  const name = `${c.skill}: ${c.claim}`;
  const file = join(ROOT, c.file);

  if (!existsSync(file)) {
    fail("knowledge", name, `cited file is gone: ${c.file}`);
    continue;
  }

  const body = readFileSync(file, "utf8");

  if (c.contains !== undefined && !body.includes(c.contains)) {
    fail("knowledge", name, `${c.file} no longer contains "${c.contains}"`);
    continue;
  }
  if (c.regex !== undefined && !new RegExp(c.regex, "m").test(body)) {
    fail("knowledge", name, `${c.file} no longer matches /${c.regex}/`);
    continue;
  }
  if (c.absent !== undefined && new RegExp(c.absent, "m").test(body)) {
    fail("knowledge", name, `${c.file} now matches /${c.absent}/, which the skill says it must not`);
    continue;
  }
  pass("knowledge", name, c.file);
}

/* ---------------------------------- output -------------------------------- */

const failed = results.filter((r) => !r.ok);

if (asJson) {
  console.log(JSON.stringify({ ok: failed.length === 0, total: results.length, failed: failed.length, results }, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

if (results.length === 0) {
  console.error(only ? `no eval cases for skill '${only}'` : "no eval cases found");
  process.exit(1);
}

for (const r of results) {
  if (!r.ok) console.log(`FAIL  [${r.kind}] ${r.name}\n        ${r.detail}`);
}

const byKind = (k) => results.filter((r) => r.kind === k);
console.log(
  `\nrouting  ${byKind("routing").filter((r) => r.ok).length}/${byKind("routing").length}` +
    `   knowledge ${byKind("knowledge").filter((r) => r.ok).length}/${byKind("knowledge").length}` +
    `   ${failed.length === 0 ? "-- all green" : `-- ${failed.length} FAILING`}`,
);

process.exit(failed.length === 0 ? 0 : 1);
