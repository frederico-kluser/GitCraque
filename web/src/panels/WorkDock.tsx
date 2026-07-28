/**
 * Gaveta de trabalho do sidebar direito: duas abas.
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
import type { ReactNode } from "react";
import { motion } from "motion/react";
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

export interface WorkDockProps extends PanelProps {
  /** Minimizar/maximizar da gaveta, montados na mesma barra das abas. */
  controls?: ReactNode;
}

export function WorkDock({ className, controls }: WorkDockProps) {
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
      {/* Duas linhas em vez de uma: numa coluna estreita, abas + caminho do
          arquivo + controles nao cabem lado a lado sem truncar tudo. */}
      <div className="border-b border-border bg-surface-rail">
      <div className="flex items-center gap-2 px-3 py-1.5">
        {/* CASCATA: a pilula ativa do `SmoothTabs` e um elemento de layout
            compartilhado, e o Motion recalcula a posicao dela contra a PAGINA a
            cada render. Como esta gaveta anda junto com a divisoria do sidebar,
            cada quadro do arrasto disparava uma animacao nova e a pilula vinha
            deslizando atras da aba. `layoutRoot` (mais o `layout` que ele exige)
            troca a referencia para esta caixa: mover a caixa inteira nao anima
            nada, e a troca de aba continua deslizando como antes. */}
        <motion.div layout layoutRoot className="shrink-0">
          <SmoothTabsList ariaLabel="Painel de trabalho" className="gap-0.5 p-0.5">
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
        </motion.div>

        <span className="flex-1" />
        {controls}
      </div>

      {/* De onde o conteudo aberto saiu — commit ou arvore de trabalho. */}
      {openFile && (
        <div className="flex min-w-0 items-center gap-1.5 px-3 pb-1.5">
          <span
            className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground"
            title={openFile.path}
          >
            {openFile.path}
          </span>
          {openFile.fromWorkingTree ? (
            <Chip tone="warning">arvore de trabalho</Chip>
          ) : (
            openFile.hash && <Chip tone="primary">{short(openFile.hash)}</Chip>
          )}
        </div>
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
