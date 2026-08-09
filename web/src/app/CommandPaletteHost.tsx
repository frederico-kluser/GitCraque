/**
 * Host da paleta de comandos (⌘K) — o wrapper que liga o componente do Motion
 * UI ao catalogo deste app.
 *
 * O `CommandPalette` do catalogo e dono do CLI do shadcn: nada aqui edita o
 * arquivo dele. O componente traz o listener global de ⌘K e uma barra-gatilho
 * propria; como a barra nao cabe na toolbar (que ja tem a busca de commits),
 * ela fica escondida e a porta visivel e o botao da toolbar, ligado ao mesmo
 * `paletteOpen` do `useShellStore`.
 *
 * Por que `[&>div:first-child]:hidden` e nao um `hidden` no wrapper inteiro:
 * o `Dialog.Root` nao renderiza elemento proprio e o `Dialog.Portal` anexa o
 * popup ao `<body>` — entao o primeiro `div` filho deste wrapper E a barra do
 * gatilho, e so ela morre. O popup aberto fica no `body` e nao sofre com o
 * wrapper.
 *
 * Foco ao fechar: o Dialog devolve o foco ao gatilho interno, que esta
 * `display:none` — o navegador cai para o `body`. Aceito: a abertura por ⌘K
 * ou pelo botao da toolbar devolve o foco ao input da paleta na proxima vez.
 */
import { CommandPalette, type CommandPaletteItem } from "@/components/motion-ui/command-palette";
import { closePalette, selectPaletteOpen, useShellState } from "@/hooks";
import { t } from "@/i18n";
import { commandGroups, useAppCommands } from "./commands";

export function CommandPaletteHost() {
  const commands = useAppCommands();
  const open = useShellState(selectPaletteOpen);

  return (
    <div className="[&>div:first-child]:hidden">
      <CommandPalette
        open={open}
        onOpenChange={closePalette}
        items={commands}
        groupOrder={commandGroups()}
        /* A barra-gatilho escondida ainda existe no DOM: o rotulo dela e o
           que a busca de commits chamava de "Search Commits…" (chave orfa
           desde que a paleta original saiu, em 9b5184d3). */
        triggerLabel={t("search.commandLabel")}
        inputPlaceholder={t("palette.placeholder")}
        inputAriaLabel={t("palette.inputLabel")}
        dialogLabel={t("palette.dialogLabel")}
        footerHints={[
          { keys: "↑↓", label: t("palette.hint.navigate") },
          { keys: "↵", label: t("palette.hint.run") },
          { keys: "esc", label: t("palette.hint.close") },
        ]}
        renderEmpty={(query) => <>{t("palette.empty", { query })}</>}
        onSelect={(item: CommandPaletteItem) => {
          const command = commands.find((c) => c.id === item.id);
          command?.run();
        }}
      />
    </div>
  );
}
