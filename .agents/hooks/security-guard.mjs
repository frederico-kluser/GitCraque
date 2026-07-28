#!/usr/bin/env node
/*
 * PreToolUse security guardrail.
 *
 * Two jobs: keep secrets out of the transcript, and keep unrecoverable commands
 * from running. Hooks fire for subagent tool calls too, so this applies
 * recursively to every agent the router spawns.
 *
 * Calibration matters more than coverage here. GitCraque is a git client whose
 * own test suite builds throwaway repositories and runs rebases, resets and
 * squashes against them. A guard that blocked "dangerous git" wholesale would
 * block the project's actual work, get switched off, and protect nothing. So
 * this blocks only what is unrecoverable or exfiltrating, and deliberately
 * leaves ordinary git surgery alone.
 *
 * Semantics: exit 0 = allow, exit 2 = block (stderr reaches Claude).
 * Fails CLOSED on a malformed payload -- that is the point of a guardrail.
 */

import { readFileSync } from "node:fs";

function allow() {
  process.exit(0);
}

function block(reason, suggestion) {
  console.error(`[security-guard] BLOCKED: ${reason}${suggestion ? `\n${suggestion}` : ""}`);
  process.exit(2);
}

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  allow();
}

const tool = input.tool_name ?? "";
const ti = input.tool_input ?? {};

/* ---------------------------- secret material ----------------------------- */

const SECRET_PATHS = [
  /(^|\/)\.env(\.|$)/,
  /(^|\/)secrets?\//,
  /(^|\/)\.ssh\//,
  /(^|\/)id_(rsa|ed25519|ecdsa)(\.|$)/,
  /(^|\/)\.netrc$/,
  /(^|\/)credentials\.json$/,
];

if (["Read", "Write", "Edit", "MultiEdit"].includes(tool)) {
  const p = ti.file_path ?? "";
  if (SECRET_PATHS.some((re) => re.test(p))) {
    block(
      `${tool} on '${p}' -- credential material must not enter the transcript.`,
      `If you need a value from it, ask the user to provide it directly.`,
    );
  }
}

if (tool !== "Bash") allow();

const cmd = String(ti.command ?? "");

/* ------------------------- unrecoverable filesystem ----------------------- */

/* rm -rf aimed at a root, a home directory, or a bare variable that could be
   empty. Project-local rm -rf is left alone: it is recoverable from git. */
const RM_CATASTROPHE = [
  /\brm\s+(-[a-zA-Z]*\s+)*-?[a-zA-Z]*[rR][a-zA-Z]*f?[a-zA-Z]*\s+(\/|~|\$HOME|\/\*|\.\.)(\s|$)/,
  /\brm\s+-rf?\s+"?\$\{?\w*\}?"?\s*\//,
];
if (RM_CATASTROPHE.some((re) => re.test(cmd))) {
  block(`'${cmd.slice(0, 120)}' targets a root or home path.`, `Delete inside the project only, and prefer git for anything tracked.`);
}

/* ---------------------- irreversible history rewriting -------------------- */

/* Scoped to the OUTER repository: rewriting GitCraque's own history destroys
   the audit trail that every skill update depends on for rollback. Operations
   inside a temporary fixture repo are how this project's tests work, so paths
   under /tmp or a test fixture directory are exempt. */
const touchesTempRepo = /(^|\s)(-C\s+)?(\/tmp\/|\$TMPDIR|fixtures?\/|\.test-repo)/.test(cmd);

const HISTORY_DESTROYERS = [
  { re: /\bgit\s+push\b[^|;]*\s(--force|-f)\b(?![\w-])/, why: "force-push overwrites remote history" },
  { re: /\bgit\s+filter-branch\b/, why: "filter-branch rewrites every commit" },
  { re: /\bgit\s+reflog\s+expire\b[^|;]*--expire[= ]now/, why: "expiring the reflog removes the last undo path" },
  { re: /\bgit\s+update-ref\s+-d\s+refs\/heads\//, why: "deleting a branch ref by plumbing leaves no reflog entry" },
];

if (!touchesTempRepo) {
  for (const { re, why } of HISTORY_DESTROYERS) {
    if (re.test(cmd)) {
      block(
        `'${cmd.slice(0, 120)}' -- ${why}.`,
        `Git history is the rollback mechanism for every skill update here. Ask the user before rewriting it. ` +
          `--force-with-lease on a feature branch is usually the safe alternative.`,
      );
    }
  }
}

/* ----------------------------- remote code exec --------------------------- */

if (/\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba)?sh\b/.test(cmd)) {
  block(`piping a download straight into a shell.`, `Download to a file, read it, then run it deliberately.`);
}

/* ------------------------------ secret echo ------------------------------- */

if (/\b(cat|head|tail|less|more|strings)\b[^|;]*(\.env|id_rsa|id_ed25519|\.netrc)/.test(cmd)) {
  block(`printing credential material to the transcript.`);
}

allow();
