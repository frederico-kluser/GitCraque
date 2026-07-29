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
import { Rich, t } from "@/i18n";
import type { MessageKey } from "@/i18n";
import { short } from "@/lib/utils";
import {
  resolveConflictsWithAgent,
  runOperation,
  selectAgent,
  selectAi,
  selectPending,
  useAppState,
} from "@/state/store";
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

const KIND_KEY: Record<PendingOperation["kind"], MessageKey> = {
  rebase: "conflict.kind.rebase",
  "rebase-interactive": "conflict.kind.rebaseInteractive",
  merge: "conflict.kind.merge",
  "cherry-pick": "conflict.kind.cherryPick",
  revert: "conflict.kind.revert",
  bisect: "conflict.kind.bisect",
};

const kindLabel = (kind: PendingOperation["kind"]) => t(KIND_KEY[kind]);

const signatureOf = (p: PendingOperation | null) =>
  p ? `${p.kind}|${p.current ?? ""}|${p.step ?? ""}|${p.conflicts.join(",")}` : null;

export function ConflictDialog() {
  const pending = useAppState(selectPending);
  const ai = useAppState(selectAi);
  const agent = useAppState(selectAgent);
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
    void runOperation(
      t("conflict.op.continue", { kind: kindLabel(shown.kind) }),
      () => api.continueOp(resumeBody(kind)),
      { refresh: "rebase-state", successMessage: t("conflict.done.resumed") },
    );
  };

  const abort = () => {
    if (!kind) return;
    close();
    void runOperation(
      t("conflict.op.abort", { kind: kindLabel(shown.kind) }),
      () => api.abort(resumeBody(kind)),
      { refresh: "rebase-state", successMessage: t("conflict.done.aborted") },
    );
  };

  // O agente so e oferecido quando ha o que resolver E ha chave: um botao que
  // so sabe devolver 401 e pior que botao nenhum. Enquanto uma sessao roda, ele
  // fica desabilitado — `session.begin` recusa a segunda com `error.aiBusy`.
  const podeIA = shown.conflicts.length > 0 && ai.hasKey && agent.phase !== "running";

  const resolverComIA = () => {
    close();
    void resolveConflictsWithAgent();
  };

  const progress =
    shown.step && shown.total ? t("conflict.progress", { step: shown.step, total: shown.total }) : "";

  return (
    <DialogShell
      open={open}
      onClose={close}
      title={t("conflict.title", { kind: kindLabel(shown.kind), progress })}
      description={
        shown.conflicts.length > 0
          ? t("conflict.description.conflicts")
          : t("conflict.description.clean")
      }
      tone="destructive"
      onEnter={kind ? resume : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t("common.close")}
          </Button>
          {podeIA ? (
            <Button variant="ghost" onClick={resolverComIA}>
              {t("conflict.ai.action")}
            </Button>
          ) : null}
          {kind ? (
            <>
              <HoldToConfirmButton
                onConfirm={abort}
                aria-describedby="conflict-hold-hint"
                className="w-48"
              >
                {t("conflict.hold")}
              </HoldToConfirmButton>
              <Button variant="primary" onClick={resume}>
                {t("conflict.continue")}
              </Button>
            </>
          ) : null}
        </>
      }
    >
      {shown.current ? (
        <Callout tone="info">
          <Rich
            k="conflict.applying"
            nodes={{ hash: <code className="font-mono">{short(shown.current)}</code> }}
          />
        </Callout>
      ) : null}

      {shown.conflicts.length > 0 ? (
        <Field
          label={t("conflict.files", { count: shown.conflicts.length })}
          hint={t("conflict.files.hint")}
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
        <Callout tone="warning">{t("conflict.noFiles")}</Callout>
      )}

      {kind ? (
        <>
          <CommandPreview argv={continuePreview(kind)} label={t("conflict.preview.continue")} />
          <CommandPreview argv={abortPreview(kind)} label={t("conflict.preview.abort")} />
          <HoldHint id="conflict-hold-hint">{t("conflict.holdHint")}</HoldHint>
        </>
      ) : (
        <Callout tone="warning">
          {t("conflict.unsupported", { kind: kindLabel(shown.kind) })}
        </Callout>
      )}
    </DialogShell>
  );
}
