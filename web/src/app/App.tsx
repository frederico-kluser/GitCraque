/**
 * Shell do GitCraque — o unico lugar que monta os quatro modulos juntos.
 *
 * Layout: toolbar no topo, rail a esquerda, View Tree ao centro e, a direita, a
 * coluna de detalhe — que mostra UMA tela por vez, o detalhe do commit ou a View
 * do arquivo aberto. Staging e commit saem de uma gaveta por cima da tela,
 * chamada pelo botao de commit da toolbar. Rodape de diagnostico fecha a tela.
 * Tudo em grid; o unico posicionamento absoluto do arquivo e o alvo de arrasto
 * das divisorias.
 *
 * As larguras das colunas sao arrastaveis e persistidas (ver `Splitter.tsx`,
 * que explica por que ele e escrito a mao).
 */
import { useEffect, useRef } from "react";
import { FolderX, GitCommitHorizontal, PlugZap } from "lucide-react";
import { GraphView } from "@/graph";
import { GitDndProvider } from "@/dnd";
import { DialogHost, RepoPicker } from "@/dialogs";
import { ChangesSheet, RailPanels, SidePanel, Toolbar } from "@/panels";
import { StaggerReveal, StaggerRevealHeadline, StaggerRevealItem } from "@/components/motion-ui/stagger-reveal";
import { Rich, t } from "@/i18n";
import {
  bootstrap,
  clearReveal,
  clearSelection,
  selectCommit,
  selectCommits,
  setPendingIntent,
  useAppState,
} from "@/state/store";
import {
  DETAIL_RANGE,
  RAIL_RANGE,
  openContextMenu,
  requestCommit,
  setCommitDraft,
  setDetailWidth,
  setRailWidth,
  togglePalette,
  useHotkeys,
  useShellState,
} from "@/hooks";
import type { CommitRef } from "@/types/git";
import { doActivateRef, doRefresh } from "./actions";
import { commitMenu, refMenu } from "./menus";
import { ConfirmHost } from "./ConfirmHost";
import { ContextMenuHost } from "./ContextMenuHost";
import { Splitter } from "./Splitter";
import { StatusFooter } from "./StatusFooter";
import { Toasts } from "./Toasts";
import { VoiceBubble } from "./VoiceBubble";

/* ------------------------------------------------------------------ */
/* Menus da View Tree                                                  */
/* ------------------------------------------------------------------ */

/**
 * O grafo nao sabe o que se pode fazer com um commit — ele so avisa onde foi o
 * clique. Quem traduz isso em acoes e o shell, aqui.
 */
const onCommitContextMenu = (hash: string, at: { x: number; y: number }) =>
  openContextMenu({ label: `Commit ${hash.slice(0, 7)}`, ...at, items: commitMenu(hash) });

