#!/usr/bin/env node
/**
 * gitcraque — CLI do backend.
 *
 *   gitcraque [--repo <path>] [--port <n>] [--host <addr>] [--open|--no-open] [--dev]
 *
 * Faz `process.chdir()` para o caminho, sobe o servidor e imprime o banner.
 * Fecha servidor, watcher e socket do trampolim em SIGINT/SIGTERM.
 *
 * Caminho que NAO e repositorio git nao impede a subida: a interface tem um
 * seletor de repositorios da maquina, e ela precisa do servidor no ar para
 * poder oferece-lo.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_HOST, DEFAULT_PORT } from "../src/contract.mjs";
import { detectGitVersion, readGitLine } from "../src/git/exec.mjs";
import { rememberRepo } from "../src/git/discover.mjs";
import { createServer } from "../src/server.mjs";
import { listWorktrees } from "../src/git/worktree.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const HELP = `gitcraque — cliente Git de desktop sem Electron

USO
  gitcraque [opcoes]

OPCOES
  --repo <path>     repositorio a abrir            (default: diretorio atual)
  --port <n>        porta do backend               (default: ${DEFAULT_PORT})
  --host <addr>     endereco de escuta             (default: ${DEFAULT_HOST})
  --open            abre o navegador               (default)
  --no-open         nao abre o navegador
  --dev             nao serve web/dist (o Vite serve o front em 5273)
  -h, --help        esta ajuda
  -v, --version     versao

NOTAS
  O host padrao e 127.0.0.1 de proposito: o servidor executa comandos git na
  sua maquina e nao deve ficar exposto na rede. Requisicoes cujo Host ou Origin
  nao sejam locais sao recusadas com 403.
  Se a porta pedida estiver ocupada, as 10 seguintes sao testadas.
`;

/** Parser de argv sem dependencia. */
export function parseArgs(argv) {
  const options = {
    repo: process.cwd(),
    port: DEFAULT_PORT,
    host: DEFAULT_HOST,
    open: true,
    dev: false,
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`a opcao ${arg} precisa de um valor`);
      }
      i += 1;
      return value;
    };

    switch (arg) {
      case "--repo":
      case "-C":
        options.repo = next();
        break;
      case "--port":
      case "-p": {
        const value = Number.parseInt(next(), 10);
        if (!Number.isFinite(value) || value < 1 || value > 65535) {
          throw new Error("--port precisa de um numero entre 1 e 65535");
        }
        options.port = value;
        break;
      }
      case "--host":
        options.host = next();
        break;
      case "--open":
        options.open = true;
        break;
      case "--no-open":
        options.open = false;
        break;
      case "--dev":
        options.dev = true;
        // Em dev quem abre o navegador e o Vite, na porta dele.
        options.open = false;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--version":
      case "-v":
        options.version = true;
        break;
      default:
        if (arg.startsWith("-")) throw new Error(`opcao desconhecida: ${arg}`);
        // Argumento solto e o repositorio, como `git -C`.
        options.repo = arg;
        break;
    }
  }
  return options;
}

function readVersion() {
  // A RAIZ primeiro. No pacote publicado `server/package.json` nem vai junto, e
  // no repo ele existe mas carrega a versao do workspace — ler o do server
  // antes fazia `--version` reportar um numero que ninguem publica.
  for (const candidate of [
    path.resolve(HERE, "..", "..", "package.json"),
    path.resolve(HERE, "..", "package.json"),
  ]) {
    try {
      return JSON.parse(fs.readFileSync(candidate, "utf8")).version ?? "0.0.0";
    } catch {
      /* tenta o proximo */
    }
  }
  return "0.0.0";
}

/** Abre o navegador sem dependencia externa. Falhar aqui nao derruba nada. */
function openBrowser(url) {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true, shell: false });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* sem navegador: a URL esta no banner */
  }
}

const BOLD = "\u001b[1m";
const DIM = "\u001b[2m";
const CYAN = "\u001b[36m";
const RESET = "\u001b[0m";

