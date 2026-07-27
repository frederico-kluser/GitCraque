/**
 * Shell do GitCraque — o unico lugar que monta os quatro modulos juntos.
 *
 * Layout: toolbar no topo, rail a esquerda, View Tree ao centro, detalhe a
 * direita, staging e console embaixo, rodape de diagnostico. Tudo em grid; o
 * unico posicionamento absoluto do arquivo e o alvo de arrasto das divisorias.
 *
 * As larguras das colunas sao arrastaveis e persistidas (ver `Splitter.tsx`,
 * que explica por que ele e escrito a mao).
 */
import { useEffect } from "react";
import { FolderX, GitCommitHorizontal, PlugZap } from "lucide-react";
import { GraphView } from "@/graph";
import { GitDndProvider } from "@/dnd";
import { DialogHost } from "@/dialogs";
import { ConsolePanel, DetailPanel, RailPanels, StatusPanel, Toolbar } from "@/panels";
import { StaggerReveal, StaggerRevealHeadline, StaggerRevealItem } from "@/components/motion-ui/stagger-reveal";
import {
  bootstrap,
  clearSelection,
  selectCommit,
  selectCommits,
  setPendingIntent,
  useAppState,
} from "@/state/store";
import {
  BOTTOM_RANGE,
  DETAIL_RANGE,
  RAIL_RANGE,
  requestCommit,
  setBottomHeight,
  setDetailWidth,
  setRailWidth,
  togglePalette,
  useHotkeys,
  useShellState,
} from "@/hooks";
import { doRefresh } from "./actions";
import { ConfirmHost } from "./ConfirmHost";
import { Splitter } from "./Splitter";
import { StatusFooter } from "./StatusFooter";
import { Toasts } from "./Toasts";

/* ------------------------------------------------------------------ */
/* Estados de contorno                                                 */
/* ------------------------------------------------------------------ */

function BoundaryScreen({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid h-full place-items-center bg-background p-8">
      <StaggerReveal className="flex max-w-md flex-col items-center gap-3 text-center">
        <StaggerRevealItem>{icon}</StaggerRevealItem>
        <StaggerRevealHeadline as="h1" className="font-heading text-lg text-foreground">
          {title}
        </StaggerRevealHeadline>
        <StaggerRevealItem as="div" className="text-sm leading-relaxed text-muted-foreground">
          {children}
        </StaggerRevealItem>
      </StaggerReveal>
    </main>
  );
}

/** Centro vazio: repositorio sem nenhum commit alcancavel. */
function EmptyRepo() {
  return (
    <StaggerReveal className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <StaggerRevealItem>
        <GitCommitHorizontal className="size-7 text-muted-foreground" />
      </StaggerRevealItem>
      <StaggerRevealHeadline as="h2" className="font-heading text-sm font-medium text-foreground">
        Repositorio sem commits
      </StaggerRevealHeadline>
      <StaggerRevealItem as="p" className="max-w-sm text-xs leading-relaxed text-muted-foreground">
        O <span className="font-mono">git log --all --topo-order</span> nao devolveu nada. Prepare arquivos no
        painel de alteracoes e faca o primeiro commit — a View Tree aparece na hora.
      </StaggerRevealItem>
    </StaggerReveal>
  );
}

