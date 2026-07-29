/**
 * Rotina automatica de `git fetch --all --prune`.
 *
 * Irma do `useRepoPoll`, com um alvo diferente. Aquele cobre o que muda no
 * DISCO sem passar pelo `.git` (o arquivo editado no editor); este cobre o que
 * muda no REMOTO, que nao gera evento nenhum na maquina — nenhum watcher local
 * pode saber que alguem empurrou uma branch em outro lugar.
 *
 * FETCH, nunca pull. `git fetch` so mexe em `refs/remotes/**`: o ponteiro da
 * branch local nao anda, nao nasce commit de merge, e nao ha conflito possivel
 * com trabalho em andamento. Trazer o que chegou e barato e reversivel; decidir
 * o que fazer com isso continua sendo escolha explicita de quem usa o app.
 *
 * Cinco condicoes pulam um tick:
 *
 *  - intervalo em `0` — a pessoa desligou a rotina nas configuracoes;
 *  - aba escondida — ninguem esta olhando, e o navegador ja estrangula timers;
 *  - operacao git em andamento — o `fetch` e `{ mutating: true }` e disputaria
 *    o lock serial do backend com o comando que a pessoa acabou de mandar;
 *  - WebSocket caido — o servidor provavelmente esta reiniciando;
 *  - repositorio sem remoto — nao ha de onde buscar, e `git fetch --all` num
 *    repo local so gastaria o lock para nao fazer nada.
 *
 * A sexta protecao e a forma do laco, copiada do poll: `setTimeout` encadeado,
 * nunca `setInterval`. O intervalo so comeca a contar DEPOIS que a resposta
 * chega, entao um fetch lento numa rede ruim afasta o proximo em vez de
 * empilhar requisicoes de rede em cima de si mesmas.
 *
 * O tick e mudo por decisao de produto: quem faz o trabalho e `silentFetch`
 * (`state/store.ts`), que nao emite toast nem acende o indicador de operacao.
 * Novidade aparece sozinha no rail, pelo contador de "atras".
 */
import { useEffect } from "react";

import { getState, silentFetch, useAppState } from "@/state/store";

import { useShellState } from "./useShellStore";

export function useAutoFetch() {
  const intervalMs = useShellState((s) => s.autoFetchMs);
  // Igual ao poll: a conexao entra como dependencia para a rotina RECOMECAR
  // assim que o socket volta, sem esperar o tick de um efeito que ja morreu.
  const connection = useAppState((s) => s.connection);

  useEffect(() => {
    if (intervalMs <= 0 || connection !== "open") return;

    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const agenda = () => {
      if (cancelado) return;
      timer = setTimeout(tick, intervalMs);
    };

    const tick = async () => {
      if (cancelado) return;
      const state = getState();
      const semRemoto = (state.repo?.remotes ?? state.refs?.remotes ?? []).length === 0;
      if (document.visibilityState !== "visible" || state.loading.operation || semRemoto) {
        agenda();
        return;
      }
      try {
        await silentFetch();
      } finally {
        agenda();
      }
    };

    // Diferente do poll, NAO ha fetch imediato ao voltar para a aba: o poll
    // custa duas leituras locais, este custa uma ida a rede. Voltar da aba
    // adianta o proximo tick e nada mais.
    agenda();

    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
    };
  }, [connection, intervalMs]);
}
