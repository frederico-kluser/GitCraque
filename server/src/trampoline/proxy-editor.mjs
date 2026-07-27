#!/usr/bin/env node
/**
 * proxy-editor — executado PELO GIT, nunca pelo servidor.
 *
 * O git chama este script como `GIT_SEQUENCE_EDITOR` do `git rebase -i`, com o
 * caminho do `git-rebase-todo` em `process.argv[2]`. Ele nao tem acesso nenhum
 * ao estado do servidor: recebe tudo por variavel de ambiente.
 *
 *   GITCRAQUE_SQUASH_HASHES  hashes completos selecionados, separados por virgula
 *   GITCRAQUE_SQUASH_MODE    "squash" (default) ou "fixup"
 *   GITCRAQUE_SQUASH_AUDIT   arquivo onde gravar o todo original e o reescrito
 *
 * A regra que faz o rebase funcionar: o PRIMEIRO commit selecionado continua
 * `pick`. Sem isso o git aborta com "cannot squash without a previous commit".
 *
 * Sair com 0 = todo aceito. Sair com !=0 = o git cancela o rebase inteiro, que
 * e exatamente o que queremos quando o todo nao bate com o plano.
 */
import fs from "node:fs";

import { ENV_SQUASH_AUDIT, ENV_SQUASH_HASHES, ENV_SQUASH_MODE } from "../contract.mjs";

const todoPath = process.argv[2];
const selected = (process.env[ENV_SQUASH_HASHES] || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);
const mode = process.env[ENV_SQUASH_MODE] === "fixup" ? "fixup" : "squash";
const auditPath = process.env[ENV_SQUASH_AUDIT] || "";

/** Grava a auditoria para o servidor devolver em originalTodo/rewrittenTodo. */
function audit(payload) {
  if (!auditPath) return;
  try {
    fs.writeFileSync(auditPath, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    /* auditoria e diagnostico: nao pode derrubar o rebase */
  }
}

function fail(message, extra = {}) {
  audit({ ok: false, error: message, mode, selected, ...extra });
  process.stderr.write(`gitcraque proxy-editor: ${message}\n`);
  process.exit(1);
}

if (!todoPath) fail("o git nao passou o caminho do git-rebase-todo");
if (!selected.length) fail(`${ENV_SQUASH_HASHES} vazio: nao ha o que reescrever`);

let originalTodo;
try {
  originalTodo = fs.readFileSync(todoPath, "utf8");
} catch (err) {
  fail(`nao consegui ler ${todoPath}: ${err.message}`);
}

/** O hash do todo vem ABREVIADO: casa por prefixo contra os hashes completos. */
function isSelected(todoHash) {
  const needle = todoHash.toLowerCase();
  return selected.some((full) => full.startsWith(needle) || needle.startsWith(full));
}

const lines = originalTodo.split("\n");
const rewritten = [];
let matched = 0;

for (const line of lines) {
  // "pick 1a2b3c assunto do commit" — tambem aceita a forma curta "p".
  const match = /^(pick|p)([ \t]+)([0-9a-fA-F]+)([ \t]+.*)?$/.exec(line);
  if (!match || !isSelected(match[3])) {
    rewritten.push(line);
    continue;
  }
  matched += 1;
  if (matched === 1) {
    // O primeiro selecionado e a base do squash: continua pick.
    rewritten.push(line);
    continue;
  }
  rewritten.push(`${mode}${match[2]}${match[3]}${match[4] ?? ""}`);
}

if (matched !== selected.length) {
  fail(
    `esperava ${selected.length} commits no todo, encontrei ${matched}`,
    { originalTodo, matched },
  );
}

const rewrittenTodo = rewritten.join("\n");
try {
  fs.writeFileSync(todoPath, rewrittenTodo, "utf8");
} catch (err) {
  fail(`nao consegui gravar ${todoPath}: ${err.message}`);
}

audit({ ok: true, mode, selected, matched, originalTodo, rewrittenTodo });
process.exit(0);
