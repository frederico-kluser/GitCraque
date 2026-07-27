/**
 * Roteador e guarda de origem.
 *
 * A guarda nao e paranoia: o servidor executa comandos git na maquina do
 * usuario. Sem ela, qualquer site poderia apontar um dominio para 127.0.0.1
 * (DNS rebinding) e mandar POST /api/raw pelo navegador da vitima.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ROUTES } from "../src/contract.mjs";
import { Router } from "../src/router.mjs";
import { buildRouter, assertContract } from "../src/routes/index.mjs";
import { isLocalHostname, originDenial } from "../src/server.mjs";

test("casa rota literal e devolve o handler", () => {
  const router = new Router();
  const handler = () => "ok";
  router.add("GET", "/refs", handler);
  const match = router.match("GET", "/refs");
  assert.equal(match.handler, handler);
  assert.deepEqual(match.params, {});
});

test("casa :param e decodifica o valor", () => {
  const router = new Router();
  router.add("DELETE", "/credentials/:host", () => null);
  assert.equal(router.match("DELETE", "/credentials/github.com").params.host, "github.com");
  assert.equal(
    router.match("DELETE", "/credentials/meu%20host").params.host,
    "meu host",
    "o valor do parametro vem decodificado",
  );
});

test("nao casa numero de segmentos diferente", () => {
  const router = new Router();
  router.add("GET", "/commit/:hash", () => null);
  assert.equal(router.match("GET", "/commit"), null);
  assert.equal(router.match("GET", "/commit/abc/def"), null);
});

test("rota literal ganha da rota com :param", () => {
  const router = new Router();
  router.add("POST", "/worktrees/switch", () => "literal");
  router.add("POST", "/worktrees/:id", () => "param");
  assert.equal(router.match("POST", "/worktrees/switch").handler(), "literal");
  assert.equal(router.match("POST", "/worktrees/outro").handler(), "param");
});

test("allowedMethods alimenta o 405", () => {
  const router = new Router();
  router.add("GET", "/credentials", () => null);
  router.add("POST", "/credentials", () => null);
  assert.deepEqual(router.allowedMethods("/credentials").sort(), ["GET", "POST"]);
});

test("o roteador registra EXATAMENTE a tabela de contract.mjs", () => {
  const router = buildRouter();
  for (const [method, pattern] of ROUTES) {
    assert.ok(router.match(method, pattern.replace(/:\w+/g, "valor")), `faltou ${method} ${pattern}`);
  }
  // buildRouter ja chama assertContract; chamar de novo prova que passa limpo.
  assert.doesNotThrow(() => assertContract(router));
});

test("rota fora do contrato derruba o boot", () => {
  const router = buildRouter();
  router.add("GET", "/inventada", () => null);
  assert.throws(() => assertContract(router), /fora do contrato/);
});

test("isLocalHostname aceita so o que e local", () => {
  for (const bom of ["localhost", "app.localhost", "127.0.0.1", "127.1.2.3", "::1", "[::1]"]) {
    assert.equal(isLocalHostname(bom), true, `${bom} deveria passar`);
  }
  for (const ruim of ["", "example.com", "192.168.0.10", "0.0.0.0", "meulocalhost.com", "10.0.0.1"]) {
    assert.equal(isLocalHostname(ruim), false, `${ruim} nao deveria passar`);
  }
});

const req = (headers) => ({ headers });

test("Host local passa; Host remoto e recusado", () => {
  assert.equal(originDenial(req({ host: "127.0.0.1:5271" })), "");
  assert.equal(originDenial(req({ host: "localhost:5273" })), "");
  assert.equal(originDenial(req({ host: "[::1]:5271" })), "");
  assert.match(originDenial(req({ host: "evil.example.com" })), /nao e local/);
  assert.match(originDenial(req({})), /sem header Host/);
});

test("Origin de outra origem e recusada, mesmo com Host local", () => {
  assert.match(
    originDenial(req({ host: "127.0.0.1:5271", origin: "https://evil.example.com" })),
    /Origin .* nao e local/,
    "e exatamente este o vetor do DNS rebinding",
  );
  // O Vite em 5273 fala com o backend em 5271: outra PORTA, mesma maquina.
  assert.equal(originDenial(req({ host: "127.0.0.1:5271", origin: "http://localhost:5273" })), "");
  assert.equal(originDenial(req({ host: "localhost:5271", origin: "http://127.0.0.1:5271" })), "");
});

test("Origin invalida e recusada", () => {
  assert.match(originDenial(req({ host: "localhost:5271", origin: "nao-e-url" })), /invalida/);
});
