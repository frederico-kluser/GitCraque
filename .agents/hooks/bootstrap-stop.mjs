#!/usr/bin/env node
/*
 * Bootstrap Stop gate.
 *
 * Blocks the agent from ending its turn while the knowledge-skill system
 * bootstrap still has red phases. Without this, "progress was made" is
 * indistinguishable from "the mission is done" and the agent stops early.
 *
 * Semantics: exit 0 = allow stop, exit 2 = block stop (stderr reaches Claude).
 *
 * Two safety properties:
 *   - Fail OPEN. Any unexpected error allows the stop. A buggy hook must never
 *     trap a session; availability beats enforcement for this particular gate.
 *   - Bounded. After MAX_BLOCKS consecutive blocks the gate gives up and lets
 *     the turn end with a report, so a genuinely stuck phase cannot loop forever.
 *
 * Once every phase is done + gate_passed this hook is a no-op and can be
 * removed from .claude/settings.json. See .agents/README.md.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MAX_BLOCKS = 12;

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const statePath = join(root, ".agents", "skills", ".bootstrap-state.json");
const guardPath = join(root, ".agents", ".stop-guard.json");

function allow() {
  process.exit(0);
}

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function readGuard() {
  try {
    return JSON.parse(readFileSync(guardPath, "utf8"));
  } catch {
    return { blocks: 0 };
  }
}

try {
  // No state file means no bootstrap in flight: nothing to enforce.
  if (!existsSync(statePath)) allow();

  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const phases = Array.isArray(state.phases) ? state.phases : [];
  const pending = phases.filter((p) => !(p.done === true && p.gate_passed === true));

  if (pending.length === 0) {
    // Mission complete. Reset the counter so a later run starts clean.
    if (existsSync(guardPath)) writeFileSync(guardPath, JSON.stringify({ blocks: 0 }, null, 2));
    allow();
  }

  const input = readStdin();
  const guard = readGuard();

  // stop_hook_active means we already blocked once and Claude is running again.
  // Count those blocks; give up rather than spin.
  const blocks = input.stop_hook_active ? (guard.blocks ?? 0) + 1 : 1;
  writeFileSync(guardPath, JSON.stringify({ blocks }, null, 2));

  if (blocks > MAX_BLOCKS) {
    console.error(
      `[bootstrap-stop] Giving up after ${MAX_BLOCKS} blocks. Still pending: ` +
        pending.map((p) => `${p.id}:${p.name}`).join(", ") +
        `. Report the blockage to the user instead of continuing silently.`,
    );
    allow();
  }

  const list = pending
    .map((p) => `  - phase ${p.id} "${p.name}" -> artifact ${p.artifact} (done=${p.done}, gate_passed=${p.gate_passed})`)
    .join("\n");

  console.error(
    `[bootstrap-stop] The knowledge-skill bootstrap is not finished. Pending phases:\n${list}\n\n` +
      `Continue the mission: run the phase's self-verification gate, write its artifact, commit, ` +
      `then flip done/gate_passed in .agents/skills/.bootstrap-state.json. ` +
      `Only flip a phase after an objective pass signal (tests, typecheck, linter, eval). ` +
      `Block ${blocks}/${MAX_BLOCKS}.`,
  );
  process.exit(2);
} catch (err) {
  console.error(`[bootstrap-stop] disabled by error: ${err?.message ?? err}`);
  allow();
}
