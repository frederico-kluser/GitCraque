#!/usr/bin/env node
/**
 * askpass — executado PELO GIT (e pelo ssh), nunca pelo servidor.
 *
 * Nao tem acesso nenhum ao estado do servidor: a unica ponte e o socket unix
 * cujo caminho e nonce chegam por variavel de ambiente. Ele conecta, manda
 * `{nonce, prompt, cwd}`, recebe o segredo, imprime no STDOUT (e assim que o
 * git le a resposta de um askpass) e sai com 0.
 *
 * Sem segredo -> sai com 1. O git falha limpo, sem travar num prompt de tty.
 */
import net from "node:net";

import { ASKPASS_TIMEOUT_MS, ENV_ASKPASS_NONCE, ENV_ASKPASS_SOCK } from "../contract.mjs";

const socketPath = process.env[ENV_ASKPASS_SOCK];
const nonce = process.env[ENV_ASKPASS_NONCE];
const prompt = process.argv[2] ?? "";

if (!socketPath || !nonce) {
  process.stderr.write("gitcraque askpass: sem socket ou nonce no ambiente\n");
  process.exit(1);
}

const socket = net.createConnection(socketPath);
let buffer = "";
let done = false;

const timer = setTimeout(() => {
  finish(1, "", "gitcraque askpass: tempo esgotado esperando o cofre");
}, ASKPASS_TIMEOUT_MS + 15_000);

function finish(code, stdout, stderr) {
  if (done) return;
  done = true;
  clearTimeout(timer);
  socket.destroy();
  if (stderr) process.stderr.write(`${stderr}\n`);
  if (stdout) process.stdout.write(`${stdout}\n`);
  process.exit(code);
}

socket.on("connect", () => {
  socket.write(`${JSON.stringify({ nonce, prompt, cwd: process.cwd() })}\n`);
});

socket.setEncoding("utf8");
socket.on("data", (chunk) => {
  buffer += chunk;
  const newline = buffer.indexOf("\n");
  if (newline === -1) return;
  let reply;
  try {
    reply = JSON.parse(buffer.slice(0, newline));
  } catch {
    finish(1, "", "gitcraque askpass: resposta invalida do cofre");
    return;
  }
  if (reply && reply.ok && typeof reply.value === "string") finish(0, reply.value, "");
  else finish(1, "", "");
});

socket.on("error", (err) => {
  finish(1, "", `gitcraque askpass: ${err.message}`);
});

socket.on("close", () => {
  finish(1, "", "");
});
