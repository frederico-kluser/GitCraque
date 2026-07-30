/**
 * O QUE CADA COISA OFERECE NO BOTAO DIREITO.
 *
 * Um construtor por tipo de alvo, todos devolvendo `MenuItemSpec[]` — dado puro,
 * sem JSX. Tres consequencias, e as tres sao o motivo de este arquivo existir:
 *
 *  · a MESMA lista alimenta o menu de contexto e o "⋯" da linha, entao as duas
 *    portas nunca divergem;
 *  · a lista e montada NO CLIQUE, lendo o estado do momento — e por isso que
 *    "Checkout" sabe dizer "presa em ../outra-worktree" em vez de so falhar;
 *  · **lista vazia significa menu nenhum**. Onde nao ha acao util, o clique com
 *    o botao direito nao mostra caixa vazia e tambem nao devolve o menu do
 *    navegador (ver `ContextMenuHost`).
 *
 * Nenhuma acao executa daqui: todas chamam `./actions`, que confirma antes de
 * tocar o repositorio.
 */
import {
  Archive,
  Bomb,
  Check,
  ClipboardCopy,
  Cloud,
  Crosshair,
  Eye,
  ExternalLink,
  FileMinus2,
  FilePlus2,
  FileSearch,
  FolderPlus,
  GitBranchPlus,
  GitCommitHorizontal,
  GitMerge,
  History,
  Layers,
  Link2,
  Pencil,
  Tag as TagIcon,
  Trash2,
  Undo2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import type { MenuItemSpec } from "@/hooks";
import { t } from "@/i18n";
import type { ViewerMode } from "@/viewer";
import { clearSelection, getState, openBlame, openFile, selectRef, showStashDiff } from "@/state/store";
import { browseUrl, short } from "@/lib/utils";
import type {
  Branch,
  CommitFileChange,
  CommitRef,
  Remote,
  RemoteBranch,
  StashEntry,
  StatusEntry,
  Tag,
  Worktree,
} from "@/types/git";
import {
  doActivateRef,
  doCheckout,
  doCopy,
  doFetchRemote,
  doStashApply,
  doStage,
  doSwitchWorktree,
  doUnstage,
  openAddWorktree,
  openCheckoutCommit,
  openCherryPick,
  openCreateBranch,
  openCreateTag,
  openDeleteBranchAll,
  openDeleteBranchBoth,
  openDeleteBranchLocal,
  openDeleteBranchRemote,
  openDeleteTag,
  hasRemoteCounterpart,
  remoteOfBranch,
  openDiscard,
  openEditRemoteUrl,
  openMergeInto,
  openPruneWorktrees,
  openPushDialog,
  openRebaseOnto,
  openRemoveRemote,
  openRemoveWorktree,
  openRenameBranch,
  openResetTo,
  openRevert,
  openSquash,
  openStashDrop,
  openStashPop,
} from "./actions";

/* ------------------------------------------------------------------ */
/* Contexto do repositorio no instante do clique                       */
/* ------------------------------------------------------------------ */

const headBranch = () => getState().repo?.head.branch ?? getState().status?.branch ?? null;

const branchByName = (name: string) =>
  getState().refs?.branches.find((b) => b.name === name || b.fullName === name);

const remoteNames = () => (getState().repo?.remotes ?? getState().refs?.remotes ?? []).map((r) => r.name);

/**
 * O nome curto da worktree que prende uma branch.
 *
 * `checkedOutIn` vem como caminho absoluto, e caminho absoluto nao cabe na dica
 * de um item de menu: ele empurra o rotulo para fora dos 342 px do popup e a
 * acao fica sem nome. O `label` da worktree e o basename, que e o que a pessoa
 * usa para se referir a ela de qualquer jeito.
 */
const worktreeLabel = (caminho: string) =>
  getState().worktrees?.worktrees.find((w) => w.path === caminho)?.label ??
  caminho.split(/[\\/]/).filter(Boolean).at(-1) ??
  caminho;

/* ------------------------------------------------------------------ */
/* 1. Commit — o alvo mais rico da View Tree                           */
/* ------------------------------------------------------------------ */

/**
 * Menu de um commit.
 *
 * Com dois ou mais commits selecionados E o clicado entre eles, o menu vira o
 * da SELECAO: squash e cherry-pick em lote. O que nao se aplica a um intervalo
 * (reverter, resetar, criar tag) sai da lista em vez de aparecer desabilitado —
 * item morto so faz procurar o que nao esta la.
 */
export function commitMenu(hash: string): MenuItemSpec[] {
  const { selection, log } = getState();
  const commit = log?.commits.find((c) => c.hash === hash) ?? null;
  const selecao = selection.commits;
  const emLote = selecao.length > 1 && selecao.includes(hash);

  if (emLote) {
    return [
      {
        label: t("menu.commit.squashSelected", { count: selecao.length }),
        icon: GitMerge,
        onSelect: () => openSquash(selecao),
      },
      {
        label: t("menu.commit.cherryPickSelected", { count: selecao.length }),
        icon: Layers,
        onSelect: () => openCherryPick(selecao),
      },
      {
        label: t("menu.commit.copyHashes"),
        icon: ClipboardCopy,
        separatorBefore: true,
        hint: String(selecao.length),
        onSelect: () => void doCopy(selecao.join("\n"), t("copy.hashes")),
      },
      { label: t("menu.commit.clearSelection"), icon: Undo2, onSelect: clearSelection },
    ];
  }

  const items: MenuItemSpec[] = [
    {
      label: t("menu.commit.checkout"),
      icon: Check,
      hint: t("menu.hint.detached"),
      onSelect: () => openCheckoutCommit(hash),
    },
    { label: t("menu.commit.createBranch"), icon: GitBranchPlus, onSelect: () => openCreateBranch(hash) },
    { label: t("menu.commit.createTag"), icon: TagIcon, onSelect: () => openCreateTag(hash) },
    {
      label: t("menu.commit.cherryPick"),
      icon: Layers,
      separatorBefore: true,
      onSelect: () => openCherryPick([hash]),
    },
    { label: t("menu.commit.revert"), icon: Undo2, onSelect: () => openRevert(hash) },
    {
      label: t("menu.commit.reset"),
      icon: History,
      destructive: true,
      onSelect: () => openResetTo(hash),
    },
    {
      label: t("menu.commit.copyHash"),
      icon: ClipboardCopy,
      separatorBefore: true,
      hint: short(hash),
      onSelect: () => void doCopy(hash, t("copy.hash")),
    },
  ];

  if (commit) {
    items.push({
      label: t("menu.commit.copySubject"),
      icon: ClipboardCopy,
      onSelect: () => void doCopy(commit.subject, t("copy.subject")),
    });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* 2. Referencias                                                      */
/* ------------------------------------------------------------------ */

export function branchMenu(branch: Branch): MenuItemSpec[] {
  const atual = headBranch();
  const presa = Boolean(branch.checkedOutIn) && !branch.isHead;
  // Merge e rebase precisam de uma branch atual DIFERENTE desta para fazer
  // sentido — mesclar uma branch nela mesma nao e operacao.
  const integravel = Boolean(atual) && !branch.isHead;
  const remoto = remoteOfBranch(branch.name);
  const temRemoto = hasRemoteCounterpart(branch.name, remoto);

  return [
    {
      label: t("rail.branches.checkout"),
      icon: Check,
      disabled: branch.isHead || presa,
      hint: branch.isHead
        ? t("menu.hint.current")
        : presa
          ? t("commands.branch.checkout.pinned", { worktree: branch.checkedOutIn ?? "" })
          : undefined,
      onSelect: () => void doCheckout(branch.name),
    },
    {
      label: t("menu.reveal"),
      icon: Crosshair,
      onSelect: () => selectRef(branch.fullName),
    },
    {
      label: t("menu.branch.mergeInto", { branch: atual ?? "…" }),
      icon: GitMerge,
      separatorBefore: true,
      disabled: !integravel,
      hint: branch.isHead ? t("menu.hint.isCurrent") : atual ? undefined : t("menu.hint.detached"),
      onSelect: () => openMergeInto(branch.name),
    },
    {
      label: t("menu.branch.rebaseOnto", { branch: atual ?? "…" }),
      icon: History,
      destructive: true,
      disabled: !integravel,
      onSelect: () => openRebaseOnto(branch.name),
    },
    {
      label: t("rail.branches.push"),
      icon: Upload,
      separatorBefore: true,
      onSelect: () => openPushDialog({ branch: branch.name }),
    },
    { label: t("rail.branches.rename"), icon: Pencil, onSelect: () => openRenameBranch(branch.name) },
    {
      label: t("menu.branch.createFrom"),
      icon: GitBranchPlus,
      onSelect: () => openCreateBranch(branch.name),
    },
    { label: t("rail.branches.tagHere"), icon: TagIcon, onSelect: () => openCreateTag(branch.name) },
    {
      label: t("menu.copyName"),
      icon: ClipboardCopy,
      separatorBefore: true,
      onSelect: () => void doCopy(branch.name, t("copy.name")),
    },
    {
      label: t("rail.branches.deleteLocal"),
      icon: Trash2,
      destructive: true,
      separatorBefore: true,
      disabled: branch.isHead || presa,
      hint: branch.isHead ? t("menu.hint.isCurrent") : undefined,
      onSelect: () => openDeleteBranchLocal(branch.name),
    },
    {
      label: t("rail.branches.deleteBoth", { remote: remoto }),
      icon: Trash2,
      destructive: true,
      disabled: branch.isHead || presa || !temRemoto,
      hint: temRemoto ? undefined : t("rail.branches.deleteBoth.noRemote"),
      onSelect: () => openDeleteBranchBoth(branch.name, remoto),
    },
    // NUNCA desabilitada. E justamente a saida para quando as duas de cima
    // estao travadas — desabilita-la nos mesmos casos recriaria o beco sem
    // saida que ela existe para abrir. A barreira e o hold-to-confirm, e o
    // dialogo diz antes o que vai ser destruido.
    {
      label: t("rail.branches.deleteAll"),
      icon: Bomb,
      destructive: true,
      hint: branch.isHead
        ? t("menu.hint.isCurrent")
        : branch.checkedOutIn
          ? t("rail.branches.pinnedIn", { worktree: worktreeLabel(branch.checkedOutIn) })
          : undefined,
      onSelect: () => openDeleteBranchAll(branch.name),
    },
  ];
}

export function remoteBranchMenu(rb: RemoteBranch): MenuItemSpec[] {
  const atual = headBranch();
  const localJaExiste = Boolean(branchByName(rb.shortName));

  return [
    {
      label: localJaExiste
        ? t("menu.remoteBranch.checkoutExisting", { name: rb.shortName })
        : t("menu.remoteBranch.checkoutNew"),
      icon: Check,
      onSelect: () =>
        doActivateRef({ kind: "remoteBranch", name: rb.name, fullName: rb.fullName, isHead: false, remote: rb.remote }),
    },
    {
      label: t("rail.remotes.createLocal"),
      icon: GitBranchPlus,
      onSelect: () => openCreateBranch(rb.name),
    },
    {
      label: t("menu.reveal"),
      icon: Crosshair,
      onSelect: () => selectRef(rb.fullName),
    },
    {
      label: t("menu.branch.mergeInto", { branch: atual ?? "…" }),
      icon: GitMerge,
      separatorBefore: true,
      disabled: !atual,
      hint: atual ? undefined : t("menu.hint.detached"),
      onSelect: () => openMergeInto(rb.name),
    },
    {
      label: t("menu.copyName"),
      icon: ClipboardCopy,
      separatorBefore: true,
      onSelect: () => void doCopy(rb.name, t("copy.name")),
    },
    {
      label: t("rail.remotes.deleteRemote"),
      icon: Trash2,
      destructive: true,
      separatorBefore: true,
      onSelect: () => openDeleteBranchRemote(rb.remote, rb.shortName),
    },
  ];
}

export function tagMenu(tag: Tag): MenuItemSpec[] {
  return [
    {
      label: t("menu.reveal"),
      icon: Crosshair,
      onSelect: () => selectRef(tag.fullName),
    },
    {
      label: t("menu.tag.createBranch"),
      icon: GitBranchPlus,
      onSelect: () => openCreateBranch(tag.name),
    },
    {
      label: t("menu.copyName"),
      icon: ClipboardCopy,
      separatorBefore: true,
      hint: short(tag.target),
      onSelect: () => void doCopy(tag.name, t("copy.name")),
    },
    {
      label: t("rail.tags.delete"),
      icon: Trash2,
      destructive: true,
      separatorBefore: true,
      onSelect: () => openDeleteTag(tag.name, remoteNames()),
    },
  ];
}

/**
 * O chip de referencia da View Tree.
 *
 * `head` solto (detached) e `stash` nao tem acao propria: devolver lista vazia
 * faz o chip DEVOLVER o clique para a linha, e quem responde e o menu do commit
 * — que e exatamente o que a pessoa quis dizer ao clicar ali.
 */
export function refMenu(refEntry: CommitRef): MenuItemSpec[] {
  const refs = getState().refs;
  if (!refs) return [];

  if (refEntry.kind === "localBranch") {
    const branch = refs.branches.find(
      (b) => b.fullName === refEntry.fullName || b.name === refEntry.name,
    );
    return branch ? branchMenu(branch) : [];
  }
  if (refEntry.kind === "remoteBranch") {
    const rb = refs.remoteBranches.find(
      (r) => r.fullName === refEntry.fullName || r.name === refEntry.name,
    );
    return rb ? remoteBranchMenu(rb) : [];
  }
  if (refEntry.kind === "tag") {
    const tag = refs.tags.find((t) => t.fullName === refEntry.fullName || t.name === refEntry.name);
    return tag ? tagMenu(tag) : [];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* 3. Remotos, stashes e worktrees                                     */
/* ------------------------------------------------------------------ */

export function remoteMenu(remote: Remote): MenuItemSpec[] {
  const url = browseUrl(remote.fetchUrl);

  const items: MenuItemSpec[] = [
    {
      label: t("menu.remote.fetch"),
      icon: Cloud,
      onSelect: () => void doFetchRemote(remote.name),
    },
    {
      label: t("rail.remotes.push"),
      icon: Upload,
      onSelect: () => openPushDialog({ remote: remote.name }),
    },
    {
      label: t("rail.remotes.editUrl"),
      icon: Pencil,
      separatorBefore: true,
      onSelect: () => openEditRemoteUrl(remote),
    },
    {
      label: t("menu.remote.copyFetchUrl"),
      icon: ClipboardCopy,
      onSelect: () => void doCopy(remote.fetchUrl, t("copy.url")),
    },
  ];

  if (url) {
    items.push({
      label: t("menu.remote.browse"),
      icon: ExternalLink,
      onSelect: () => window.open(url, "_blank", "noopener,noreferrer"),
    });
  }

  items.push({
    label: t("rail.remotes.removeRemote"),
    icon: Trash2,
    destructive: true,
    separatorBefore: true,
    onSelect: () => openRemoveRemote(remote.name),
  });
  return items;
}

export function stashMenu(stash: StashEntry): MenuItemSpec[] {
  return [
    {
      label: t("menu.stash.show"),
      icon: Eye,
      onSelect: () => void showStashDiff(stash.ref),
    },
    {
      label: t("rail.stashes.apply"),
      icon: Undo2,
      onSelect: () => void doStashApply(stash.ref),
    },
    {
      label: t("rail.stashes.pop"),
      icon: Archive,
      destructive: true,
      onSelect: () => openStashPop(stash.ref),
    },
    {
      label: t("menu.stash.copyMessage"),
      icon: ClipboardCopy,
      separatorBefore: true,
      onSelect: () => void doCopy(stash.message, t("copy.message")),
    },
    {
      label: t("rail.stashes.drop"),
      icon: Trash2,
      destructive: true,
      separatorBefore: true,
      onSelect: () => openStashDrop(stash.ref),
    },
  ];
}

export function worktreeMenu(wt: Worktree): MenuItemSpec[] {
  return [
    {
      label: t("menu.worktree.switch"),
      icon: Link2,
      disabled: wt.isActive,
      hint: wt.isActive ? t("rail.chip.active") : t("menu.hint.chdir"),
      onSelect: () => void doSwitchWorktree(wt),
    },
    {
      label: t("menu.copyPath"),
      icon: ClipboardCopy,
      onSelect: () => void doCopy(wt.path, t("copy.path")),
    },
    {
      label: t("rail.worktrees.add"),
      icon: FolderPlus,
      separatorBefore: true,
      onSelect: openAddWorktree,
    },
    { label: t("rail.worktrees.prune"), icon: Wand2, onSelect: openPruneWorktrees },
    {
      label: t("rail.worktrees.removeThis"),
      icon: Trash2,
      destructive: true,
      separatorBefore: true,
      disabled: wt.isMain,
      hint: wt.isMain ? t("rail.chip.main") : undefined,
      onSelect: () => openRemoveWorktree(wt),
    },
  ];
}

/* ------------------------------------------------------------------ */
/* 4. Arquivos                                                         */
/* ------------------------------------------------------------------ */

const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** Linha do painel de alteracoes: preparar, descartar, ver, copiar. */
export function changeFileMenu(entry: StatusEntry): MenuItemSpec[] {
  const preparado = entry.staged && !entry.conflicted;

  return [
    {
      label: t("menu.file.view"),
      icon: Eye,
      onSelect: () => openFile(entry.path, null, true),
    },
    {
      label: t("menu.commitFile.blame"),
      icon: FileSearch,
      onSelect: () => openBlame(entry.path, null),
    },
    preparado
      ? {
          label: t("changes.unstage"),
          icon: FileMinus2,
          separatorBefore: true,
          onSelect: () => void doUnstage([entry.path]),
        }
      : {
          label: t("changes.stage"),
          icon: FilePlus2,
          separatorBefore: true,
          onSelect: () => void doStage([entry.path]),
        },
    {
      label: t("action.discard.op"),
      icon: Trash2,
      destructive: true,
      onSelect: () => openDiscard([entry.path]),
    },
    {
      label: t("menu.copyPath"),
      icon: ClipboardCopy,
      separatorBefore: true,
      onSelect: () => void doCopy(entry.path, t("copy.path")),
    },
    {
      label: t("menu.copyFileName"),
      icon: ClipboardCopy,
      onSelect: () => void doCopy(fileName(entry.path), t("copy.name")),
    },
  ];
}

/** Linha da lista de arquivos de um commit. */
export function commitFileMenu(file: CommitFileChange, hash: string): MenuItemSpec[] {
  return [
    {
      label: t("menu.commitFile.view"),
      icon: Eye,
      hint: short(hash),
      onSelect: () => openFile(file.path, hash),
    },
    {
      label: t("menu.commitFile.viewWorking"),
      icon: GitCommitHorizontal,
      disabled: file.status === "deleted",
      hint: file.status === "deleted" ? t("status.deleted") : undefined,
      onSelect: () => openFile(file.path, null, true),
    },
    {
      label: t("menu.commitFile.blame"),
      icon: FileSearch,
      separatorBefore: true,
      disabled: file.binary,
      hint: file.binary ? t("common.binaryShort") : undefined,
      onSelect: () => openBlame(file.path, hash),
    },
    {
      label: t("menu.copyPath"),
      icon: ClipboardCopy,
      separatorBefore: true,
      onSelect: () => void doCopy(file.path, t("copy.path")),
    },
    {
      label: t("menu.copyFileName"),
      icon: ClipboardCopy,
      onSelect: () => void doCopy(fileName(file.path), t("copy.name")),
    },
  ];
}

/* ------------------------------------------------------------------ */
/* 5. Visualizador                                                     */
/* ------------------------------------------------------------------ */

export interface ViewerMenuContext {
  path: string;
  /** commit de origem; null quando o conteudo veio da arvore de trabalho */
  hash: string | null;
  /** texto selecionado no visualizador no instante do clique */
  selection: string;
  mode: ViewerMode;
  modes: ViewerMode[];
  modeLabel: (mode: ViewerMode) => string;
  onMode: (mode: ViewerMode) => void;
  onClose?: () => void;
}

/**
 * O visualizador e o unico lugar do app onde o menu nativo tinha uso real fora
 * de um campo de texto: copiar um trecho do diff. Ele volta aqui como item
 * proprio — e desabilitado, com o motivo a vista, quando nao ha nada marcado.
 */
export function viewerMenu(ctx: ViewerMenuContext): MenuItemSpec[] {
  const items: MenuItemSpec[] = [
    {
      label: t("menu.viewer.copySelection"),
      icon: ClipboardCopy,
      disabled: ctx.selection.length === 0,
      hint:
        ctx.selection.length === 0
          ? t("menu.viewer.nothingSelected")
          : t("menu.viewer.chars", { count: ctx.selection.length }),
      onSelect: () => void doCopy(ctx.selection, t("copy.selection")),
    },
    {
      label: t("menu.copyPath"),
      icon: ClipboardCopy,
      onSelect: () => void doCopy(ctx.path, t("copy.path")),
    },
  ];

  if (ctx.hash) {
    items.push({
      label: t("menu.viewer.copySourceHash"),
      icon: ClipboardCopy,
      hint: short(ctx.hash),
      onSelect: () => void doCopy(ctx.hash as string, t("copy.hash")),
    });
  }

  items.push({
    label: t("menu.viewer.blame"),
    icon: FileSearch,
    separatorBefore: true,
    onSelect: () => openBlame(ctx.path, ctx.hash),
  });

  for (const [i, mode] of ctx.modes.entries()) {
    items.push({
      label: t("menu.viewer.viewMode", { mode: ctx.modeLabel(mode) }),
      icon: Eye,
      separatorBefore: i === 0,
      disabled: mode === ctx.mode,
      hint: mode === ctx.mode ? t("menu.hint.current") : undefined,
      onSelect: () => ctx.onMode(mode),
    });
  }

  if (ctx.hash) {
    items.push({
      label: t("menu.viewer.openWorking"),
      icon: GitCommitHorizontal,
      separatorBefore: true,
      onSelect: () => openFile(ctx.path, null, true),
    });
  }

  if (ctx.onClose) {
    items.push({
      label: t("viewer.close"),
      icon: X,
      separatorBefore: true,
      onSelect: ctx.onClose,
    });
  }
  return items;
}
