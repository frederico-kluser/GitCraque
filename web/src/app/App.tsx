/**
 * Shell do GitCraque — o unico lugar que monta os quatro modulos juntos.
 *
 * Layout: toolbar no topo, rail a esquerda, View Tree ao centro, detalhe a
 * direita, console/staging embaixo. Tudo em grid; nenhum posicionamento
 * absoluto para estrutura.
 */
import { useEffect } from "react";
import { GraphView } from "@/graph";
import { GitDndProvider } from "@/dnd";
import { DialogHost } from "@/dialogs";
import { ConsolePanel, DetailPanel, RailPanels, StatusPanel, Toolbar } from "@/panels";
import {
  bootstrap,
  selectCommit,
  selectCommits,
  setPendingIntent,
  useAppState,
} from "@/state/store";

export function App() {
  useEffect(() => {
    bootstrap();
  }, []);

  const commits = useAppState(selectCommits);
  const refs = useAppState((s) => s.refs);
  const selected = useAppState((s) => s.selection.commits);
  const primary = useAppState((s) => s.selection.primary);
  const pendingIntent = useAppState((s) => s.pendingIntent);
  const loadingLog = useAppState((s) => s.loading.log);
  const fatal = useAppState((s) => s.fatal);

  if (fatal) {
    return (
      <main className="grid h-full place-items-center bg-background p-8">
        <div className="max-w-md space-y-2 text-center">
          <h1 className="font-heading text-lg text-foreground">GitCraque nao conseguiu abrir o repositorio</h1>
          <p className="text-sm text-muted-foreground">{fatal}</p>
        </div>
      </main>
    );
  }

  return (
    <GitDndProvider onIntent={setPendingIntent}>
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] bg-background text-foreground">
        <Toolbar className="border-b border-border bg-surface-rail" />

        <div className="grid min-h-0 grid-cols-[clamp(220px,18vw,300px)_minmax(0,1fr)_clamp(280px,24vw,420px)]">
          <RailPanels className="min-h-0 overflow-y-auto border-r border-border bg-surface-rail" />

          <main className="min-h-0 bg-surface-graph">
            <GraphView
              commits={commits}
              refs={refs}
              selected={selected}
              primary={primary}
              loading={loadingLog}
              onSelect={selectCommit}
              className="h-full"
            />
          </main>

          <DetailPanel className="min-h-0 overflow-y-auto border-l border-border bg-card" />
        </div>

        <div className="grid max-h-[38vh] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] border-t border-border">
          <StatusPanel className="min-h-0 overflow-y-auto border-r border-border" />
          <ConsolePanel className="min-h-0 overflow-y-auto bg-surface-inset" />
        </div>
      </div>

      <DialogHost intent={pendingIntent} onClose={() => setPendingIntent(null)} />
    </GitDndProvider>
  );
}
