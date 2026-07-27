/**
 * Remotos e rede. Todo comando daqui pode pedir credencial — e por isso que
 * todos passam pelo trampolim `GIT_ASKPASS` montado em `git/exec.mjs`.
 */
import {
  addRemote,
  getRemotes,
  gitFetch,
  gitPull,
  gitPush,
  removeRemote,
  setRemoteUrl,
} from "../git/remotes.mjs";
import { bodyOf, commandResult } from "./_util.mjs";

export function registerRemoteRoutes(router) {
  router.add("GET", "/remotes", async () => ({ remotes: await getRemotes() }));

  router.add("POST", "/remotes/add", async (ctx) => commandResult(await addRemote(bodyOf(ctx))));
  router.add("POST", "/remotes/remove", async (ctx) =>
    commandResult(await removeRemote(bodyOf(ctx))),
  );
  router.add("POST", "/remotes/set-url", async (ctx) =>
    commandResult(await setRemoteUrl(bodyOf(ctx))),
  );

  router.add("POST", "/net/fetch", async (ctx) => commandResult(await gitFetch(bodyOf(ctx))));
  router.add("POST", "/net/pull", async (ctx) => commandResult(await gitPull(bodyOf(ctx))));
  router.add("POST", "/net/push", async (ctx) => commandResult(await gitPush(bodyOf(ctx))));
}