const onRefContextMenu = (refEntry: CommitRef, at: { x: number; y: number }) =>
  openContextMenu({ label: refEntry.name, ...at, items: refMenu(refEntry) });

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
        {t("app.emptyRepo.title")}
      </StaggerRevealHeadline>
      <StaggerRevealItem as="p" className="max-w-sm text-xs leading-relaxed text-muted-foreground">
        <Rich
          k="app.emptyRepo.body"
          nodes={{ command: <span className="font-mono">git log --all --topo-order</span> }}
        />
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
  // Clicar numa branch ou tag no rail vira este pedido; o grafo rola ate o
  // commit, marca a linha e devolve `onRevealed` para o store limpar.
  const reveal = useAppState((s) => s.reveal);
  const pendingIntent = useAppState((s) => s.pendingIntent);
  const loadingLog = useAppState((s) => s.loading.log);
  const fatal = useAppState((s) => s.fatal);
  const isRepo = useAppState((s) => s.repo?.isRepo ?? true);
  const repoCwd = useAppState((s) => s.repo?.cwd ?? null);
  const emptyLog = useAppState((s) => s.log?.empty ?? false);
  const connection = useAppState((s) => s.connection);

  const railWidth = useShellState((s) => s.railWidth);
  const detailWidth = useShellState((s) => s.detailWidth);

  useHotkeys({
    onRefresh: () => void doRefresh(),
    onCommit: requestCommit,
    onEscape: clearSelection,
  });

  // Trocar de projeto ou de worktree e trocar o diretorio do servidor: o
  // rascunho do commit era daquele repositorio, nao deste. Mora aqui, e nao no
  // painel de alteracoes, porque aquele desmonta toda vez que a gaveta fecha.
  const lastCwd = useRef<string | null>(null);
  useEffect(() => {
    if (lastCwd.current && lastCwd.current !== repoCwd) setCommitDraft({ message: "", amend: false });
    lastCwd.current = repoCwd;
  }, [repoCwd]);

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
        title={t("app.fatal.title")}
      >
        <p>{fatal}</p>
        <p className="mt-2 text-xs">
          <Rich k="app.fatal.hint" nodes={{ port: <span className="font-mono">:5271</span> }} />
        </p>
      </BoundaryScreen>
    );
  }

  // Sem repositorio, a tela NAO e um aviso: e o seletor. Mandar o usuario voltar
  // ao terminal para subir o app de novo era um beco sem saida.
  if (!isRepo) {
    return (
      <>
        {/* Ancorado no topo, nao centralizado: a lista cresce e encolhe conforme
            a aba e o filtro, e centralizar faria a tela inteira pular a cada
            tecla digitada. */}
        <main className="h-full overflow-y-auto bg-background px-6 py-[7vh]">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
            <header className="flex items-start gap-3">
              <FolderX className="mt-0.5 size-6 shrink-0 text-warning" />
              <div className="min-w-0">
                <h1 className="font-heading text-lg text-foreground">{t("app.picker.title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  <Rich
                    k="app.picker.body"
                    nodes={{
                      cwd: <span className="break-all font-mono text-foreground">{repoCwd ?? "?"}</span>,
                      dotgit: <span className="font-mono">.git</span>,
                      init: <span className="font-mono">git init</span>,
                    }}
                  />
                </p>
              </div>
            </header>
            <RepoPicker variant="page" className="w-full max-w-none" />
          </div>
        </main>
        <ContextMenuHost />
        <Toasts />
      </>
    );
  }

  return (
    <GitDndProvider onIntent={setPendingIntent}>
      {/* Tres linhas: toolbar, corpo e rodape de diagnostico. */}
      <div
        className="grid h-full bg-background text-foreground"
        style={{ gridTemplateRows: "auto minmax(0,1fr) auto" }}
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
            label={t("app.splitter.rail")}
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
                reveal={reveal}
                onRevealed={clearReveal}
                /* duplo clique num chip de branch da View Tree troca para ela */
                onRefActivate={doActivateRef}
                /* botao direito: no chip, o menu da ref; na linha, o do commit */
                onRefContextMenu={onRefContextMenu}
                onContextMenu={onCommitContextMenu}
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
            label={t("app.splitter.detail")}
            onChange={setDetailWidth}
          />
          <SidePanel className="min-h-0 border-l border-border bg-card" />
        </div>

        <StatusFooter className="border-t border-border bg-surface-rail" />
      </div>

      {/* Staging e commit: gaveta unica, chamada pelo botao da toolbar. Fica
          aqui, e nao dentro do sidebar, porque ela cobre a tela inteira. */}
      <ChangesSheet />

      {/* Confirmacoes vindas do DND (outro modulo) e dos paineis (este). */}
      <DialogHost intent={pendingIntent} onClose={() => setPendingIntent(null)} />
      <ConfirmHost />
      {/* Um menu de contexto para a tela inteira — e o fim do menu do navegador
          em tudo o que nao e campo de texto. */}
      <ContextMenuHost />
      <Toasts />

      {/* Microfone flutuante do bottom center. Fica em z-40, abaixo de tudo o
          que vem acima, para que um dialogo sempre o cubra. */}
      <VoiceBubble />

      {/* Reconexao: banner fixo, para nao depender do scroll da toolbar. */}
      {connection === "reconnecting" && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center p-2"
        >
          <span className="rounded-full border border-warning/50 bg-popover px-3 py-1 text-[11px] text-warning shadow-lg">
            {t("app.reconnecting")}
          </span>
        </div>
      )}
    </GitDndProvider>
  );
}
