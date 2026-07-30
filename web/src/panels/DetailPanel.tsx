/**
 * Painel direito — o detalhe do commit focado, ou o resumo da selecao multipla.
 *
 * Um commit: cabecalho (assunto, corpo, autor, committer, hash, pais clicaveis)
 * e a lista de arquivos alterados. Cada arquivo e um botao: clicar TROCA esta
 * tela pela View do arquivo, na mesma coluna, com voltar no cabecalho — o diff
 * fica com a coluna inteira em vez de meia. Dois ou mais commits: o painel vira
 * o resumo do intervalo, com o botao de Squash.
 *
 * SEM commit selecionado a coluna NAO fica vazia quando ha trabalho em aberto:
 * mostra a arvore de trabalho, com a mesma lista clicavel. Isso e o que faz a
 * troca de worktree cair direto no que aquela worktree tem por commitar —
 * `cwd:changed` limpa a selecao inteira (`state/store.ts:671-678`), entao o
 * estado logo apos a troca e exatamente este. Sem selecao e com a arvore limpa,
 * o vazio de sempre.
 *
 * O carregamento e por hash, com cache e descarte de resposta obsoleta
 * (`useCommitDetail`), e o vazio e coberto por `Skeleton` do Motion UI.
 */
import { useMemo } from "react";
import { Archive, ArrowLeft, FolderGit2, GitCommitHorizontal, GitMerge, Layers, User } from "lucide-react";
/* Arte da marca, recorte de `docs/logo.png` em 400px. Mora em `src/assets` e
 * nao em `public/`: importada, o Vite versiona o nome e o arquivo cai no ramo
 * `immutable` de `server/src/static.mjs:100-105` — na raiz do `dist` levaria
 * `no-cache` e revalidaria por ETag a cada carga. */
import logoMark from "@/assets/logo-mark.webp";
import { CopyButton } from "@/components/motion-ui/copy-button";
import { Skeleton } from "@/components/motion-ui/skeleton";
import { StaggerReveal, StaggerRevealHeadline, StaggerRevealItem } from "@/components/motion-ui/stagger-reveal";
import { clearStashView, openFile, selectCommit, selectCommits, selectStashView, showStashDiff, useAppState } from "@/state/store";
import { contextMenuFor, openChanges, useCommitDetail, useWorkingDiffStats, type DiffStats } from "@/hooks";
import { openSquash } from "@/app/actions";
import { changeFileMenu, commitFileMenu, commitMenu } from "@/app/menus";
import { Rich, formatDateTime, formatGitRelativeDate, t } from "@/i18n";
import { cn, short } from "@/lib/utils";
import type { CommitDetail, DiffPayload, StatusEntry } from "@/types/git";
import type { PanelProps } from "@/types/modules";
import {
  Chip,
  DiffStat,
  EmptyState,
  FilePath,
  FOCUS_RING,
  GROUP_ORDER,
  GROUP_TITLE,
  SectionLabel,
  StatusGlyph,
  ToolButton,
  displayStatus,
  groupEntries,
} from "./parts";

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
/* Arvore de trabalho — o que ainda nao virou commit                   */
/* ------------------------------------------------------------------ */

/** Uma linha de arquivo em aberto: abre o diff dele na propria coluna. */
function WorkingFileRow({ entry, stats }: { entry: StatusEntry; stats: DiffStats }) {
  // Marca a linha so quando o arquivo aberto veio DAQUI: o mesmo caminho pode
  // estar aberto a partir de um commit, e ai a linha marcada nao e esta.
  const opened = useAppState((s) => s.openFile);
  const isOpen = opened?.path === entry.path && opened.fromWorkingTree;
  const delta = stats.get(entry.path);

  return (
    <button
      type="button"
      aria-current={isOpen ? "true" : undefined}
      title={t("changes.viewFile", { path: entry.path })}
      /* `hash: null` + `fromWorkingTree` e o que manda o visualizador ler do
         disco em vez de um commit — o mesmo caminho que a gaveta de staging usa. */
      onClick={() => openFile(entry.path, null, true)}
      onContextMenu={contextMenuFor(entry.path, () => changeFileMenu(entry))}
      className={cn(
        "flex items-center gap-2 rounded-sm px-1.5 py-1 text-left transition-colors",
        "duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
        isOpen ? "bg-primary/12 ring-1 ring-primary ring-inset" : "hover:bg-accent",
        FOCUS_RING,
      )}
    >
      <StatusGlyph status={displayStatus(entry)} />
      <FilePath path={entry.path} className="flex-1" />
      {entry.oldPath && (
        <span className="shrink-0 truncate font-mono text-[10px] text-muted-foreground" title={entry.oldPath}>
          ← {entry.oldPath.split("/").pop()}
        </span>
      )}
      {delta?.binary ? (
        <Chip tone="neutral">{t("common.binaryShort")}</Chip>
      ) : (
        delta && <DiffStat insertions={delta.insertions} deletions={delta.deletions} />
      )}
    </button>
  );
}

