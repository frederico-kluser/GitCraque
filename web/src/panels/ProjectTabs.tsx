/**
 * A tira de TABS de projetos — a troca rapida de contexto.
 *
 * Uma tab e um projeto aberto: clicar troca pela MESMA acao do seletor de
 * projeto (`openRepository` → `process.chdir` no servidor + recarregamento) —
 * dois caminhos para a mesma acao, um comportamento so. A tab ativa deriva de
 * `repo.cwd` (o servidor e a fonte); a lista de abertos e preferencia
 * persistida (`useShellStore`), e volta no arranque.
 *
 * DECISOES DA AUDITORIA (uxui-evaluator, 2026-09-27):
 *   - C.1.4.01: a UNICA tab nao fecha (hint) — nao existe operacao "sair do
 *     repositorio", e fechar sem destino e um erro previsivel;
 *   - F.2.2.03: tira com scroll horizontal, rotulo curto (nome), caminho no
 *     tooltip;
 *   - I.2.2.02: tab e fecho sao ALVOS SEPARADOS (botao dentro de botao e HTML
 *     invalido e alvo pequeno), ambos com utilitarios de toque;
 *   - C.1.1.01: abrir projeto por qualquer caminho (seletor, picker, paleta)
 *     regista/foca a tab — e o invariante do efeito abaixo.
 */
import { useEffect } from "react";
import { FolderGit2, Plus, X } from "lucide-react";

import { openRepoPicker } from "@/app/actions";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/panels/parts";
import { openRepository, useAppState } from "@/state/store";
import { useShellState } from "../hooks";
import {
  closeProjectTab,
  openProjectTab,
  selectOpenProjects,
  type OpenProjectTab,
} from "../hooks/useShellStore";

const TAB_SURFACE =
  "flex h-8 shrink-0 items-center rounded-md border text-xs " +
  "transition-colors duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]";

export function ProjectTabs() {
  const repo = useAppState((s) => s.repo);
  const openProjects = useShellState(selectOpenProjects);
  const cwd = repo?.cwd ?? null;

  /* Invariante: o projeto ATIVO tem sempre tab. Nao e uma acao espalhada pelos
     botoes de abrir — e derivado do estado do servidor, aqui. */
  useEffect(() => {
    if (cwd && !openProjects.some((entry) => entry.path === cwd)) {
      openProjectTab({ path: cwd, name: repo?.name ?? cwd });
    }
  }, [cwd, repo?.name, openProjects]);

  const close = (tab: OpenProjectTab) => {
    const wasActive = tab.path === cwd;
    const index = openProjects.findIndex((entry) => entry.path === tab.path);
    closeProjectTab(tab.path);
    // Fechar a tab ATIVA salta para a vizinha mais proxima — nunca para o nada.
    if (wasActive) {
      const neighbor = openProjects[index + 1] ?? openProjects[index - 1];
      if (neighbor) void openRepository(neighbor.path);
    }
  };

  return (
    <div
      aria-label={t("tabs.label")}
      className="flex items-center gap-1 overflow-x-auto border-b border-border bg-surface-rail px-2 py-1"
    >
      {openProjects.map((tab) => {
        const active = tab.path === cwd;
        const only = openProjects.length <= 1;
        return (
          <div
            key={tab.path}
            className={cn(
              TAB_SURFACE,
              active
                ? "border-border bg-background text-foreground shadow-sm"
                : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <button
              type="button"
              onClick={() => {
                if (!active) void openRepository(tab.path);
              }}
              title={tab.path}
              className={cn("flex min-w-0 items-center gap-1.5 py-1 pl-2.5 pr-1.5 touch:min-h-tap", FOCUS_RING)}
            >
              <FolderGit2 className="size-3.5 shrink-0 text-primary" />
              <span className="max-w-[10rem] truncate">{tab.name}</span>
            </button>
            <button
              type="button"
              disabled={only}
              onClick={() => close(tab)}
              title={only ? t("tabs.closeLast.hint") : t("tabs.close", { name: tab.name })}
              aria-label={t("tabs.close", { name: tab.name })}
              className={cn(
                "mr-1 flex size-6 shrink-0 items-center justify-center rounded-sm touch:size-tap",
                "text-muted-foreground/70 hover:bg-accent hover:text-foreground",
                only && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground/70",
                FOCUS_RING,
              )}
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => openRepoPicker()}
        title={t("tabs.add")}
        aria-label={t("tabs.add")}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground",
          "hover:bg-accent hover:text-foreground touch:size-tap",
          FOCUS_RING,
        )}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
