/**
 * Staging e commit.
 *
 * As linhas usam `SwipeActions` do Motion UI — arrastar revela preparar /
 * despreparar / descartar. O arrasto e um atalho, nunca a unica porta: cada
 * linha tem os mesmos botoes no hover, e o teclado alcanca todos.
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
import { useAppState } from "@/state/store";
import { registerCommitHandler, useWorkingDiffStats, type DiffStats } from "@/hooks";
import { doCommit, doDiscard, doStage, doUnstage } from "@/app/actions";
import { cn, plural } from "@/lib/utils";
import type { ChangeStatus, StatusEntry } from "@/types/git";
import type { PanelProps } from "@/types/modules";
import { Chip, DiffStat, FilePath, SectionLabel, StatusGlyph, ToolButton } from "./parts";

/** Acima disso o git deixa a primeira linha feia em `git log --oneline`. */
const SUBJECT_LIMIT = 72;
/** Alto o bastante para o icone + rotulo da acao de swipe caberem. */
const ROW_HEIGHT = 40;

/* ------------------------------------------------------------------ */
/* Agrupamento                                                         */
/* ------------------------------------------------------------------ */

type GroupKey = "conflicted" | "staged" | "untracked" | "modified";

const GROUP_TITLE: Record<GroupKey, string> = {
  conflicted: "Conflitos",
  staged: "Preparados",
  untracked: "Nao rastreados",
  modified: "Modificados",
};

function groupOf(entry: StatusEntry): GroupKey {
  if (entry.conflicted) return "conflicted";
  if (entry.staged) return "staged";
  if (entry.untracked) return "untracked";
  return "modified";
}

/** O status que a linha mostra: o do index quando preparado, o da arvore fora. */
function displayStatus(entry: StatusEntry): ChangeStatus {
  if (entry.conflicted) return "unmerged";
  if (entry.untracked) return "untracked";
  return (entry.staged ? entry.indexStatus : entry.worktreeStatus) ?? entry.worktreeStatus ?? "unknown";
}

/* ------------------------------------------------------------------ */
/* Linha                                                               */
/* ------------------------------------------------------------------ */

