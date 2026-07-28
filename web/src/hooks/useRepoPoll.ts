/**
 * Poll de meio segundo do que muda FORA do app.
 *
 * O watcher do backend e `fs.watch` sobre o `.git`, e cobre bem tudo que mexe
 * em ref, HEAD, index e estado de rebase. O que ele nao pode ver e a edicao de
 * um arquivo no editor: isso nao toca no `.git`, nao gera evento nenhum, e sem
 * este poll a lista de alteracoes fica parada ate alguem rodar um comando git.
 *
 * O tick e barato de proposito (`pollRepo` = status + worktrees) e, mais
 * importante, sabe ficar quieto. Tres condicoes pulam um tick:
 *
 *  - aba escondida — ninguem esta olhando, e o navegador ja estrangula timers;
 *  - operacao git em andamento — o lock de mutacao esta tomado e o refresh que
 *    interessa e o que vem quando ela terminar;
 *  - WebSocket caido — o servidor provavelmente esta reiniciando, e martelar
 *    a porta a cada meio segundo nao ajuda ninguem.
 *
 * A quarta protecao nao e uma condicao, e a forma do laco: `setTimeout`
 * encadeado, nunca `setInterval`. O intervalo so comeca a contar DEPOIS que a
 * resposta chega, entao um `git status` que passe de 500 ms em repo grande
 * afasta o proximo tick em vez de empilhar pedidos em cima de si mesmo.
 */
import { useEffect } from "react";

import { getState, pollRepo, useAppState } from "@/state/store";

/** Meio segundo: o que o usuario pediu para "ver a mudanca aparecer sozinha". */
export const REPO_POLL_MS = 500;

export function useRepoPoll(intervalMs = REPO_POLL_MS) {
  // A conexao entra como dependencia para o poll RECOMECAR assim que o socket
  // volta, sem esperar o proximo tick de um efeito que ja morreu.
  const connection = useAppState((s) => s.connection);

  useEffect(() => {
    if (connection !== "open") return;

    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const agenda = () => {
      if (cancelado) return;
      timer = setTimeout(tick, intervalMs);
    };

    const tick = async () => {
      if (cancelado) return;
      if (document.visibilityState !== "visible" || getState().loading.operation) {
        agenda();
        return;
      }
      try {
        await pollRepo();
      } finally {
        agenda();
      }
    };

    // Voltar para a aba tem de mostrar o estado atual na hora, nao no proximo
    // tick: quem volta ao app depois de mexer no editor quer ver o resultado.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void pollRepo();
    };
    document.addEventListener("visibilitychange", aoVoltar);

    agenda();

    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [connection, intervalMs]);
}