/**
 * A coluna direita quando nao ha commit selecionado e a arvore tem trabalho.
 *
 * Mesma anatomia do detalhe de commit — cabecalho, depois a lista de arquivos
 * clicaveis — para que trocar de worktree e clicar num commit se parecam. As
 * acoes de preparar, descartar e commitar continuam na gaveta: aqui e leitura,
 * e o botao do cabecalho leva para la em um clique.
 */
function WorkingTreeDetail() {
  const status = useAppState((s) => s.status);
  const stats = useWorkingDiffStats(status);
  const entries = status?.entries ?? EMPTY_ENTRIES;

  const groups = useMemo(() => groupEntries(entries), [entries]);
  const total = useMemo(() => {
    let insertions = 0;
    let deletions = 0;
    for (const entry of entries) {
      const delta = stats.get(entry.path);
      if (!delta || delta.binary) continue;
      insertions += delta.insertions;
      deletions += delta.deletions;
    }
    return { insertions, deletions };
  }, [entries, stats]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex flex-col gap-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <FolderGit2 className="size-4 shrink-0 text-primary" />
          <h2 className="font-heading text-sm font-semibold text-foreground">
            {t("detail.working.title")}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {status?.branch && <Chip tone="primary">{status.branch}</Chip>}
          {status?.upstream && (
            <Chip tone="neutral" mono>
              {status.upstream}
            </Chip>
          )}
          {status && (status.ahead > 0 || status.behind > 0) && (
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              ↑{status.ahead} ↓{status.behind}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{t("changes.filesChanged", { count: entries.length })}</span>
          <DiffStat insertions={total.insertions} deletions={total.deletions} />
          <span className="flex-1" />
          {/* Uma vez so, no cabecalho: repetido em cada grupo, o mesmo aviso
              aparecia tres vezes na mesma tela. */}
          <span className="text-[10px]">{t("detail.working.hint")}</span>
        </div>

        <div>
          <ToolButton
            tone="primary"
            icon={<GitCommitHorizontal className="size-3.5" />}
            onClick={openChanges}
          >
            {t("detail.working.stage")}
          </ToolButton>
        </div>
      </header>

      {GROUP_ORDER.map((group) =>
        groups[group].length === 0 ? null : (
          <section key={group}>
            <header className="flex items-center gap-2 px-3 py-2">
              <SectionLabel className={group === "conflicted" ? "text-destructive" : "text-foreground"}>
                {t(GROUP_TITLE[group])}
              </SectionLabel>
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {groups[group].length}
              </span>
            </header>
            <div className="flex flex-col gap-0.5 px-2 pb-2">
              {groups[group].map((entry) => (
                <WorkingFileRow key={entry.path} entry={entry} stats={stats} />
              ))}
            </div>
          </section>
        ),
      )}
    </div>
  );
}

/** Constante de modulo: literal inline mudaria a identidade a cada render. */
const EMPTY_ENTRIES: StatusEntry[] = [];

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

/** A lista de arquivos do commit: cada linha troca a coluna pela View dele. */
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
                {/* Botao de blame: nao-binario so. */}
                {!file.binary && (
                  <button
                    type="button"
                    title={t("menu.commitFile.blame")}
                    aria-label={t("menu.commitFile.blame")}
                    onClick={(e) => {
                      e.stopPropagation();
                      openBlame(file.path, detail.hash);
                    }}
                    className={cn(
                      "shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground",
                      "transition-colors duration-[var(--motion-ui-transition-snap-duration)]",
                      FOCUS_RING,
                    )}
                  >
                    <FileSearch className="size-3.5" />
                  </button>
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
/* Diff de stash                                                        */
/* ------------------------------------------------------------------ */

/** Renderiza o diff completo de um stash — mesmo layout do detalhe de commit. */
function StashDiffView({ ref, diffs, loading, error }: { ref: string; diffs: DiffPayload[] | null; loading: boolean; error: string | null }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex flex-col gap-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clearStashView}
            className="rounded-sm p-0.5 hover:bg-accent"
            title={t("detail.stash.back")}
          >
            <ArrowLeft className="size-4 text-muted-foreground" />
          </button>
          <Archive className="size-4 shrink-0 text-primary" />
          <h2 className="font-heading text-sm font-semibold text-foreground">{ref}</h2>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t("detail.stash.body")}
        </p>
      </header>

      <div className="flex flex-col gap-0.5 px-2 py-3">
        {loading && <DetailSkeleton />}
        {error && <EmptyState title={t("detail.error.title")} description={error} />}
        {!loading && !error && diffs && diffs.length === 0 && (
          <EmptyState title={t("detail.stash.empty.title")} description={t("detail.stash.empty.body")} />
        )}
        {!loading && !error && diffs && diffs.length > 0 && (
          <div className="rounded-md border border-border bg-card">
            {diffs.map((file) => (
              <button
                key={file.path}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-accent"
              >
                <FilePath path={file.path} className="flex-1" />
                {file.oldPath && (
                  <span className="shrink-0 truncate font-mono text-[10px] text-muted-foreground">
                    &larr; {file.oldPath.split("/").pop()}
                  </span>
                )}
                {file.binary ? (
                  <Chip tone="neutral">{t("common.binaryShort")}</Chip>
                ) : (
                  <DiffStat
                    insertions={file.hunks.reduce((a, h) => a + h.lines.filter((l) => l.kind === "add").length, 0)}
                    deletions={file.hunks.reduce((a, h) => a + h.lines.filter((l) => l.kind === "del").length, 0)}
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export type DetailPanelProps = PanelProps;

export function DetailPanel({ className }: DetailPanelProps) {
  const primary = useAppState((s) => s.selection.primary);
  const selected = useAppState((s) => s.selection.commits);
  const detail = useCommitDetail(primary);
  // Numero, nao o array: `entries` e objeto novo a cada refresh, e o comparador
  // do `useAppState` e `Object.is`.
  const dirtyCount = useAppState((s) => s.status?.entries.length ?? 0);
  // `status` ainda nulo E carregando e a janela logo depois de `cwd:changed`:
  // decidir "arvore limpa" ali mostraria o vazio por um instante e trocaria
  // para a lista em seguida. Fora dessa janela o refresh reusa o status antigo,
  // entao a tela nao pisca a cada watcher.
  const loadingStatus = useAppState((s) => s.status === null && s.loading.status);
  const stashView = useAppState(selectStashView);

  if (stashView) {
    return (
      <section className={cn("flex flex-col", className)} aria-label={t("detail.stash.label", { ref: stashView.ref })}>
        <StashDiffView ref={stashView.ref} diffs={stashView.diffs} loading={stashView.loading} error={stashView.error} />
      </section>
    );
  }

  if (selected.length > 1) {
    return (
      <section className={cn("flex flex-col", className)} aria-label={t("detail.selectionLabel")}>
        <SelectionSummary selected={selected} />
      </section>
    );
  }

  // Sem commit selecionado, a coluna e da arvore de trabalho — e e isso que a
  // troca de worktree passa a mostrar sozinha, sem clique na branch atual.
  if (!primary && (dirtyCount > 0 || loadingStatus)) {
    return (
      <section className={cn("flex flex-col", className)} aria-label={t("changes.label")}>
        {loadingStatus && dirtyCount === 0 ? <DetailSkeleton /> : <WorkingTreeDetail />}
      </section>
    );
  }

  if (!primary) {
    return (
      <section className={cn("flex flex-col", className)} aria-label={t("detail.label")}>
        {/* `pb-16`, e nao `pb-6`: a area de IA flutua em `fixed ... bottom-6`
            com ~46px de altura (`app/AiBar.tsx:244`) e passa POR CIMA desta
            coluna. Com a folga de rodape normal, a faixa cortava o selo ao
            meio. 4rem sobem a marca para acima da barra. */}
        <StaggerReveal className="flex h-full flex-col items-center px-6 pb-16 text-center">
          {/* O aviso continua centralizado no espaco que sobra ACIMA do selo:
              a marca no rodape nao pode empurrar o texto para cima. */}
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
            <StaggerRevealItem>
              <GitCommitHorizontal className="size-6 text-muted-foreground" />
            </StaggerRevealItem>
            <StaggerRevealHeadline as="h3" className="font-heading text-sm font-medium text-foreground">
              {t("detail.empty.title")}
            </StaggerRevealHeadline>
            <StaggerRevealItem as="p" className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              {t("detail.empty.body")}
            </StaggerRevealItem>
          </div>
          {/* Selo da marca — so existe nesta tela, o unico momento em que a
              coluna nao tem trabalho nenhum para mostrar. Fica dentro do
              `StaggerReveal` de proposito: o container acha os seguidores pelo
              atributo `data-stagger-item`, entao aninhar nao tira o item da
              coreografia. `alt` vazio porque a imagem e decorativa — quem
              anuncia a tela e `detail.empty.title`. */}
          <StaggerRevealItem as="div" className="shrink-0 pt-6">
            <img
              src={logoMark}
              alt=""
              width={400}
              height={289}
              draggable={false}
              className={cn(
                "w-full max-w-[12.5rem] opacity-60 hover:opacity-100",
                "transition-opacity duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
              )}
            />
          </StaggerRevealItem>
        </StaggerReveal>
      </section>
    );
  }

  return (
    <section className={cn("flex flex-col", className)} aria-label={t("detail.label")}>
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
