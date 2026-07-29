/**
 * Barra superior: identidade do repositorio, worktree ativa, rede e o estado
 * global (conexao, operacao em curso, operacao pendente no .git).
 *
 * Dois seletores vivem aqui, e a diferenca entre eles e a espinha do produto:
 * o de PROJETO troca de repositorio (favoritos e recentes), o de WORKTREE troca
 * de diretorio de trabalho dentro do mesmo repositorio. Os dois fazem
 * `process.chdir()` no servidor — nenhum faz `git checkout`.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  CircleAlert,
  Clock,
  FolderTree,
  GitBranch,
  GitCommitHorizontal,
  FolderGit2,
  GitBranchPlus,
  Loader2,
  Plug,
  PlugZap,
  RefreshCw,
  Settings,
  Star,
  TriangleAlert,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { BorderBeam } from "@/components/motion-ui/border-beam";
import { MultiStateButton } from "@/components/motion-ui/multi-state-button";
import { ProgressBar } from "@/components/motion-ui/progress-bar";
import { Skeleton } from "@/components/motion-ui/skeleton";
import { Sparkline } from "@/components/motion-ui/sparkline";
import { useMotionUITransition } from "@/components/motion-ui/ui-theme";
import { selectCommits, selectHead, selectPending, selectWorktrees, useAppState } from "@/state/store";
import {
  loadProjects,
  openSettings,
  selectChangesOpen,
  toggleChanges,
  toggleFavorite,
  useCommitActivity,
  useProjects,
  useShellState,
  useTrickle,
} from "@/hooks";
import {
  doContinue,
  doFetch,
  doOpenRepository,
  doPull,
  doRefresh,
  doSwitchWorktree,
  openAbort,
  openCreateBranch,
  openPushDialog,
  openRepoPicker,
  openStashPush,
} from "@/app/actions";
import { UndoRedo } from "./UndoRedo";
import { Rich, t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ConnectionState } from "@/lib/ws";
import type { MessageKey } from "@/i18n";
import type { PanelProps } from "@/types/modules";
import { Chip, FOCUS_RING, SectionLabel, ToolButton } from "./parts";

/* ------------------------------------------------------------------ */
/* Rede: fetch / pull / push                                           */
/* ------------------------------------------------------------------ */

type NetState = "idle" | "loading" | "ok" | "error";

const NET_SURFACE: Record<NetState, string> = {
  idle: "border border-border bg-card text-foreground",
  loading: "bg-muted text-muted-foreground",
  ok: "bg-success text-success-foreground",
  error: "bg-destructive text-destructive-foreground",
};

function NetButton({
  label,
  icon,
  state,
  busy,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  state: NetState;
  busy: boolean;
  onClick: () => void;
}) {
  const glyph =
    state === "loading" ? (
      <Loader2 className="size-3.5 animate-spin" />
    ) : state === "ok" ? (
      <Check className="size-3.5" />
    ) : state === "error" ? (
      <X className="size-3.5" />
    ) : (
      icon
    );

  return (
    <MultiStateButton
      state={state}
      icon={glyph}
      onClick={onClick}
      disabled={busy}
      feedback={state === "error" ? "shake" : state === "ok" ? "pop" : "none"}
      surfaceClassName={NET_SURFACE[state]}
      pillClassName="rounded-md px-2.5 py-1.5 text-xs font-medium"
      announce={`${label}: ${state}`}
      aria-label={label}
    >
      {state === "ok" ? t("common.ok") : state === "error" ? t("common.error") : label}
    </MultiStateButton>
  );
}

/* ------------------------------------------------------------------ */
/* Conexao do WebSocket                                                */
/* ------------------------------------------------------------------ */

const CONNECTION_META: Record<ConnectionState, { key: MessageKey; tone: string; pulse: boolean }> = {
  open: { key: "toolbar.connection.open", tone: "text-success", pulse: false },
  connecting: { key: "toolbar.connection.connecting", tone: "text-warning", pulse: true },
  reconnecting: { key: "toolbar.connection.reconnecting", tone: "text-warning", pulse: true },
  closed: { key: "toolbar.connection.closed", tone: "text-destructive", pulse: false },
};

