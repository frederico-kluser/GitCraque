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
 */
import { useCallback, useMemo, useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  Cloud,
  CloudOff,
  FolderPlus,
  FolderTree,
  GitBranch,
  GitBranchPlus,
  Link2,
  Lock,
  Pencil,
  PlugZap,
  Plus,
  Tag as TagIcon,
  Trash2,
  Undo2,
  Upload,
  Wand2,
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
  doCheckout,
  doStashApply,
  doSwitchWorktree,
  openAddRemote,
  openAddWorktree,
  openCreateBranch,
  openCreateTag,
  openDeleteBranchLocal,
  openDeleteBranchRemote,
  openDeleteTag,
  openEditRemoteUrl,
  openPruneWorktrees,
  openPushDialog,
  openRemoveRemote,
  openRemoveWorktree,
  openRenameBranch,
  openStashDrop,
  openStashPop,
  openStashPush,
} from "@/app/actions";
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
  children,
  className,
  innerRef,
  dragProps,
}: {
  active?: boolean;
  highlighted?: boolean;
  onClick?: () => void;
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
    <RailRow active={wt.isActive} onClick={wt.isActive ? undefined : () => void doSwitchWorktree(wt)}>
      <FolderTree className={cn("size-3.5 shrink-0", wt.isActive ? "text-primary" : "text-muted-foreground")} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium text-foreground">{wt.label}</span>
          {wt.isMain && <Chip tone="neutral">principal</Chip>}
          {wt.bare && <Chip tone="neutral">bare</Chip>}
          {wt.detached && <Chip tone="warning">detached</Chip>}
          {wt.locked && (
            <Chip tone="warning" title={wt.lockReason}>
              <Lock className="size-2.5" /> locked
            </Chip>
          )}
          {wt.prunable && <Chip tone="danger">prunable</Chip>}
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
      <ActionMenu
        label={`Acoes da worktree ${wt.label}`}
        items={[
          { label: "Adicionar worktree", icon: FolderPlus, onSelect: openAddWorktree },
          { label: "Prune (limpar registros)", icon: Wand2, onSelect: openPruneWorktrees },
          {
            label: "Remover esta worktree",
            icon: Trash2,
            destructive: true,
            separatorBefore: true,
            disabled: wt.isMain,
            onSelect: () => openRemoveWorktree(wt),
          },
        ]}
      />
    </RailRow>
  );
}

