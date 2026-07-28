/**
 * O NUCLEO: a unica porta de entrada para o binario do git no projeto inteiro.
 *
 * Regras que este modulo garante e ninguem contorna:
 *  - `spawn(gitBin, argvArray)` sempre. Nunca `shell: true`, nunca interpolacao
 *    de entrada do usuario numa string de comando.
 *  - Ambiente injetado em toda chamada (prompt desligado, editor/pager mudos,
 *    locale C para o parser, trampolim de askpass ligado).
 *  - Todo comando visivel emite `git:command` no WebSocket (start -> stdout/
 *    stderr em streaming -> exit com o GitCommandResult completo).
 *  - Comandos que MUTAM o repositorio sao serializados numa fila com lock;
 *    leituras correm em paralelo.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import { assertNotBusy } from "../ai/session.mjs";
import { GIT_MAX_BUFFER_BYTES, GIT_TIMEOUT_MS } from "../contract.mjs";
import { runtime } from "../runtime.mjs";

/** Binario do git. Sobrescrevivel para teste. */
export const GIT_BIN = process.env.GITCRAQUE_GIT_BIN || "git";

/** Quanto esperamos entre o SIGTERM e o SIGKILL de um comando estourado. */
const KILL_GRACE_MS = 3_000;

/* ------------------------------------------------------------------ *
 * Ambiente
 * ------------------------------------------------------------------ */

/**
 * Monta o env de um comando git. A tabela e a de `docs/ARCHITECTURE.md` e nao
 * e negociavel: sem ela um `git push` trava num prompt de senha herdado do tty.
 */
export function gitEnv(extra = {}) {
  return {
    ...process.env,
    ...runtime.trampolineEnv,
    GIT_TERMINAL_PROMPT: "0",
    GIT_EDITOR: "true",
    GIT_PAGER: "cat",
    PAGER: "cat",
    LC_ALL: "C",
    LANG: "C",
    GIT_OPTIONAL_LOCKS: "0",
    SSH_ASKPASS_REQUIRE: "force",
    // Um askpass que nao existe seria pior que nenhum: so injeta se o cofre subiu.
    ...(runtime.trampolineEnv.GIT_ASKPASS
      ? { SSH_ASKPASS: runtime.trampolineEnv.GIT_ASKPASS }
      : {}),
    ...extra,
  };
}

/* ------------------------------------------------------------------ *
 * Fila de serializacao das mutacoes
 * ------------------------------------------------------------------ */

let mutationChain = Promise.resolve();
let mutationDepth = 0;

/** true enquanto algum comando mutante esta em voo. */
export const isMutating = () => mutationDepth > 0;

/**
 * Enfileira `fn` de modo que dois comandos mutantes nunca corram juntos.
 * Leituras nao passam por aqui.
 */
