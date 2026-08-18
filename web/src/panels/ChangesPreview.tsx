/**
 * O BALAO DE ALTERACOES — o que esta preparado e o que nao esta, sem abrir nada.
 *
 * O botao de commit da toolbar dizia so um numero: "7". Para descobrir QUAIS
 * sete arquivos, e quais deles ja estavam no index, era preciso abrir a gaveta
 * — que cobre a coluna da direita justamente onde o diff apareceria. Este
 * cartao e a leitura rapida que faltava: passa o ponteiro no botao e a lista
 * sai, agrupada como a gaveta agrupa, com o mesmo glifo de status e o mesmo
 * `+x −y` por arquivo.
 *
 * E SO LEITURA. Preparar, despreparar e descartar continuam na gaveta: um
 * cartao que abre sozinho ao passar o ponteiro nao e lugar de acao que mexe no
 * index, e muito menos de acao destrutiva. O que ele faz e levar — clicar num
 * arquivo abre o diff dele no visualizador, e o rodape abre a gaveta inteira.
 *
 * CASCATA: o catalogo Motion UI nao tem hover card (os 19 instalados sao
 * mecanicas de revelacao, gesto e overlay — `docs/UI.md`), entao a semantica
 * vem do `PreviewCard` do Base UI, que ja traz atraso de abertura, ponte do
 * ponteiro ate o cartao, foco e Escape prontos.
 *
 * NO TOQUE ELE NAO EXISTE, pela mesma razao do balao do grafo (`TOOLTIP.popup`
 * e `touch:hidden`): o dedo cobre o alvo que segura, e a gaveta em tela cheia
 * ja mostra tudo. Ali o toque continua fazendo o que sempre fez — abrir a
 * gaveta.
 */
import { useMemo } from "react";
import type { ReactNode } from "react";
import { PreviewCard } from "@base-ui/react/preview-card";
import { FileStack } from "lucide-react";
import { openFile, useAppState } from "@/state/store";
import {
  openChanges,
  selectIsTouch,
  useViewportValue,
  useWorkingDiffStats,
  type DiffStats,
} from "@/hooks";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { StatusEntry } from "@/types/git";
import {
  Chip,
  DiffStat,
  FilePath,
  FOCUS_RING,
  GROUP_ORDER,
  GROUP_TITLE,
  SectionLabel,
  StatusGlyph,
  displayStatus,
  groupEntries,
} from "./parts";

/**
 * Quantos arquivos cada grupo mostra antes de resumir o resto.
 *
 * O cartao e um relance, nao a lista: com 40 arquivos modificados ele viraria
 * uma tela inteira pendurada na toolbar, e a gaveta — que rola, tem busca e
 * tem acoes — deixaria de ter motivo. Oito e o que cabe sem rolar em cada
 * grupo.
 */
const PER_GROUP = 8;

/** Atraso ate abrir. Ponteiro de passagem pela toolbar nao paga cartao. */
const OPEN_DELAY = 320;
/** Folga para o ponteiro atravessar do botao ate o cartao sem ele fechar. */
const CLOSE_DELAY = 160;

/* ------------------------------------------------------------------ */
/* Linha                                                               */
/* ------------------------------------------------------------------ */

function PreviewRow({ entry, stats }: { entry: StatusEntry; stats: DiffStats }) {
  const delta = stats.get(entry.path);
  return (
    <button
      type="button"
      title={t("changes.viewFile", { path: entry.path })}
      onClick={() => openFile(entry.path, null, true)}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left",
        "hover:bg-accent/60",
        "transition-colors duration-[var(--motion-ui-transition-snap-duration)]",
        "ease-[var(--motion-ui-transition-snap)] motion-reduce:transition-none",
        FOCUS_RING,
      )}
    >
      <StatusGlyph status={displayStatus(entry)} />
      <FilePath path={entry.path} className="flex-1" />
      {delta && !delta.binary && (
        <DiffStat insertions={delta.insertions} deletions={delta.deletions} />
      )}
      {delta?.binary && <Chip tone="neutral">{t("common.binaryShort")}</Chip>}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Conteudo do cartao                                                  */
/* ------------------------------------------------------------------ */

/**
 * O corpo do balao.
 *
 * Componente separado de proposito: o `PreviewCard.Portal` so monta os filhos
 * enquanto o cartao esta aberto, entao `useWorkingDiffStats` — que faz DOIS
 * `GET /api/diff` (index e arvore) — so roda quando alguem realmente olha. Se
 * o hook morasse no gatilho, toda alteracao em disco pagaria duas requisicoes
 * mesmo com o cartao fechado a tarde inteira.
 */
