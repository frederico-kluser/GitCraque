#!/usr/bin/env node
/**
 * proxy-editor — executado PELO GIT, nunca pelo servidor.
 *
 * O git chama este script como `GIT_SEQUENCE_EDITOR` do `git rebase -i`, com o
 * caminho do `git-rebase-todo` em `process.argv[2]`. Ele nao tem acesso nenhum
 * ao estado do servidor: recebe tudo por variavel de ambiente.
 *
 * MODOS:
 *
 *   Modo sequence-editor (squash / rebase interativo):
 *     GITCRAQUE_SQUASH_HASHES   hashes completos selecionados, separados por virgula
 *     GITCRAQUE_SQUASH_MODE     "squash" (default) ou "fixup"
 *     GITCRAQUE_SQUASH_AUDIT    arquivo onde gravar o todo original e o reescrito
 *     GITCRAQUE_REBASE_HASHES   hashes completos no rebase, separados por virgula
 *     GITCRAQUE_REBASE_ACTIONS  JSON: [{"hash","action"},...] — acao de cada commit
 *     GITCRAQUE_REBASE_AUDIT    arquivo onde gravar o todo original e o reescrito
 *
 *   Modo git-editor (reword):
 *     GITCRAQUE_REWORD_QUEUE    caminho para arquivo JSON: [mensagem, ...]
 *                               O proxy le o primeiro elemento da fila, escreve o
 *                               conteudo no arquivo de mensagem do commit, remove
 *                               o primeiro elemento e grava a fila de volta.
 *     GITCRAQUE_REWORD_AUDIT    arquivo onde gravar diagnostico
 *
 * A regra que faz o rebase funcionar: o PRIMEIRO commit selecionado continua
 * `pick`. Sem isso o git aborta com "cannot squash without a previous commit".
 *
 * Sair com 0 = todo aceito. Sair com !=0 = o git cancela o rebase inteiro, que
 * e exatamente o que queremos quando o todo nao bate com o plano.
 */
import fs from "node:fs";

import {
  ENV_REBASE_ACTIONS,
  ENV_REBASE_AUDIT,
  ENV_REBASE_HASHES,
  ENV_REWORD_AUDIT,
  ENV_REWORD_MESSAGE,
  ENV_REWORD_QUEUE,
  ENV_SQUASH_AUDIT,
  ENV_SQUASH_HASHES,
  ENV_SQUASH_MODE,
} from "../contract.mjs";

const todoPath = process.argv[2];

/* ------------------------------------------------------------------ */
/* Auditoria generica                                                  */
/* ------------------------------------------------------------------ */

