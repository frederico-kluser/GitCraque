/**
 * Painel direito — o detalhe do commit focado, ou o resumo da selecao multipla.
 *
 * Um commit: cabecalho (assunto, corpo, autor, committer, hash, pais clicaveis)
 * e a lista de arquivos alterados. Cada arquivo e um botao: clicar abre o
 * conteudo no visualizador do rodape, que tem largura inteira para mostrar o
 * diff — este painel e estreito e fica com os metadados. Dois ou mais commits:
 * o painel vira o resumo do intervalo, com o botao de Squash.
 *
 * O carregamento e por hash, com cache e descarte de resposta obsoleta
 * (`useCommitDetail`), e o vazio e coberto por `Skeleton` do Motion UI.
 */
import { useMemo } from "react";
import type { ReactNode } from "react";
import { GitCommitHorizontal, GitMerge, Layers, User } from "lucide-react";
import { CopyButton } from "@/components/motion-ui/copy-button";
import { Skeleton } from "@/components/motion-ui/skeleton";
import { StaggerReveal, StaggerRevealHeadline, StaggerRevealItem } from "@/components/motion-ui/stagger-reveal";
import { openFile, selectCommit, selectCommits, useAppState } from "@/state/store";
import { contextMenuFor, useCommitDetail } from "@/hooks";
import { openSquash } from "@/app/actions";
import { commitFileMenu, commitMenu } from "@/app/menus";
import { Rich, formatDateTime, formatGitRelativeDate, t } from "@/i18n";
import { cn, short } from "@/lib/utils";
import type { CommitDetail } from "@/types/git";
import type { PanelProps } from "@/types/modules";
import { Chip, DiffStat, EmptyState, FilePath, FOCUS_RING, SectionLabel, StatusGlyph, ToolButton } from "./parts";

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
        <SectionLabel className="text-foreground">{t("selection.title")}</SectionLabel>
        <Chip tone="primary">{t("selection.count", { count: selected.length })}</Chip>
      </header>

      <div className="flex flex-col gap-3 p-3">
        <div className="rounded-md border border-border bg-card p-3">
          <SectionLabel>{t("selection.range")}</SectionLabel>
          <div className="mt-2 flex flex-col gap-1.5 font-mono text-[11px]">
            <div className="flex items-center gap-2">
              <Chip tone="neutral">{t("selection.newest")}</Chip>
              <span className="text-primary">{short(newest?.hash ?? "")}</span>
              <span className="min-w-0 flex-1 truncate text-foreground">{newest?.subject}</span>
            </div>
            <div className="flex items-center gap-2">
              <Chip tone="neutral">{t("selection.oldest")}</Chip>
              <span className="text-primary">{short(oldest?.hash ?? "")}</span>
              <span className="min-w-0 flex-1 truncate text-foreground">{oldest?.subject}</span>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-3">
          <SectionLabel>{t("selection.squash")}</SectionLabel>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            <Rich
              k="selection.squash.body"
              params={{ count: selected.length }}
              nodes={{
                command: (
                  <span className="font-mono text-foreground">
                    git rebase -i {short(oldest?.hash ?? "")}^
                  </span>
                ),
                editor: <span className="font-mono text-foreground">GIT_SEQUENCE_EDITOR</span>,
                pick: <span className="font-mono text-foreground">pick</span>,
                squash: <span className="font-mono text-foreground">squash</span>,
              }}
            />
          </p>
          <div className="mt-2.5">
            <ToolButton
              tone="primary"
              icon={<GitMerge className="size-3.5" />}
              onClick={() => openSquash(chosen.map((c) => c.hash))}
            >
              {t("selection.squash.button", { count: selected.length })}
            </ToolButton>
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          {chosen.map((commit) => (
            <button
              key={commit.hash}
              type="button"
              onClick={() => selectCommit(commit.hash)}
              onContextMenu={contextMenuFor(`Commit ${short(commit.hash)}`, () => commitMenu(commit.hash))}
              className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-left hover:bg-accent"
            >
              <span className="shrink-0 font-mono text-[10px] text-primary">{short(commit.hash)}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{commit.subject}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {formatGitRelativeDate(commit.relativeDate)}
              </span>
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
    /* O cabecalho e o commit: o botao direito aqui oferece o mesmo menu da
       linha dele na View Tree, sem obrigar a voltar para o grafo. */
    <header
      className="flex flex-col gap-2 border-b border-border p-3"
      onContextMenu={contextMenuFor(`Commit ${detail.abbrevHash}`, () => commitMenu(detail.hash))}
    >
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
        <CopyButton
          variant="icon"
          value={detail.hash}
          label={t("detail.copyHash")}
          copiedLabel={t("detail.hashCopied")}
        />
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-[11px]">
        <dt className="flex items-center gap-1 text-muted-foreground">
          <User className="size-3" /> {t("detail.author")}
        </dt>
        <dd className="min-w-0 text-foreground">
          <span className="font-medium">{detail.authorName}</span>{" "}
          <span className="text-muted-foreground">&lt;{detail.authorEmail}&gt;</span>
          <br />
          <span className="text-muted-foreground">{formatDateTime(detail.authorDate)}</span>
        </dd>

        <dt className="flex items-center gap-1 text-muted-foreground">
          <GitCommitHorizontal className="size-3" /> {t("detail.committer")}
        </dt>
        <dd className="min-w-0 text-foreground">
          <span className="font-medium">{detail.committerName}</span>{" "}
          <span className="text-muted-foreground">&lt;{detail.committerEmail}&gt;</span>
          <br />
          <span className="text-muted-foreground">{formatDateTime(detail.committerDate)}</span>
        </dd>

        {detail.parents.length > 0 && (
          <>
            <dt className="text-muted-foreground">
              {detail.parents.length > 1 ? t("detail.parents") : t("detail.parent")}
            </dt>
            <dd className="flex flex-wrap gap-1">
              {detail.parents.map((parent) => (
                <button
                  key={parent}
                  type="button"
                  onClick={() => selectCommit(parent)}
                  title={t("detail.goTo", { hash: parent })}
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
        <span>{t("detail.fileCount", { count: detail.stats.filesChanged })}</span>
        <DiffStat insertions={detail.stats.insertions} deletions={detail.stats.deletions} />
      </div>
    </header>
  );
}

/** A lista de arquivos do commit: cada linha abre o arquivo no visualizador. */
function CommitFiles({ detail }: { detail: CommitDetail }) {
  const opened = useAppState((s) => s.openFile);

  return (
    <div className="flex flex-col">
      {/* `sticky`: a lista pode ser longa, e a coluna inteira rola de uma vez. */}
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-card/95 px-3 py-2 backdrop-blur-sm">
        <SectionLabel className="text-foreground">{t("detail.files")}</SectionLabel>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{detail.files.length}</span>
        <span className="flex-1" />
        <span className="text-[10px] text-muted-foreground">{t("detail.files.hint")}</span>
      </header>

      <div className="flex flex-col gap-0.5 px-2 pb-3">
        {detail.files.length === 0 ? (
          <EmptyState title={t("detail.files.empty.title")} description={t("detail.files.empty.body")} />
        ) : (
          detail.files.map((file) => {
            const isOpen =
              opened?.path === file.path && !opened.fromWorkingTree && opened.hash === detail.hash;
            return (
              <button
                key={file.path}
                type="button"
                aria-current={isOpen ? "true" : undefined}
                title={t("detail.viewFile", { path: file.path })}
                onClick={() => openFile(file.path, detail.hash)}
                onContextMenu={contextMenuFor(file.path, () => commitFileMenu(file, detail.hash))}
                className={cn(
                  "flex items-center gap-2 rounded-sm px-1.5 py-1 text-left transition-colors",
                  "duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
                  isOpen ? "bg-primary/12 ring-1 ring-primary ring-inset" : "hover:bg-accent",
                  FOCUS_RING,
                )}
              >
                <StatusGlyph status={file.status} />
                <FilePath path={file.path} className="flex-1" />
                {file.oldPath && (
                  <span className="shrink-0 truncate font-mono text-[10px] text-muted-foreground">
                    ← {file.oldPath.split("/").pop()}
                  </span>
                )}
                {file.binary ? (
                  <Chip tone="neutral">{t("common.binaryShort")}</Chip>
                ) : (
                  <DiffStat insertions={file.insertions} deletions={file.deletions} />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export interface DetailPanelProps extends PanelProps {
  /**
   * Controles da gaveta (minimizar/maximizar) montados na barra de titulo.
   * Vem do `SidePanel`, que e quem conhece o estado do sidebar.
   */
  headerExtra?: ReactNode;
}

/** Barra de titulo da gaveta. So aparece quando ha controles para hospedar. */
function DrawerBar({ extra }: { extra?: ReactNode }) {
  if (!extra) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-rail px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("side.drawer.detail")}
      </span>
      {extra}
    </div>
  );
}

export function DetailPanel({ className, headerExtra }: DetailPanelProps) {
  const primary = useAppState((s) => s.selection.primary);
  const selected = useAppState((s) => s.selection.commits);
  const detail = useCommitDetail(primary);

  if (selected.length > 1) {
    return (
      <section className={cn("flex flex-col", className)} aria-label={t("detail.selectionLabel")}>
        <DrawerBar extra={headerExtra} />
        <SelectionSummary selected={selected} />
      </section>
    );
  }

  if (!primary) {
    return (
      <section className={cn("flex flex-col", className)} aria-label={t("detail.label")}>
        <DrawerBar extra={headerExtra} />
        <StaggerReveal className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <StaggerRevealItem>
            <GitCommitHorizontal className="size-6 text-muted-foreground" />
          </StaggerRevealItem>
          <StaggerRevealHeadline as="h3" className="font-heading text-sm font-medium text-foreground">
            {t("detail.empty.title")}
          </StaggerRevealHeadline>
          <StaggerRevealItem as="p" className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            {t("detail.empty.body")}
          </StaggerRevealItem>
        </StaggerReveal>
      </section>
    );
  }

  return (
    <section className={cn("flex flex-col", className)} aria-label={t("detail.label")}>
      <DrawerBar extra={headerExtra} />
      {detail.loading && <DetailSkeleton />}
      {detail.error && <EmptyState title={t("detail.error.title")} description={detail.error} />}
      {detail.data && (
        // O cabecalho rola junto com a lista: num painel estreito, prender os
        // metadados no topo comeria a metade util da coluna.
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <CommitHeader detail={detail.data} />
          <CommitFiles detail={detail.data} />
        </div>
      )}
    </section>
  );
}