function ConnectionBadge({ connection }: { connection: ConnectionState }) {
  const meta = { ...CONNECTION_META[connection], label: t(CONNECTION_META[connection].key) };
  const ambient = useMotionUITransition("ambient");
  const Icon = connection === "open" ? Plug : PlugZap;

  return (
    <span
      title={t("toolbar.connection.title", { state: meta.label })}
      className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium", meta.tone)}
    >
      <motion.span
        className="inline-flex"
        animate={meta.pulse ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
        transition={
          meta.pulse
            ? { duration: ambient.duration * 1.6, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0 }
        }
      >
        <Icon className="size-3.5" />
      </motion.span>
      {meta.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Seletor de projeto — favoritos, recentes e "abrir outro"            */
/* ------------------------------------------------------------------ */

/**
 * A identidade do repositorio no canto E o seletor de projeto.
 *
 * CASCATA: menu ancorado nao existe no catalogo do Motion UI (os 19 instalados
 * sao mecanicas de revelacao e gesto), entao a semantica vem do `Menu` do Base
 * UI — o mesmo caminho que o seletor de worktree ao lado ja percorre.
 */
/**
 * A estrela que fixa/desfixa um projeto, aqui dentro do menu.
 *
 * CASCATA: o catalogo do Motion UI nao tem botao de alternancia — o
 * `segmented-toggle` escolhe entre N opcoes visiveis lado a lado, nao liga e
 * desliga um estado numa linha de lista, e nenhum dos 19 expoe `aria-pressed`.
 *
 * A disciplina de eventos e a mesma de `parts.tsx:226-233` e nao e opcional:
 * este botao vive DENTRO de um `Menu.Item` cujo clique troca de repositorio.
 * Sem barrar pointer, clique e teclado, fixar um favorito abriria o projeto e
 * fecharia o menu — que e exatamente o oposto do que a estrela promete.
 */
function StarToggle({ path, name, pinned }: { path: string; name: string; pinned: boolean }) {
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  return (
    <button
      type="button"
      aria-pressed={pinned}
      aria-label={pinned ? t("favorites.unpin", { name }) : t("favorites.pin", { name })}
      title={pinned ? t("favorites.unpinTitle") : t("favorites.pinTitle")}
      onPointerDown={stop}
      onPointerUp={stop}
      onKeyDown={stop}
      onClick={(event) => {
        event.stopPropagation();
        void toggleFavorite(path, name);
      }}
      className={cn(
        "shrink-0 rounded p-1 outline-none",
        "transition-colors duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
        "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
        pinned ? "text-warning" : "text-muted-foreground hover:text-warning",
      )}
    >
      <Star className="size-3.5" fill={pinned ? "currentColor" : "none"} />
    </button>
  );
}

function ProjectRow({
  icon,
  title,
  path,
  branch,
  current,
  missing,
  pinned,
  onSelect,
}: {
  icon: ReactNode;
  title: string;
  path: string;
  branch?: string | null;
  current: boolean;
  missing?: boolean;
  pinned: boolean;
  onSelect: () => void;
}) {
  return (
    <Menu.Item
      onClick={onSelect}
      disabled={current || missing}
      className={cn(
        "flex cursor-default items-center gap-2.5 rounded-sm px-2.5 py-2 outline-none select-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        current && "data-[disabled]:opacity-100",
        missing && "data-[disabled]:opacity-45",
      )}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium">{title}</span>
          {current && <Chip tone="success">{t("common.opened")}</Chip>}
          {missing && <Chip tone="danger">{t("common.missingFromDisk")}</Chip>}
          {branch && !current && <Chip tone="primary">{branch}</Chip>}
        </span>
        <span className="block truncate font-mono text-[10px] text-muted-foreground">{path}</span>
      </span>
      <StarToggle path={path} name={title} pinned={pinned} />
    </Menu.Item>
  );
}

function ProjectSelector() {
  const repo = useAppState((s) => s.repo);
  const head = useAppState(selectHead);
  const cwd = useAppState((s) => s.repo?.cwd ?? null);
  const { favorites, recents, loading, loaded } = useProjects();

  // Os recentes que ja estao nos favoritos viravam linha repetida.
  const favoritePaths = new Set(favorites.map((f) => f.path));
  const outros = recents.filter((r) => !favoritePaths.has(r.path)).slice(0, 8);
  const vazio = favorites.length === 0 && outros.length === 0;

  return (
    <Menu.Root onOpenChange={(open) => open && void loadProjects()}>
      <Menu.Trigger
        title={t("toolbar.project.trigger")}
        className={cn(
          "flex max-w-[18rem] min-w-0 items-center gap-2.5 rounded-lg border border-transparent px-2 py-1 text-left",
          "transition-colors duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
          "hover:border-border hover:bg-accent data-[popup-open]:border-border data-[popup-open]:bg-accent",
          FOCUS_RING,
        )}
      >
        <FolderGit2 className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-heading text-sm font-semibold text-foreground">
            {repo?.name ?? "GitCraque"}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <GitBranch className="size-3 shrink-0" />
            <span className="truncate font-mono">
              {head?.detached
                ? t("toolbar.head.detached", { hash: head.hash?.slice(0, 7) ?? "?" })
                : (head?.branch ?? "—")}
            </span>
          </span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="start" className="z-50 outline-none">
          <Menu.Popup className="max-h-[70vh] w-[26rem] max-w-[90vw] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-2xl">
            <div className="px-2.5 pt-2 pb-1.5">
              <SectionLabel>{t("toolbar.project.section")}</SectionLabel>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                <Rich
                  k="toolbar.project.note"
                  nodes={{ chdir: <span className="font-mono text-foreground">process.chdir()</span> }}
                />
              </p>
            </div>

            {/* O projeto ABERTO agora, com estrela propria. Sem esta linha, o
                unico jeito de fixar o projeto em que se esta trabalhando era
                abrir o seletor e procura-lo numa das quatro abas. */}
            {cwd && (
              <div className="mx-1 flex items-center gap-2.5 rounded-sm px-1.5 py-2">
                <FolderGit2 className="size-3.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium">{repo?.name ?? cwd}</span>
                    <Chip tone="success">{t("common.opened")}</Chip>
                  </span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">
                    {cwd}
                  </span>
                </span>
                <StarToggle
                  path={cwd}
                  name={repo?.name ?? cwd}
                  pinned={favoritePaths.has(cwd)}
                />
              </div>
            )}

            {favorites.length > 0 && (
              <>
                <Menu.Separator className="my-1 h-px bg-border" />
                <div className="px-2.5 py-1">
                  <SectionLabel>{t("toolbar.project.favorites")}</SectionLabel>
                </div>
                {favorites.map((fav) => (
                  <ProjectRow
                    key={fav.path}
                    icon={<Star className="size-3.5" />}
                    title={fav.label || fav.name}
                    path={fav.path}
                    branch={fav.branch}
                    current={fav.path === cwd}
                    missing={!fav.exists}
                    pinned
                    onSelect={() => void doOpenRepository(fav.path)}
                  />
                ))}
              </>
            )}

            {outros.length > 0 && (
              <>
                <Menu.Separator className="my-1 h-px bg-border" />
                <div className="px-2.5 py-1">
                  <SectionLabel>{t("toolbar.project.recents")}</SectionLabel>
                </div>
                {outros.map((recent) => (
                  <ProjectRow
                    key={recent.path}
                    icon={<Clock className="size-3.5" />}
                    title={recent.name}
                    path={recent.path}
                    branch={recent.branch}
                    current={recent.path === cwd}
                    missing={!recent.exists}
                    pinned={favoritePaths.has(recent.path)}
                    onSelect={() => void doOpenRepository(recent.path)}
                  />
                ))}
              </>
            )}

            {vazio && (
              <p className="px-2.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
                {loading || !loaded ? t("toolbar.project.loading") : t("toolbar.project.empty")}
              </p>
            )}

            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item
              onClick={openRepoPicker}
              className={cn(
                "flex cursor-default items-center gap-2.5 rounded-sm px-2.5 py-2 text-xs outline-none select-none",
                "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
              )}
            >
              <FolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
              {t("toolbar.project.openOther")}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Botao de commit — o que sobrou da aba "Alteracoes"                  */
/* ------------------------------------------------------------------ */

/**
 * Abre a gaveta de alteracoes. Fica colado no seletor de projeto de proposito:
 * "o que ha para commitar" e uma propriedade DESTE repositorio, e ler as duas
 * coisas juntas evita o passeio ate o outro canto da tela para descobrir se ha
 * trabalho pendente.
 *
 * Sem alteracoes ele nao some — apaga e desabilita. Um botao que aparece e
 * desaparece faz a fileira inteira dancar a cada `git add`, e a pessoa perde a
 * mira de todos os outros.
 *
 * CASCATA: `BorderBeam` do catalogo resolve a animacao inteira — o feixe corre
 * a borda enquanto ha o que commitar e para sozinho sob `prefers-reduced-motion`
 * e fora da tela. O `active` dele e o mesmo booleano que pinta o botao, entao
 * nao ha dois estados para discordarem.
 */
function CommitButton() {
  const changeCount = useAppState((s) => s.status?.entries.length ?? 0);
  const open = useShellState(selectChangesOpen);
  const dirty = changeCount > 0;

  const title = dirty
    ? t("changes.filesChanged", { count: changeCount })
    : t("toolbar.commit.clean");

  return (
    <BorderBeam active={dirty && !open} size={140} duration={5} thickness={2} className="shrink-0">
      <button
        type="button"
        onClick={toggleChanges}
        disabled={!dirty}
        aria-label={t("toolbar.commit.label")}
        aria-expanded={open}
        title={title}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
          "transition-colors duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
          dirty
            ? "border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90"
            : "border-border bg-card text-muted-foreground opacity-60",
          FOCUS_RING,
        )}
      >
        <GitCommitHorizontal className="size-3.5 shrink-0" />
        {t("commit.button")}
        {dirty && (
          <span className="rounded-sm bg-primary-foreground/20 px-1 font-mono text-[10px] tabular-nums">
            {changeCount}
          </span>
        )}
      </button>
    </BorderBeam>
  );
}

/* ------------------------------------------------------------------ */
/* Seletor de worktree                                                 */
/* ------------------------------------------------------------------ */

function WorktreeSelector() {
  const worktrees = useAppState(selectWorktrees);
  const cwd = useAppState((s) => s.worktrees?.cwd ?? s.repo?.cwd ?? null);
  const active = worktrees.find((w) => w.isActive) ?? worktrees.find((w) => w.isMain) ?? null;

  return (
    <Menu.Root>
      {/* A worktree ativa e marcada por uma borda ESTATICA em primary — sem
          efeito animado correndo pela borda. */}
      <Menu.Trigger
        title={t("toolbar.worktree.trigger")}
        className={cn(
          "flex max-w-[22rem] min-w-0 items-center gap-2.5 rounded-lg border bg-card px-3 py-1.5 text-left",
          "transition-colors duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
          "hover:bg-accent data-[popup-open]:bg-accent",
          active ? "border-primary/40" : "border-border",
          FOCUS_RING,
        )}
      >
        <FolderTree className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-foreground">
              {active?.label ?? t("toolbar.worktree.none")}
            </span>
            {active?.branch && <Chip tone="primary">{active.branch}</Chip>}
          </span>
          {/* O caminho absoluto na cara: a troca e por diretorio. */}
          <span className="block truncate font-mono text-[10px] text-muted-foreground">
            {active?.path ?? cwd ?? "—"}
          </span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="start" className="z-50 outline-none">
          <Menu.Popup className="w-[26rem] max-w-[90vw] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-2xl">
            <div className="px-2.5 pt-2 pb-1.5">
              <SectionLabel>{t("rail.worktrees.title")}</SectionLabel>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                <Rich
                  k="toolbar.worktree.note"
                  nodes={{
                    chdir: <span className="font-mono text-foreground">process.chdir()</span>,
                    checkout: <span className="font-mono text-foreground">git checkout</span>,
                  }}
                />
              </p>
            </div>
            <Menu.Separator className="my-1 h-px bg-border" />
            {worktrees.length === 0 && (
              <p className="px-2.5 py-3 text-xs text-muted-foreground">{t("toolbar.worktree.emptyList")}</p>
            )}
            {worktrees.map((wt) => (
              <Menu.Item
                key={wt.path}
                onClick={() => void doSwitchWorktree(wt)}
                disabled={wt.isActive}
                className={cn(
                  "flex cursor-default flex-col gap-0.5 rounded-sm px-2.5 py-2 outline-none select-none",
                  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                  "data-[disabled]:opacity-100",
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium">{wt.label}</span>
                  {wt.isActive && <Chip tone="success">{t("rail.chip.active")}</Chip>}
                  {wt.isMain && <Chip tone="neutral">{t("rail.chip.main")}</Chip>}
                  {wt.branch ? (
                    <Chip tone="primary">{wt.branch}</Chip>
                  ) : (
                    <Chip tone="warning">{t("rail.chip.detached")}</Chip>
                  )}
                </span>
                <span className="truncate font-mono text-[10px] text-muted-foreground">{wt.path}</span>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Aviso de operacao pendente no .git                                  */
/* ------------------------------------------------------------------ */

function PendingBanner() {
  const pending = useAppState(selectPending);
  const enter = useMotionUITransition("ui");
  if (!pending) return null;

  const step =
    pending.step != null && pending.total != null
      ? t("toolbar.pending.step", { step: pending.step, total: pending.total })
      : t("toolbar.pending.inProgress");

  return (
    <motion.div
      initial={{ opacity: 0, transform: "translateY(-6px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      exit={{ opacity: 0, transform: "translateY(-6px)" }}
      transition={{ ...enter }}
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-warning/40 bg-warning/12 px-4 py-1.5"
    >
      <TriangleAlert className="size-3.5 shrink-0 text-warning" />
      <span className="text-xs font-medium text-foreground">
        {t("toolbar.pending.banner", { kind: pending.kind, step })}
      </span>
      {pending.current && (
        <span className="font-mono text-[11px] text-muted-foreground">{pending.current.slice(0, 7)}</span>
      )}
      {pending.conflicts.length > 0 && (
        <Chip tone="danger">{t("toolbar.pending.conflicts", { count: pending.conflicts.length })}</Chip>
      )}
      <span className="flex-1" />
      <ToolButton size="sm" icon={<Check className="size-3" />} onClick={() => void doContinue(pending.kind)}>
        {t("toolbar.pending.continue")}
      </ToolButton>
      <ToolButton size="sm" tone="danger" icon={<X className="size-3" />} onClick={() => openAbort(pending.kind)}>
        {t("toolbar.pending.abort")}
      </ToolButton>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbar                                                             */
/* ------------------------------------------------------------------ */

export function Toolbar({ className }: PanelProps) {
  // A identidade do repositorio (nome, HEAD) mora no `ProjectSelector`.
  const commits = useAppState(selectCommits);
  const connection = useAppState((s) => s.connection);
  const busy = useAppState((s) => s.loading.operation);
  const operationLabel = useAppState((s) => s.operationLabel);

  const activity = useCommitActivity(commits);
  const progress = useTrickle(busy);

  // Cada botao de rede tem a propria maquina de estados; `loading.operation`
  // (global) e o que trava os tres enquanto qualquer comando esta em voo.
  const [net, setNet] = useState<{ op: "fetch" | "pull" | "push" | null; state: NetState }>({
    op: null,
    state: "idle",
  });

  useEffect(() => {
    if (net.state !== "ok" && net.state !== "error") return;
    const t = setTimeout(() => setNet({ op: null, state: "idle" }), 1_800);
    return () => clearTimeout(t);
  }, [net]);

  const runNet = (op: "fetch" | "pull", fn: () => Promise<{ ok: boolean } | null>) => {
    setNet({ op, state: "loading" });
    void fn().then((result) => setNet({ op, state: result?.ok ? "ok" : "error" }));
  };

  const stateOf = (op: "fetch" | "pull" | "push"): NetState => (net.op === op ? net.state : "idle");

  return (
    <header className={cn("flex flex-col", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        {/* --- identidade: e o seletor de projeto --- */}
        <div className="flex min-w-0 items-center gap-3">
          <ProjectSelector />

          {/* O que ha para commitar, colado na identidade do repositorio. */}
          <CommitButton />

          {/* Atividade das ultimas semanas, derivada do %ar de cada commit.
              Espera o log chegar: montar com a serie zerada faria o Motion
              interpolar do nada para os dados na primeira carga. */}
          <div className="hidden items-center gap-1.5 md:flex">
            {commits.length === 0 ? (
              <Skeleton className="h-7 w-[7.5rem] rounded-sm" />
            ) : (
              <>
                <Sparkline
                  history={activity.history}
                  tone="primary"
                  area
                  dot
                  width={120}
                  height={30}
                  padY={5}
                  // Serie estatica: ela so muda quando o log inteiro e recarregado,
                  // e o morph do componente parte de um `d` ainda nao pintado.
                  motionAllowed={false}
                  className="h-7 w-[7.5rem]"
                  label={t("toolbar.activity.label", {
                    count: activity.windowTotal,
                    weeks: activity.weeks,
                  })}
                />
                <span className="text-[10px] leading-tight text-muted-foreground">
                  {activity.windowTotal}
                  <br />
                  {t("toolbar.activity.weeks", { weeks: activity.weeks })}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="h-7 w-px bg-border" />

        {/* --- worktree ativa --- */}
        <WorktreeSelector />

        <div className="flex-1" />

        {/* --- desfazer / refazer --- */}
        <UndoRedo className="hidden md:block" />
        {/* Some junto com os botoes: separador solto no md- seria um risco no ar. */}
        <div className="hidden h-7 w-px bg-border md:block" />

        {/* --- rede --- */}
        <div className="flex items-center gap-1.5">
          <NetButton
            label={t("action.fetch")}
            icon={<ArrowDownToLine className="size-3.5" />}
            state={stateOf("fetch")}
            busy={busy}
            onClick={() => runNet("fetch", doFetch)}
          />
          <NetButton
            label={t("action.pull")}
            icon={<ArrowDownToLine className="size-3.5" />}
            state={stateOf("pull")}
            busy={busy}
            onClick={() => runNet("pull", () => doPull())}
          />
          <NetButton
            label={t("action.push.title")}
            icon={<ArrowUpFromLine className="size-3.5" />}
            state={stateOf("push")}
            busy={busy}
            onClick={openPushDialog}
          />
        </div>

        <div className="h-7 w-px bg-border" />

        {/* --- acoes rapidas --- */}
        <div className="flex items-center gap-1.5">
          <ToolButton
            icon={<FolderGit2 className="size-3.5" />}
            onClick={openRepoPicker}
            title={t("toolbar.action.open.title")}
          >
            {t("toolbar.action.open")}
          </ToolButton>
          <ToolButton icon={<GitBranchPlus className="size-3.5" />} onClick={() => openCreateBranch()}>
            {t("toolbar.action.branch")}
          </ToolButton>
          <ToolButton icon={<Archive className="size-3.5" />} onClick={openStashPush}>
            {t("toolbar.action.stash")}
          </ToolButton>
          <ToolButton
            tone="ghost"
            aria-label={t("toolbar.action.refresh")}
            title={t("toolbar.action.refresh.title")}
            icon={<RefreshCw className="size-3.5" />}
            onClick={() => void doRefresh()}
          />
          {/* Uma engrenagem no lugar do seletor de idioma e do sol/lua: os dois
              viraram secao do modal de configuracoes, junto da rotina de fetch
              e da chave de IA. */}
          <ToolButton
            tone="ghost"
            aria-label={t("settings.open")}
            title={t("settings.open")}
            icon={<Settings className="size-3.5" />}
            onClick={openSettings}
          />
        </div>

        <div className="h-7 w-px bg-border" />
        <ConnectionBadge connection={connection} />
      </div>

      {/* --- barra de progresso da operacao em curso --- */}
      <AnimatePresence>
        {busy && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-4 pb-1.5">
            <ProgressBar
              value={progress}
              size="sm"
              highlight
              progressbar
              aria-label={operationLabel ?? t("toolbar.progress.label")}
              label={
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {operationLabel ?? t("toolbar.progress.running")}
                </span>
              }
              className="gap-1"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- operacao pendente detectada no .git --- */}
      <AnimatePresence>
        <PendingBanner />
      </AnimatePresence>

      {/* --- conexao caida: banner explicito --- */}
      {connection !== "open" && (
        <div className="flex items-center gap-2 border-t border-border bg-surface-inset px-4 py-1.5 text-[11px] text-muted-foreground">
          <CircleAlert className="size-3.5 shrink-0 text-warning" />
          {connection === "closed" ? t("toolbar.ws.closed") : t("toolbar.ws.reconnecting")}
        </div>
      )}
    </header>
  );
}