function ChangesCard() {
  /* `s.status` e o objeto do store, referencia estavel — selecionar
     `s.status.entries.filter(...)` construiria um array novo a cada leitura e
     re-renderizaria para sempre (o comparador do store e `Object.is`). */
  const status = useAppState((s) => s.status);
  const stats = useWorkingDiffStats(status);
  const groups = useMemo(() => groupEntries(status?.entries ?? []), [status]);
  const total = status?.entries.length ?? 0;

  /* o total de linhas e a soma do que o diff contou, nao do que o status diz:
     o status sabe QUAIS arquivos mudaram, nunca QUANTO. */
  const sum = useMemo(() => {
    let insertions = 0;
    let deletions = 0;
    for (const delta of stats.values()) {
      insertions += delta.insertions;
      deletions += delta.deletions;
    }
    return { insertions, deletions };
  }, [stats]);

  return (
    <div className="flex flex-col gap-2">
      <header className="flex items-center gap-2 px-1.5">
        <FileStack aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-xs font-medium text-popover-foreground">
          {t("changes.filesChanged", { count: total })}
        </span>
        <DiffStat insertions={sum.insertions} deletions={sum.deletions} />
      </header>

      {GROUP_ORDER.map((key) => {
        const entries = groups[key];
        if (entries.length === 0) return null;
        const shown = entries.slice(0, PER_GROUP);
        const rest = entries.length - shown.length;
        return (
          <section key={key} className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-1.5 px-1.5">
              <SectionLabel>{t(GROUP_TITLE[key])}</SectionLabel>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {entries.length}
              </span>
            </div>
            {shown.map((entry) => (
              <PreviewRow key={entry.path} entry={entry} stats={stats} />
            ))}
            {rest > 0 && (
              <span className="px-1.5 text-[11px] text-muted-foreground">
                {t("changes.preview.more", { count: rest })}
              </span>
            )}
          </section>
        );
      })}

      <footer className="flex items-center gap-2 border-t border-border pt-2">
        <span className="flex-1 px-1.5 text-[11px] text-muted-foreground">
          {t("changes.preview.hint")}
        </span>
        <button
          type="button"
          onClick={openChanges}
          className={cn(
            "shrink-0 rounded-sm px-1.5 py-1 text-[11px] font-medium text-primary",
            "hover:bg-accent/60",
            "transition-colors duration-[var(--motion-ui-transition-snap-duration)]",
            "ease-[var(--motion-ui-transition-snap)] motion-reduce:transition-none",
            FOCUS_RING,
          )}
        >
          {t("changes.preview.all")}
        </button>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Gatilho                                                             */
/* ------------------------------------------------------------------ */

/**
 * Envolve o botao de commit e pendura o cartao nele.
 *
 * O gatilho e um `<span>` em volta, e nao o proprio botao: o `PreviewCard`
 * tambem abre por PRESSAO, e o clique no botao ja tem dono — abrir a gaveta.
 * Com o span no meio, o ponteiro e o foco abrem o cartao (o `focus` do botao
 * sobe ate ele) e o clique continua indo para a gaveta, sem disputa.
 */
export function ChangesPreview({ children }: { children: ReactNode }) {
  const touch = useViewportValue(selectIsTouch);
  const dirty = useAppState((s) => (s.status?.entries.length ?? 0) > 0);

  /* arvore limpa nao tem o que mostrar, e o botao ja esta desabilitado. */
  if (touch || !dirty) return <>{children}</>;

  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger
        render={<span className="inline-flex" />}
        delay={OPEN_DELAY}
        closeDelay={CLOSE_DELAY}
      >
        {children}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        {/* `z-50`: a mesma altura dos menus da toolbar — acima do conteudo,
            abaixo do dialogo de confirmacao (`z-60`) e do menu de contexto
            (`z-80`). A escada esta em `app/ContextMenuHost.tsx`. */}
        <PreviewCard.Positioner side="bottom" align="start" sideOffset={8} className="z-50">
          <PreviewCard.Popup
            aria-label={t("changes.preview.label")}
            className={cn(
              "w-[22rem] max-w-[calc(100vw-2rem)] rounded-md border border-border",
              "bg-popover p-2 text-popover-foreground shadow-xl",
            )}
          >
            <ChangesCard />
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
