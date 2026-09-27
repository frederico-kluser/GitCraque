/**
 * O seletor de REMOTO de sincronizacao — o destino de fetch/pull/push.
 *
 * Multi origin e isto: o remoto ativo e uma escolha VISIVEL e persistida
 * (`useShellStore.activeRemote`), nunca um default escondido. O gatilho mostra
 * o nome do remoto e o estado do branch atual nele (`+a -b`); o popup lista os
 * remotos todos com o mesmo estado e termina com "Buscar em todos os remotos".
 *
 * CASCATA: `Menu` do Base UI e a mesma primitiva dos seletores de projeto e de
 * worktree da toolbar — uma idioma so para gatilhos com popup. O que nao havia
 * no catalogo, e por isso esta escrito aqui, e o BADGE de tracking: texto
 * minimo, com o detalhe no `title`.
 */
import { Menu } from "@base-ui/react/menu";
import { ArrowDownToLine, Check, ChevronDown, Cloud } from "lucide-react";

import { doFetchAll, resolveActiveRemote } from "@/app/actions";
// Relativo pelo mesmo motivo de `app/actions.ts`: o alias "@/hooks" dos domtests
// engole subcaminhos, e este componente vive na cadeia deles.
import { useShellState } from "../hooks";
import { selectActiveRemote, setActiveRemote } from "../hooks/useShellStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { FOCUS_RING, MENU_ITEM_CLASS, MENU_POPUP_CLASS } from "@/panels/parts";
import { useAppState } from "@/state/store";
import type { RemoteTracking } from "@/types/git";

/**
 * `+a -b` quando ha diferenca; `±0` quando esta em dia; `—` sem branch no
 * remoto. O `title` e que explica qualquer um dos tres estados.
 */
function badgeOf(tracking: RemoteTracking | undefined, remoteName: string) {
  if (!tracking) return null;
  const ref = `${remoteName}/${tracking.branch}`;
  const title = !tracking.exists
    ? t("toolbar.remote.noBranch", { ref })
    : tracking.ahead || tracking.behind
      ? t("toolbar.remote.status", { ahead: tracking.ahead, behind: tracking.behind, ref })
      : t("toolbar.remote.upToDate", { ref });
  const text =
    tracking.exists && (tracking.ahead > 0 || tracking.behind > 0)
      ? `${tracking.ahead > 0 ? `+${tracking.ahead}` : ""} ${tracking.behind > 0 ? `−${tracking.behind}` : ""}`.trim()
      : tracking.exists
        ? "±0"
        : "—";
  return { text, title };
}

export function RemoteSelector() {
  const remotes = useAppState((s) => s.repo?.remotes ?? s.refs?.remotes ?? null) ?? [];
  const activeRemote = useShellState(selectActiveRemote);

  // Sem remoto nao ha o que escolher: o rail ja tem o estado vazio dele.
  if (remotes.length === 0) return null;

  const activeName =
    activeRemote && remotes.some((r) => r.name === activeRemote)
      ? activeRemote
      : resolveActiveRemote();
  const badge = badgeOf(
    remotes.find((r) => r.name === activeName)?.tracking,
    activeName,
  );

  return (
    <Menu.Root>
      <Menu.Trigger
        title={badge?.title ?? t("toolbar.remote.trigger")}
        aria-label={t("toolbar.remote.trigger")}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg border border-transparent px-2 text-xs touch:min-h-tap",
          "transition-colors duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
          "hover:border-border hover:bg-accent data-[popup-open]:border-border data-[popup-open]:bg-accent",
          FOCUS_RING,
        )}
      >
        <Cloud className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="max-w-[7rem] truncate font-mono text-foreground">{activeName}</span>
        {badge && (
          <span className="rounded-sm bg-primary/12 px-1 font-mono text-[10px] text-primary">
            {badge.text}
          </span>
        )}
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="z-50 outline-none">
          <Menu.Popup className={cn(MENU_POPUP_CLASS, "w-[22rem] max-w-[90vw]")}>
            {remotes.map((remote) => {
              const rowBadge = badgeOf(remote.tracking, remote.name);
              const current = remote.name === activeName;
              return (
                <Menu.Item
                  key={remote.name}
                  onClick={() => setActiveRemote(remote.name)}
                  title={rowBadge?.title}
                  className={cn(MENU_ITEM_CLASS, "gap-2.5 px-2.5 py-2")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-xs font-medium">{remote.name}</span>
                      {rowBadge && (
                        <span className="rounded-sm bg-primary/12 px-1 font-mono text-[10px] text-primary">
                          {rowBadge.text}
                        </span>
                      )}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">
                      {remote.pushUrl || remote.fetchUrl}
                    </span>
                  </span>
                  {current && <Check className="size-3.5 shrink-0 text-primary" />}
                </Menu.Item>
              );
            })}

            <div className="mx-1 my-1 h-px bg-border" />

            <Menu.Item onClick={() => void doFetchAll()} className={MENU_ITEM_CLASS}>
              <ArrowDownToLine className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-xs">{t("action.fetchAll")}</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
