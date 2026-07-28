#!/usr/bin/env node
/*
 * PreToolUse write-gate on SKILL.md.
 *
 * The central failure mode of a self-evolving memory is not bloat, it is a
 * confidently wrong entry: it gets retrieved on similar tasks, followed, and
 * amplified. A model is an unreliable judge of its own errors, so "I am sure
 * this is right" cannot be what authorizes a write.
 *
 * This hook makes the external-validation rule mechanical: an EXISTING SKILL.md
 * may only be modified while a fresh green receipt exists for that skill, and
 * receipts are only produced by actually running the skill's declared
 * verification signal (see .agents/skills/scripts/record-validation.mjs).
 *
 * Creating a NEW SKILL.md is allowed: a new skill is a draft for human review,
 * not a silent mutation of knowledge the agent already relies on.
 *
 * Semantics: exit 0 = allow, exit 2 = block (stderr reaches Claude).
 * Fails CLOSED -- the blast radius is one file pattern, so refusing on error is
 * cheap, while allowing on error would silently void the guarantee.
 */

import { readFileSync, existsSync, realpathSync } from "node:fs";
import { join, basename, dirname } from "node:path";

const FRESH_MS = 60 * 60 * 1000;

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

function allow() {
  process.exit(0);
}

function block(msg) {
  console.error(msg);
  process.exit(2);
}

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  allow(); // Not a hook payload we understand; not our business.
}

const tool = input.tool_name ?? "";
if (!["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool)) allow();

const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? "";
if (!filePath) allow();

/* Resolve through the .claude/skills -> .agents/skills symlink so the gate
   cannot be sidestepped by addressing the same file by its other path. */
let resolved = filePath;
try {
  const dir = dirname(filePath);
  if (existsSync(dir)) resolved = join(realpathSync(dir), basename(filePath));
} catch {
  /* keep the literal path */
}

if (basename(resolved) !== "SKILL.md") allow();
if (!resolved.includes("/skills/")) allow();

/* A file that does not exist yet is a new draft, not an edit to live memory. */
if (!existsSync(resolved)) allow();

const skill = basename(dirname(resolved));
const receiptPath = join(root, ".agents", "skills", ".validation", `${skill}.json`);

if (!existsSync(receiptPath)) {
  block(
    `[skill-write-gate] BLOCKED: editing ${skill}/SKILL.md with no validation receipt.\n\n` +
      `A skill update needs an objective signal external to the model -- importance is not truth.\n` +
      `Run the skill's declared verification signal first:\n\n` +
      `    node .agents/skills/scripts/record-validation.mjs ${skill}\n\n` +
      `If the signal cannot pass, the memory pipeline says DISCARD the learning rather than write it.`,
  );
}

let receipt;
try {
  receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
} catch (err) {
  block(`[skill-write-gate] BLOCKED: receipt for ${skill} is unreadable (${err.message}). Re-run record-validation.mjs.`);
}

if (receipt.exit !== 0) {
  block(`[skill-write-gate] BLOCKED: the receipt for ${skill} records a FAILING signal (exit ${receipt.exit}). Discard the learning.`);
}

const age = Date.now() - (receipt.at ?? 0);
if (age > FRESH_MS) {
  block(
    `[skill-write-gate] BLOCKED: the receipt for ${skill} is ${Math.round(age / 60000)} minutes old (max 60).\n` +
      `A stale green does not describe the tree you are about to change. Re-run:\n\n` +
      `    node .agents/skills/scripts/record-validation.mjs ${skill}`,
  );
}

allow();