function WorktreesSection() {
  const worktrees = useAppState(selectWorktrees);
  return (
    <RailSection
      value="worktrees"
      title="Worktrees"
      count={worktrees.length}
      action={
        <ToolButton
          tone="ghost"
          size="sm"
          aria-label="Adicionar worktree"
          title="Adicionar worktree"
          icon={<Plus className="size-3" />}
          onClick={openAddWorktree}
        />
      }
    >
      <div id="rail-worktrees" className="flex flex-col gap-1">
        {worktrees.length === 0 ? (
          <EmptyState
            title="Nenhuma worktree"
            description="O servidor ainda nao listou `git worktree list --porcelain`."
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
        <span className="flex items-center text-success" title={`${ahead} commits a frente do upstream`}>
          <ArrowUp className="size-2.5" />
          {ahead}
        </span>
      )}
      {behind > 0 && (
        <span className="flex items-center text-warning" title={`${behind} commits atras do upstream`}>
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
          {locked && (
            <Chip tone="warning" className="shrink-0" title={`Checada em ${branch.checkedOutIn}`}>
              presa
            </Chip>
          )}
        </div>
        {branch.upstream && (
          <div className="truncate font-mono text-[10px] text-muted-foreground">↑ {branch.upstream}</div>
        )}
      </div>
      <AheadBehind ahead={branch.ahead} behind={branch.behind} />
      <ActionMenu
        label={`Acoes da branch ${branch.name}`}
        items={[
          {
            label: locked ? `Presa em ${branch.checkedOutIn}` : "Checkout",
            icon: Check,
            disabled: branch.isHead || locked,
            onSelect: () => void doCheckout(branch.name),
          },
          { label: "Renomear", icon: Pencil, onSelect: () => openRenameBranch(branch.name) },
          { label: "Criar tag aqui", icon: TagIcon, onSelect: () => openCreateTag(branch.name) },
          {
            label: "Push desta branch",
            icon: Upload,
            onSelect: () => openPushDialog({ branch: branch.name }),
          },
          {
            label: "Deletar Branch (Local)",
            icon: Trash2,
            destructive: true,
            separatorBefore: true,
            disabled: branch.isHead,
            onSelect: () => openDeleteBranchLocal(branch.name),
          },
        ]}
      />
    </RailRow>
  );
}

function BranchesSection() {
  const branches = useAppState(selectBranches);
  const selected = useAppState((s) => s.selection.ref);

  return (
    <RailSection
      value="branches"
      title="Branches locais"
      count={branches.length}
      action={
        <ToolButton
          tone="ghost"
          size="sm"
          aria-label="Nova branch"
          title="Nova branch"
          icon={<GitBranchPlus className="size-3" />}
          onClick={() => openCreateBranch()}
        />
      }
    >
      <div className="flex flex-col gap-0.5">
        {branches.length === 0 ? (
          <EmptyState
            title="Nenhuma branch local"
            description="Repositorio sem commits ou sem refs em refs/heads."
            action={
              <ToolButton icon={<GitBranchPlus className="size-3" />} onClick={() => openCreateBranch()}>
                Criar a primeira
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
    <RailRow highlighted={selected} onClick={() => selectRef(rb.fullName)} className="pl-6">
      <Cloud className="size-3 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{rb.shortName}</span>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{short(rb.target)}</span>
      <ActionMenu
        label={`Acoes de ${rb.name}`}
        items={[
          {
            label: "Criar branch local daqui",
            icon: GitBranchPlus,
            onSelect: () => openCreateBranch(rb.name),
          },
          {
            label: "Deletar Branch (Origin)",
            icon: Trash2,
            destructive: true,
            separatorBefore: true,
            onSelect: () => openDeleteBranchRemote(rb.remote, rb.shortName),
          },
        ]}
      />
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
      <RailRow onClick={() => setOpen((v) => !v)} className="rounded-b-none">
        {https ? (
          <PlugZap className="size-3.5 shrink-0 text-primary" />
        ) : (
          <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-foreground">{remote.name}</span>
            {https ? (
              <Chip tone="primary" title="Url https: usa o trampolim GIT_ASKPASS">
                https · askpass
              </Chip>
            ) : (
              <Chip tone="neutral">ssh</Chip>
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
        <ActionMenu
          label={`Acoes do remoto ${remote.name}`}
          items={[
            { label: "Editar url", icon: Pencil, onSelect: () => openEditRemoteUrl(remote) },
            { label: "Push para este remoto", icon: Upload, onSelect: () => openPushDialog({ remote: remote.name }) },
            {
              label: "Remover remoto",
              icon: Trash2,
              destructive: true,
              separatorBefore: true,
              onSelect: () => openRemoveRemote(remote.name),
            },
          ]}
        />
      </RailRow>

      {open && (
        <div className="flex flex-col gap-0.5 border-t border-border px-1 pt-1 pb-1">
          {branches.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-muted-foreground">Nenhuma branch remota conhecida.</p>
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
      title="Remotos"
      count={remotes.length}
      action={
        <ToolButton
          tone="ghost"
          size="sm"
          aria-label="Adicionar Origin"
          title="Adicionar Origin"
          icon={<Plus className="size-3" />}
          onClick={() => openAddRemote()}
        />
      }
    >
      <div className="flex flex-col gap-1.5">
        {remotes.length === 0 ? (
          <EmptyState
            title="Nenhum remoto"
            description="`git remote -v` nao devolveu nada. Adicione um origin para poder dar fetch e push."
            action={
              <ToolButton icon={<CloudOff className="size-3" />} onClick={() => openAddRemote()}>
                Adicionar Origin
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

function TagRow({ tag, remotes, selected }: { tag: Tag; remotes: string[]; selected: boolean }) {
  return (
    <RailRow highlighted={selected} onClick={() => selectRef(tag.fullName)}>
      <TagIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-mono text-xs text-foreground">{tag.name}</span>
          <Chip tone={tag.annotated ? "primary" : "neutral"}>{tag.annotated ? "anotada" : "leve"}</Chip>
        </div>
        {tag.message && <div className="truncate text-[10px] text-muted-foreground">{tag.message}</div>}
      </div>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{short(tag.target)}</span>
      <ActionMenu
        label={`Acoes da tag ${tag.name}`}
        items={[
          {
            label: "Deletar tag",
            icon: Trash2,
            destructive: true,
            onSelect: () => openDeleteTag(tag.name, remotes),
          },
        ]}
      />
    </RailRow>
  );
}

function TagsSection() {
  const tags = useAppState(selectTags);
  const remotes = useAppState(selectRemotes);
  const selectedRef = useAppState((s) => s.selection.ref);
  const remoteNames = useMemo(() => remotes.map((r) => r.name), [remotes]);

  return (
    <RailSection
      value="tags"
      title="Tags"
      count={tags.length}
      action={
        <ToolButton
          tone="ghost"
          size="sm"
          aria-label="Criar tag"
          title="Criar tag"
          icon={<Plus className="size-3" />}
          onClick={() => openCreateTag()}
        />
      }
    >
      <div className="flex flex-col gap-0.5">
        {tags.length === 0 ? (
          <EmptyState title="Nenhuma tag" description="Marque uma versao a partir de um commit ou branch." />
        ) : (
          tags.map((t) => (
            <TagRow
              key={t.fullName}
              tag={t}
              remotes={remoteNames}
              selected={selectedRef === t.fullName}
            />
          ))
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
    <RailRow>
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
      <ActionMenu
        label={`Acoes de ${stash.ref}`}
        items={[
          { label: "Aplicar (mantem na pilha)", icon: Undo2, onSelect: () => void doStashApply(stash.ref) },
          { label: "Pop (aplica e remove)", icon: Undo2, destructive: true, onSelect: () => openStashPop(stash.ref) },
          {
            label: "Descartar",
            icon: Trash2,
            destructive: true,
            separatorBefore: true,
            onSelect: () => openStashDrop(stash.ref),
          },
        ]}
      />
    </RailRow>
  );
}

function StashesSection() {
  const stashes = useAppState(selectStashes);
  return (
    <RailSection
      value="stashes"
      title="Stashes"
      count={stashes.length}
      action={
        <ToolButton
          tone="ghost"
          size="sm"
          aria-label="Guardar alteracoes"
          title="Guardar alteracoes (stash push)"
          icon={<Plus className="size-3" />}
          onClick={openStashPush}
        />
      }
    >
      <div className="flex flex-col gap-0.5">
        {stashes.length === 0 ? (
          <EmptyState title="Pilha vazia" description="Nada guardado com `git stash`." />
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
    <aside className={className} aria-label="Referencias do repositorio">
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