/** Grava a auditoria para o servidor devolver em originalTodo/rewrittenTodo. */
function audit(payload, auditPath) {
  if (!auditPath) return;
  try {
    fs.writeFileSync(auditPath, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    /* auditoria e diagnostico: nao pode derrubar o rebase */
  }
}

function fail(message, opts = {}) {
  audit({ ok: false, error: message, ...opts }, opts.auditPath || "");
  process.stderr.write(`gitcraque proxy-editor: ${message}\n`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Modo git-editor: reword                                             */
/* ------------------------------------------------------------------ */

const rewordQueuePath = process.env[ENV_REWORD_QUEUE] || "";
const rewordAuditPath = process.env[ENV_REWORD_AUDIT] || "";

if (rewordQueuePath) {
  if (!todoPath) fail("o git nao passou o caminho da mensagem do commit", { auditPath: rewordAuditPath });

  // O GIT_EDITOR e chamado em varios contextos.
  // So consumimos a fila quando o arquivo NAO e uma mensagem combinada de squash
  // (que comeca com "# This is a combination of...").
  let content;
  try {
    content = fs.readFileSync(todoPath, "utf8");
  } catch (err) {
    fail(`nao consegui ler a mensagem em ${todoPath}: ${err.message}`, { auditPath: rewordAuditPath });
  }

  // O GIT_EDITOR e chamado para o todo depois do GIT_SEQUENCE_EDITOR.
  // So consumimos a fila quando o arquivo e uma mensagem de commit de verdade
  // (nao e todo nem squash combinado). Sempre que houver duvida, pular.
  const isTodo = /^(pick|reword|squash|fixup|drop|edit|exec|break)[\t ]/m.test(content);
  const isSquash = /^#\s*(This is a combination of|Please enter the commit message)/m.test(content);

  if (isSquash || isTodo) {
    audit({ ok: true, mode: "reword-skip", reason: "not-a-commit-message" }, rewordAuditPath);
    process.exit(0);
  }

  let queue;
  try {
    queue = JSON.parse(fs.readFileSync(rewordQueuePath, "utf8"));
  } catch (err) {
    fail(`nao consegui ler a fila de reword ${rewordQueuePath}: ${err.message}`, { auditPath: rewordAuditPath });
  }

  if (!Array.isArray(queue) || queue.length === 0) {
    fail("fila de reword vazia — mais chamadas de GIT_EDITOR do que mensagens", { auditPath: rewordAuditPath });
  }

  const message = queue[0];
  const remaining = queue.slice(1);

  try {
    fs.writeFileSync(todoPath, String(message ?? ""), "utf8");
  } catch (err) {
    fail(`nao consegui gravar a mensagem em ${todoPath}: ${err.message}`, { auditPath: rewordAuditPath });
  }

  try {
    fs.writeFileSync(rewordQueuePath, JSON.stringify(remaining), "utf8");
  } catch {
    /* Fila corrompida — os rewrites seguintes vao falhar. Melhor do que
     * reusar a mensagem e ficar com o historico errado. */
  }

  audit({ ok: true, mode: "reword", consumed: message, remaining: remaining.length }, rewordAuditPath);
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* Modo sequence-editor: squash                                       */
/* ------------------------------------------------------------------ */

const selected = (process.env[ENV_SQUASH_HASHES] || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);
const mode = process.env[ENV_SQUASH_MODE] === "fixup" ? "fixup" : "squash";
const squashAuditPath = process.env[ENV_SQUASH_AUDIT] || "";

if (selected.length > 0) {
  if (!todoPath) fail("o git nao passou o caminho do git-rebase-todo", { auditPath: squashAuditPath });

  let originalTodo;
  try {
    originalTodo = fs.readFileSync(todoPath, "utf8");
  } catch (err) {
    fail(`nao consegui ler ${todoPath}: ${err.message}`, { auditPath: squashAuditPath });
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
    const match = /^(pick|p)([ \t]+)([0-9a-fA-F]+)([ \t]+.*)?$/.exec(line);
    if (!match || !isSelected(match[3])) {
      rewritten.push(line);
      continue;
    }
    matched += 1;
    if (matched === 1) {
      rewritten.push(line);
      continue;
    }
    rewritten.push(`${mode}${match[2]}${match[3]}${match[4] ?? ""}`);
  }

  if (matched !== selected.length) {
    fail(
      `esperava ${selected.length} commits no todo, encontrei ${matched}`,
      { originalTodo, matched, auditPath: squashAuditPath },
    );
  }

  const rewrittenTodo = rewritten.join("\n");
  try {
    fs.writeFileSync(todoPath, rewrittenTodo, "utf8");
  } catch (err) {
    fail(`nao consegui gravar ${todoPath}: ${err.message}`, { auditPath: squashAuditPath });
  }

  audit({ ok: true, mode, selected, matched, originalTodo, rewrittenTodo }, squashAuditPath);
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* Modo sequence-editor: rebase interativo                             */
/* ------------------------------------------------------------------ */

const rebaseHashes = (process.env[ENV_REBASE_HASHES] || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);
const rebaseActionsRaw = process.env[ENV_REBASE_ACTIONS] || "";
const rebaseAuditPath = process.env[ENV_REBASE_AUDIT] || "";

if (rebaseHashes.length > 0) {
  if (!todoPath) fail("o git nao passou o caminho do git-rebase-todo", { auditPath: rebaseAuditPath });

  let actions;
  try {
    actions = JSON.parse(rebaseActionsRaw);
  } catch (err) {
    fail(`ENV_REBASE_ACTIONS nao e JSON valido: ${err.message}`, { auditPath: rebaseAuditPath });
  }

  if (!Array.isArray(actions) || actions.length === 0) {
    fail("ENV_REBASE_ACTIONS vazio: nao ha o que reescrever", { auditPath: rebaseAuditPath });
  }

  // Cria mapa hash -> acao (hashes vindos de ENV sao completos; no todo sao abreviados)
  const actionMap = new Map();
  const actionEntries = [];
  for (const entry of actions) {
    const hash = String(entry.hash || "").toLowerCase().trim();
    const action = String(entry.action || "pick").toLowerCase().trim();
    if (!hash) continue;
    actionMap.set(hash, action);
    actionEntries.push({ hash, action });
  }

  /** Procura a acao por prefixo do hash (o todo usa hash abreviado). */
  function actionFor(todoHash) {
    const needle = todoHash.toLowerCase();
    for (const entry of actionEntries) {
      if (entry.hash.startsWith(needle) || needle.startsWith(entry.hash)) {
        return entry.action;
      }
    }
    return "pick";
  }

  let originalTodo;
  try {
    originalTodo = fs.readFileSync(todoPath, "utf8");
  } catch (err) {
    fail(`nao consegui ler ${todoPath}: ${err.message}`, { auditPath: rebaseAuditPath });
  }

  function rebaseIsSelected(todoHash) {
    const needle = todoHash.toLowerCase();
    return rebaseHashes.some((full) => full.startsWith(needle) || needle.startsWith(full));
  }

  const lines = originalTodo.split("\n");
  const rewritten = [];
  let matched = 0;

  for (const line of lines) {
    const match = /^(pick|p)([ \t]+)([0-9a-fA-F]+)([ \t]+.*)?$/.exec(line);
    if (!match || !rebaseIsSelected(match[3])) {
      rewritten.push(line);
      continue;
    }
    matched += 1;
    const hash = match[3];
    const action = actionFor(hash);
    // "reword" vira "pick" + "exec git commit --amend -m ..." injetado
    // como linha extra, para evitar depender do GIT_EDITOR.
    if (action === "reword") {
      rewritten.push(line); // mantem como pick
      // A mensagem nova viaja em GITCRAQUE_REWORD_MESSAGE, um JSON mapeando hash -> mensagem.
      const rewordMessagesRaw = process.env[ENV_REWORD_MESSAGE] || "{}";
      let rewordMessages = {};
      try {
        rewordMessages = JSON.parse(rewordMessagesRaw);
      } catch { /* ignora JSON invalido */ }
      // O hash do todo e abreviado; o mapa tem hashes completos. Prefix match.
      let newMessage = "";
      const needle = hash.toLowerCase();
      for (const [full, msg] of Object.entries(rewordMessages)) {
        if (full.toLowerCase().startsWith(needle) || needle.startsWith(full.toLowerCase())) {
          newMessage = String(msg || "");
          break;
        }
      }
      if (newMessage) {
        // Escapa aspas simples na mensagem para shell quoting.
        const escaped = newMessage.replace(/'/g, `'\\''`);
        rewritten.push(`exec git commit --amend -m '${escaped}'`);
      }
    } else if (!action || action === "pick") {
      rewritten.push(line);
    } else {
      rewritten.push(`${action}${match[2]}${hash}${match[4] ?? ""}`);
    }
  }

  if (matched !== rebaseHashes.length) {
    fail(
      `esperava ${rebaseHashes.length} commits no todo, encontrei ${matched}`,
      { originalTodo, matched, auditPath: rebaseAuditPath },
    );
  }

  const rewrittenTodo = rewritten.join("\n");
  try {
    fs.writeFileSync(todoPath, rewrittenTodo, "utf8");
  } catch (err) {
    fail(`nao consegui gravar ${todoPath}: ${err.message}`, { auditPath: rebaseAuditPath });
  }

  audit({ ok: true, mode: "rebase-interactive", matched, originalTodo, rewrittenTodo }, rebaseAuditPath);
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* Legacy: GIT_EDITOR com ENV_REWORD_MESSAGE (compatibilidade)       */
/* ------------------------------------------------------------------ */

const rewordMessage = process.env[ENV_REWORD_MESSAGE];

if (rewordMessage !== undefined) {
  if (!todoPath) fail("o git nao passou o caminho da mensagem", { auditPath: rewordAuditPath });
  try {
    fs.writeFileSync(todoPath, rewordMessage, "utf8");
  } catch (err) {
    fail(`nao consegui gravar mensagem em ${todoPath}: ${err.message}`, { auditPath: rewordAuditPath });
  }
  audit({ ok: true, mode: "reword-single" }, rewordAuditPath);
  process.exit(0);
}

/* Nenhum modo reconhecido — nada a fazer. */
fail("proxy-editor chamado sem modo reconhecido (variavel de ambiente faltando)", { auditPath: "" });
