/**
 * Multi origin: o tracking do branch atual POR REMOTO — o que enriquece
 * `GET /refs` para o seletor de remoto da toolbar mostrar `+a -b`.
 *
 * O contrato, independente da implementacao:
 *   - cada remoto ganha `tracking` do branch atual comparado com
 *     `<remoto>/<branch>...HEAD` — ahead = commits so meus, behind = so dele;
 *   - um remoto SEM o branch fica `exists: false`, nunca erro e nunca excecao;
 *   - um nome que comeca com "-" ou traz ".." e IGNORADO: remoto malicioso
 *     nunca vira flag de argv nem altera o intervalo do rev-list;
 *   - sem branch (detached) nada e calculado — `tracking` nem aparece;
 *   - `getRefsPayload` e que anexa o campo (a rota nao muda, so o payload).
 *
 * Os "remotos" sao espelhos locais fabricados com `git update-ref` em
 * refs/remotes/*: o tracking e uma comparacao de historico, nao ha rede e nao
 * ha origin real em nenhum teste.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import { attachRemoteTracking, getRefsPayload } from "../src/git/refs.mjs";
import { getRemotes } from "../src/git/remotes.mjs";
import { git, makeEmptyRepo } from "./helpers/repo.mjs";

function commit(cwd, file, content, message) {
  fs.writeFileSync(path.join(cwd, file), content);
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", message);
  return git(cwd, "rev-parse", "HEAD");
}

test("tracking por remoto: em dia, a frente/atras e remoto sem o branch", async (t) => {
  const { root, cleanup } = makeEmptyRepo();
  t.after(cleanup);

  const a = commit(root, "a.txt", "a\n", "A");

  git(root, "remote", "add", "origin", "https://example.invalid/origin.git");
  git(root, "remote", "add", "upstream", "https://example.invalid/upstream.git");
  git(root, "remote", "add", "frodo", "https://example.invalid/frodo.git");

  // um commit lateral que so o upstream tem (behind)
  git(root, "checkout", "-q", "-b", "lateral");
  const lateral = commit(root, "l.txt", "l\n", "L");
  git(root, "checkout", "-q", "main");
  assert.equal(a !== lateral, true);

  // main avanca dois commits so meus (ahead de qualquer um que fique em A/L)
  commit(root, "b.txt", "b\n", "B");
  const head = commit(root, "c.txt", "c\n", "C");

  // espelhos dos remotos: origin em dia, upstream parado no lateral, frodo sem branch
  git(root, "update-ref", "refs/remotes/origin/main", head);
  git(root, "update-ref", "refs/remotes/upstream/main", lateral);

  const remotes = await getRemotes(root);
  await attachRemoteTracking(root, "main", remotes);
  const byName = Object.fromEntries(remotes.map((r) => [r.name, r]));

  assert.deepEqual(byName.origin.tracking, { branch: "main", exists: true, ahead: 0, behind: 0 });
  assert.deepEqual(byName.upstream.tracking, { branch: "main", exists: true, ahead: 2, behind: 1 });
  assert.deepEqual(byName.frodo.tracking, { branch: "main", exists: false, ahead: 0, behind: 0 });

  // e o payload da rota ja carrega o campo — sem rota nova, so aditivo
  const payload = await getRefsPayload(root);
  const upstream = payload.remotes.find((r) => r.name === "upstream");
  assert.deepEqual(upstream.tracking, { branch: "main", exists: true, ahead: 2, behind: 1 });
});

test("detached HEAD: tracking nao e calculado", async (t) => {
  const { root, cleanup } = makeEmptyRepo();
  t.after(cleanup);

  commit(root, "a.txt", "a\n", "A");
  git(root, "remote", "add", "origin", "https://example.invalid/origin.git");
  git(root, "checkout", "-q", "--detach", "HEAD");

  const payload = await getRefsPayload(root);
  assert.equal(payload.head.detached, true);
  assert.equal(payload.remotes[0].tracking, undefined);
});

test("nome de remoto ou branch hostil nao vira flag nem intervalo", async (t) => {
  const { root, cleanup } = makeEmptyRepo();
  t.after(cleanup);

  commit(root, "a.txt", "a\n", "A");
  const hostile = [
    { name: "--upload-pack=pwn", fetchUrl: "", pushUrl: "", https: false },
    { name: "a..b", fetchUrl: "", pushUrl: "", https: false },
  ];

  // nunca devolve erro — so se recusa a calcular
  await attachRemoteTracking(root, "main", hostile);
  assert.equal(hostile[0].tracking, undefined);
  assert.equal(hostile[1].tracking, undefined);

  await attachRemoteTracking(root, "-b", hostile);
  assert.equal(hostile[0].tracking, undefined);
});
