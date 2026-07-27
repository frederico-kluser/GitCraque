/**
 * Conflito — aparece quando o repositorio fica com operacao pendente
 * (`repo.head.pending`), que e como uma operacao volta quando o git parou no
 * meio: rebase, merge, cherry-pick ou revert com arquivos em conflito.
 *
 * Lista os arquivos e oferece continuar (`/ops/continue`) ou abortar
 * (`/ops/abort`). Abortar joga fora o trabalho da operacao, entao exige hold.
 *
 * Abre sozinho, mas pode ser fechado: quem fecha nao ve de novo o MESMO estado
 * pendente. Os paineis reabrem com `openDialog({ kind: "conflict" })`.
 */
import { useState } from "react";
import { HoldToConfirmButton } from "@/components/motion-ui/hold-to-confirm";
import { api } from "@/lib/api";
import { short } from "@/lib/utils";
import { runOperation, selectPending, useAppState } from "@/state/store";
import type { PendingOperation } from "@/types/git";
import {
  Button,
  Callout,
  CommandPreview,
  DialogShell,
  Field,
  HoldHint,
} from "./parts";
import {
  abortPreview,
  continuePreview,
  resumableKind,
  resumeBody,
} from "./requests";
import { useLingering } from "./parts";
import { closeDialog, useDialogState } from "./store";

const KIND_LABEL: Record<PendingOperation["kind"], string> = {
  rebase: "rebase",
  "rebase-interactive": "rebase interativo",
  merge: "merge",
  "cherry-pick": "cherry-pick",
  revert: "revert",
  bisect: "bisect",
};

const signatureOf = (p: PendingOperation | null) =>
  p ? `${p.kind}|${p.current ?? ""}|${p.step ?? ""}|${p.conflicts.join(",")}` : null;

export function ConflictDialog() {
  const pending = useAppState(selectPending);
  const spec = useDialogState();
  const [dismissed, setDismissed] = useState<string | null>(null);

  const requested = spec?.kind === "conflict";
  const signature = signatureOf(pending);
  const open = pending !== null && (requested || dismissed !== signature);
  const shown = useLingering(pending);

  if (!shown) return null;

  const close = () => {
    setDismissed(signature);
    if (requested) closeDialog();
  };

  const kind = resumableKind(shown.kind);

  const resume = () => {
    if (!kind) return;
    close();
    void runOperation(`Continuar ${KIND_LABEL[shown.kind]}`, () => api.continueOp(resumeBody(kind)), {
      refresh: "rebase-state",
      successMessage: "Operacao retomada",
    });
  };

  const abort = () => {
    if (!kind) return;
    close();
    void runOperation(`Abortar ${KIND_LABEL[shown.kind]}`, () => api.abort(resumeBody(kind)), {
      refresh: "rebase-state",
      successMessage: "Operacao abortada",
    });
  };

  const progress =
    shown.step && shown.total ? ` — passo ${shown.step} de ${shown.total}` : "";

  return (
    <DialogShell
      open={open}
      onClose={close}
      title={`${KIND_LABEL[shown.kind]} em andamento${progress}`}
      description={
        shown.conflicts.length > 0
          ? "O git parou com conflitos. Resolva os arquivos abaixo no editor e continue, ou aborte e volte ao estado anterior."
          : "O repositorio esta no meio de uma operacao. Continue quando terminar de resolver, ou aborte."
      }
      tone="destructive"
      onEnter={kind ? resume : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Fechar
          </Button>
          {kind ? (
            <>
              <HoldToConfirmButton
                onConfirm={abort}
                aria-describedby="conflict-hold-hint"
                className="w-48"
              >
                Segure para abortar
              </HoldToConfirmButton>
              <Button variant="primary" onClick={resume}>
                Continuar
              </Button>
            </>
          ) : null}
        </>
      }
    >
      {shown.current ? (
        <Callout tone="info">
          Aplicando o commit <code className="font-mono">{short(shown.current)}</code>.
        </Callout>
      ) : null}

      {shown.conflicts.length > 0 ? (
        <Field
          label={`Arquivos em conflito (${shown.conflicts.length})`}
          hint="Resolva no editor e faca stage; depois volte aqui e continue."
        >
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {shown.conflicts.map((path) => (
              <li
                key={path}
                className="bg-surface-inset px-3 py-2 font-mono text-xs text-destructive"
              >
                {path}
              </li>
            ))}
          </ul>
        </Field>
      ) : (
        <Callout tone="warning">
          Nenhum arquivo em conflito reportado. Se voce ja resolveu tudo, continuar deve
          terminar a operacao.
        </Callout>
      )}

      {kind ? (
        <>
          <CommandPreview argv={continuePreview(kind)} label="Continuar executa" />
          <CommandPreview argv={abortPreview(kind)} label="Abortar executa" />
          <HoldHint id="conflict-hold-hint">
            Abortar descarta o que a operacao ja aplicou e devolve o repositorio ao
            estado anterior. Segure o botao para confirmar.
          </HoldHint>
        </>
      ) : (
        <Callout tone="warning">
          {KIND_LABEL[shown.kind]} nao tem continuar nem abortar pela API do GitCraque.
          Resolva pelo terminal (git bisect reset).
        </Callout>
      )}
    </DialogShell>
  );
}
