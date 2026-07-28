/**
 * O seletor de repositorios dentro do chrome de dialogo.
 *
 * A mesma peca aparece SEM dialogo na tela de contorno (quando o servidor nao
 * esta num repositorio): la ela e a tela inteira, porque nao ha nada por baixo
 * para voltar. Ver `RepoPicker` com `variant="page"`.
 */
import { t } from "@/i18n";
import { RepoPicker } from "./RepoPicker";
import { DialogShell } from "./parts";

export function RepoPickerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t("picker.dialog.title")}
      description={t("picker.dialog.description")}
      size="lg"
    >
      <RepoPicker variant="dialog" onOpened={onClose} />
    </DialogShell>
  );
}
