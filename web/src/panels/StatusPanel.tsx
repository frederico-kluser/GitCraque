/**
 * Staging e commit.
 *
 * As linhas usam `SwipeActions` do Motion UI — arrastar revela preparar /
 * despreparar / descartar. O arrasto e um atalho, nunca a unica porta: cada
 * linha tem os mesmos botoes no hover, e o teclado alcanca todos. Clicar na
 * linha abre o arquivo no visualizador do rodape, na aba ao lado.
 *
 * Descartar arquivo passa por `HoldToConfirmButton`: e a unica acao daqui que
 * apaga trabalho do disco sem rede de seguranca no git.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Minus, Plus, Trash2 } from "lucide-react";
import { HoldToConfirmButton } from "@/components/motion-ui/hold-to-confirm";
import { MultiStateButton } from "@/components/motion-ui/multi-state-button";
import { SwipeAction, SwipeActions, SwipeActionsList } from "@/components/motion-ui/swipe-actions";
import { StaggerReveal, StaggerRevealHeadline, StaggerRevealItem } from "@/components/motion-ui/stagger-reveal";
import { openFile, useAppState } from "@/state/store";
import {
  contextMenuFor,
  registerCommitHandler,
  selectCommitDraft,
  setCommitDraft,
  useShellState,
  useWorkingDiffStats,
  type DiffStats,
} from "@/hooks";
import { doCommit, doDiscard, doStage, doUnstage } from "@/app/actions";
import { changeFileMenu } from "@/app/menus";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { StatusEntry } from "@/types/git";
import type { PanelProps } from "@/types/modules";
import {
  Chip,
  DiffStat,
  FilePath,
  FOCUS_RING,
  GROUP_TITLE,
  SectionLabel,
  StatusGlyph,
  ToolButton,
  displayStatus,
  groupEntries,
  type GroupKey,
} from "./parts";

/** Acima disso o git deixa a primeira linha feia em `git log --oneline`. */
const SUBJECT_LIMIT = 72;
/** Alto o bastante para o icone + rotulo da acao de swipe caberem. */
const ROW_HEIGHT = 40;

/* ------------------------------------------------------------------ */
/* Linha                                                               */
/* ------------------------------------------------------------------ */

