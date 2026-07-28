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
  ExternalLink,
  FolderGit2,
  FolderTree,
  GitBranchPlus,
  GitMerge,
  Languages,
  Moon,
  RefreshCw,
  Star,
  Sun,
  Archive,
  Tag as TagIcon,
} from "lucide-react";
import {
  selectBranches,
  selectRemotes,
  selectStashes,
  selectWorktrees,
  toast,
  useAppState,
} from "@/state/store";
import { toggleTheme, useProjects, useShellState } from "@/hooks";
import { LOCALE_OPTIONS, chooseLocale, t, useLocale } from "@/i18n";
import { short, truncate } from "@/lib/utils";
import {
  doCheckout,
  doFetch,
  doOpenRepository,
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

/**
 * Os grupos, ja traduzidos. Funcao e nao constante porque o rotulo muda com o
 * idioma — e ele tambem e a CHAVE de agrupamento da paleta, entao os dois lados
 * (o `group` de cada item e o `groupOrder`) tem de sair da mesma chamada.
 */
export const commandGroups = () =>
  [
    t("commands.group.repository"),
    t("commands.group.worktrees"),
    t("commands.group.branches"),
    t("commands.group.network"),
    t("commands.group.history"),
    t("commands.group.remotes"),
    t("commands.group.appearance"),
    t("language.group"),
  ] as const;

/** "abrir, trocar, repo" -> ["abrir", "trocar", "repo"], para o filtro difuso. */
const words = (list: string): string[] =>
  list
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

/** Abre a url de um remoto no navegador, convertendo scp-like em https. */
export function browseUrl(raw: string): string | null {
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
  // Os favoritos viram um comando cada: pular de projeto sem tirar a mao do ⌘K.
  const { favorites } = useProjects();
  // O idioma entra nas dependencias para o memo nao servir rotulos velhos.
  const locale = useLocale();

  return useMemo(() => {
    const items: AppCommand[] = [];
    const [
      GROUP_REPO,
      GROUP_WORKTREES,
      GROUP_BRANCHES,
      GROUP_NET,
      GROUP_HISTORY,
      GROUP_REMOTES,
      GROUP_APPEARANCE,
      GROUP_LANGUAGE,
    ] = commandGroups();

    /* ---- repositorio ---- */
    items.push(
      {
        id: "repo.refresh",
        label: t("commands.repo.refresh"),
        group: GROUP_REPO,
        icon: RefreshCw,
        shortcut: ["⌘", "R"],
        keywords: words(t("commands.repo.refresh.keywords")),
        run: () => void doRefresh(),
      },
      {
        id: "repo.open",
        label: t("commands.repo.open"),
        group: GROUP_REPO,
        icon: FolderGit2,
        keywords: words(t("commands.repo.open.keywords")),
        run: openRepoPicker,
      },
    );
    for (const fav of favorites) {
      const name = fav.label || fav.name;
      items.push({
        id: `repo.favorite.${fav.path}`,
        label: t("commands.repo.favorite", { name }),
        hint: fav.exists ? fav.path : t("commands.repo.favorite.missing", { path: fav.path }),
        group: GROUP_REPO,
        icon: Star,
        keywords: [...words(t("commands.repo.favorite.keywords")), name.toLowerCase()],
        run: () =>
          fav.exists
            ? void doOpenRepository(fav.path)
            : toast("warning", t("commands.repo.favorite.gone", { name }), fav.path),
      });
    }

    /* ---- worktrees: process.chdir, nunca checkout ---- */
    for (const wt of worktrees) {
      if (wt.isActive) continue;
      items.push({
        id: `worktree.switch.${wt.path}`,
        label: t("commands.worktree.switch", { label: wt.label }),
        hint: wt.path,
        group: GROUP_WORKTREES,
        icon: FolderTree,
        keywords: [
          ...words(t("commands.worktree.keywords")),
          wt.label.toLowerCase(),
          wt.branch?.toLowerCase() ?? "",
        ],
        run: () => void doSwitchWorktree(wt),
      });
    }
    items.push({
      id: "worktree.list",
      label: t("commands.worktree.list"),
      hint: t("commands.worktree.list.hint", { count: worktrees.length }),
      group: GROUP_WORKTREES,
      icon: Boxes,
      keywords: words(t("commands.worktree.keywords")),
      run: () => {
        const el = document.getElementById("rail-worktrees");
        el?.scrollIntoView({ block: "start", behavior: "smooth" });
      },
    });

    /* ---- branches ---- */
    items.push({
      id: "branch.create",
      label: t("commands.branch.create"),
      group: GROUP_BRANCHES,
      icon: GitBranchPlus,
      keywords: words(t("commands.branch.create.keywords")),
      run: () => openCreateBranch(),
    });
    for (const branch of branches) {
      if (branch.isHead) continue;
      items.push({
        id: `branch.checkout.${branch.fullName}`,
        label: t("commands.branch.checkout", { name: branch.name }),
        hint: branch.checkedOutIn
          ? t("commands.branch.checkout.pinned", { worktree: branch.checkedOutIn })
          : short(branch.target),
        group: GROUP_BRANCHES,
        icon: Check,
        keywords: [...words(t("commands.branch.checkout.keywords")), branch.name.toLowerCase()],
        run: () =>
          branch.checkedOutIn
            ? toast(
                "warning",
                t("commands.branch.inUse", { name: branch.name }),
                t("commands.branch.inUse.detail", { worktree: branch.checkedOutIn }),
              )
            : void doCheckout(branch.name),
      });
    }

    /* ---- rede ---- */
    items.push(
      {
        id: "net.fetch",
        label: t("commands.net.fetch"),
        group: GROUP_NET,
        icon: ArrowDownToLine,
        keywords: words(t("commands.net.fetch.keywords")),
        run: () => void doFetch(),
      },
      {
        id: "net.pull",
        label: t("commands.net.pull"),
        group: GROUP_NET,
        icon: ArrowDownToLine,
        keywords: words(t("commands.net.pull.keywords")),
        run: () => void doPull(),
      },
      {
        id: "net.pull.rebase",
        label: t("commands.net.pullRebase"),
        group: GROUP_NET,
        icon: ArrowDownToLine,
        keywords: words(t("commands.net.pullRebase.keywords")),
        run: () => void doPull(true),
      },
      {
        id: "net.push",
        label: t("commands.net.push"),
        group: GROUP_NET,
        icon: ArrowUpFromLine,
        keywords: words(t("commands.net.push.keywords")),
        run: () => openPushDialog(),
      },
    );

    /* ---- historico ---- */
    items.push(
      {
        id: "stash.push",
        label: t("commands.stash.push"),
        group: GROUP_HISTORY,
        icon: Archive,
        keywords: words(t("commands.stash.push.keywords")),
        run: openStashPush,
      },
      {
        id: "tag.create",
        label: t("commands.tag.create"),
        group: GROUP_HISTORY,
        icon: TagIcon,
        keywords: words(t("commands.tag.create.keywords")),
        run: () => openCreateTag(),
      },
    );
    if (stashes.length > 0) {
      items.push({
        id: "stash.apply.latest",
        label: t("commands.stash.applyLatest", { ref: stashes[0].ref }),
        hint: truncate(stashes[0].message, 48),
        group: GROUP_HISTORY,
        icon: Archive,
        keywords: words(t("commands.stash.apply.keywords")),
        run: () => void doStashApply(stashes[0].ref),
      });
    }
    items.push({
      id: "history.squash",
      label:
        selection.length >= 2
          ? t("commands.history.squash", { count: selection.length })
          : t("commands.history.squash.needs"),
      group: GROUP_HISTORY,
      icon: GitMerge,
      keywords: words(t("commands.history.squash.keywords")),
      run: () => openSquash(selection),
    });

    /* ---- remotos ---- */
    items.push({
      id: "remote.add",
      label: t("commands.remote.add"),
      group: GROUP_REMOTES,
      icon: ExternalLink,
      keywords: words(t("commands.remote.add.keywords")),
      run: () => openAddRemote(),
    });
    for (const remote of remotes) {
      const url = browseUrl(remote.fetchUrl);
      if (!url) continue;
      items.push({
        id: `remote.open.${remote.name}`,
        label: t("commands.remote.browse", { name: remote.name }),
        hint: url,
        group: GROUP_REMOTES,
        icon: ExternalLink,
        keywords: [...words(t("commands.remote.browse.keywords")), remote.name.toLowerCase()],
        run: () => window.open(url, "_blank", "noopener,noreferrer"),
      });
    }

    /* ---- aparencia ---- */
    items.push({
      id: "theme.toggle",
      label: theme === "dark" ? t("commands.theme.light") : t("commands.theme.dark"),
      group: GROUP_APPEARANCE,
      icon: theme === "dark" ? Sun : Moon,
      keywords: words(t("commands.theme.keywords")),
      run: toggleTheme,
    });

    /* ---- idioma: um comando por lingua, o corrente fora da lista ---- */
    for (const option of LOCALE_OPTIONS) {
      if (option.value === locale) continue;
      items.push({
        id: `language.${option.value}`,
        label: t("commands.language.set", { name: option.label }),
        hint: option.tag,
        group: GROUP_LANGUAGE,
        icon: Languages,
        keywords: [...words(t("commands.language.keywords")), option.label.toLowerCase(), option.value],
        run: () => chooseLocale(option.value),
      });
    }

    return items;
  }, [worktrees, branches, remotes, stashes, selection, theme, favorites, locale]);
}
