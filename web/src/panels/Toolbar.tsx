/**
 * Barra superior: identidade do repositorio, worktree ativa, rede e o estado
 * global (conexao, operacao em curso, operacao pendente no .git).
 *
 * O ponto que este painel precisa deixar OBVIO: trocar de worktree e trocar de
 * DIRETORIO. O seletor mostra o caminho absoluto e diz, com todas as letras,
 * que a troca e `process.chdir()` no servidor — nunca `git checkout`.
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
  FolderTree,
  GitBranch,
  GitBranchPlus,
  Loader2,
  Moon,
  Plug,
  PlugZap,
  RefreshCw,
  Sun,
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
import { toggleTheme, useCommitActivity, useShellState, useTrickle } from "@/hooks";
import {
  doContinue,
  doFetch,
  doPull,
  doRefresh,
  doSwitchWorktree,
  openAbort,
  openCreateBranch,
  openPushDialog,
  openStashPush,
} from "@/app/actions";
import { CommandBar } from "@/app/CommandBar";
import { cn } from "@/lib/utils";
import type { ConnectionState } from "@/lib/ws";
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
      {state === "ok" ? "ok" : state === "error" ? "erro" : label}
    </MultiStateButton>
  );
}

/* ------------------------------------------------------------------ */
/* Conexao do WebSocket                                                */
/* ------------------------------------------------------------------ */

const CONNECTION_META: Record<ConnectionState, { label: string; tone: string; pulse: boolean }> = {
  open: { label: "conectado", tone: "text-success", pulse: false },
  connecting: { label: "conectando", tone: "text-warning", pulse: true },
  reconnecting: { label: "reconectando", tone: "text-warning", pulse: true },
  closed: { label: "sem conexao", tone: "text-destructive", pulse: false },
};

