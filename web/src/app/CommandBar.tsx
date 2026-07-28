/**
 * A paleta ⌘K, ligada ao registro unico de `commands.ts`.
 *
 * O `CommandPalette` do Motion UI ja traz o proprio gatilho (a barra colapsada)
 * e o proprio listener global de ⌘K — por isso ele mora na toolbar em vez de um
 * botao solto: a barra E o gatilho, e nao ha atalho duplicado.
 */
import { CommandPalette } from "@/components/motion-ui/command-palette";
import { setPaletteOpen, useShellState } from "@/hooks";
import { t } from "@/i18n";
import { commandGroups, useAppCommands } from "./commands";

export function CommandBar({ className }: { className?: string }) {
  const commands = useAppCommands();
  const open = useShellState((s) => s.paletteOpen);

  return (
    <div className={className}>
      <CommandPalette
        open={open}
        onOpenChange={setPaletteOpen}
        items={commands}
        groupOrder={[...commandGroups()]}
        triggerLabel={t("palette.trigger")}
        inputPlaceholder={t("palette.placeholder")}
        inputAriaLabel={t("palette.inputLabel")}
        dialogLabel={t("palette.dialogLabel")}
        footerHints={[
          { keys: "↑↓", label: t("palette.hint.navigate") },
          { keys: "↵", label: t("palette.hint.run") },
          { keys: "esc", label: t("palette.hint.close") },
        ]}
        renderEmpty={(query) => <>{t("palette.empty", { query })}</>}
        onSelect={(item) => {
          const command = commands.find((c) => c.id === item.id);
          command?.run();
        }}
      />
    </div>
  );
}
