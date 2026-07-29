/**
 * Testes do retrato do autor: a URL do Gravatar e o retrato de reserva.
 *
 * O que importa aqui e o CAMINHO DE QUEDA. A foto e a unica coisa do app que
 * depende de um servidor de fora, entao cada forma de ela nao existir — e-mail
 * vazio, busca desligada, runtime sem WebCrypto — tem de terminar em iniciais,
 * nunca em excecao e nunca em requisicao pendurada.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { avatarLane, gravatarUrl, initialsOf } from "../gravatar.ts";

/* O digest de referencia: sha256 de "k2.frederico@grupofleury.com.br", conferido
   contra `sha256sum` em 2026-07-29. E o mesmo formato que o Gravatar respondeu
   200 para uma conta real, e 404 para e-mail sem conta — que e o gatilho do
   fallback. */
const KNOWN_EMAIL = "k2.frederico@grupofleury.com.br";
const KNOWN_SHA256 = "5007ceb9a829fb628c684694692d3babdf929b3a466b376084a14f506b9e892e";

test("gravatarUrl monta o caminho com sha256 do e-mail normalizado", async () => {
  const url = await gravatarUrl(KNOWN_EMAIL, 72);
  assert.equal(url, `https://gravatar.com/avatar/${KNOWN_SHA256}?d=404&s=72`);
});

test("gravatarUrl normaliza caixa e espacos antes do digest", async () => {
  const sujo = await gravatarUrl(`  ${KNOWN_EMAIL.toUpperCase()}  `, 72);
  assert.equal(sujo, await gravatarUrl(KNOWN_EMAIL, 72));
});

test("gravatarUrl pede d=404 — e o que permite cair nas iniciais", async () => {
  const url = await gravatarUrl(KNOWN_EMAIL, 40);
  /* sem `d=404` o Gravatar devolveria a silhueta padrao com status 200 e o
     `onError` da <img> nunca dispararia: o fallback morreria em silencio. */
  assert.match(url ?? "", /[?&]d=404(&|$)/);
});

test("gravatarUrl devolve null sem e-mail, em vez de uma URL de lixo", async () => {
  assert.equal(await gravatarUrl("", 40), null);
  assert.equal(await gravatarUrl("   ", 40), null);
});

test("initialsOf usa primeiro e ultimo nome", () => {
  assert.equal(initialsOf("Frederico Kluser"), "FK");
  assert.equal(initialsOf("Ana Maria de Souza"), "AS");
});

test("initialsOf com um nome so rende uma letra", () => {
  /* "RR" a partir de "Rafael" seria inventar uma inicial que nao existe */
  assert.equal(initialsOf("Rafael"), "R");
});

test("initialsOf cai no e-mail, e depois em '?'", () => {
  assert.equal(initialsOf("", "zeca@exemplo.com"), "Z");
  assert.equal(initialsOf("", ""), "?");
  assert.equal(initialsOf("   ", "  "), "?");
});

test("avatarLane e deterministico e cabe na paleta de 8 lanes", () => {
  const emails = [
    KNOWN_EMAIL,
    "outra@pessoa.dev",
    "a@b.c",
    "",
    "MAIUSCULA@EXEMPLO.COM",
    "commit-bot@ci.local",
  ];
  for (const email of emails) {
    const lane = avatarLane(email);
    assert.ok(Number.isInteger(lane), `lane inteira para ${email}`);
    assert.ok(lane >= 0 && lane < 8, `lane ${lane} fora da paleta para ${email}`);
    assert.equal(lane, avatarLane(email), `mesma cor toda vez para ${email}`);
  }
});

test("avatarLane ignora caixa — o mesmo autor nao troca de cor", () => {
  assert.equal(avatarLane(KNOWN_EMAIL), avatarLane(KNOWN_EMAIL.toUpperCase()));
});
