/**
 * FONTE UNICA dos comandos do app.
 *
 * Tudo o que a paleta (⌘K) oferece nasce aqui, e nada mais. Cada entrada e um
 * `CommandPaletteItem` do Motion UI (id, label, grupo, atalho, palavras-chave)
 * acompanhado do `run` que o shell executa quando a linha e escolhida.
 *
 * A lista e derivada do estado vivo: as worktrees viram comandos de troca, as
 * branches viram comandos de checkout, a selecao do grafo vira o squash. Nao ha
 * comando "morto" — se o repositorio nao tem stash, o comando de stash apply
 * nao aparece.
 */
import { useMemo } from "react";
import type { CommandPaletteItem } from "@/components/motion-ui/command-palette";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Check,
  Eraser,
  ExternalLink,
  FolderGit2,
  FolderTree,
  GitBranchPlus,
  GitMerge,
  Moon,
  RefreshCw,
  Sun,
  Archive,
  Tag as TagIcon,
} from "lucide-react";
import {
  clearConsole,
  selectBranches,
  selectRemotes,
  selectStashes,
  selectWorktrees,
  toast,
  useAppState,
} from "@/state/store";
import { toggleTheme, useShellState } from "@/hooks";
import { short, truncate } from "@/lib/utils";
import {
  doCheckout,
  doFetch,
  doPull,
  doRefresh,
  doStashApply,
  doSwitchWorktree,
  openCreateBranch,
  openCreateTag,
  openPushDialog,
  openRepoPicker,
  openSquash,
  openStashPush,
  openAddRemote,
} from "./actions";

/** Um comando: o item que a paleta desenha + o que ele faz. */
export interface AppCommand extends CommandPaletteItem {
  run: () => void;
}

export const COMMAND_GROUPS = [
  "Repositorio",
  "Worktrees",
  "Branches",
  "Rede",
  "Historico",
  "Remotos",
  "Aparencia",
] as const;

