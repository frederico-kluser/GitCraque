/**
 * Confirmacao de uma intencao do motor de DND.
 *
 * Mostra titulo, explicacao, o argv cru de cada opcao em fonte mono e um botao
 * por opcao. Opcao `destructive` exige `HoldToConfirmButton`; as outras vao no
 * clique. Este dialogo e o UNICO lugar onde a operacao arrastada e executada.
 */
import { HoldToConfirmButton } from "@/components/motion-ui/hold-to-confirm";
import { t } from "@/i18n";
import type { DragIntent, DragIntentOption } from "@/types/git";
import { executeIntentOption } from "./executors";
import { Button, Callout, CommandPreview, DialogShell, HoldHint, RefChip } from "./parts";

export interface IntentDialogProps {
  intent: DragIntent | null;
  open: boolean;
  onClose: () => void;
}

export function IntentDialog({ intent, open, onClose }: IntentDialogProps) {
  if (!intent) return null;

  const single = intent.options.length === 1 ? intent.options[0] : null;

  const confirm = (option: DragIntentOption) => {
    // Fecha antes de executar: o progresso e os toasts sao globais.
    onClose();
    void executeIntentOption(option);
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={intent.title}
      description={intent.description}
      size={intent.options.length > 1 ? "lg" : "md"}
      onEnter={single && !single.destructive ? () => confirm(single) : undefined}
      footer={
        <>
          <span className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefChip mono={intent.source.type === "commit"}>{intent.source.label}</RefChip>
            {t("dialog.intent.for")}
            <RefChip>{intent.target.label}</RefChip>
          </span>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </>
      }
    >
      {intent.options.length === 0 ? (
        <Callout tone="warning">{intent.reason ?? t("dialog.intent.noOperation")}</Callout>
      ) : null}

      <div className={intent.options.length > 1 ? "grid gap-3 sm:grid-cols-2" : "space-y-3"}>
        {intent.options.map((option) => (
          <OptionCard key={option.id} option={option} onConfirm={() => confirm(option)} />
        ))}
      </div>
    </DialogShell>
  );
}

function OptionCard({
  option,
  onConfirm,
}: {
  option: DragIntentOption;
  onConfirm: () => void;
}) {
  const hintId = `hold-hint-${option.id}`;

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-background p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">
          {option.label}
          {option.destructive ? (
            <span className="ml-2 rounded bg-destructive/15 px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-destructive">
              {t("dialog.intent.rewritesHistory")}
            </span>
          ) : null}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{option.description}</p>
      </div>

      <CommandPreview argv={option.preview} label={t("common.willRun")} />

      <div className="mt-auto flex flex-col gap-2">
        {option.destructive ? (
          <>
            <HoldToConfirmButton
              onConfirm={onConfirm}
              aria-describedby={hintId}
              className="w-full"
            >
              {option.id === "rebase" ? t("dialog.intent.holdRebase") : t("dialog.intent.holdConfirm")}
            </HoldToConfirmButton>
            <HoldHint id={hintId} />
          </>
        ) : (
          <Button variant="primary" onClick={onConfirm} className="w-full">
            {option.label}
          </Button>
        )}
      </div>
    </section>
  );
}
