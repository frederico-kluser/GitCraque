/**
 * FONTE UNICA dos comandos da paleta (⌘K).
 *
 * Cada entrada e um `CommandPaletteItem` do Motion UI (id, label, grupo, icone,
 * atalho, palavras-chave) com o `run` que o shell executa quando a linha e
 * escolhida. A lista e derivada do estado vivo: worktrees viram comandos de
 * troca, branches viram comandos de checkout, favoritos e recentes viram
 * saltos de projeto. Nao ha comando "morto": branch presa em outra worktree
 * nao aparece (ela pertence a worktree que a usa, e o rail explica o motivo).
 *
 * CASCATA: o catalogo do Motion UI nao tem registro de comandos — ele tem o
 * componente `command-palette`, que recebe itens por prop. O registro mora
 * aqui, e o host em `app/CommandPaletteHost.tsx` liga a lista ao componente.
 *
 * As `keywords` sao vocabulario de busca INVISIVEL (o filtro fuzzy da paleta
 * as compara com a digitacao) — por isso ficam cruas aqui, fora do catalogo
 * i18n: ninguem as le na tela.
 */
import { useMemo } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  FolderGit2,
  FolderTree,
  GitBranchPlus,
  Moon,
  RefreshCw,
  Settings,
  Sun,
} from "lucide-react";
import type { CommandPaletteItem } from "@/components/motion-ui/command-palette";
import { selectBranches, selectWorktrees, useAppState } from "@/state/store";
import { openSettings, setTheme, useProjects } from "@/hooks";
import { t } from "@/i18n";
import { short } from "@/lib/utils";
import {
  doCheckout,
  doFetch,
  doOpenRepository,
  doPull,
  doRefresh,
  doSwitchWorktree,
  openCreateBranch,
  openPushDialog,
  openRepoPicker,
} from "./actions";

/** Um comando: o item que a paleta desenha + o que ele faz. */
export interface AppCommand extends CommandPaletteItem {
  run: () => void;
}

/**
 * A ordem dos grupos e fixa: a lista derivada pode nascer em qualquer ordem e
 * o `groupOrder` da paleta e quem decide a sequencia na tela.
 */
export function commandGroups(): string[] {
  return [
    t("commands.group.repository"),
    t("commands.group.projects"),
    t("commands.group.worktrees"),
    t("commands.group.branches"),
    t("commands.group.network"),
    t("commands.group.appearance"),
  ];
}

export function useAppCommands(): AppCommand[] {
  const worktrees = useAppState(selectWorktrees);
  const branches = useAppState(selectBranches);
  const cwd = useAppState((s) => s.repo?.cwd ?? null);
  const { favorites, recents } = useProjects();

  return useMemo(() => {
    const repository = t("commands.group.repository");
    const projects = t("commands.group.projects");
    const worktreesGroup = t("commands.group.worktrees");
    const branchesGroup = t("commands.group.branches");
    const network = t("commands.group.network");
    const appearance = t("commands.group.appearance");

    const items: AppCommand[] = [];

    /* ---- repositorio ---- */
    items.push(
      {
        id: "repo.open",
        label: t("toolbar.project.openOther"),
        group: repository,
        icon: FolderGit2,
        keywords: ["abrir", "open", "projeto", "repository", "proyecto"],
        run: openRepoPicker,
      },
      {
        id: "repo.refresh",
        label: t("toolbar.action.refresh"),
        group: repository,
        icon: RefreshCw,
        shortcut: ["⌘", "R"],
        keywords: ["refresh", "reload", "recarregar", "atualizar"],
        run: () => void doRefresh(),
      },
      {
        id: "repo.settings",
        label: t("settings.open"),
        group: repository,
        icon: Settings,
        keywords: ["configuracoes", "settings", "preferencias", "idioma", "tema"],
        run: openSettings,
      },
    );

    /* ---- projetos: saltos para favoritos e recentes ---- */
    // O mesmo criterio do seletor da toolbar: recentes que ja sao favoritos
    // nao viram linha repetida. O corte em 12 mantem a paleta magra, e o
    // projeto JA aberto nao vira salto (abrir de novo e no-op).
    const favoritos = new Set(favorites.map((p) => p.path));
    const saltos = favorites.map((p) => ({ path: p.path, name: p.label || p.name }));
    for (const rec of recents) {
      if (!favoritos.has(rec.path) && saltos.length < 12) {
        saltos.push({ path: rec.path, name: rec.name });
      }
    }
    for (const salto of saltos) {
      if (salto.path === cwd) continue;
      items.push({
        id: `project.open.${salto.path}`,
        label: t("commands.project.open", { name: salto.name }),
        hint: salto.path,
        group: projects,
        icon: FolderGit2,
        keywords: ["projeto", "project", "abrir", "open", salto.name.toLowerCase()],
        run: () => void doOpenRepository(salto.path),
      });
    }

    /* ---- worktrees: process.chdir, nunca checkout ---- */
    for (const wt of worktrees) {
      if (wt.isActive) continue;
      items.push({
        id: `worktree.switch.${wt.path}`,
        label: t("commands.worktree.switch", { label: wt.label }),
        hint: wt.path,
        group: worktreesGroup,
        icon: FolderTree,
        keywords: ["worktree", "chdir", wt.label.toLowerCase(), wt.branch?.toLowerCase() ?? ""],
        run: () => void doSwitchWorktree(wt),
      });
    }

    /* ---- branches ---- */
    items.push({
      id: "branch.create",
      label: t("toolbar.action.branch"),
      group: branchesGroup,
      icon: GitBranchPlus,
      keywords: ["branch", "nova", "new", "criar", "create"],
      run: openCreateBranch,
    });
    for (const branch of branches) {
      // A checada em outra worktree bloqueia checkout de verdade (o git recusa);
      // deixa-la aqui como comando que falha seria um comando "morto".
      if (branch.isHead || branch.checkedOutIn) continue;
      items.push({
        id: `branch.checkout.${branch.fullName}`,
        label: t("commands.branch.checkout", { name: branch.name }),
        hint: short(branch.target),
        group: branchesGroup,
        icon: Check,
        keywords: ["checkout", branch.name.toLowerCase()],
        run: () => void doCheckout(branch.name),
      });
    }

    /* ---- rede ---- */
    items.push(
      {
        id: "net.fetch",
        label: t("action.fetch"),
        group: network,
        icon: ArrowDownToLine,
        keywords: ["fetch", "buscar", "atualizar"],
        run: () => void doFetch(),
      },
      {
        id: "net.pull",
        label: t("action.pull"),
        group: network,
        icon: ArrowDownToLine,
        keywords: ["pull", "puxar", "baixar"],
        run: () => void doPull(),
      },
      {
        id: "net.push",
        label: t("action.push.title"),
        group: network,
        icon: ArrowUpFromLine,
        keywords: ["push", "enviar", "subir"],
        run: openPushDialog,
      },
    );

    /* ---- aparencia ---- */
    items.push(
      {
        id: "appearance.theme.light",
        label: t("commands.theme.light"),
        group: appearance,
        icon: Sun,
        keywords: ["tema", "theme", "claro", "light"],
        run: () => setTheme("light"),
      },
      {
        id: "appearance.theme.dark",
        label: t("commands.theme.dark"),
        group: appearance,
        icon: Moon,
        keywords: ["tema", "theme", "escuro", "dark"],
        run: () => setTheme("dark"),
      },
    );

    return items;
  }, [worktrees, branches, favorites, recents, cwd]);
}