/* ------------------------------------------------------------------ */

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
  const isRepo = useAppState((s) => s.repo?.isRepo ?? true);
  const repoCwd = useAppState((s) => s.repo?.cwd ?? null);
  const emptyLog = useAppState((s) => s.log?.empty ?? false);
  const connection = useAppState((s) => s.connection);

  const railWidth = useShellState((s) => s.railWidth);
  const detailWidth = useShellState((s) => s.detailWidth);
  const bottomHeight = useShellState((s) => s.bottomHeight);

  useHotkeys({
    onRefresh: () => void doRefresh(),
    onCommit: requestCommit,
    onEscape: clearSelection,
  });

  // O ⌘K e instalado pelo proprio `useCommandK` do Motion UI; este e o gatilho
  // de reserva para quem chega pelo menu do navegador em tela estreita.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (fatal) {
    return (
      <BoundaryScreen
        icon={<PlugZap className="size-7 text-destructive" />}
        title="GitCraque nao conseguiu abrir o repositorio"
      >
        <p>{fatal}</p>
        <p className="mt-2 text-xs">
          Confira se o backend esta no ar em <span className="font-mono">:5271</span> e se o diretorio informado
          existe.
        </p>
      </BoundaryScreen>
    );
  }

  if (!isRepo) {
    return (
      <BoundaryScreen icon={<FolderX className="size-7 text-warning" />} title="Este diretorio nao e um repositorio git">
        <p>
          O servidor esta em <span className="font-mono break-all">{repoCwd ?? "?"}</span>, e ali nao ha{" "}
          <span className="font-mono">.git</span>.
        </p>
        <p className="mt-2 text-xs">
          Suba o <span className="font-mono">gitcraque</span> apontando para um repositorio, ou rode{" "}
          <span className="font-mono">git init</span> nesse diretorio.
        </p>
      </BoundaryScreen>
    );
  }

  return (
    <GitDndProvider onIntent={setPendingIntent}>
      <div
        className="grid h-full bg-background text-foreground"
        style={{ gridTemplateRows: `auto minmax(0,1fr) auto ${bottomHeight}px auto` }}
      >
        <Toolbar className="border-b border-border bg-surface-rail" />

        {/* --- tres colunas com divisorias arrastaveis --- */}
        <div
          className="grid min-h-0"
          style={{ gridTemplateColumns: `${railWidth}px auto minmax(0,1fr) auto ${detailWidth}px` }}
        >
          <RailPanels className="min-h-0 overflow-y-auto border-r border-border bg-surface-rail" />
          <Splitter
            axis="x"
            value={railWidth}
            min={RAIL_RANGE.min}
            max={RAIL_RANGE.max}
            label="Largura do rail"
            onChange={setRailWidth}
          />

          <main className="min-h-0 bg-surface-graph">
            {emptyLog && commits.length === 0 && !loadingLog ? (
              <EmptyRepo />
            ) : (
              <GraphView
                commits={commits}
                refs={refs}
                selected={selected}
                primary={primary}
                loading={loadingLog}
                onSelect={selectCommit}
                className="h-full"
              />
            )}
          </main>

          <Splitter
            axis="x"
            sign={-1}
            value={detailWidth}
            min={DETAIL_RANGE.min}
            max={DETAIL_RANGE.max}
            label="Largura do painel de detalhe"
            onChange={setDetailWidth}
          />
          <DetailPanel className="min-h-0 border-l border-border bg-card" />
        </div>

        <Splitter
          axis="y"
          sign={-1}
          value={bottomHeight}
          min={BOTTOM_RANGE.min}
          max={BOTTOM_RANGE.max}
          label="Altura do painel inferior"
          onChange={setBottomHeight}
        />

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] border-t border-border">
          <StatusPanel className="min-h-0 border-r border-border bg-background" />
          <ConsolePanel className="min-h-0 bg-surface-inset" />
        </div>

        <StatusFooter className="border-t border-border bg-surface-rail" />
      </div>

      {/* Confirmacoes vindas do DND (outro modulo) e dos paineis (este). */}
      <DialogHost intent={pendingIntent} onClose={() => setPendingIntent(null)} />
      <ConfirmHost />
      <Toasts />

      {/* Reconexao: banner fixo, para nao depender do scroll da toolbar. */}
      {connection === "reconnecting" && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center p-2"
        >
          <span className="rounded-full border border-warning/50 bg-popover px-3 py-1 text-[11px] text-warning shadow-lg">
            Reconectando ao servidor…
          </span>
        </div>
      )}
    </GitDndProvider>
  );
}
