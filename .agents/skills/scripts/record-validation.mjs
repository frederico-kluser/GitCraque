#!/usr/bin/env node
/*
 * Validation recorder -- turns "I am confident" into "a command exited 0".
 *
 * A skill may only be edited after its declared verification signal has run
 * green. This script runs that signal and, ONLY on success, writes a receipt
 * that the PreToolUse write-gate looks for. That is the whole mechanism behind
 * the external-validation rule: the model cannot author its own permission.
 *
 * Usage:
 *   node .agents/skills/scripts/record-validation.mjs <skill-name>
 *   node .agents/skills/scripts/record-validation.mjs <skill-name> --user-confirmed "<what the user approved>"
 *
 * Exit 0 = receipt written. Exit 1 = signal failed or was refused; no receipt.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(SKILLS_DIR, "..", "..");
const VALIDATION_DIR = join(SKILLS_DIR, ".validation");

/*
 * Allowlist of runnable verification signals.
 *
 * The signal string is read from a file inside the repo, and this script
 * executes it. Without an allowlist, anyone able to write a SKILL.md frontmatter
 * (including a poisoned or model-authored one) would gain arbitrary command
 * execution through the very gate meant to constrain it. Extend deliberately.
 */
const ALLOWED_SIGNALS = new Set([
  "npm test",
  "npm run typecheck",
  "npm run build",
  "npm run test:server",
  "npm run test:graph",
  "npm run test:dnd",
  "npm run test:viewer",
  "npm run test:e2e",
  "node .agents/skills/scripts/lint-skills.mjs",
  "node .agents/skills/evals/run-evals.mjs",
]);

function fail(msg) {
  console.error(`[record-validation] ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const skill = args.find((a) => !a.startsWith("--"));
const userConfirmedIdx = args.indexOf("--user-confirmed");
const userConfirmed = userConfirmedIdx !== -1 ? args[userConfirmedIdx + 1] : null;

if (!skill) fail("usage: record-validation.mjs <skill-name> [--user-confirmed \"<note>\"]");

const skillFile = join(SKILLS_DIR, skill, "SKILL.md");
if (!existsSync(skillFile)) fail(`no skill at ${skillFile}`);

/* Pull the declared signal straight out of the skill's own frontmatter, so the
   skill and the check that guards it can never drift apart. */
const raw = readFileSync(skillFile, "utf8");
const match = raw.match(/^\s*verification_signal:\s*(.+)$/m);
if (!match) fail(`${skill} declares no metadata.verification_signal`);

const signal = match[1].trim().replace(/^["']|["']$/g, "");

/* A signal may chain allowlisted commands with &&; every part must be allowed. */
const parts = signal.split("&&").map((p) => p.trim()).filter(Boolean);
const rejected = parts.filter((p) => !ALLOWED_SIGNALS.has(p));
if (rejected.length) {
  fail(
    `refusing to run non-allowlisted signal(s): ${rejected.join(", ")}\n` +
      `  Allowed: ${[...ALLOWED_SIGNALS].join(", ")}\n` +
      `  If this signal is legitimate, a human must add it to ALLOWED_SIGNALS in this script.`,
  );
}

const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
})();

console.log(`[record-validation] ${skill}: running "${signal}"`);

let output = "";
try {
  /*
   * Serial by construction. The graph perf suite asserts wall-clock ratios
   * (web/src/graph/__tests__/perf.test.ts:70-76), so running it next to another
   * heavy job produces a false red. One command at a time, no background jobs.
   */
  output = execSync(signal, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15 * 60_000 });
} catch (err) {
  const tail = `${err.stdout ?? ""}${err.stderr ?? ""}`.split("\n").slice(-25).join("\n");
  console.error(`[record-validation] SIGNAL FAILED -- no receipt written.\n${tail}`);
  console.error(
    `\n[record-validation] The learning is NOT validated. Per the memory pipeline, discard it ` +
      `rather than writing it: a wrong entry gets retrieved and amplified on every similar future task.`,
  );
  process.exit(1);
}

mkdirSync(VALIDATION_DIR, { recursive: true });

const receipt = {
  skill,
  signal,
  exit: 0,
  at_commit: commit,
  at: Date.now(),
  user_confirmed: userConfirmed ?? null,
  output_tail: output.split("\n").filter(Boolean).slice(-8).join("\n"),
};

writeFileSync(join(VALIDATION_DIR, `${skill}.json`), JSON.stringify(receipt, null, 2));
console.log(`[record-validation] green. Receipt written; ${skill}/SKILL.md is now editable for 60 minutes.`);
