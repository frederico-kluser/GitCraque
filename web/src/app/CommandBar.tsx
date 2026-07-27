/**
 * A paleta ⌘K, ligada ao registro unico de `commands.ts`.
 *
 * O `CommandPalette` do Motion UI ja traz o proprio gatilho (a barra colapsada)
 * e o proprio listener global de ⌘K — por isso ele mora na toolbar em vez de um
 * botao solto: a barra E o gatilho, e nao ha atalho duplicado.
 */
import { CommandPalette } from "@/components/motion-ui/command-palette";
import { setPaletteOpen, useShellState } from "@/hooks";
import { COMMAND_GROUPS, useAppCommands } from "./commands";

export function CommandBar({ className }: { className?: string }) {
  const commands = useAppCommands();
  const open = useShellState((s) => s.paletteOpen);

  return (
    <div className={className}>
      <CommandPalette
        open={open}
        onOpenChange={setPaletteOpen}
        items={commands}
        groupOrder={[...COMMAND_GROUPS]}
        triggerLabel="Buscar comando…"
        inputPlaceholder="fetch, checkout, worktree, squash…"
        inputAriaLabel="Buscar comando do GitCraque"
        dialogLabel="Comandos do GitCraque"
        footerHints={[
          { keys: "↑↓", label: "navegar" },
          { keys: "↵", label: "executar" },
          { keys: "esc", label: "fechar" },
        ]}
        renderEmpty={(query) => <>Nenhum comando casa com “{query}”.</>}
        onSelect={(item) => {
          const command = commands.find((c) => c.id === item.id);
          command?.run();
        }}
      />
    </div>
  );
}