/** Abre a url de um remoto no navegador, convertendo scp-like em https. */
function browseUrl(raw: string): string | null {
  if (/^https?:\/\//.test(raw)) return raw.replace(/\.git$/, "");
  const scp = /^(?:([^@]+)@)?([^:/]+):(.+)$/.exec(raw);
  if (scp) return `https://${scp[2]}/${scp[3].replace(/\.git$/, "")}`;
  return null;
}

export function useAppCommands(): AppCommand[] {
  const worktrees = useAppState(selectWorktrees);
  const branches = useAppState(selectBranches);
  const remotes = useAppState(selectRemotes);
  const stashes = useAppState(selectStashes);
  const selection = useAppState((s) => s.selection.commits);
  const theme = useShellState((s) => s.theme);

  return useMemo(() => {
    const items: AppCommand[] = [];

    /* ---- repositorio ---- */
    items.push(
      {
        id: "repo.refresh",
        label: "Recarregar o repositorio",
        group: "Repositorio",
        icon: RefreshCw,
        shortcut: ["⌘", "R"],
        keywords: ["refresh", "reload", "atualizar"],
        run: () => void doRefresh(),
      },
      {
        id: "repo.open",
        label: "Abrir outro repositorio…",
        group: "Repositorio",
        icon: FolderGit2,
        keywords: ["abrir", "open", "trocar", "repositorio", "repo", "projeto", "pasta"],
        run: openRepoPicker,
      },
      {
        id: "console.clear",
        label: "Limpar o console",
        group: "Repositorio",
        icon: Eraser,
        keywords: ["console", "clear", "limpar"],
        run: clearConsole,
      },
    );

    /* ---- worktrees: process.chdir, nunca checkout ---- */
    for (const wt of worktrees) {
      if (wt.isActive) continue;
      items.push({
        id: `worktree.switch.${wt.path}`,
        label: `Trocar para a worktree ${wt.label}`,
        hint: wt.path,
        group: "Worktrees",
        icon: FolderTree,
        keywords: ["worktree", "chdir", wt.label.toLowerCase(), wt.branch?.toLowerCase() ?? ""],
        run: () => void doSwitchWorktree(wt),
      });
    }
    items.push({
      id: "worktree.list",
      label: "Ver worktrees no rail",
      hint: `${worktrees.length} registradas`,
      group: "Worktrees",
      icon: Boxes,
      keywords: ["worktree"],
      run: () => {
        const el = document.getElementById("rail-worktrees");
        el?.scrollIntoView({ block: "start", behavior: "smooth" });
      },
    });

    /* ---- branches ---- */
    items.push({
      id: "branch.create",
      label: "Criar branch",
      group: "Branches",
      icon: GitBranchPlus,
      keywords: ["branch", "nova", "new"],
      run: () => openCreateBranch(),
    });
    for (const branch of branches) {
      if (branch.isHead) continue;
      items.push({
        id: `branch.checkout.${branch.fullName}`,
        label: `Checkout ${branch.name}`,
        hint: branch.checkedOutIn ? `presa em ${branch.checkedOutIn}` : short(branch.target),
        group: "Branches",
        icon: Check,
        keywords: ["checkout", branch.name.toLowerCase()],
        run: () =>
          branch.checkedOutIn
            ? toast(
                "warning",
                `${branch.name} ja esta em uso`,
                `A branch esta checada em ${branch.checkedOutIn}. Troque de worktree em vez de fazer checkout.`,
              )
            : void doCheckout(branch.name),
      });
    }

    /* ---- rede ---- */
    items.push(
      {
        id: "net.fetch",
        label: "Fetch --all --prune",
        group: "Rede",
        icon: ArrowDownToLine,
        keywords: ["fetch", "buscar"],
        run: () => void doFetch(),
      },
      {
        id: "net.pull",
        label: "Pull",
        group: "Rede",
        icon: ArrowDownToLine,
        keywords: ["pull", "puxar"],
        run: () => void doPull(),
      },
      {
        id: "net.pull.rebase",
        label: "Pull --rebase",
        group: "Rede",
        icon: ArrowDownToLine,
        keywords: ["pull", "rebase"],
        run: () => void doPull(true),
      },
      {
        id: "net.push",
        label: "Push…",
        group: "Rede",
        icon: ArrowUpFromLine,
        keywords: ["push", "enviar"],
        run: () => openPushDialog(),
      },
    );

    /* ---- historico ---- */
    items.push(
      {
        id: "stash.push",
        label: "Guardar alteracoes (stash)",
        group: "Historico",
        icon: Archive,
        keywords: ["stash", "guardar"],
        run: openStashPush,
      },
      {
        id: "tag.create",
        label: "Criar tag",
        group: "Historico",
        icon: TagIcon,
        keywords: ["tag"],
        run: () => openCreateTag(),
      },
    );
    if (stashes.length > 0) {
      items.push({
        id: "stash.apply.latest",
        label: `Aplicar ${stashes[0].ref}`,
        hint: truncate(stashes[0].message, 48),
        group: "Historico",
        icon: Archive,
        keywords: ["stash", "apply"],
        run: () => void doStashApply(stashes[0].ref),
      });
    }
    items.push({
      id: "history.squash",
      label:
        selection.length >= 2
          ? `Squash dos ${selection.length} commits selecionados`
          : "Squash da selecao (selecione 2 ou mais)",
      group: "Historico",
      icon: GitMerge,
      keywords: ["squash", "rebase", "juntar"],
      run: () => openSquash(selection),
    });

    /* ---- remotos ---- */
    items.push({
      id: "remote.add",
      label: "Adicionar Origin",
      group: "Remotos",
      icon: ExternalLink,
      keywords: ["remote", "origin", "adicionar"],
      run: () => openAddRemote(),
    });
    for (const remote of remotes) {
      const url = browseUrl(remote.fetchUrl);
      if (!url) continue;
      items.push({
        id: `remote.open.${remote.name}`,
        label: `Abrir ${remote.name} no navegador`,
        hint: url,
        group: "Remotos",
        icon: ExternalLink,
        keywords: ["remote", "abrir", remote.name.toLowerCase()],
        run: () => window.open(url, "_blank", "noopener,noreferrer"),
      });
    }

    /* ---- aparencia ---- */
    items.push({
      id: "theme.toggle",
      label: theme === "dark" ? "Tema claro" : "Tema escuro",
      group: "Aparencia",
      icon: theme === "dark" ? Sun : Moon,
      keywords: ["tema", "theme", "dark", "light", "claro", "escuro"],
      run: toggleTheme,
    });

    return items;
  }, [worktrees, branches, remotes, stashes, selection, theme]);
}