function ConnectionBadge({ connection }: { connection: ConnectionState }) {
  const meta = CONNECTION_META[connection];
  const ambient = useMotionUITransition("ambient");
  const Icon = connection === "open" ? Plug : PlugZap;

  return (
    <span
      title={`WebSocket ${meta.label}`}
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
/* Seletor de worktree                                                 */
/* ------------------------------------------------------------------ */

function WorktreeSelector() {
  const worktrees = useAppState(selectWorktrees);
  const cwd = useAppState((s) => s.worktrees?.cwd ?? s.repo?.cwd ?? null);
  const active = worktrees.find((w) => w.isActive) ?? worktrees.find((w) => w.isMain) ?? null;

  return (
    <Menu.Root>
      {/* BorderBeam marca a worktree ativa; `active` e o portao do efeito. */}
      <BorderBeam active={Boolean(active)} duration={9} size={90} thickness={2} className="rounded-lg">
        <Menu.Trigger
          title="Trocar de worktree — o servidor faz process.chdir, sem checkout"
          className={cn(
            "flex max-w-[22rem] min-w-0 items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-1.5 text-left",
            "transition-colors duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
            "hover:bg-accent data-[popup-open]:bg-accent",
            FOCUS_RING,
          )}
        >
          <FolderTree className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-foreground">
                {active?.label ?? "sem worktree"}
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
      </BorderBeam>

      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="start" className="z-50 outline-none">
          <Menu.Popup className="w-[26rem] max-w-[90vw] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-2xl">
            <div className="px-2.5 pt-2 pb-1.5">
              <SectionLabel>Worktrees</SectionLabel>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Trocar de worktree executa <span className="font-mono text-foreground">process.chdir()</span> no
                servidor. Nenhum <span className="font-mono text-foreground">git checkout</span> acontece.
              </p>
            </div>
            <Menu.Separator className="my-1 h-px bg-border" />
            {worktrees.length === 0 && (
              <p className="px-2.5 py-3 text-xs text-muted-foreground">Nenhuma worktree listada.</p>
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
                  {wt.isActive && <Chip tone="success">ativa</Chip>}
                  {wt.isMain && <Chip tone="neutral">principal</Chip>}
                  {wt.branch ? <Chip tone="primary">{wt.branch}</Chip> : <Chip tone="warning">detached</Chip>}
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
    pending.step != null && pending.total != null ? `${pending.step} de ${pending.total}` : "em andamento";

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
        {pending.kind} em andamento, {step}
      </span>
      {pending.current && (
        <span className="font-mono text-[11px] text-muted-foreground">{pending.current.slice(0, 7)}</span>
      )}
      {pending.conflicts.length > 0 && (
        <Chip tone="danger">
          {pending.conflicts.length} {pending.conflicts.length === 1 ? "conflito" : "conflitos"}
        </Chip>
      )}
      <span className="flex-1" />
      <ToolButton size="sm" icon={<Check className="size-3" />} onClick={() => void doContinue(pending.kind)}>
        Continuar
      </ToolButton>
      <ToolButton size="sm" tone="danger" icon={<X className="size-3" />} onClick={() => openAbort(pending.kind)}>
        Abortar
      </ToolButton>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbar                                                             */
/* ------------------------------------------------------------------ */

export function Toolbar({ className }: PanelProps) {
  const repo = useAppState((s) => s.repo);
  const head = useAppState(selectHead);
  const commits = useAppState(selectCommits);
  const connection = useAppState((s) => s.connection);
  const busy = useAppState((s) => s.loading.operation);
  const operationLabel = useAppState((s) => s.operationLabel);
  const theme = useShellState((s) => s.theme);

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
        {/* --- identidade --- */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-heading text-sm font-semibold text-foreground">
              {repo?.name ?? "GitCraque"}
            </h1>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <GitBranch className="size-3" />
              <span className="truncate font-mono">
                {head?.detached ? `detached em ${head.hash?.slice(0, 7) ?? "?"}` : (head?.branch ?? "—")}
              </span>
            </span>
          </div>

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
                  label={`Atividade: ${activity.windowTotal} commits nas ultimas ${activity.weeks} semanas`}
                />
                <span className="text-[10px] leading-tight text-muted-foreground">
                  {activity.windowTotal}
                  <br />/{activity.weeks} sem
                </span>
              </>
            )}
          </div>
        </div>

        <div className="h-7 w-px bg-border" />

        {/* --- worktree ativa --- */}
        <WorktreeSelector />

        <div className="flex-1" />

        {/* --- paleta de comandos: a barra E o gatilho do ⌘K --- */}
        <CommandBar className="hidden max-w-[15rem] min-w-[9rem] flex-1 lg:block" />

        {/* --- rede --- */}
        <div className="flex items-center gap-1.5">
          <NetButton
            label="Fetch"
            icon={<ArrowDownToLine className="size-3.5" />}
            state={stateOf("fetch")}
            busy={busy}
            onClick={() => runNet("fetch", doFetch)}
          />
          <NetButton
            label="Pull"
            icon={<ArrowDownToLine className="size-3.5" />}
            state={stateOf("pull")}
            busy={busy}
            onClick={() => runNet("pull", () => doPull())}
          />
          <NetButton
            label="Push"
            icon={<ArrowUpFromLine className="size-3.5" />}
            state={stateOf("push")}
            busy={busy}
            onClick={openPushDialog}
          />
        </div>

        <div className="h-7 w-px bg-border" />

        {/* --- acoes rapidas --- */}
        <div className="flex items-center gap-1.5">
          <ToolButton icon={<GitBranchPlus className="size-3.5" />} onClick={() => openCreateBranch()}>
            Branch
          </ToolButton>
          <ToolButton icon={<Archive className="size-3.5" />} onClick={openStashPush}>
            Stash
          </ToolButton>
          <ToolButton
            tone="ghost"
            aria-label="Recarregar"
            title="Recarregar (⌘R)"
            icon={<RefreshCw className="size-3.5" />}
            onClick={() => void doRefresh()}
          />
          <ToolButton
            tone="ghost"
            aria-label={theme === "dark" ? "Tema claro" : "Tema escuro"}
            title={theme === "dark" ? "Tema claro" : "Tema escuro"}
            icon={theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            onClick={toggleTheme}
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
              aria-label={operationLabel ?? "Operacao em curso"}
              label={
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {operationLabel ?? "Executando comando git"}
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
          {connection === "closed"
            ? "WebSocket fechado — o app nao esta recebendo eventos do repositorio."
            : "Restabelecendo a conexao com o servidor…"}
        </div>
      )}
    </header>
  );
}