function FileRow({
  entry,
  index,
  isLast,
  stats,
  open,
}: {
  entry: StatusEntry;
  index: number;
  isLast: boolean;
  stats: DiffStats;
  /** true quando ESTE arquivo e o que esta aberto no visualizador */
  open: boolean;
}) {
  const [arming, setArming] = useState(false);
  const delta = stats.get(entry.path);
  const staged = entry.staged && !entry.conflicted;
  const status = displayStatus(entry);

  const stage = () => void doStage([entry.path]);
  const unstage = () => void doUnstage([entry.path]);
  const discard = () => void doDiscard([entry.path]);

  /**
   * Clicar na linha abre o arquivo no visualizador do rodape.
   *
   * A mesma linha e arrastavel, e soltar um swipe tambem dispara `click` — o
   * guarda de deslocamento separa o toque do gesto. E um clique num botao de
   * acao (preparar, descartar) nao e um clique na linha: eles tem dono proprio,
   * exatamente como o `SwipeActions` ja trata o pointerdown deles.
   */
  const pressedAt = useRef({ x: 0, y: 0 });
  const rememberPress = (event: React.PointerEvent<HTMLDivElement>) => {
    pressedAt.current = { x: event.clientX, y: event.clientY };
  };
  const openInViewer = () => openFile(entry.path, null, true);
  const onRowClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const moved =
      Math.abs(event.clientX - pressedAt.current.x) > 6 ||
      Math.abs(event.clientY - pressedAt.current.y) > 6;
    if (moved) return;
    openInViewer();
  };

  return (
    <SwipeActions
      id={entry.path}
      index={index}
      isLast={isLast}
      rowHeight={ROW_HEIGHT}
      className="border-b border-border last:border-b-0"
      left={
        staged ? (
          <SwipeAction
            side="left"
            primary
            icon={<Minus className="size-3.5" />}
            label={t("changes.unstage")}
            ariaLabel={t("changes.unstageFile", { path: entry.path })}
            fillClassName="bg-muted text-foreground"
            onActivate={unstage}
          />
        ) : (
          <SwipeAction
            side="left"
            primary
            icon={<Plus className="size-3.5" />}
            label={t("changes.stage")}
            ariaLabel={t("changes.stageFile", { path: entry.path })}
            fillClassName="bg-success text-success-foreground"
            onActivate={stage}
          />
        )
      }
      right={
        <SwipeAction
          side="right"
          primary
          icon={<Trash2 className="size-3.5" />}
          label={t("changes.discard")}
          ariaLabel={t("changes.discardFile", { path: entry.path })}
          fillClassName="bg-destructive text-destructive-foreground"
          onActivate={() => setArming(true)}
        />
      }
    >
      {/* `group` fica na LINHA: os botoes so aparecem no hover desta linha.
          `select-none` porque arrastar a linha e gesto, nao selecao de texto. */}
      <div
        role="button"
        tabIndex={0}
        aria-current={open ? "true" : undefined}
        title={t("changes.viewFile", { path: entry.path })}
        onPointerDown={rememberPress}
        onClick={onRowClick}
        /* O swipe e um atalho de gesto; o botao direito e o atalho de quem usa
           mouse. Os dois oferecem as mesmas acoes da linha. */
        onContextMenu={contextMenuFor(entry.path, () => changeFileMenu(entry))}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          if ((event.target as HTMLElement).closest("button")) return;
          event.preventDefault();
          openInViewer();
        }}
        className={cn(
          "group flex h-full cursor-pointer items-center gap-2 px-2 select-none",
          open ? "bg-primary/12 ring-1 ring-primary ring-inset" : "bg-card hover:bg-accent/60",
          FOCUS_RING,
        )}
      >
        <StatusGlyph status={status} />
        <FilePath path={entry.path} className="flex-1" />
        {entry.oldPath && (
          <span className="shrink-0 truncate font-mono text-[10px] text-muted-foreground" title={entry.oldPath}>
            ← {entry.oldPath.split("/").pop()}
          </span>
        )}
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{entry.code}</span>
        {delta && !delta.binary && <DiffStat insertions={delta.insertions} deletions={delta.deletions} />}
        {delta?.binary && <Chip tone="neutral">{t("common.binaryShort")}</Chip>}

        {/* Confirmacao por hold: descartar apaga trabalho que o git nao guarda. */}
        {arming ? (
          <HoldToConfirmButton
            holdSeconds={1.2}
            onConfirm={() => {
              setArming(false);
              discard();
            }}
            onCancel={() => setArming(false)}
            // O componente vem com `h-[3.25rem] w-60`; numa linha de arquivo ele
            // precisa caber em 24px. `!` sobrepoe as classes do proprio botao.
            className="h-6! w-20! shrink-0 gap-1 rounded-sm! px-0! text-[10px]!"
          >
            <Trash2 className="size-3" />
            {t("changes.hold")}
          </HoldToConfirmButton>
        ) : (
          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            {staged ? (
              <ToolButton
                tone="ghost"
                size="sm"
                aria-label={t("changes.unstageFile", { path: entry.path })}
                title={t("changes.unstage")}
                icon={<Minus className="size-3" />}
                onClick={unstage}
              />
            ) : (
              <ToolButton
                tone="ghost"
                size="sm"
                aria-label={t("changes.stageFile", { path: entry.path })}
                title={t("changes.stage")}
                icon={<Plus className="size-3" />}
                onClick={stage}
              />
            )}
            <ToolButton
              tone="danger"
              size="sm"
              aria-label={t("changes.discardFile", { path: entry.path })}
              title={t("changes.discard")}
              icon={<Trash2 className="size-3" />}
              onClick={() => setArming(true)}
            />
          </span>
        )}
      </div>
    </SwipeActions>
  );
}

/* ------------------------------------------------------------------ */
/* Grupo                                                               */
/* ------------------------------------------------------------------ */