export function withMutationLock(fn) {
  // Enquanto o agente trabalha, mutacao vinda da INTERFACE e recusada na hora.
  // A checagem e aqui e nao no handler porque este e o unico ponto por onde
  // toda mutacao passa. O proprio agente nao e afetado: ele roda git no seu
  // processo, por fora do `execGit`. Ver `ai/session.mjs`.
  assertNotBusy();
  const run = mutationChain.then(() => {
    mutationDepth += 1;
    runtime.watcher?.beginSuppression();
    return Promise.resolve()
      .then(fn)
      .finally(() => {
        mutationDepth -= 1;
        runtime.watcher?.endSuppression();
      });
  });
  // A corrente nao pode quebrar quando um comando falha.
  mutationChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/* ------------------------------------------------------------------ *
 * Execucao
 * ------------------------------------------------------------------ */

/**
 * @typedef {object} ExecOptions
 * @property {string}  [cwd]       diretorio (default: process.cwd())
 * @property {number}  [timeout]   ms ate matar o processo
 * @property {boolean} [silent]    nao emite `git:command` (leitura de refresh)
 * @property {boolean} [mutating]  passa pela fila de lock
 * @property {Record<string,string>} [env] variaveis extras
 * @property {string}  [input]     stdin
 * @property {number}  [maxBuffer]
 * @property {string}  [progressOp] emite `op:progress` a partir do stderr
 */

/**
 * Executa o git e devolve um `GitCommandResult` — SEMPRE resolvido, nunca
 * rejeitado por exit code. Quem chama decide o que fazer com `ok === false`.
 *
 * @param {string[]} args
 * @param {ExecOptions} [opts]
 * @returns {Promise<import("../types.mjs").GitCommandResult>}
 */
export function execGit(args, opts = {}) {
  if (opts.mutating) return withMutationLock(() => rawExec(args, opts));
  return rawExec(args, opts);
}

function rawExec(args, opts) {
  const cwd = opts.cwd || process.cwd();
  const argv = [GIT_BIN, ...args];
  const id = randomUUID();
  const silent = opts.silent === true;
  const timeout = opts.timeout ?? GIT_TIMEOUT_MS;
  const maxBuffer = opts.maxBuffer ?? GIT_MAX_BUFFER_BYTES;
  const started = Date.now();

  if (!silent) {
    runtime.hub?.broadcast({ type: "git:command", id, phase: "start", argv, cwd });
  }

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(GIT_BIN, args, {
        cwd,
        env: gitEnv(opts.env),
        stdio: ["pipe", "pipe", "pipe"],
        // NUNCA shell: true. O argv vai como array e ponto final.
        shell: false,
        windowsHide: true,
      });
    } catch (err) {
      const result = finish({
        argv,
        cwd,
        stdout: "",
        stderr: String(err?.message ?? err),
        exitCode: null,
        signal: null,
        durationMs: Date.now() - started,
      });
      if (!silent) emitExit(id, result);
      resolve(result);
      return;
    }

    /** @type {Buffer[]} */ const outChunks = [];
    /** @type {Buffer[]} */ const errChunks = [];
    let outBytes = 0;
    let errBytes = 0;
    let overflow = false;
    let timedOut = false;
    let killTimer = null;
    let graceTimer = null;
    let settled = false;

    const hardKill = () => {
      graceTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ja morreu */
        }
      }, KILL_GRACE_MS);
      graceTimer.unref?.();
      try {
        child.kill("SIGTERM");
      } catch {
        /* ja morreu */
      }
    };

    if (timeout > 0) {
      killTimer = setTimeout(() => {
        timedOut = true;
        hardKill();
      }, timeout);
      killTimer.unref?.();
    }

    const collect = (stream, chunks, phase) => {
      stream.on("data", (chunk) => {
        const size = chunk.length;
        if (phase === "stdout") outBytes += size;
        else errBytes += size;
        if (outBytes + errBytes > maxBuffer) {
          if (!overflow) {
            overflow = true;
            hardKill();
          }
          return;
        }
        chunks.push(chunk);
        if (silent) return;
        const text = chunk.toString("utf8");
        runtime.hub?.broadcast({ type: "git:command", id, phase, chunk: text });
        // O git escreve o progresso de rede no stderr; a UI mostra numa barra
        // em vez de fazer o usuario ler "Receiving objects: 47%" no console.
        if (phase === "stderr" && opts.progressOp) emitProgress(id, opts.progressOp, text);
      });
      stream.on("error", () => {
        /* stream fechado junto com o processo */
      });
    };

    collect(child.stdout, outChunks, "stdout");
    collect(child.stderr, errChunks, "stderr");

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      clearTimeout(graceTimer);
      const result = finish({
        argv,
        cwd,
        stdout: Buffer.concat(outChunks).toString("utf8"),
        stderr: String(err?.message ?? err),
        exitCode: null,
        signal: null,
        durationMs: Date.now() - started,
      });
      if (!silent) emitExit(id, result);
      resolve(result);
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      clearTimeout(graceTimer);
      let stderr = Buffer.concat(errChunks).toString("utf8");
      if (timedOut) stderr += `\ngitcraque: comando abortado por timeout (${timeout} ms)`;
      if (overflow) stderr += `\ngitcraque: saida excedeu ${maxBuffer} bytes e foi abortada`;
      const result = finish({
        argv,
        cwd,
        stdout: Buffer.concat(outChunks).toString("utf8"),
        stderr,
        exitCode: code,
        signal: signal ?? null,
        durationMs: Date.now() - started,
      });
      if (!silent) emitExit(id, result);
      resolve(result);
    });

    // Comando que morre antes de ler o stdin gera EPIPE: nao pode subir como
    // excecao nao tratada e derrubar o processo inteiro.
    child.stdin.on("error", () => {});
    child.stdin.end(opts.input ?? "");
  });
}

function emitExit(id, result) {
  runtime.hub?.broadcast({ type: "git:command", id, phase: "exit", result });
}

/**
 * "Receiving objects:  47% (470/1000), 1.2 MiB | 3.4 MiB/s" -> `op:progress`.
 * O git usa \r para reescrever a mesma linha: so a ULTIMA de cada chunk vale.
 */
