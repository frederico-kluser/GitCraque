/**
 * O pi coding agent, como PROCESSO EXTERNO.
 *
 * O backend do GitCraque tem exatamente uma dependencia (`ws`) e vai continuar
 * tendo. O pi traz 21 dependencias diretas e ~33 MB; colocar isso no
 * `package.json` resolveria o problema errado. Entao ele entra pelo mesmo
 * mecanismo do `git`: `spawn` com argv em array, ambiente controlado, saida
 * lida linha a linha.
 *
 * ── A chave nunca vai em argv ────────────────────────────────────────
 * O pi aceita `--api-key`, e nos NAO usamos. Argumento de processo e legivel
 * por qualquer usuario da maquina (`ps`, `/proc/<pid>/cmdline` com modo 0444).
 * A chave vai por variavel de ambiente, que no Linux so o dono do processo le.
 * E a mesma disciplina que o trampolim do askpass ja aplica ao token do git.
 *
 * ── Hermetismo ───────────────────────────────────────────────────────
 * Sem cerca, o pi carrega `~/.pi` do host e extensoes npm que o usuario tenha
 * instalado para outra coisa, e tenta se atualizar pela rede no boot. O huu
 * resolvia isso montando o ambiente na memoria (`hermetic.ts`); por fora, o
 * equivalente sao tres variaveis: `PI_CODING_AGENT_DIR`, `PI_OFFLINE` e
 * `PI_TELEMETRY`.
 */
import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";

import { configHome } from "../git/store.mjs";
import { runtime } from "../runtime.mjs";

/** Versao fixada. O agente e parte do produto; nao flutua com o npm. */
export const PI_PACKAGE = "@mariozechner/pi-coding-agent@0.73.1";

/** O modelo que roda o agente, pela OpenRouter. */
export const AGENT_MODEL = "deepseek/deepseek-v4-pro";

/**
 * Niveis de raciocinio que o pi aceita em `--thinking`, do menor para o maior.
 * Confirmado em `pi --help` da 0.73.x. Nao inventar nivel: valor desconhecido
 * faz o pi sair com erro de uso, e a sessao morre antes de gastar token.
 */
