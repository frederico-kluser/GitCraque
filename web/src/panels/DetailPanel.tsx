/**
 * Painel direito — o detalhe do commit focado, ou o resumo da selecao multipla.
 *
 * Um commit: cabecalho (assunto, corpo, autor, committer, hash, pais
 * clicaveis) e duas abas, Arquivos e Diff. Dois ou mais commits: o painel vira
 * o resumo do intervalo, com o botao de Squash.
 *
 * O carregamento e por hash, com cache e descarte de resposta obsoleta
 * (`useCommitDetail`), e o vazio e coberto por `Skeleton` do Motion UI.
 */
import { useMemo, useState } from "react";
import { GitCommitHorizontal, GitMerge, Layers, User } from "lucide-react";
import { CopyButton } from "@/components/motion-ui/copy-button";
import { SegmentedToggle, SegmentedToggleOption } from "@/components/motion-ui/segmented-toggle";
import { Skeleton } from "@/components/motion-ui/skeleton";
import {
  SmoothTabs,
  SmoothTabsList,
  SmoothTabsPanel,
  SmoothTabsPanels,
  SmoothTabsTab,
} from "@/components/motion-ui/smooth-tabs";
import { StaggerReveal, StaggerRevealHeadline, StaggerRevealItem } from "@/components/motion-ui/stagger-reveal";
import { selectCommit, selectCommits, useAppState } from "@/state/store";
import { useCommitDetail, useCommitDiff } from "@/hooks";
import { openSquash } from "@/app/actions";
import { cn, plural, short } from "@/lib/utils";
import type { CommitDetail, DiffHunk, DiffLine, DiffPayload } from "@/types/git";
import type { PanelProps } from "@/types/modules";
import { Chip, DiffStat, EmptyState, FilePath, SectionLabel, StatusGlyph, ToolButton } from "./parts";

const DATE_FORMAT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });

function absoluteDate(raw: string): string {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : DATE_FORMAT.format(date);
}

/* ------------------------------------------------------------------ */
/* Diff                                                                */
/* ------------------------------------------------------------------ */

type DiffMode = "unified" | "split";

const LINE_CLASS: Record<DiffLine["kind"], string> = {
  add: "bg-diff-add-bg text-diff-add-fg",
  del: "bg-diff-del-bg text-diff-del-fg",
  context: "text-muted-foreground",
  meta: "text-muted-foreground/70 italic",
};

const GUTTER = "w-9 shrink-0 select-none pr-1.5 text-right text-[10px] text-muted-foreground tabular-nums";

