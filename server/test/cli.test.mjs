/**
 * CLI: parser de flags e o processo de verdade subindo contra um repositorio.
 */
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { DEFAULT_HOST, DEFAULT_PORT } from "../src/contract.mjs";
import { parseArgs } from "../bin/gitcraque.mjs";
import { makeFixtureRepo } from "./helpers/repo.mjs";

const execFileAsync = promisify(execFile);
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "gitcraque.mjs");

test("defaults do parser", () => {
  const options = parseArgs([]);
  assert.equal(options.port, DEFAULT_PORT);
  assert.equal(options.host, DEFAULT_HOST, "127.0.0.1: nao expoe na rede por padrao");
  assert.equal(options.open, true);
  assert.equal(options.dev, false);
  assert.equal(options.repo, process.cwd());
});

test("todas as flags", () => {
  const options = parseArgs([
    "--repo", "/tmp/x",
    "--port", "5299",
    "--host", "localhost",
    "--no-open",
  ]);
  assert.equal(options.repo, "/tmp/x");
  assert.equal(options.port, 5299);
  assert.equal(options.host, "localhost");
  assert.equal(options.open, false);

  assert.equal(parseArgs(["--open"]).open, true);
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["-h"]).help, true);
  assert.equal(parseArgs(["--version"]).version, true);
  assert.equal(parseArgs(["/tmp/solto"]).repo, "/tmp/solto", "argumento solto e o repo");
});

test("--dev nao abre navegador (quem abre e o Vite)", () => {
  const options = parseArgs(["--dev"]);
  assert.equal(options.dev, true);
  assert.equal(options.open, false);
});

test("flags invalidas explodem com mensagem", () => {
  assert.throws(() => parseArgs(["--port", "abc"]), /entre 1 e 65535/);
  assert.throws(() => parseArgs(["--port", "99999"]), /entre 1 e 65535/);
  assert.throws(() => parseArgs(["--repo"]), /precisa de um valor/);
  assert.throws(() => parseArgs(["--inventada"]), /opcao desconhecida/);
});

test("--help e --version nao sobem servidor", async () => {
  const ajuda = await execFileAsync(process.execPath, [CLI, "--help"], { encoding: "utf8" });
  assert.match(ajuda.stdout, /--repo <path>/);
  assert.match(ajuda.stdout, /--no-open/);

  const versao = await execFileAsync(process.execPath, [CLI, "--version"], { encoding: "utf8" });
  assert.match(versao.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test("diretorio que nao e repositorio git falha com mensagem clara", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [CLI, "--repo", "/tmp", "--no-open"], { timeout: 15_000 }),
    (err) => {
      assert.match(String(err.stderr), /nao e um repositorio git/);
      return true;
    },
  );
});

test("sobe de verdade, responde a API e fecha em SIGTERM", async () => {
  const fixture = makeFixtureRepo("gitcraque-cli-");
  const porta = 5397;
  const child = spawn(
    process.execPath,
    [CLI, "--repo", fixture.root, "--port", String(porta), "--no-open"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let saida = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    saida += chunk;
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    saida += chunk;
  });

  try {
    // Espera o banner sair.
    const inicio = Date.now();
    while (!saida.includes("GitCraque") && Date.now() - inicio < 15_000) {
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.match(saida, /GitCraque/);
    assert.match(saida, new RegExp(`http://127\\.0\\.0\\.1:${porta}`));
    assert.match(saida, /worktree/);
    assert.match(saida, /git\s+\d+\.\d+/, "o banner traz a versao do git");
    assert.ok(saida.includes(fixture.root), "e o repositorio aberto");

    const res = await fetch(`http://127.0.0.1:${porta}/api/repo`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.cwd, fixture.root);
    assert.equal(json.head.branch, "main");

    const encerrou = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    const code = await Promise.race([
      encerrou,
      new Promise((r) => setTimeout(() => r("timeout"), 10_000)),
    ]);
    assert.notEqual(code, "timeout", "SIGTERM tem de encerrar o processo");
    assert.match(saida, /SIGTERM recebido/);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    fixture.cleanup();
  }
});

test("porta ocupada cai para a proxima e avisa qual usou", async () => {
  const fixture = makeFixtureRepo("gitcraque-porta-");
  const porta = 5398;

  // Ocupa a porta com um servidor bobo.
  const http = await import("node:http");
  const bloqueio = http.createServer(() => {});
  await new Promise((r) => bloqueio.listen(porta, "127.0.0.1", r));

  const child = spawn(
    process.execPath,
    [CLI, "--repo", fixture.root, "--port", String(porta), "--no-open"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let saida = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (c) => {
    saida += c;
  });

  try {
    const inicio = Date.now();
    while (!saida.includes("GitCraque") && Date.now() - inicio < 15_000) {
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.match(saida, new RegExp(`${porta} estava ocupada; subi na ${porta + 1}`));

    const res = await fetch(`http://127.0.0.1:${porta + 1}/api/health`);
    assert.equal(res.status, 200);
  } finally {
    child.kill("SIGKILL");
    await new Promise((r) => bloqueio.close(r));
    fixture.cleanup();
  }
});

test("--dev nao serve estaticos", async () => {
  const fixture = makeFixtureRepo("gitcraque-dev-");
  const porta = 5399;
  const child = spawn(
    process.execPath,
    [CLI, "--repo", fixture.root, "--port", String(porta), "--dev"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let saida = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (c) => {
    saida += c;
  });

  try {
    const inicio = Date.now();
    while (!saida.includes("GitCraque") && Date.now() - inicio < 15_000) {
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.match(saida, /--dev/);

    const api = await fetch(`http://127.0.0.1:${porta}/api/health`);
    assert.equal(api.status, 200, "a API continua respondendo");

    const raiz = await fetch(`http://127.0.0.1:${porta}/`);
    assert.equal(raiz.status, 404);
    assert.match((await raiz.json()).error, /Vite/);
  } finally {
    child.kill("SIGKILL");
    fixture.cleanup();
  }
});
