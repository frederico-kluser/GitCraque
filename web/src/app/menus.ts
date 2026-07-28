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
  Check,
  ClipboardCopy,
  Cloud,
  Crosshair,
  Eye,
  ExternalLink,
  FileMinus2,
  FilePlus2,
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
import type { ViewerMode } from "@/viewer";
import { clearSelection, getState, openFile, selectRef } from "@/state/store";
import { short } from "@/lib/utils";
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
  openDeleteBranchLocal,
  openDeleteBranchRemote,
  openDeleteTag,
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
import { browseUrl } from "./commands";

/* ------------------------------------------------------------------ */
/* Contexto do repositorio no instante do clique                       */
/* ------------------------------------------------------------------ */

const headBranch = () => getState().repo?.head.branch ?? getState().status?.branch ?? null;

const branchByName = (name: string) =>
  getState().refs?.branches.find((b) => b.name === name || b.fullName === name);

const remoteNames = () => (getState().repo?.remotes ?? getState().refs?.remotes ?? []).map((r) => r.name);

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
        label: `Squash dos ${selecao.length} commits`,
        icon: GitMerge,
        onSelect: () => openSquash(selecao),
      },
      {
        label: `Cherry-pick dos ${selecao.length} na branch atual`,
        icon: Layers,
        onSelect: () => openCherryPick(selecao),
      },
      {
        label: "Copiar os hashes",
        icon: ClipboardCopy,
        separatorBefore: true,
        hint: String(selecao.length),
        onSelect: () => void doCopy(selecao.join("\n"), "Hashes copiados"),
      },
      { label: "Limpar a selecao", icon: Undo2, onSelect: clearSelection },
    ];
  }

  const items: MenuItemSpec[] = [
    {
      label: "Checkout deste commit",
      icon: Check,
      hint: "detached",
      onSelect: () => openCheckoutCommit(hash),
    },
    { label: "Criar branch aqui", icon: GitBranchPlus, onSelect: () => openCreateBranch(hash) },
    { label: "Criar tag aqui", icon: TagIcon, onSelect: () => openCreateTag(hash) },
    {
      label: "Cherry-pick na branch atual",
      icon: Layers,
      separatorBefore: true,
      onSelect: () => openCherryPick([hash]),
    },
    { label: "Reverter", icon: Undo2, onSelect: () => openRevert(hash) },
    {
      label: "Reset da branch atual ate aqui",
      icon: History,
      destructive: true,
      onSelect: () => openResetTo(hash),
    },
    {
      label: "Copiar hash",
      icon: ClipboardCopy,
      separatorBefore: true,
      hint: short(hash),
      onSelect: () => void doCopy(hash, "Hash copiado"),
    },
  ];

  if (commit) {
    items.push({
      label: "Copiar assunto",
      icon: ClipboardCopy,
      onSelect: () => void doCopy(commit.subject, "Assunto copiado"),
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

  return [
    {
      label: "Checkout",
      icon: Check,
      disabled: branch.isHead || presa,
      hint: branch.isHead ? "atual" : presa ? `presa em ${branch.checkedOutIn}` : undefined,
      onSelect: () => void doCheckout(branch.name),
    },
    {
      label: "Levar a View Tree ate aqui",
      icon: Crosshair,
      onSelect: () => selectRef(branch.fullName),
    },
    {
      label: `Mesclar em ${atual ?? "…"}`,
      icon: GitMerge,
      separatorBefore: true,
      disabled: !integravel,
      hint: branch.isHead ? "e a atual" : atual ? undefined : "detached",
      onSelect: () => openMergeInto(branch.name),
    },
    {
      label: `Rebasear ${atual ?? "…"} sobre esta`,
      icon: History,
      destructive: true,
      disabled: !integravel,
      onSelect: () => openRebaseOnto(branch.name),
    },
    {
      label: "Push desta branch",
      icon: Upload,
      separatorBefore: true,
      onSelect: () => openPushDialog({ branch: branch.name }),
    },
    { label: "Renomear", icon: Pencil, onSelect: () => openRenameBranch(branch.name) },
    {
      label: "Criar branch a partir daqui",
      icon: GitBranchPlus,
      onSelect: () => openCreateBranch(branch.name),
    },
    { label: "Criar tag aqui", icon: TagIcon, onSelect: () => openCreateTag(branch.name) },
    {
      label: "Copiar nome",
      icon: ClipboardCopy,
      separatorBefore: true,
      onSelect: () => void doCopy(branch.name, "Nome copiado"),
    },
    {
      label: "Deletar Branch (Local)",
      icon: Trash2,
      destructive: true,
      separatorBefore: true,
      disabled: branch.isHead || presa,
      hint: branch.isHead ? "e a atual" : undefined,
      onSelect: () => openDeleteBranchLocal(branch.name),
    },
  ];
}

export function remoteBranchMenu(rb: RemoteBranch): MenuItemSpec[] {
  const atual = headBranch();
  const localJaExiste = Boolean(branchByName(rb.shortName));

  return [
    {
      label: localJaExiste ? `Checkout de ${rb.shortName}` : "Checkout (cria a local rastreando)",
      icon: Check,
      onSelect: () =>
        doActivateRef({ kind: "remoteBranch", name: rb.name, fullName: rb.fullName, isHead: false, remote: rb.remote }),
    },
    {
      label: "Criar branch local daqui",
      icon: GitBranchPlus,
      onSelect: () => openCreateBranch(rb.name),
    },
    {
      label: "Levar a View Tree ate aqui",
      icon: Crosshair,
      onSelect: () => selectRef(rb.fullName),
    },
    {
      label: `Mesclar em ${atual ?? "…"}`,
      icon: GitMerge,
      separatorBefore: true,
      disabled: !atual,
      hint: atual ? undefined : "detached",
      onSelect: () => openMergeInto(rb.name),
    },
    {
      label: "Copiar nome",
      icon: ClipboardCopy,
      separatorBefore: true,
      onSelect: () => void doCopy(rb.name, "Nome copiado"),
    },
    {
      label: "Deletar Branch (Origin)",
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
      label: "Levar a View Tree ate aqui",
      icon: Crosshair,
      onSelect: () => selectRef(tag.fullName),
    },
    {
      label: "Criar branch a partir da tag",
      icon: GitBranchPlus,
      onSelect: () => openCreateBranch(tag.name),
    },
    {
      label: "Copiar nome",
      icon: ClipboardCopy,
      separatorBefore: true,
      hint: short(tag.target),
      onSelect: () => void doCopy(tag.name, "Nome copiado"),
    },
    {
      label: "Deletar tag",
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
      label: "Fetch --prune deste remoto",
      icon: Cloud,
      onSelect: () => void doFetchRemote(remote.name),
    },
    {
      label: "Push para este remoto",
      icon: Upload,
      onSelect: () => openPushDialog({ remote: remote.name }),
    },
    { label: "Editar url", icon: Pencil, separatorBefore: true, onSelect: () => openEditRemoteUrl(remote) },
    {
      label: "Copiar url de fetch",
      icon: ClipboardCopy,
      onSelect: () => void doCopy(remote.fetchUrl, "Url copiada"),
    },
  ];

  if (url) {
    items.push({
      label: "Abrir no navegador",
      icon: ExternalLink,
      onSelect: () => window.open(url, "_blank", "noopener,noreferrer"),
    });
  }

  items.push({
    label: "Remover remoto",
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
      label: "Aplicar (mantem na pilha)",
      icon: Undo2,
      onSelect: () => void doStashApply(stash.ref),
    },
    {
      label: "Pop (aplica e remove)",
      icon: Archive,
      destructive: true,
      onSelect: () => openStashPop(stash.ref),
    },
    {
      label: "Copiar a mensagem",
      icon: ClipboardCopy,
      separatorBefore: true,
      onSelect: () => void doCopy(stash.message, "Mensagem copiada"),
    },
    {
      label: "Descartar",
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
      label: "Trocar para esta worktree",
      icon: Link2,
      disabled: wt.isActive,
      hint: wt.isActive ? "ativa" : "process.chdir",
      onSelect: () => void doSwitchWorktree(wt),
    },
    {
      label: "Copiar o caminho",
      icon: ClipboardCopy,
      onSelect: () => void doCopy(wt.path, "Caminho copiado"),
    },
    { label: "Adicionar worktree", icon: FolderPlus, separatorBefore: true, onSelect: openAddWorktree },
    { label: "Prune (limpar registros)", icon: Wand2, onSelect: openPruneWorktrees },
    {
      label: "Remover esta worktree",
      icon: Trash2,
      destructive: true,
      separatorBefore: true,
      disabled: wt.isMain,
      hint: wt.isMain ? "principal" : undefined,
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
      label: "Ver no visualizador",
      icon: Eye,
      onSelect: () => openFile(entry.path, null, true),
    },
    preparado
      ? {
          label: "Despreparar",
          icon: FileMinus2,
          separatorBefore: true,
          onSelect: () => void doUnstage([entry.path]),
        }
      : {
          label: "Preparar",
          icon: FilePlus2,
          separatorBefore: true,
          onSelect: () => void doStage([entry.path]),
        },
    {
      label: "Descartar alteracoes",
      icon: Trash2,
      destructive: true,
      onSelect: () => openDiscard([entry.path]),
    },
    {
      label: "Copiar o caminho",
      icon: ClipboardCopy,
      separatorBefore: true,
      onSelect: () => void doCopy(entry.path, "Caminho copiado"),
    },
    {
      label: "Copiar o nome do arquivo",
      icon: ClipboardCopy,
      onSelect: () => void doCopy(fileName(entry.path), "Nome copiado"),
    },
  ];
}

/** Linha da lista de arquivos de um commit. */
export function commitFileMenu(file: CommitFileChange, hash: string): MenuItemSpec[] {
  return [
    {
      label: "Ver neste commit",
      icon: Eye,
      hint: short(hash),
      onSelect: () => openFile(file.path, hash),
    },
    {
      label: "Ver a versao da arvore de trabalho",
      icon: GitCommitHorizontal,
      disabled: file.status === "deleted",
      hint: file.status === "deleted" ? "removido" : undefined,
      onSelect: () => openFile(file.path, null, true),
    },
    {
      label: "Copiar o caminho",
      icon: ClipboardCopy,
      separatorBefore: true,
      onSelect: () => void doCopy(file.path, "Caminho copiado"),
    },
    {
      label: "Copiar o nome do arquivo",
      icon: ClipboardCopy,
      onSelect: () => void doCopy(fileName(file.path), "Nome copiado"),
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
      label: "Copiar a selecao",
      icon: ClipboardCopy,
      disabled: ctx.selection.length === 0,
      hint: ctx.selection.length === 0 ? "nada marcado" : `${ctx.selection.length} car.`,
      onSelect: () => void doCopy(ctx.selection, "Selecao copiada"),
    },
    {
      label: "Copiar o caminho",
      icon: ClipboardCopy,
      onSelect: () => void doCopy(ctx.path, "Caminho copiado"),
    },
  ];

  if (ctx.hash) {
    items.push({
      label: "Copiar o hash de origem",
      icon: ClipboardCopy,
      hint: short(ctx.hash),
      onSelect: () => void doCopy(ctx.hash as string, "Hash copiado"),
    });
  }

  for (const [i, mode] of ctx.modes.entries()) {
    items.push({
      label: `Ver em ${ctx.modeLabel(mode)}`,
      icon: Eye,
      separatorBefore: i === 0,
      disabled: mode === ctx.mode,
      hint: mode === ctx.mode ? "atual" : undefined,
      onSelect: () => ctx.onMode(mode),
    });
  }

  if (ctx.hash) {
    items.push({
      label: "Abrir a versao da arvore de trabalho",
      icon: GitCommitHorizontal,
      separatorBefore: true,
      onSelect: () => openFile(ctx.path, null, true),
    });
  }

  if (ctx.onClose) {
    items.push({
      label: "Fechar o visualizador",
      icon: X,
      separatorBefore: true,
      onSelect: ctx.onClose,
    });
  }
  return items;
}