function emitProgress(id, op, text) {
  const linhas = text.split(/[\r\n]+/).filter((l) => l.trim().length > 0);
  const ultima = linhas[linhas.length - 1];
  if (!ultima) return;
  const percent = /(\d{1,3})%/.exec(ultima);
  runtime.hub?.broadcast({
    type: "op:progress",
    id,
    op,
    message: ultima.trim(),
    ...(percent ? { percent: Number.parseInt(percent[1], 10) } : {}),
  });
}

function finish(partial) {
  const ok = partial.exitCode === 0 && partial.signal === null;
  /** @type {import("../types.mjs").GitCommandResult} */
  const result = { ok, ...partial };
  if (!ok) result.error = friendlyError(partial.stderr, partial.stdout, partial.exitCode);
  return result;
}

/** Primeira linha util do stderr — e o que a UI mostra no toast. */
export function friendlyError(stderr, stdout, exitCode) {
  const source = `${stderr || ""}\n${stdout || ""}`;
  const line = source
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !/^hint:/i.test(l) && !/^warning:/i.test(l));
  if (line) return line.replace(/^(fatal|error):\s*/i, "");
  return `git terminou com codigo ${exitCode}`;
}

/* ------------------------------------------------------------------ *
 * Leitura silenciosa
 * ------------------------------------------------------------------ *
 * O watcher dispara muito refresh. Se cada leitura de refresh aparecesse no
 * console da UI, o console viraria ruido puro. Por isso toda leitura passa por
 * estas funcoes: `silent: true` e `--no-optional-locks` (nao mexe no index).
 */

/** Injeta `--no-optional-locks` antes do subcomando. */
function readArgs(args) {
  return ["--no-optional-locks", ...args];
}

/**
 * Leitura pura: nao aparece no console, nao pega o lock de mutacao.
 * @returns {Promise<import("../types.mjs").GitCommandResult>}
 */
export function readGit(args, opts = {}) {
  return rawExec(readArgs(args), { ...opts, silent: true });
}

/**
 * Leitura silenciosa que devolve o resultado ja estruturado (serializavel em
 * JSON), para quem quer inspecionar exitCode/stderr sem poluir o console.
 * @returns {Promise<import("../types.mjs").GitCommandResult>}
 */
export function execGitJSON(args, opts = {}) {
  return readGit(args, opts);
}

/**
 * Leitura silenciosa que ja devolve as linhas do stdout.
 * @param {string[]} args
 * @param {ExecOptions & { separator?: string, keepEmpty?: boolean }} [opts]
 * @returns {Promise<string[]>} vazio quando o comando falha
 */
export async function execGitLines(args, opts = {}) {
  const result = await readGit(args, opts);
  if (!result.ok) return [];
  return splitLines(result.stdout, opts.separator ?? "\n", opts.keepEmpty === true);
}

export function splitLines(text, separator = "\n", keepEmpty = false) {
  const parts = text.split(separator).map((l) => (separator === "\n" ? l.replace(/\r$/, "") : l));
  if (keepEmpty) {
    // O ultimo pedaco depois do separador final e sempre vazio: some com ele.
    if (parts.length && parts[parts.length - 1] === "") parts.pop();
    return parts;
  }
  return parts.filter((l) => l.length > 0);
}

/** Uma unica linha de stdout, ja aparada. `null` quando o comando falha. */
export async function readGitLine(args, opts = {}) {
  const result = await readGit(args, opts);
  if (!result.ok) return null;
  return result.stdout.trim();
}

/* ------------------------------------------------------------------ *
 * Diagnostico
 * ------------------------------------------------------------------ */

/** "git version 2.43.0" -> "2.43.0" */
export async function detectGitVersion() {
  const line = await readGitLine(["--version"]);
  if (!line) return "";
  const match = /(\d+\.\d+[\d.]*)/.exec(line);
  return match ? match[1] : line.replace(/^git version\s*/i, "");
}

/** true quando `dir` esta dentro de um repositorio git. */
export async function isGitRepo(dir) {
  const result = await readGit(["rev-parse", "--git-dir"], { cwd: dir, timeout: 15_000 });
  return result.ok;
}

/**
 * O git recusou porque o diretorio NAO e um repositorio.
 *
 * Isso deixou de ser erro quando o app ganhou o seletor de repositorios: o
 * servidor pode legitimamente estar fora de um repo, esperando o usuario
 * escolher um. Rota que trata isso como 500 faz a interface gritar um stack
 * trace no rosto de quem so precisa abrir uma pasta.
 */
export function isNotARepoError(stderr) {
  return /not a git repository|nao e um repositorio git|fatal: detected dubious ownership/i.test(
    stderr || "",
  );
}