function Group({
  group,
  entries,
  stats,
  openPath,
}: {
  group: GroupKey;
  entries: StatusEntry[];
  stats: DiffStats;
  /** caminho aberto no visualizador vindo da arvore de trabalho, ou null */
  openPath: string | null;
}) {
  if (entries.length === 0) return null;
  const paths = entries.map((e) => e.path);

  return (
    <section>
      <header className="flex items-center gap-2 px-2 py-1.5">
        <SectionLabel className={group === "conflicted" ? "text-destructive" : undefined}>
          {t(GROUP_TITLE[group])}
        </SectionLabel>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{entries.length}</span>
        <span className="flex-1" />
        {group === "staged" ? (
          <ToolButton
            tone="ghost"
            size="sm"
            icon={<Minus className="size-3" />}
            onClick={() => void doUnstage(paths)}
          >
            {t("changes.unstageAll")}
          </ToolButton>
        ) : (
          <ToolButton
            tone="ghost"
            size="sm"
            icon={<Plus className="size-3" />}
            onClick={() => void doStage(paths)}
          >
            {t("changes.stageAll")}
          </ToolButton>
        )}
      </header>
      <SwipeActionsList className="border-y border-border bg-card">
        {entries.map((entry, i) => (
          <FileRow
            key={entry.path}
            entry={entry}
            index={i}
            isLast={i === entries.length - 1}
            stats={stats}
            open={openPath === entry.path}
          />
        ))}
      </SwipeActionsList>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Area de commit                                                      */
/* ------------------------------------------------------------------ */

type CommitState = "idle" | "loading" | "ok" | "error";

function CommitBox({ stagedCount, conflicts }: { stagedCount: number; conflicts: number }) {
  // O rascunho vive no shell store: trocar para a aba do visualizador desmonta
  // este painel, e estado local viraria mensagem perdida.
  const { message, amend, signoff } = useShellState(selectCommitDraft);
  const [state, setState] = useState<CommitState>("idle");

  const firstLine = message.split("\n", 1)[0] ?? "";
  const overLimit = firstLine.length > SUBJECT_LIMIT;
  const blocked = (!message.trim() && !amend) || (stagedCount === 0 && !amend) || conflicts > 0;

  // ⌘Enter global: o shell dispara, o painel executa (ponte em `useShellStore`).
  const submitRef = useRef<() => void>(() => {});
  useEffect(() => registerCommitHandler(() => submitRef.current()), []);

  const submit = () => {
    if (blocked || state === "loading") return;
    setState("loading");
    void doCommit({ message: message.trim(), amend, signoff }).then((result) => {
      const ok = Boolean(result?.ok);
      setState(ok ? "ok" : "error");
      // `--signoff` sobrevive ao commit de proposito: quem assina, assina sempre.
      if (ok) setCommitDraft({ message: "", amend: false });
      setTimeout(() => setState("idle"), 1_800);
    });
  };
  submitRef.current = submit;

  return (
    <div className="flex flex-col gap-2 border-t border-border bg-surface-inset px-3 py-2.5">
      <div className="relative">
        <textarea
          value={message}
          rows={3}
          placeholder={amend ? t("commit.placeholder.amend") : t("commit.placeholder")}
          onChange={(e) => setCommitDraft({ message: e.target.value })}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          className={cn(
            "w-full resize-y rounded-md border bg-background px-2.5 py-2 font-mono text-xs leading-relaxed text-foreground",
            "placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            overLimit ? "border-warning" : "border-input",
          )}
        />
        <span
          className={cn(
            "pointer-events-none absolute right-2 bottom-1.5 font-mono text-[10px] tabular-nums",
            overLimit ? "text-warning" : "text-muted-foreground",
          )}
          title={t("commit.subjectCounter", { length: firstLine.length, limit: SUBJECT_LIMIT })}
        >
          {firstLine.length}/{SUBJECT_LIMIT}
        </span>
      </div>

      {overLimit && (
        <p className="flex items-center gap-1.5 text-[11px] text-warning">
          <AlertTriangle className="size-3" />
          {t("commit.subjectTooLong", { limit: SUBJECT_LIMIT })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <ToolButton
          size="sm"
          tone={amend ? "primary" : "ghost"}
          active={amend}
          onClick={() => setCommitDraft({ amend: !amend })}
        >
          --amend
        </ToolButton>
        <ToolButton
          size="sm"
          tone={signoff ? "primary" : "ghost"}
          active={signoff}
          onClick={() => setCommitDraft({ signoff: !signoff })}
        >
          --signoff
        </ToolButton>
        <span className="flex-1" />
        <span className="text-[11px] text-muted-foreground">
          {conflicts > 0
            ? t("changes.conflictsLeft", { count: conflicts })
            : t("changes.staged", { count: stagedCount })}
        </span>
        <MultiStateButton
          state={state}
          onClick={submit}
          disabled={blocked}
          feedback={state === "error" ? "shake" : state === "ok" ? "pop" : "none"}
          surfaceClassName={
            state === "ok"
              ? "bg-success text-success-foreground"
              : state === "error"
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground"
          }
          pillClassName="rounded-md px-3 py-1.5 text-xs font-medium"
          announce={`${t("commit.button")}: ${state}`}
          aria-label={t("commit.button.label")}
        >
          {state === "loading"
            ? t("commit.button.loading")
            : state === "ok"
              ? t("commit.button.ok")
              : state === "error"
                ? t("commit.button.error")
                : t("commit.button")}
        </MultiStateButton>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function StatusPanel({ className }: PanelProps) {
  const status = useAppState((s) => s.status);
  const loading = useAppState((s) => s.loading.status);
  const stats = useWorkingDiffStats(status);
  // So marca a linha quando o arquivo aberto veio DAQUI: o mesmo caminho pode
  // estar aberto a partir de um commit, e ai a linha nao e esta.
  const openPath = useAppState((s) => (s.openFile?.fromWorkingTree ? s.openFile.path : null));

  const groups = useMemo(() => groupEntries(status?.entries ?? []), [status]);

  const clean = !status || status.clean || (status.entries.length === 0 && !loading);

  return (
    <section className={cn("flex flex-col", className)} aria-label={t("changes.label")}>
      {/* Sem rotulo "Alteracoes": quem nomeia este painel agora e a aba do
          rodape. Aqui fica so o que a aba nao tem — a branch e o upstream. */}
      <header className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        {status?.branch && <Chip tone="primary">{status.branch}</Chip>}
        {status?.upstream && (
          <Chip tone="neutral" mono>
            {status.upstream}
          </Chip>
        )}
        <span className="flex-1" />
        {status && (status.ahead > 0 || status.behind > 0) && (
          <span className="font-mono text-[10px] text-muted-foreground">
            ↑{status.ahead} ↓{status.behind}
          </span>
        )}
        <span className="text-[11px] text-muted-foreground">
          {t("changes.filesChanged", { count: status?.entries.length ?? 0 })}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {clean ? (
          <StaggerReveal className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <StaggerRevealItem>
              <Check className="size-6 text-success" />
            </StaggerRevealItem>
            <StaggerRevealHeadline as="h3" className="font-heading text-sm font-medium text-foreground">
              {t("changes.clean.title")}
            </StaggerRevealHeadline>
            <StaggerRevealItem as="p" className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              {t("changes.clean.body")}
            </StaggerRevealItem>
          </StaggerReveal>
        ) : (
          <div className="flex flex-col gap-2 py-1.5">
            <Group group="conflicted" entries={groups.conflicted} stats={stats} openPath={openPath} />
            <Group group="staged" entries={groups.staged} stats={stats} openPath={openPath} />
            <Group group="modified" entries={groups.modified} stats={stats} openPath={openPath} />
            <Group group="untracked" entries={groups.untracked} stats={stats} openPath={openPath} />
          </div>
        )}
      </div>

      <CommitBox stagedCount={groups.staged.length} conflicts={groups.conflicted.length} />
    </section>
  );
}
