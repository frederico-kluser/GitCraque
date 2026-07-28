/**
 * Cofre de credenciais do trampolim.
 *
 * O GET nunca devolve o token — so host, username e uma mascara. O token so
 * existe em memoria e so sai pelo socket do askpass.
 */
import { runtime } from "../runtime.mjs";
import { HttpError } from "../router.mjs";
import { bodyOf } from "./_util.mjs";

export function registerCredentialRoutes(router) {
  router.add("GET", "/credentials", () => vault().list());

  router.add("POST", "/credentials", (ctx) => {
    const body = bodyOf(ctx);
    vault().save({ host: body.host, username: body.username, token: body.token });
    return { ok: true };
  });

  router.add("DELETE", "/credentials/:host", (ctx) => {
    vault().remove(ctx.params.host);
    return { ok: true };
  });
}

function vault() {
  if (!runtime.vault) throw new HttpError(503, "error.vaultDown");
  return runtime.vault;
}
