/**
 * Retomada da aba — o Page Lifecycle API ligado ao store.
 *
 * O problema que isto resolve: a aba do GitCraque fica de fundo, o Chrome
 * economiza recurso em cima dela, e voltar devolve uma tela que nao e mais a
 * verdade — no melhor caso dados de minutos atras, no pior a tela vazia.
 *
 * Sao tres caminhos de volta, e cada um chega por um evento diferente:
 *
 *  - `visibilitychange` — a aba reapareceu. Sozinho nao prova nada: um alt-tab
 *    de dois segundos passa por aqui tambem.
 *  - `resume` — a aba SAIU do estado congelado. Prova que ela dormiu.
 *  - `pageshow` com `persisted` — a pagina voltou inteira do bfcache, com o
 *    estado congelado no lugar e as conexoes fechadas por baixo.
 *
 * `freeze` e a virada de escondida para congelada, e e o ultimo instante em que
 * ainda roda codigo antes de um possivel descarte: e ali (e ao esconder, porque
 * `freeze` nem sempre vem) que o retrato da view e gravado. `beforeunload` e
 * `unload` NAO servem — nao disparam quando o navegador descarta a aba.
 *
 * Tudo registrado na fase de captura, como recomenda o Chrome: `freeze`,
 * `resume` e `pageshow` nao borbulham.
 *
 * O poll de `useRepoPoll` continua dono do tick de meio segundo e do seu proprio
 * `visibilitychange`; aqui e a camada de cima, a que trata a aba ter sumido.
 */
import { useEffect } from "react";

import { claimAutoReload, clearAutoReloads, rootIsEmpty } from "@/lib/recovery";
import { getState, reviveSession, snapshotView } from "@/state/store";

/**
 * Abaixo disto a ida foi um alt-tab, e recarregar log e refs a cada troca de
 * janela sairia caro a toa: o watcher do `.git` e o poll ja cobrem esse buraco.
 * Acima, vale pagar o refresh completo.
 */
export const REVIVE_AFTER_HIDDEN_MS = 30_000;

/** O app ficou de pe isto sem quebrar: o orcamento de recarga pode zerar. */
const HEALTHY_MS = 10_000;

export function useLifecycleRecovery() {
  useEffect(() => {
    let hiddenSince = 0;
    let sleptWhileHidden = false;

    const park = () => {
      if (!hiddenSince) hiddenSince = Date.now();
      snapshotView();
    };

    /** `forced` = ha prova de que a aba dormiu, nao so de que ela voltou. */
    const revive = (forced: boolean) => {
      if (document.visibilityState !== "visible") {
        // `resume` chega com a aba AINDA escondida — foi medido no chromium, e a
        // ordem que o Chrome documenta e essa: sai do congelamento primeiro,
        // reaparece depois. Recarregar tudo aqui seria trabalhar para uma aba
        // que ninguem esta olhando; jogar fora a prova de que ela dormiu seria
        // pior, porque o `visibilitychange` que vem em seguida nao a tem. Entao
        // a prova fica guardada e e cobrada na volta.
        if (forced) sleptWhileHidden = true;
        return;
      }

      // A tela vazia e a unica falha que nao da para consertar de dentro: sem
      // arvore do React nao sobra componente vivo para remontar coisa alguma.
      // Recarregar e a saida — com orcamento, para nao virar laco.
      if (rootIsEmpty()) {
        if (claimAutoReload()) location.reload();
        return;
      }

      const longEnough = hiddenSince > 0 && Date.now() - hiddenSince >= REVIVE_AFTER_HIDDEN_MS;
      const slept = forced || sleptWhileHidden || longEnough;
      hiddenSince = 0;
      sleptWhileHidden = false;
      if (!slept && getState().connection === "open") return;
      void reviveSession();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") park();
      else revive(false);
    };
    const onFreeze = () => park();
    const onResume = () => revive(true);
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) revive(true);
    };
    const onOnline = () => revive(true);

    const opts = { capture: true } as const;
    document.addEventListener("visibilitychange", onVisibility, opts);
    document.addEventListener("freeze", onFreeze, opts);
    document.addEventListener("resume", onResume, opts);
    window.addEventListener("pageshow", onPageShow, opts);
    window.addEventListener("online", onOnline, opts);

    const healthy = setTimeout(clearAutoReloads, HEALTHY_MS);

    return () => {
      clearTimeout(healthy);
      document.removeEventListener("visibilitychange", onVisibility, opts);
      document.removeEventListener("freeze", onFreeze, opts);
      document.removeEventListener("resume", onResume, opts);
      window.removeEventListener("pageshow", onPageShow, opts);
      window.removeEventListener("online", onOnline, opts);
    };
  }, []);
}
