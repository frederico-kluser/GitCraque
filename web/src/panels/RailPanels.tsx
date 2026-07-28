/**
 * Rail esquerdo — as cinco secoes do repositorio, num `Accordion` do Motion UI.
 *
 * Ordem fixa: Worktrees, Branches locais, Remotos, Tags, Stashes.
 *
 * Duas regras aparecem aqui de forma visivel:
 *  - a worktree ativa e marcada por fundo e cor (marca ESTATICA, sem efeito de
 *    borda animado) e clicar em outra chama `switchWorktree()`, que e
 *    `process.chdir()` no servidor — jamais checkout;
 *  - toda acao destrutiva abre dialogo antes de tocar o repositorio; nenhuma
 *    linha deste arquivo chama `api.*` diretamente.
 *
 * Cada branch e, ao mesmo tempo, ORIGEM de arrasto e ALVO de soltura, pelos
 * hooks de `@/dnd` — o motor semantico e de outra frente, aqui so se declara a
 * ligacao.
 *
 * O botao direito abre O MESMO menu do "⋯" da linha, montado por `@/app/menus`.
 * O "⋯" continua onde estava: menu de contexto e atalho para quem ja sabe, nunca
 * a unica porta.
 */
import { useCallback, useMemo, useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Cloud,
  CloudOff,
  FolderTree,
  GitBranch,
  GitBranchPlus,
  Link2,
  Lock,
  PlugZap,
  Plus,
  Tag as TagIcon,
} from "lucide-react";
import {
  Accordion,
  AccordionChevron,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/motion-ui/accordion";
import { useDraggableEntity, useDroppableTarget } from "@/dnd";
import {
  selectBranches,
  selectRemoteBranches,
  selectRemotes,
  selectStashes,
  selectTags,
  selectWorktrees,
  selectRef,
  useAppState,
} from "@/state/store";
import {
  doSwitchWorktree,
  openAddRemote,
  openAddWorktree,
  openCreateBranch,
  openCreateTag,
  openStashPush,
} from "@/app/actions";
import {
  branchMenu,
  remoteBranchMenu,
  remoteMenu,
  stashMenu,
  tagMenu,
  worktreeMenu,
} from "@/app/menus";
import { contextMenuFor } from "@/hooks";
import { t } from "@/i18n";
import { cn, isHttpsRemote, short } from "@/lib/utils";
import type { Branch, Remote, RemoteBranch, StashEntry, Tag, Worktree } from "@/types/git";
import type { PanelProps } from "@/types/modules";
import { ActionMenu, Chip, EmptyState, FOCUS_RING, SectionLabel, ToolButton } from "./parts";

/* ------------------------------------------------------------------ */
/* Casca de secao                                                      */
/* ------------------------------------------------------------------ */

function RailSection({
  value,
  title,
  count,
  action,
  children,
}: {
  value: string;
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={value} className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-1 pr-2">
        <AccordionTrigger
          inset
          className="flex-1 px-3 py-2.5"
          indicator={<AccordionChevron className="size-3.5" />}
        >
          <span className="flex items-center gap-2">
            <SectionLabel className="text-foreground">{title}</SectionLabel>
            {count !== undefined && (
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{count}</span>
            )}
          </span>
        </AccordionTrigger>
        {action}
      </div>
      <AccordionPanel className="px-1.5 pb-2">{children}</AccordionPanel>
    </AccordionItem>
  );
}

/** Linha base do rail: mesma altura, mesmo hover, mesmo anel de foco. */
function RailRow({
  active,
  highlighted,
  onClick,
  onContextMenu,
  children,
  className,
  innerRef,
  dragProps,
}: {
  active?: boolean;
  highlighted?: boolean;
  onClick?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  children: React.ReactNode;
  className?: string;
  innerRef?: (node: HTMLElement | null) => void;
  dragProps?: Record<string, unknown>;
}) {
  return (
    <div
      ref={innerRef}
      {...dragProps}
      onClick={onClick}
      onContextMenu={onContextMenu}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        "group flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors",
        "duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
        onClick && "cursor-pointer",
        active ? "bg-primary/12" : "hover:bg-accent",
        highlighted && "ring-1 ring-primary ring-inset",
        FOCUS_RING,
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Worktrees                                                        */
/* ------------------------------------------------------------------ */

function WorktreeRow({ wt }: { wt: Worktree }) {
  return (
    <RailRow
      active={wt.isActive}
      onClick={wt.isActive ? undefined : () => void doSwitchWorktree(wt)}
      onContextMenu={contextMenuFor(`Worktree ${wt.label}`, () => worktreeMenu(wt))}
    >
      <FolderTree className={cn("size-3.5 shrink-0", wt.isActive ? "text-primary" : "text-muted-foreground")} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium text-foreground">{wt.label}</span>
          {wt.isMain && <Chip tone="neutral">{t("rail.chip.main")}</Chip>}
          {wt.bare && <Chip tone="neutral">{t("rail.chip.bare")}</Chip>}
          {wt.detached && <Chip tone="warning">{t("rail.chip.detached")}</Chip>}
          {wt.locked && (
            <Chip tone="warning" title={wt.lockReason}>
              <Lock className="size-2.5" /> {t("rail.chip.locked")}
            </Chip>
          )}
          {wt.prunable && <Chip tone="danger">{t("rail.chip.prunable")}</Chip>}
        </div>
        <div className="truncate font-mono text-[10px] text-muted-foreground" title={wt.path}>
          {wt.path}
        </div>
        {wt.branch && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <GitBranch className="size-2.5" />
            <span className="truncate font-mono">{wt.branch}</span>
          </div>
        )}
      </div>
      <ActionMenu label={t("rail.worktrees.actions", { label: wt.label })} items={worktreeMenu(wt)} />
    </RailRow>
  );
}

function WorktreesSection() {
  const worktrees = useAppState(selectWorktrees);
  return (
    <RailSection
      value="worktrees"
      title={t("rail.worktrees.title")}
      count={worktrees.length}
      action={
        <ToolButton
          tone="ghost"
          size="sm"
          aria-label={t("rail.worktrees.add")}
          title={t("rail.worktrees.add")}
          icon={<Plus className="size-3" />}
          onClick={openAddWorktree}
        />
      }
    >
      <div id="rail-worktrees" className="flex flex-col gap-1">
        {worktrees.length === 0 ? (
          <EmptyState
            title={t("rail.worktrees.empty.title")}
            description={t("rail.worktrees.empty.body")}
          />
        ) : (
          worktrees.map((wt) => <WorktreeRow key={wt.path} wt={wt} />)
        )}
      </div>
    </RailSection>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Branches locais — arrastaveis e alvos de soltura                 */
/* ------------------------------------------------------------------ */

function AheadBehind({ ahead, behind }: { ahead: number; behind: number }) {
  if (!ahead && !behind) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums">
      {ahead > 0 && (
        <span className="flex items-center text-success" title={t("rail.branches.ahead", { count: ahead })}>
          <ArrowUp className="size-2.5" />
          {ahead}
        </span>
      )}
      {behind > 0 && (
        <span className="flex items-center text-warning" title={t("rail.branches.behind", { count: behind })}>
          <ArrowDown className="size-2.5" />
          {behind}
        </span>
      )}
    </span>
  );
}

function BranchRow({ branch, selected }: { branch: Branch; selected: boolean }) {
  // Origem de arrasto E alvo de soltura: os dois hooks devolvem refs proprias,
  // que precisam apontar para o MESMO no.
  const draggable = useDraggableEntity({
    type: "branch",
    key: branch.name,
    label: branch.name,
    detail: branch.target,
  }, "rail");
  const droppable = useDroppableTarget({ type: "branch", key: branch.name, label: branch.name }, "rail");

  /**
   * As dependencias sao as FUNCOES, nunca os objetos que as contem: o retorno
   * de `useDraggable`/`useDroppable` e um objeto novo a cada render, entao
   * `[draggable, droppable]` recriava este callback sempre. Ref callback novo
   * faz o React desanexar e reanexar o no — e o @dnd-kit perdia o alvo no exato
   * instante em que mede os retangulos, deixando `over` sempre nulo.
   */
  const setRefs = useCallback(
    (node: HTMLElement | null) => {
      draggable.setNodeRef(node);
      droppable.setNodeRef(node);
    },
    [draggable.setNodeRef, droppable.setNodeRef],
  );

  const locked = Boolean(branch.checkedOutIn) && !branch.isHead;

  return (
    <RailRow
      innerRef={setRefs}
      dragProps={{ ...draggable.attributes, ...draggable.listeners }}
      active={branch.isHead}
      highlighted={droppable.isOver || selected}
      onClick={() => selectRef(branch.fullName)}
      onContextMenu={contextMenuFor(`Branch ${branch.name}`, () => branchMenu(branch))}
      className={cn(draggable.isDragging && "opacity-40")}
    >
      <GitBranch
        className={cn("size-3.5 shrink-0", branch.isHead ? "text-primary" : "text-muted-foreground")}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            title={branch.name}
            className={cn(
              "min-w-0 flex-1 truncate text-xs",
              branch.isHead ? "font-semibold text-foreground" : "text-foreground",
            )}
          >
            {branch.name}
          </span>
          {branch.isHead && <Chip tone="primary">HEAD</Chip>}
          {/* HEAD e nome do git, nao rotulo de interface: nunca traduzido. */}
          {locked && (
            <Chip
              tone="warning"
              className="shrink-0"
              title={t("rail.chip.pinnedTitle", { worktree: branch.checkedOutIn ?? "" })}
            >
              {t("rail.chip.pinned")}
            </Chip>
          )}
        </div>
        {branch.upstream && (
          <div className="truncate font-mono text-[10px] text-muted-foreground">↑ {branch.upstream}</div>
        )}
      </div>
      <AheadBehind ahead={branch.ahead} behind={branch.behind} />
      <ActionMenu label={t("rail.branches.actions", { name: branch.name })} items={branchMenu(branch)} />
    </RailRow>
  );
}

function BranchesSection() {
  const branches = useAppState(selectBranches);
  const selected = useAppState((s) => s.selection.ref);

  return (
    <RailSection
      value="branches"
      title={t("rail.branches.title")}
      count={branches.length}
      action={
        <ToolButton
          tone="ghost"
          size="sm"
          aria-label={t("rail.branches.new")}
          title={t("rail.branches.new")}
          icon={<GitBranchPlus className="size-3" />}
          onClick={() => openCreateBranch()}
        />
      }
    >
      <div className="flex flex-col gap-0.5">
        {branches.length === 0 ? (
          <EmptyState
            title={t("rail.branches.empty.title")}
            description={t("rail.branches.empty.body")}
            action={
              <ToolButton icon={<GitBranchPlus className="size-3" />} onClick={() => openCreateBranch()}>
                {t("rail.branches.empty.action")}
              </ToolButton>
            }
          />
        ) : (
          branches.map((b) => <BranchRow key={b.fullName} branch={b} selected={selected === b.fullName} />)
        )}
      </div>
    </RailSection>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Remotos — `git remote -v`                                        */
/* ------------------------------------------------------------------ */

function RemoteBranchRow({ rb, selected }: { rb: RemoteBranch; selected: boolean }) {
  return (
    <RailRow
      highlighted={selected}
      onClick={() => selectRef(rb.fullName)}
      onContextMenu={contextMenuFor(rb.name, () => remoteBranchMenu(rb))}
      className="pl-6"
    >
      <Cloud className="size-3 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{rb.shortName}</span>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{short(rb.target)}</span>
      <ActionMenu label={t("rail.remotes.branchActions", { name: rb.name })} items={remoteBranchMenu(rb)} />
    </RailRow>
  );
}

function RemoteBlock({
  remote,
  branches,
  selectedRef,
}: {
  remote: Remote;
  branches: RemoteBranch[];
  selectedRef: string | null;
}) {
  const [open, setOpen] = useState(true);
  const https = remote.https || isHttpsRemote(remote.fetchUrl);

  return (
    <div className="rounded-md border border-border bg-card/60">
      <RailRow
        onClick={() => setOpen((v) => !v)}
        onContextMenu={contextMenuFor(`Remoto ${remote.name}`, () => remoteMenu(remote))}
        className="rounded-b-none"
      >
        {https ? (
          <PlugZap className="size-3.5 shrink-0 text-primary" />
        ) : (
          <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-foreground">{remote.name}</span>
            {https ? (
              <Chip tone="primary" title={t("rail.chip.askpassTitle")}>
                {t("rail.chip.askpass")}
              </Chip>
            ) : (
              <Chip tone="neutral">{t("rail.chip.ssh")}</Chip>
            )}
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{branches.length}</span>
          </div>
          <div className="truncate font-mono text-[10px] text-muted-foreground" title={remote.fetchUrl}>
            fetch: {remote.fetchUrl}
          </div>
          {remote.pushUrl && remote.pushUrl !== remote.fetchUrl && (
            <div className="truncate font-mono text-[10px] text-muted-foreground" title={remote.pushUrl}>
              push: {remote.pushUrl}
            </div>
          )}
        </div>
        <ActionMenu label={t("rail.remotes.actions", { name: remote.name })} items={remoteMenu(remote)} />
      </RailRow>

      {open && (
        <div className="flex flex-col gap-0.5 border-t border-border px-1 pt-1 pb-1">
          {branches.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-muted-foreground">{t("rail.remotes.noBranches")}</p>
          ) : (
            branches.map((rb) => (
              <RemoteBranchRow key={rb.fullName} rb={rb} selected={selectedRef === rb.fullName} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function RemotesSection() {
  const remotes = useAppState(selectRemotes);
  const remoteBranches = useAppState(selectRemoteBranches);
  const selectedRef = useAppState((s) => s.selection.ref);

  const grouped = useMemo(() => {
    const map = new Map<string, RemoteBranch[]>();
    for (const rb of remoteBranches) {
      const list = map.get(rb.remote);
      if (list) list.push(rb);
      else map.set(rb.remote, [rb]);
    }
    return map;
  }, [remoteBranches]);

  return (
    <RailSection
      value="remotes"
      title={t("rail.remotes.title")}
      count={remotes.length}
      action={
        <ToolButton
          tone="ghost"
          size="sm"
          aria-label={t("commands.remote.add")}
          title={t("commands.remote.add")}
          icon={<Plus className="size-3" />}
          onClick={() => openAddRemote()}
        />
      }
    >
      <div className="flex flex-col gap-1.5">
        {remotes.length === 0 ? (
          <EmptyState
            title={t("rail.remotes.empty.title")}
            description={t("rail.remotes.empty.body")}
            action={
              <ToolButton icon={<CloudOff className="size-3" />} onClick={() => openAddRemote()}>
                {t("commands.remote.add")}
              </ToolButton>
            }
          />
        ) : (
          remotes.map((r) => (
            <RemoteBlock
              key={r.name}
              remote={r}
              branches={grouped.get(r.name) ?? []}
              selectedRef={selectedRef}
            />
          ))
        )}
      </div>
    </RailSection>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Tags                                                             */
/* ------------------------------------------------------------------ */

function TagRow({ tag, selected }: { tag: Tag; selected: boolean }) {
  return (
    <RailRow
      highlighted={selected}
      onClick={() => selectRef(tag.fullName)}
      onContextMenu={contextMenuFor(`Tag ${tag.name}`, () => tagMenu(tag))}
    >
      <TagIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-mono text-xs text-foreground">{tag.name}</span>
          <Chip tone={tag.annotated ? "primary" : "neutral"}>
            {tag.annotated ? t("rail.chip.annotated") : t("rail.chip.lightweight")}
          </Chip>
        </div>
        {tag.message && <div className="truncate text-[10px] text-muted-foreground">{tag.message}</div>}
      </div>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{short(tag.target)}</span>
      <ActionMenu label={t("rail.tags.actions", { name: tag.name })} items={tagMenu(tag)} />
    </RailRow>
  );
}

function TagsSection() {
  const tags = useAppState(selectTags);
  const selectedRef = useAppState((s) => s.selection.ref);

  return (
    <RailSection
      value="tags"
      title={t("rail.tags.title")}
      count={tags.length}
      action={
        <ToolButton
          tone="ghost"
          size="sm"
          aria-label={t("rail.tags.create")}
          title={t("rail.tags.create")}
          icon={<Plus className="size-3" />}
          onClick={() => openCreateTag()}
        />
      }
    >
      <div className="flex flex-col gap-0.5">
        {tags.length === 0 ? (
          <EmptyState title={t("rail.tags.empty.title")} description={t("rail.tags.empty.body")} />
        ) : (
          tags.map((t) => <TagRow key={t.fullName} tag={t} selected={selectedRef === t.fullName} />)
        )}
      </div>
    </RailSection>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Stashes                                                          */
/* ------------------------------------------------------------------ */

function StashRow({ stash }: { stash: StashEntry }) {
  return (
    <RailRow onContextMenu={contextMenuFor(stash.ref, () => stashMenu(stash))}>
      <Archive className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 font-mono text-[10px] text-primary">{stash.ref}</span>
          <span className="truncate text-xs text-foreground">{stash.message}</span>
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {stash.branch} · {stash.relativeDate}
        </div>
      </div>
      <ActionMenu label={t("rail.stashes.actions", { ref: stash.ref })} items={stashMenu(stash)} />
    </RailRow>
  );
}

function StashesSection() {
  const stashes = useAppState(selectStashes);
  return (
    <RailSection
      value="stashes"
      title={t("rail.stashes.title")}
      count={stashes.length}
      action={
        <ToolButton
          tone="ghost"
          size="sm"
          aria-label={t("rail.stashes.push")}
          title={t("rail.stashes.pushTitle")}
          icon={<Plus className="size-3" />}
          onClick={openStashPush}
        />
      }
    >
      <div className="flex flex-col gap-0.5">
        {stashes.length === 0 ? (
          <EmptyState title={t("rail.stashes.empty.title")} description={t("rail.stashes.empty.body")} />
        ) : (
          stashes.map((s) => <StashRow key={s.ref} stash={s} />)
        )}
      </div>
    </RailSection>
  );
}

/* ------------------------------------------------------------------ */

export function RailPanels({ className }: PanelProps) {
  return (
    <aside className={className} aria-label={t("rail.label")}>
      <Accordion multiple defaultValue={["worktrees", "branches", "remotes"]} className="flex flex-col">
        <WorktreesSection />
        <BranchesSection />
        <RemotesSection />
        <TagsSection />
        <StashesSection />
      </Accordion>
    </aside>
  );
}