function banner({ url, repo, worktree, gitVersion, version, port, requestedPort, dev }) {
  const color = process.stdout.isTTY;
  const b = (s) => (color ? `${BOLD}${s}${RESET}` : s);
  const d = (s) => (color ? `${DIM}${s}${RESET}` : s);
  const c = (s) => (color ? `${CYAN}${s}${RESET}` : s);

  const lines = [
    "",
    `  ${b("GitCraque")} ${d(`v${version}`)}`,
    "",
    `  ${d("url       ")} ${c(url)}`,
    `  ${d("repo      ")} ${repo}`,
    `  ${d("worktree  ")} ${worktree}`,
    `  ${d("git       ")} ${gitVersion || "desconhecida"}`,
    dev ? `  ${d("modo      ")} --dev (front-end pelo Vite em http://127.0.0.1:5273)` : "",
    port !== requestedPort
      ? `  ${d("porta     ")} ${requestedPort} estava ocupada; subi na ${port}`
      : "",
    "",
    `  ${d("ctrl+c para encerrar")}`,
    "",
  ];
  return lines.filter((l) => l !== "").join("\n");
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`gitcraque: ${err.message}\n\n${HELP}`);
    process.exit(2);
  }

  const version = readVersion();
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  if (options.version) {
    process.stdout.write(`${version}\n`);
    return;
  }

  const repo = path.resolve(options.repo);
  if (!fs.existsSync(repo) || !fs.statSync(repo).isDirectory()) {
    process.stderr.write(`gitcraque: ${repo} nao e um diretorio\n`);
    process.exit(1);
  }

  // Entra no repo ANTES de qualquer comando git: tudo depois roda no cwd certo.
  process.chdir(repo);

  // Nao e um repositorio? Isso NAO e motivo para recusar a subir. A interface
  // tem um seletor de repositorios da maquina (recentes, navegacao e varredura),
  // e ela so consegue oferece-lo se o servidor estiver no ar. Sair aqui era
  // deixar o usuario num beco sem saida: a mensagem mandava voltar ao terminal.
  const gitDir = await readGitLine(["rev-parse", "--git-dir"]);
  if (!gitDir) {
    process.stderr.write(
      `gitcraque: ${repo} nao e um repositorio git — abrindo o seletor de repositorios\n`,
    );
  } else {
    // Entra pela RAIZ da worktree, como `POST /repos/open` ja fazia. Subir de
    // uma subpasta deixava o servidor nela, e o selo "Aberto" do seletor
    // compara o caminho do recente com o cwd: nunca casava. Repo bare nao tem
    // toplevel, e ai fica onde esta.
    const top = await readGitLine(["rev-parse", "--show-toplevel"]);
    if (top) process.chdir(top);

    // Subir pelo terminal TAMBEM e abrir o projeto. Sem isto o repositorio nao
    // entrava nos recentes nem no menu de projetos ate ser reaberto pela
    // interface, porque `rememberRepo` so era chamado por `openRepository`.
    // Efeito colateral de bookkeeping: falhar aqui nao pode derrubar o boot.
    try {
      await rememberRepo(process.cwd());
    } catch {
      /* o historico e conveniencia; o app sobe sem ele */
    }
  }

  const gitVersion = await detectGitVersion();
  if (!gitVersion) {
    process.stderr.write("gitcraque: nao encontrei o binario do git no PATH\n");
    process.exit(1);
  }

  let handle;
  try {
    handle = await createServer({
      port: options.port,
      host: options.host,
      dev: options.dev,
      version,
    });
  } catch (err) {
    process.stderr.write(`gitcraque: ${err.message}\n`);
    process.exit(1);
  }

  const worktrees = await listWorktrees();
  const active = worktrees.find((w) => w.isActive);

  process.stdout.write(
    `${banner({
      url: handle.url,
      repo: gitDir ? (active?.isMain ? active.path : (worktrees[0]?.path ?? repo)) : repo,
      worktree: !gitDir
        ? "nenhuma — escolha um repositorio na interface"
        : active
          ? `${active.label} ${active.branch ? `(${active.branch})` : "(detached)"}`
          : repo,
      gitVersion,
      version,
      port: handle.port,
      requestedPort: options.port,
      dev: options.dev,
    })}\n`,
  );

  if (options.open) openBrowser(handle.url);

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    process.stdout.write(`\ngitcraque: ${signal} recebido, encerrando...\n`);
    const timer = setTimeout(() => process.exit(0), 5_000);
    timer.unref();
    try {
      await handle.close();
    } catch {
      /* encerrando de qualquer jeito */
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGHUP", () => shutdown("SIGHUP"));
}

/**
 * Rodou como comando, ou foi importado por um teste?
 *
 * Compara por REALPATH, nao por `path.resolve`. Instalado global, o npm poe em
 * `<prefix>/bin/gitcraque` um SYMLINK para este arquivo: o `argv[1]` e o link e
 * o `import.meta.url` e o alvo, e `path.resolve` nao desfaz symlink. A
 * comparacao dava falso, `main()` nunca rodava e o `gitcraque` instalado saia
 * calado, com codigo 0 — o binario existia e nao fazia nada.
 */
function foiChamadoDireto() {
  const arg = process.argv[1];
  if (!arg) return false;
  const self = fileURLToPath(import.meta.url);
  try {
    return fs.realpathSync(arg) === fs.realpathSync(self);
  } catch {
    // Caminho que sumiu no meio: cai na comparacao literal.
    return path.resolve(arg) === path.resolve(self);
  }
}

const invokedDirectly = foiChamadoDireto();

if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`gitcraque: ${err?.stack || err}\n`);
    process.exit(1);
  });
}
