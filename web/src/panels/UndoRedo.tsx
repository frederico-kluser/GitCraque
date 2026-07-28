/**
 * Desfazer e refazer, no lugar onde ficava a barra da paleta de comandos.
 *
 * Os dois botoes sao `ToolButton` de `./parts` — o catalogo nao tem nada com
 * semantica de undo, e um par de botoes de icone ja e exatamente o que o
 * `ToolButton` faz. Nada de novo foi escrito para pinta-los.
 *
 * O rotulo do title vem do REFLOG, entao ele diz o que sera desfeito de verdade
 * ("commit: mensagem", "rebase (finish): refs/heads/main") em vez de um
 * "Desfazer" generico. E texto que o git escreveu, em ingles: fica como veio,
 * pela mesma regra que deixa o stderr do git passar intacto.
 */
import { Redo2, Undo2 } from "lucide-react";
import { doRedo, doUndo } from "@/app/actions";
import { t } from "@/i18n";
import { selectUndo, useAppState } from "@/state/store";
import { ToolButton } from "./parts";

export function UndoRedo({ className }: { className?: string }) {
  const undo = useAppState(selectUndo);
  const busy = useAppState((s) => s.loading.operation);

  const canUndo = Boolean(undo?.canUndo) && !busy;
  const canRedo = Boolean(undo?.canRedo) && !busy;

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        <ToolButton
          icon={<Undo2 className="size-3.5" />}
          tone="ghost"
          disabled={!canUndo}
          aria-label={t("action.undo")}
          title={
            blockedTitle(undo?.blocked ?? null) ??
            (canUndo && undo?.undoLabel
              ? t("action.undo.step", { step: undo.undoLabel })
              : t("action.undo.nothing"))
          }
          onClick={doUndo}
        />
        <ToolButton
          icon={<Redo2 className="size-3.5" />}
          tone="ghost"
          disabled={!canRedo}
          aria-label={t("action.redo")}
          title={
            blockedTitle(undo?.blocked ?? null) ??
            (canRedo && undo?.redoLabel
              ? t("action.redo.step", { step: undo.redoLabel })
              : t("action.redo.nothing"))
          }
          onClick={doRedo}
        />
      </div>
    </div>
  );
}

/**
 * O title explica o botao morto em vez de so deixa-lo cinza: sem isso, "por que
 * nao da para desfazer?" nao tem resposta na tela.
 *
 * Desfazer e refazer tem chave propria em vez de um "{action}" interpolado — a
 * palavra entra no meio da frase e a caixa dela nao e a mesma em todo idioma.
 */
function blockedTitle(blocked: "empty" | "pending" | null) {
  if (blocked === "pending") return t("action.undo.blocked.pending");
  if (blocked === "empty") return t("action.undo.blocked.empty");
  return null;
}
