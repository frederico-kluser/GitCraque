/**
 * Rodape do shell: duas abas ocupando a largura inteira.
 *
 *   Alteracoes   → o `StatusPanel` (staging + commit)
 *   Visualizador → o modulo `@/viewer` com o arquivo aberto no store
 *
 * O gesto que costura os dois: clicar num arquivo — na lista do commit ou na
 * lista de alteracoes — chama `openFile` no store, e ESTE componente troca de
 * aba sozinho. Ninguem precisa saber que existe uma aba para ver um diff.
 *
 * CASCATA: `SmoothTabs` do catalogo resolve as abas inteiras (tablist com
 * semantica ARIA, pilula deslizante, crossfade direcional). O que falta e so a
 * ligacao com o store, escrita aqui. Uma consequencia importante do componente:
 * ele renderiza apenas o painel ativo, entao o painel de alteracoes DESMONTA ao
 * trocar de aba — por isso o rascunho do commit vive no shell store.
 */
import { useEffect, useState } from "react";
import {
  SmoothTabs,
  SmoothTabsList,
  SmoothTabsPanel,
  SmoothTabsPanels,
  SmoothTabsTab,
} from "@/components/motion-ui/smooth-tabs";
import { FileViewer } from "@/viewer";
import { closeFile, useAppState } from "@/state/store";
import { cn, short } from "@/lib/utils";
import type { PanelProps } from "@/types/modules";
import { Chip, EmptyState } from "./parts";
import { StatusPanel } from "./StatusPanel";

type DockTab = "changes" | "viewer";

export function BottomDock({ className }: PanelProps) {
  const openFile = useAppState((s) => s.openFile);
  const changeCount = useAppState((s) => s.status?.entries.length ?? 0);
  const [tab, setTab] = useState<DockTab>("changes");

  // `openFile` e um objeto novo a cada chamada do store — inclusive quando o
  // mesmo arquivo e clicado de novo. E o que garante que o segundo clique
  // tambem traga a aba de volta.
  useEffect(() => {
    if (openFile) setTab("viewer");
  }, [openFile]);

  return (
    <SmoothTabs
      value={tab}
      onValueChange={(next) => setTab(next as DockTab)}
      className={cn("grid grid-rows-[auto_minmax(0,1fr)]", className)}
    >
      <div className="flex items-center gap-2 border-b border-border bg-surface-rail px-3 py-1.5">
        <SmoothTabsList ariaLabel="Painel inferior" className="shrink-0 gap-0.5 p-0.5">
          <SmoothTabsTab value="changes" className="flex-none px-3 py-1 text-xs">
            <span className="flex items-center gap-1.5">
              Alteracoes
              {changeCount > 0 && (
                <span className="font-mono text-[10px] tabular-nums opacity-70">{changeCount}</span>
              )}
            </span>
          </SmoothTabsTab>
          <SmoothTabsTab value="viewer" className="flex-none px-3 py-1 text-xs">
            Visualizador
          </SmoothTabsTab>
        </SmoothTabsList>

        {/* De onde o conteudo aberto saiu — commit ou arvore de trabalho. */}
        {openFile && (
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
              title={openFile.path}
            >
              {openFile.path}
            </span>
            {openFile.fromWorkingTree ? (
              <Chip tone="warning">arvore de trabalho</Chip>
            ) : (
              openFile.hash && <Chip tone="primary">{short(openFile.hash)}</Chip>
            )}
          </span>
        )}
      </div>

      <SmoothTabsPanels className="min-h-0">
        <SmoothTabsPanel value="changes" className="min-h-0 overflow-hidden">
          <StatusPanel className="h-full min-h-0 bg-background" />
        </SmoothTabsPanel>

        <SmoothTabsPanel value="viewer" className="min-h-0 overflow-hidden bg-surface-inset">
          {openFile ? (
            <FileViewer file={openFile} onClose={closeFile} className="h-full min-h-0 overflow-auto" />
          ) : (
            <EmptyState
              className="h-full justify-center"
              title="Nenhum arquivo aberto"
              description="Clique num arquivo do commit selecionado, ou numa linha das alteracoes, para ver o conteudo aqui."
            />
          )}
        </SmoothTabsPanel>
      </SmoothTabsPanels>
    </SmoothTabs>
  );
}
