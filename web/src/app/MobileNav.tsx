/**
 * Barra de navegacao inferior — a fronteira entre os paineis no layout de
 * coluna unica.
 *
 * No desktop os tres paineis (rail, grafo, detalhe) sao colunas vizinhas e a
 * gaveta de alteracoes e chamada pelo botao de commit da toolbar. Num celular
 * so um painel cabe na tela por vez, e esta barra troca entre eles — com as
 * mesmas palavras que o desktop usa para cada coluna, para que as duas telas
 * falem a mesma lingua.
 *
 * Tres dos quatro botoes trocam o painel visivel (`setMobilePane`); o de
 * ALTERACOES abre a gaveta de staging, que no layout compacto vira tela cheia
 * (`ChangesSheet`) e cobre esta barra (z-50 contra z-30). O de DETALHE so faz
 * sentido com um commit selecionado: sem selecao ele fica desabilitado, e o
 * painel de detalhe sabe mostrar o vazio — o botao nunca some, para a barra
 * nao pular de quatro para tres colunas e voltar.
 *
 * A barra e fixa no rodape e respeita `env(safe-area-inset-bottom)`: num
 * celular com barra de gestos a altura total e 56px + o recorte, e a area
 * tocavel termina acima dele. A troca de painel e anunciada por um live
 * region (`mobile.nav.announce`), porque a barra e a unica pista de onde a
 * pessoa esta quando so existe uma coluna.
 */
import { FolderGit2, GitCommitHorizontal, History, ListTree } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppState } from "@/state/store";
import { openChanges, selectMobilePane, setMobilePane, useShellState } from "@/hooks";
import type { MobilePane } from "@/hooks";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/panels/parts";

interface NavTab {
  id: MobilePane | "changes";
  label: string;
  icon: LucideIcon;
  /** contagem mostrada no cantinho do botao (arquivos alterados) */
  badge?: number;
  disabled?: boolean;
  onSelect: () => void;
}

export function MobileNav() {
  const pane = useShellState(selectMobilePane);
  const hasSelection = useAppState((s) => s.selection.commits.length > 0);
  const changeCount = useAppState((s) => s.status?.entries.length ?? 0);

  const tabs: NavTab[] = [
    { id: "rail", label: t("mobile.nav.repo"), icon: FolderGit2, onSelect: () => setMobilePane("rail") },
    { id: "graph", label: t("mobile.nav.history"), icon: History, onSelect: () => setMobilePane("graph") },
    {
      id: "changes",
      label: t("mobile.nav.changes"),
      icon: ListTree,
      badge: changeCount,
      onSelect: openChanges,
    },
    {
      id: "detail",
      label: t("mobile.nav.detail"),
      icon: GitCommitHorizontal,
      disabled: !hasSelection,
      onSelect: () => setMobilePane("detail"),
    },
  ];

  // A frase de anuncio diz o painel que ACABA de entrar em cena. A barra e o
  // unico oraculo de navegacao em coluna unica, entao a troca tem de ser dita
  // em voz alta, nao so pintada.
  const activeLabel =
    pane === "rail"
      ? t("mobile.nav.repo")
      : pane === "detail"
        ? t("mobile.nav.detail")
        : t("mobile.nav.history");

  return (
    <nav
      aria-label={t("mobile.nav.label")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-rail"
    >
      <div className="grid h-[calc(56px+env(safe-area-inset-bottom,0px))] grid-cols-4 items-stretch pb-safe-bottom">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === pane;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={tab.onSelect}
              disabled={tab.disabled}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] text-muted-foreground",
                "transition-colors",
                "duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
                "disabled:opacity-40",
                active && "text-primary",
                FOCUS_RING,
              )}
            >
              <span className="relative">
                <Icon className="size-5" aria-hidden="true" />
                {tab.badge != null && tab.badge > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1.5 -right-2 min-w-[1.1rem] rounded-full bg-primary px-1 text-center text-[9px] leading-[1.1rem] font-semibold text-primary-foreground"
                  >
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>
      <span aria-live="polite" className="sr-only">
        {t("mobile.nav.announce", { panel: activeLabel })}
      </span>
    </nav>
  );
}