function FileRow({
  entry,
  index,
  isLast,
  stats,
}: {
  entry: StatusEntry;
  index: number;
  isLast: boolean;
  stats: DiffStats;
}) {
  const [arming, setArming] = useState(false);
  const delta = stats.get(entry.path);
  const staged = entry.staged && !entry.conflicted;
  const status = displayStatus(entry);

  const stage = () => void doStage([entry.path]);
  const unstage = () => void doUnstage([entry.path]);
  const discard = () => void doDiscard([entry.path]);

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
            label="Despreparar"
            ariaLabel={`Despreparar ${entry.path}`}
            fillClassName="bg-muted text-foreground"
            onActivate={unstage}
          />
        ) : (
          <SwipeAction
            side="left"
            primary
            icon={<Plus className="size-3.5" />}
            label="Preparar"
            ariaLabel={`Preparar ${entry.path}`}
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
          label="Descartar"
          ariaLabel={`Descartar ${entry.path}`}
          fillClassName="bg-destructive text-destructive-foreground"
          onActivate={() => setArming(true)}
        />
      }
    >
      {/* `group` fica na LINHA: os botoes so aparecem no hover desta linha.
          `select-none` porque arrastar a linha e gesto, nao selecao de texto. */}
      <div className="group flex h-full items-center gap-2 bg-card px-2 select-none">
        <StatusGlyph status={status} />
        <FilePath path={entry.path} className="flex-1" />
        {entry.oldPath && (
          <span className="shrink-0 truncate font-mono text-[10px] text-muted-foreground" title={entry.oldPath}>
            ← {entry.oldPath.split("/").pop()}
          </span>
        )}
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{entry.code}</span>
        {delta && !delta.binary && <DiffStat insertions={delta.insertions} deletions={delta.deletions} />}
        {delta?.binary && <Chip tone="neutral">bin</Chip>}

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
            segure
          </HoldToConfirmButton>
        ) : (
          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            {staged ? (
              <ToolButton
                tone="ghost"
                size="sm"
                aria-label={`Despreparar ${entry.path}`}
                title="Despreparar"
                icon={<Minus className="size-3" />}
                onClick={unstage}
              />
            ) : (
              <ToolButton
                tone="ghost"
                size="sm"
                aria-label={`Preparar ${entry.path}`}
                title="Preparar"
                icon={<Plus className="size-3" />}
                onClick={stage}
              />
            )}
            <ToolButton
              tone="danger"
              size="sm"
              aria-label={`Descartar ${entry.path}`}
              title="Descartar"
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
}: {
  group: GroupKey;
  entries: StatusEntry[];
  stats: DiffStats;
}) {
  if (entries.length === 0) return null;
  const paths = entries.map((e) => e.path);

  return (
    <section>
      <header className="flex items-center gap-2 px-2 py-1.5">
        <SectionLabel className={group === "conflicted" ? "text-destructive" : undefined}>
          {GROUP_TITLE[group]}
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
            Despreparar tudo
          </ToolButton>
        ) : (
          <ToolButton
            tone="ghost"
            size="sm"
            icon={<Plus className="size-3" />}
            onClick={() => void doStage(paths)}
          >
            Preparar tudo
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
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const [signoff, setSignoff] = useState(false);
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
      if (ok) {
        setMessage("");
        setAmend(false);
      }
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
          placeholder={amend ? "Nova mensagem (vazio mantem a original)" : "Mensagem do commit"}
          onChange={(e) => setMessage(e.target.value)}
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
          title={`Primeira linha: ${firstLine.length} de ${SUBJECT_LIMIT} caracteres recomendados`}
        >
          {firstLine.length}/{SUBJECT_LIMIT}
        </span>
      </div>

      {overLimit && (
        <p className="flex items-center gap-1.5 text-[11px] text-warning">
          <AlertTriangle className="size-3" />
          A primeira linha passou de {SUBJECT_LIMIT} caracteres — ela e o assunto do commit.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <ToolButton size="sm" tone={amend ? "primary" : "ghost"} active={amend} onClick={() => setAmend((v) => !v)}>
          --amend
        </ToolButton>
        <ToolButton
          size="sm"
          tone={signoff ? "primary" : "ghost"}
          active={signoff}
          onClick={() => setSignoff((v) => !v)}
        >
          --signoff
        </ToolButton>
        <span className="flex-1" />
        <span className="text-[11px] text-muted-foreground">
          {conflicts > 0
            ? `${plural(conflicts, "conflito", "conflitos")} por resolver`
            : plural(stagedCount, "arquivo preparado", "arquivos preparados")}
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
          announce={`Commit: ${state}`}
          aria-label="Criar commit"
        >
          {state === "loading" ? "Commitando…" : state === "ok" ? "Commitado" : state === "error" ? "Falhou" : "Commit"}
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

  const groups = useMemo(() => {
    const map: Record<GroupKey, StatusEntry[]> = { conflicted: [], staged: [], untracked: [], modified: [] };
    for (const entry of status?.entries ?? []) map[groupOf(entry)].push(entry);
    return map;
  }, [status]);

  const clean = !status || status.clean || (status.entries.length === 0 && !loading);

  return (
    <section className={cn("flex flex-col", className)} aria-label="Alteracoes da arvore de trabalho">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <SectionLabel className="text-foreground">Alteracoes</SectionLabel>
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
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {clean ? (
          <StaggerReveal className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <StaggerRevealItem>
              <Check className="size-6 text-success" />
            </StaggerRevealItem>
            <StaggerRevealHeadline as="h3" className="font-heading text-sm font-medium text-foreground">
              Arvore de trabalho limpa
            </StaggerRevealHeadline>
            <StaggerRevealItem as="p" className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              Nada para preparar. Altere um arquivo e ele aparece aqui assim que o watcher do .git avisar.
            </StaggerRevealItem>
          </StaggerReveal>
        ) : (
          <div className="flex flex-col gap-2 py-1.5">
            <Group group="conflicted" entries={groups.conflicted} stats={stats} />
            <Group group="staged" entries={groups.staged} stats={stats} />
            <Group group="modified" entries={groups.modified} stats={stats} />
            <Group group="untracked" entries={groups.untracked} stats={stats} />
          </div>
        )}
      </div>

      <CommitBox stagedCount={groups.staged.length} conflicts={groups.conflicted.length} />
    </section>
  );
}
