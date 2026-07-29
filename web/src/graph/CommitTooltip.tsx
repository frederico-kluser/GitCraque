/**
 * O BALAO QUE SEGUE O PONTEIRO sobre uma linha do historico.
 *
 * Mostra o que a linha NAO mostra: o retrato do autor, a data absoluta e
 * quantos arquivos o commit mexeu. A coluna de data continua exibindo a data
 * relativa; repetir "ha 3 dias" aqui seria gastar espaco com o que o olho
 * acabou de ler.
 *
 * UMA instancia para a lista inteira. O `handle` do Base UI e o que permite
 * isso: cada linha e so um GATILHO que carrega o seu commit como `payload`, e
 * quem monta o cartao e este componente, montado uma vez por `GraphView` fora
 * da lista virtualizada. Um balao por linha custaria um `useCommitDetail` por
 * linha montada e um no de DOM por linha — os dois proibidos aqui.
 *
 * DE ONDE VEM CADA CAMPO:
 *   nome, e-mail ............ do proprio `payload`, ja em memoria, custo zero
 *   data absoluta ........... `authorDate` de GET /commit/:hash
 *   arquivos alterados ...... `stats.filesChanged` da MESMA resposta
 *
 * Ou seja: uma requisicao so, numa rota que ja existia, com o cache de modulo
 * de `useCommitDetail` (teto 120) tornando a revisita instantanea. O atraso do
 * gatilho e o que impede rajada: varrer a lista com o ponteiro nao dispara
 * nada, so parar em cima dispara.
 */
import { useEffect, useState } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { Skeleton } from "@/components/motion-ui/skeleton";
import { useCommitDetail } from "@/hooks";
import { formatDateTime, t } from "@/i18n";
import { cn, laneVar } from "@/lib/utils";
import type { RawCommit } from "@/types/git";
import { avatarLane, gravatarUrl, initialsOf } from "./gravatar.ts";
import { TOOLTIP } from "./paint.ts";

/**
 * O gatilho vive em `CommitRow` e o cartao aqui: os dois so se conhecem por
 * este handle. Escopo de modulo de proposito — e uma instancia para o app.
 */
export const commitTooltip = Tooltip.createHandle<RawCommit>();

/** Atraso ate o cartao abrir. Ponteiro de passagem nao paga requisicao. */
export const TOOLTIP_DELAY = 350;

/**
 * O retrato: foto do Gravatar quando existe, iniciais quando nao.
 *
 * Duas coisas derrubam a foto e as duas caem no mesmo lugar: o e-mail sem conta
 * (o `d=404` faz o Gravatar responder 404, que vira `onError`) e a ausencia de
 * rede. Por isso as iniciais nao sao um estado de erro — sao o padrao, e a foto
 * e que se sobrepoe a elas quando carrega.
 */
function CommitAvatar({ name, email }: { name: string; email: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    setUrl(null);
    /* o digest e assincrono: a URL so existe um tick depois do e-mail */
    void gravatarUrl(email, TOOLTIP.avatarPx * 2).then((next) => {
      if (alive) setUrl(next);
    });
    return () => {
      alive = false;
    };
  }, [email]);

  const initials = initialsOf(name, email);

  if (!url || failed) {
    return (
      <span
        aria-hidden
        className={cn(TOOLTIP.avatar, TOOLTIP.initials)}
        /* a cor sai da paleta de lanes que o grafo ja usa — nada de valor novo */
        style={{ backgroundColor: laneVar(avatarLane(email || name)) }}
      >
        {initials}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt=""
      aria-hidden
      width={TOOLTIP.avatarPx}
      height={TOOLTIP.avatarPx}
      className={TOOLTIP.avatar}
      onError={() => setFailed(true)}
    />
  );
}

/** O corpo do cartao para um commit — separado para so pedir o detalhe quando ha um. */
function CommitCard({ commit }: { commit: RawCommit }) {
  const detail = useCommitDetail(commit.hash);

  return (
    <div className="flex items-center gap-2.5">
      <CommitAvatar name={commit.authorName} email={commit.authorEmail} />
      <div className="min-w-0">
        <div className={cn("truncate", TOOLTIP.name)}>{commit.authorName}</div>
        {/* A data absoluta e a contagem chegam juntas, da mesma resposta. Ate
            la o cartao ja esta no ar com foto e nome: o esqueleto cobre so o
            que falta, em vez de segurar o balao inteiro. */}
        {detail.data ? (
          <div className={cn("truncate", TOOLTIP.meta)}>
            {formatDateTime(detail.data.authorDate)}
            {" · "}
            {t("graph.tooltip.files", { count: detail.data.stats.filesChanged })}
          </div>
        ) : (
          <Skeleton animate={!detail.error} className={TOOLTIP.countSkeleton} />
        )}
      </div>
    </div>
  );
}

/**
 * A instancia unica. `trackCursorAxis="both"` e o que faz o cartao acompanhar o
 * ponteiro nos dois eixos — comportamento do Base UI, nao codigo nosso: nada de
 * ouvir `pointermove` e escrever `transform` a mao.
 */
export function CommitTooltip() {
  return (
    <Tooltip.Root handle={commitTooltip} trackCursorAxis="both">
      {({ payload }) => (
        <Tooltip.Portal>
          {/* `z-50`: acima da lista, abaixo do menu de contexto (`z-80`) e do
              dialogo de confirmacao (`z-60`) — a escada esta em ContextMenuHost. */}
          <Tooltip.Positioner side="top" align="center" sideOffset={TOOLTIP.offset} className="z-50">
            <Tooltip.Popup className={TOOLTIP.popup}>
              {payload !== undefined && <CommitCard commit={payload} />}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      )}
    </Tooltip.Root>
  );
}