function UnifiedHunk({ hunk }: { hunk: DiffHunk }) {
  return (
    <div>
      <div className="bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{hunk.header}</div>
      {hunk.lines.map((line, i) => (
        <div key={i} className={cn("flex font-mono text-[11px] leading-[1.55]", LINE_CLASS[line.kind])}>
          <span className={GUTTER}>{line.oldNumber ?? ""}</span>
          <span className={GUTTER}>{line.newNumber ?? ""}</span>
          <span className="w-3 shrink-0 select-none text-center">
            {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
          </span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">{line.content}</span>
        </div>
      ))}
    </div>
  );
}

/** Emparelha remocoes com adicoes na ordem em que aparecem no hunk. */
function splitRows(hunk: DiffHunk): Array<{ left: DiffLine | null; right: DiffLine | null }> {
  const rows: Array<{ left: DiffLine | null; right: DiffLine | null }> = [];
  let pendingDeletions: DiffLine[] = [];
  let pendingAdditions: DiffLine[] = [];

  const flush = () => {
    const height = Math.max(pendingDeletions.length, pendingAdditions.length);
    for (let i = 0; i < height; i++) {
      rows.push({ left: pendingDeletions[i] ?? null, right: pendingAdditions[i] ?? null });
    }
    pendingDeletions = [];
    pendingAdditions = [];
  };

  for (const line of hunk.lines) {
    if (line.kind === "del") pendingDeletions.push(line);
    else if (line.kind === "add") pendingAdditions.push(line);
    else {
      flush();
      rows.push({ left: line, right: line });
    }
  }
  flush();
  return rows;
}

function SplitHunk({ hunk }: { hunk: DiffHunk }) {
  const rows = useMemo(() => splitRows(hunk), [hunk]);
  return (
    <div>
      <div className="bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{hunk.header}</div>
      {rows.map((row, i) => (
        <div key={i} className="flex font-mono text-[11px] leading-[1.55]">
          <span className={cn("flex min-w-0 flex-1", row.left ? LINE_CLASS[row.left.kind] : "")}>
            <span className={GUTTER}>{row.left?.oldNumber ?? ""}</span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">{row.left?.content ?? ""}</span>
          </span>
          <span className="w-px shrink-0 bg-border" />
          <span className={cn("flex min-w-0 flex-1", row.right ? LINE_CLASS[row.right.kind] : "")}>
            <span className={GUTTER}>{row.right?.newNumber ?? ""}</span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">{row.right?.content ?? ""}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function DiffFile({ file, mode }: { file: DiffPayload; mode: DiffMode }) {
  return (
    <article className="overflow-hidden rounded-md border border-border">
      <header className="flex items-center gap-2 border-b border-border bg-card px-2 py-1.5">
        <FilePath path={file.path} className="flex-1" />
        <CopyButton
          variant="icon"
          value={file.raw}
          label={`Copiar o patch de ${file.path}`}
          copiedLabel="Patch copiado"
        />
      </header>
      {file.binary ? (
        <p className="px-2 py-3 text-[11px] text-muted-foreground">Arquivo binario — sem diff textual.</p>
      ) : (
        <div className="overflow-x-auto">
          {file.hunks.map((hunk, i) =>
            mode === "unified" ? <UnifiedHunk key={i} hunk={hunk} /> : <SplitHunk key={i} hunk={hunk} />,
          )}
        </div>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Esqueleto                                                           */
/* ------------------------------------------------------------------ */

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-3">
      <Skeleton className="h-4 w-3/4 rounded-sm" />
      <Skeleton className="h-3 w-1/2 rounded-sm" />
      <Skeleton className="h-16 w-full rounded-md" />
      <div className="flex flex-col gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-5 w-full rounded-sm" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Resumo da selecao multipla                                          */
/* ------------------------------------------------------------------ */

function SelectionSummary({ selected }: { selected: string[] }) {
  const commits = useAppState(selectCommits);
  const chosen = useMemo(() => {
    const wanted = new Set(selected);
    // Percorre o log na ordem topologica para o intervalo sair na ordem real.
    return commits.filter((c) => wanted.has(c.hash));
  }, [commits, selected]);

  const newest = chosen[0];
  const oldest = chosen[chosen.length - 1];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Layers className="size-4 text-primary" />
        <SectionLabel className="text-foreground">Selecao</SectionLabel>
        <Chip tone="primary">{selected.length} commits</Chip>
      </header>

      <div className="flex flex-col gap-3 p-3">
        <div className="rounded-md border border-border bg-card p-3">
          <SectionLabel>Alcance</SectionLabel>
          <div className="mt-2 flex flex-col gap-1.5 font-mono text-[11px]">
            <div className="flex items-center gap-2">
              <Chip tone="neutral">mais novo</Chip>
              <span className="text-primary">{short(newest?.hash ?? "")}</span>
              <span className="min-w-0 flex-1 truncate text-foreground">{newest?.subject}</span>
            </div>
            <div className="flex items-center gap-2">
              <Chip tone="neutral">mais antigo</Chip>
              <span className="text-primary">{short(oldest?.hash ?? "")}</span>
              <span className="min-w-0 flex-1 truncate text-foreground">{oldest?.subject}</span>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-3">
          <SectionLabel>Squash</SectionLabel>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Junta os {selected.length} commits num so com{" "}
            <span className="font-mono text-foreground">git rebase -i {short(oldest?.hash ?? "")}^</span>, via{" "}
            <span className="font-mono text-foreground">GIT_SEQUENCE_EDITOR</span>. O mais antigo continua{" "}
            <span className="font-mono text-foreground">pick</span>; os demais viram{" "}
            <span className="font-mono text-foreground">squash</span>.
          </p>
          <div className="mt-2.5">
            <ToolButton
              tone="primary"
              icon={<GitMerge className="size-3.5" />}
              onClick={() => openSquash(chosen.map((c) => c.hash))}
            >
              Squash de {selected.length} commits
            </ToolButton>
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          {chosen.map((commit) => (
            <button
              key={commit.hash}
              type="button"
              onClick={() => selectCommit(commit.hash)}
              className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-left hover:bg-accent"
            >
              <span className="shrink-0 font-mono text-[10px] text-primary">{short(commit.hash)}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{commit.subject}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{commit.relativeDate}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detalhe de um commit                                                */
/* ------------------------------------------------------------------ */

function CommitHeader({ detail }: { detail: CommitDetail }) {
  return (
    <header className="flex flex-col gap-2 border-b border-border p-3">
      <h2 className="font-heading text-sm leading-snug font-semibold text-balance text-foreground">
        {detail.subject}
      </h2>

      {detail.body.trim() && (
        <p className="rounded-md border border-border bg-surface-inset p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {detail.body.trim()}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {detail.refs.map((ref) => (
          <Chip key={`${ref.kind}-${ref.name}`} tone={ref.isHead ? "primary" : ref.kind === "tag" ? "warning" : "neutral"}>
            {ref.name}
          </Chip>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[11px] break-all text-muted-foreground">{detail.hash}</span>
        <CopyButton variant="icon" value={detail.hash} label="Copiar o hash completo" copiedLabel="Hash copiado" />
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-[11px]">
        <dt className="flex items-center gap-1 text-muted-foreground">
          <User className="size-3" /> autor
        </dt>
        <dd className="min-w-0 text-foreground">
          <span className="font-medium">{detail.authorName}</span>{" "}
          <span className="text-muted-foreground">&lt;{detail.authorEmail}&gt;</span>
          <br />
          <span className="text-muted-foreground">{absoluteDate(detail.authorDate)}</span>
        </dd>

        <dt className="flex items-center gap-1 text-muted-foreground">
          <GitCommitHorizontal className="size-3" /> committer
        </dt>
        <dd className="min-w-0 text-foreground">
          <span className="font-medium">{detail.committerName}</span>{" "}
          <span className="text-muted-foreground">&lt;{detail.committerEmail}&gt;</span>
          <br />
          <span className="text-muted-foreground">{absoluteDate(detail.committerDate)}</span>
        </dd>

        {detail.parents.length > 0 && (
          <>
            <dt className="text-muted-foreground">{detail.parents.length > 1 ? "pais" : "pai"}</dt>
            <dd className="flex flex-wrap gap-1">
              {detail.parents.map((parent) => (
                <button
                  key={parent}
                  type="button"
                  onClick={() => selectCommit(parent)}
                  title={`Ir para ${parent}`}
                  className="rounded-sm bg-muted px-1.5 py-px font-mono text-[10px] text-primary hover:bg-accent"
                >
                  {short(parent)}
                </button>
              ))}
            </dd>
          </>
        )}
      </dl>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{plural(detail.stats.filesChanged, "arquivo", "arquivos")}</span>
        <DiffStat insertions={detail.stats.insertions} deletions={detail.stats.deletions} />
      </div>
    </header>
  );
}

function CommitBody({ detail }: { detail: CommitDetail }) {
  const [tab, setTab] = useState("files");
  const [mode, setMode] = useState<DiffMode>("unified");
  const diff = useCommitDiff(detail.hash, tab === "diff");

  return (
    <SmoothTabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <SmoothTabsList ariaLabel="Detalhe do commit">
          <SmoothTabsTab value="files">Arquivos</SmoothTabsTab>
          <SmoothTabsTab value="diff">Diff</SmoothTabsTab>
        </SmoothTabsList>
        <span className="flex-1" />
        {tab === "diff" && (
          <SegmentedToggle
            value={mode}
            onChange={(next) => setMode(next as DiffMode)}
            ariaLabel="Formato do diff"
            className="p-0.5"
          >
            <SegmentedToggleOption value="unified" className="px-2 py-1 text-[11px]">
              unificado
            </SegmentedToggleOption>
            <SegmentedToggleOption value="split" className="px-2 py-1 text-[11px]">
              lado a lado
            </SegmentedToggleOption>
          </SegmentedToggle>
        )}
      </div>

      {/* O viewport ja e `grid overflow-hidden`; a rolagem fica no painel ativo,
          que ocupa a celula inteira. */}
      <SmoothTabsPanels className="min-h-0 flex-1">
        <SmoothTabsPanel value="files" className="flex h-full flex-col gap-0.5 overflow-y-auto px-2 pb-3">
          {detail.files.length === 0 ? (
            <EmptyState title="Nenhum arquivo" description="O commit nao alterou arquivos." />
          ) : (
            detail.files.map((file) => (
              <div key={file.path} className="flex items-center gap-2 rounded-sm px-1.5 py-1 hover:bg-accent">
                <StatusGlyph status={file.status} />
                <FilePath path={file.path} className="flex-1" />
                {file.oldPath && (
                  <span className="shrink-0 truncate font-mono text-[10px] text-muted-foreground">
                    ← {file.oldPath.split("/").pop()}
                  </span>
                )}
                {file.binary ? (
                  <Chip tone="neutral">bin</Chip>
                ) : (
                  <DiffStat insertions={file.insertions} deletions={file.deletions} />
                )}
              </div>
            ))
          )}
        </SmoothTabsPanel>

        <SmoothTabsPanel value="diff" className="flex h-full flex-col gap-2 overflow-y-auto px-2 pb-3">
          {diff.loading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-full rounded-md" />
              <Skeleton className="h-32 w-full rounded-md" />
            </div>
          )}
          {diff.error && <p className="px-2 py-3 text-xs text-destructive">{diff.error}</p>}
          {!diff.loading && !diff.error && (diff.data?.length ?? 0) === 0 && (
            <EmptyState title="Sem patch" description="`git diff` nao devolveu conteudo para este commit." />
          )}
          {diff.data?.map((file) => <DiffFile key={file.path} file={file} mode={mode} />)}
        </SmoothTabsPanel>
      </SmoothTabsPanels>
    </SmoothTabs>
  );
}

/* ------------------------------------------------------------------ */

export function DetailPanel({ className }: PanelProps) {
  const primary = useAppState((s) => s.selection.primary);
  const selected = useAppState((s) => s.selection.commits);
  const detail = useCommitDetail(primary);

  if (selected.length > 1) {
    return (
      <section className={cn("flex flex-col", className)} aria-label="Resumo da selecao">
        <SelectionSummary selected={selected} />
      </section>
    );
  }

  if (!primary) {
    return (
      <section className={cn("flex flex-col", className)} aria-label="Detalhe do commit">
        <StaggerReveal className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <StaggerRevealItem>
            <GitCommitHorizontal className="size-6 text-muted-foreground" />
          </StaggerRevealItem>
          <StaggerRevealHeadline as="h3" className="font-heading text-sm font-medium text-foreground">
            Nenhum commit selecionado
          </StaggerRevealHeadline>
          <StaggerRevealItem as="p" className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            Clique num commit da View Tree. Segure ⇧ para marcar um intervalo e liberar o squash.
          </StaggerRevealItem>
        </StaggerReveal>
      </section>
    );
  }

  return (
    <section className={cn("flex flex-col", className)} aria-label="Detalhe do commit">
      {detail.loading && <DetailSkeleton />}
      {detail.error && (
        <EmptyState title="Nao foi possivel ler o commit" description={detail.error} />
      )}
      {detail.data && (
        <>
          <CommitHeader detail={detail.data} />
          <CommitBody detail={detail.data} />
        </>
      )}
    </section>
  );
}