export const THINKING_LEVELS = /** @type {const} */ ([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

/**
 * O teto. Resolver conflito e a tarefa mais cara de errar que o agente faz aqui
 * — o resultado vira commit —, entao ela paga o raciocinio maximo.
 * `deepseek/deepseek-v4-pro` suporta thinking (1M de contexto, 384K de saida).
 */
export const MAX_THINKING = "xhigh";

/** Teto de uma sessao. Acima disso algo travou e ninguem esta esperando mais. */
export const SESSION_TIMEOUT_MS = 15 * 60_000;

/**
 * Diretorio de configuracao do pi, dentro da configuracao do GitCraque.
 * Isola do `~/.pi` do host sem apagar nada de ninguem.
 */
export function piAgentDir() {
  return path.join(configHome(), "gitcraque", "pi-agent");
}

/**
 * Procura o `pi` no PATH sem usar shell.
 *
 * `command -v` resolveria em uma linha e esta proibido — a regra do projeto e
 * `spawn` com argv, nunca `shell: true`. Entao a busca e a mesma que o shell
 * faria: percorrer o PATH e testar permissao de execucao.
 *
 * @returns {Promise<string>} caminho absoluto, ou "" se nao achou
 */
export async function findPiOnPath() {
  const raw = process.env.PATH ?? "";
  const names = process.platform === "win32" ? ["pi.cmd", "pi.exe", "pi"] : ["pi"];
  for (const dir of raw.split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = path.join(dir, name);
      try {
        await fsp.access(candidate, fsp.constants.X_OK);
        return candidate;
      } catch {
        // nao esta aqui, ou nao e executavel — proximo
      }
    }
  }
  return "";
}

/**
 * @typedef {object} PiLauncher
 * @property {"path" | "npx"} kind    de onde o binario vem
 * @property {string} command         executavel
 * @property {string[]} prefixArgs    argumentos que vem ANTES dos do pi
 * @property {boolean} needsDownload  true quando a primeira execucao baixa ~33 MB
 */

/**
 * Decide como invocar o pi: o do PATH, ou o `npx` como rede de seguranca.
 * @returns {Promise<PiLauncher>}
 */
export async function discoverPi() {
  const onPath = await findPiOnPath();
  if (onPath) {
    return { kind: "path", command: onPath, prefixArgs: [], needsDownload: false };
  }
  return {
    kind: "npx",
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    prefixArgs: ["-y", PI_PACKAGE],
    needsDownload: true,
  };
}

/**
 * Traduz um evento do pi para o formato que o WebSocket carrega.
 *
 * Funcao pura, testada com objetos sintetizados — sem isso o parser so seria
 * exercitado por uma sessao real, que custa dinheiro e precisa de rede.
 *
 * Formas consumidas (subconjunto do AgentSessionEvent do pi 0.73.x):
 *   {type:"agent_start"} | {type:"agent_end"}
 *   {type:"tool_execution_start", toolName, args}
 *   {type:"tool_execution_end", toolName, isError?}
 *   {type:"message_update", assistantMessageEvent:{type, delta}}
 *   {type:"message_end", message:{usage:{...}}}
 *   {type:"error", message?}
 *
 * @param {unknown} event
 * @returns {{kind: string, [k: string]: unknown} | null} null = ignorar
 */
export function translateEvent(event) {
  if (!event || typeof event !== "object") return null;
  const ev = /** @type {Record<string, unknown>} */ (event);

  switch (ev.type) {
    case "agent_start":
      return { kind: "start" };

    case "tool_execution_start": {
      const tool = String(ev.toolName ?? "");
      const args = /** @type {Record<string, unknown>} */ (ev.args ?? {});
      // O `bash` e o unico que interessa mostrar por extenso: e nele que o git
      // acontece, e ver o comando literal e a promessa central do produto.
      const command =
        tool === "bash" && typeof args.command === "string" ? args.command : "";
      const file =
        typeof args.path === "string"
          ? args.path
          : typeof args.file_path === "string"
            ? args.file_path
            : "";
      return { kind: "tool", tool, command, file };
    }

    case "tool_execution_end":
      return { kind: "tool-end", tool: String(ev.toolName ?? ""), failed: ev.isError === true };

    case "message_update": {
      const sub = /** @type {{type?: string, delta?: unknown}} */ (ev.assistantMessageEvent);
      if (!sub || typeof sub.delta !== "string" || !sub.delta) return null;
      // So o texto: o `thinking_delta` e barulho para quem olha uma bolha.
      if (sub.type !== "text_delta") return null;
      return { kind: "text", delta: sub.delta };
    }

    case "message_end": {
      const message = /** @type {Record<string, unknown>} */ (ev.message ?? {});
      // O pi NAO emite {type:"error"} quando o provider recusa. A falha vem
      // aqui dentro, como stopReason:"error" + errorMessage — verificado numa
      // execucao real com chave invalida, que devolve
      // `errorMessage: "401 User not found."` e sai com codigo 1. Sem este
      // ramo o motivo se perderia: no modo json o stderr fica vazio, e a
      // interface mostraria so "exit 1" para o erro mais comum de todos.
      if (message.stopReason === "error" || message.stopReason === "aborted") {
        return {
          kind: "error",
          message: String(message.errorMessage || `request ${message.stopReason}`),
        };
      }
      const usage = /** @type {Record<string, unknown>} */ (message.usage ?? ev.usage ?? {});
      const cost = Number(/** @type {Record<string, unknown>} */ (usage.cost ?? {}).total) || 0;
      if (!cost) return null;
      return { kind: "usage", cost };
    }

    case "agent_end":
      return { kind: "end" };

    case "error":
      return { kind: "error", message: String(ev.message ?? "unknown error") };

    default:
      return null;
  }
}

/**
 * Monta o ambiente do processo do pi.
 *
 * Tres grupos: a credencial (so em env), o hermetismo, e o trampolim do
 * GitCraque — sem este ultimo, um `git push` disparado pelo agente pararia
 * esperando senha num terminal que nao existe, e a sessao inteira travaria ate
 * o teto de tempo.
 *
 * @param {string} apiKey
 * @returns {Record<string, string>}
 */
export function buildPiEnv(apiKey) {
  return {
    ...process.env,
    ...runtime.trampolineEnv,
    OPENROUTER_API_KEY: apiKey,
    PI_CODING_AGENT_DIR: piAgentDir(),
    PI_OFFLINE: "1",
    PI_TELEMETRY: "0",
    // O git nao pode abrir editor nem paginador dentro de um processo sem tty.
    GIT_EDITOR: "true",
    GIT_PAGER: "cat",
    PAGER: "cat",
  };
}

/**
 * Os argumentos do pi. Separado do spawn para o teste conferir a argv sem
 * precisar executar nada.
 *
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {string} params.message
 * @param {string} [params.model]
 * @param {typeof THINKING_LEVELS[number]} [params.thinking] omitido = padrao do pi
 * @returns {string[]}
 */
export function buildPiArgs({ systemPrompt, message, model = AGENT_MODEL, thinking }) {
  // Nivel invalido nao vira argv: o pi sairia com erro de uso e a sessao
  // morreria depois de ja ter aberto. Sem `thinking`, o argv sai identico ao
  // que sempre foi — a chamada de voz nao muda de comportamento.
  const pensar = thinking && THINKING_LEVELS.includes(thinking) ? ["--thinking", thinking] : [];

  return [
    "--print",
    "--mode",
    "json",
    "--provider",
    "openrouter",
    "--model",
    model,
    ...pensar,
    // Sem sessao: o pi gravaria a transcricao em disco e, rodando dentro do
    // repositorio do usuario, ela poderia acabar num commit.
    "--no-session",
    "--system-prompt",
    systemPrompt,
    message,
  ];
}

/**
 * Roda uma sessao do agente ate o fim.
 *
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} params.systemPrompt
 * @param {string} params.message
 * @param {string} params.cwd
 * @param {string} [params.model]
 * @param {typeof THINKING_LEVELS[number]} [params.thinking]
 * @param {(event: object) => void} params.onEvent
 * @param {(child: import("node:child_process").ChildProcess) => void} [params.onSpawn]
 * @param {typeof spawn} [params.spawnImpl] injetado no teste
 * @returns {Promise<{ok: boolean, code: number, text: string, cost: number}>}
 */
export async function runAgent({
  apiKey,
  systemPrompt,
  message,
  cwd,
  model,
  thinking,
  onEvent,
  onSpawn,
  spawnImpl = spawn,
}) {
  const launcher = await discoverPi();
  const args = [
    ...launcher.prefixArgs,
    ...buildPiArgs({ systemPrompt, message, model, thinking }),
  ];

  const child = spawnImpl(launcher.command, args, {
    cwd,
    env: buildPiEnv(apiKey),
    stdio: ["ignore", "pipe", "pipe"],
  });
  onSpawn?.(child);

  let text = "";
  let cost = 0;
  let stderr = "";
  let buffer = "";
  let failure = "";

  const emit = (event) => {
    const translated = translateEvent(event);
    if (!translated) return;
    if (translated.kind === "text") text += translated.delta;
    if (translated.kind === "usage") cost += Number(translated.cost) || 0;
    // Guarda o motivo para o chamador reportar algo melhor que "exit 1".
    if (translated.kind === "error") failure = String(translated.message);
    onEvent(translated);
  };

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => {
    buffer += chunk;
    // NDJSON: um evento por linha. A ultima fatia pode estar pela metade e fica
    // no buffer ate a proxima chegada.
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) {
        try {
          emit(JSON.parse(line));
        } catch {
          // Linha que nao e JSON: aviso do npx, banner. Nao e evento, ignora.
        }
      }
      index = buffer.indexOf("\n");
    }
  });

  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => {
    // Teto para o stderr nao virar vazamento de memoria numa sessao longa.
    if (stderr.length < 64_000) stderr += chunk;
  });

  const timer = setTimeout(() => child.kill("SIGKILL"), SESSION_TIMEOUT_MS);

  const code = await new Promise((resolve) => {
    child.on("error", (err) => {
      onEvent({ kind: "error", message: String(err?.message ?? err) });
      resolve(-1);
    });
    child.on("close", (exitCode) => resolve(exitCode ?? -1));
  });
  clearTimeout(timer);

  // O stderr so vira erro quando o fluxo json nao trouxe nenhum: no modo json
  // o pi manda a falha do provider como evento, e o stderr fica vazio.
  if (code !== 0 && !failure && stderr.trim()) {
    failure = stderr.trim().slice(0, 2_000);
    onEvent({ kind: "error", message: failure });
  }

  return { ok: code === 0, code, text: text.trim(), cost, error: failure };
}
