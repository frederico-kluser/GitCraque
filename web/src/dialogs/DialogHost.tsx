/**
 * Host unico de todos os dialogos. O shell monta um so destes.
 *
 * Tres fontes, independentes entre si:
 *
 *  1. `props.intent` — a intencao pendente do motor de DND (o shell entrega o
 *     que veio de `setPendingIntent`).
 *  2. `useDialogState()` — a spec que algum painel abriu com `openDialog`.
 *  3. `state/store.ts` — os dois dialogos que ninguem abre: credenciais
 *     (`credentialPrompt`) e conflito (`repo.head.pending`).
 *
 * `useLingering` segura o ultimo valor nao nulo para a animacao de saida ter o
 * que renderizar depois do estado ja ter zerado.
 */
import { useEffect } from "react";
import type { DialogHostProps } from "@/types/modules";
import { AddRemoteDialog } from "./AddRemoteDialog";
import { ConflictDialog } from "./ConflictDialog";
import { CredentialDialog } from "./CredentialDialog";
import { CreateBranchDialog, CreateTagDialog } from "./CreateRefDialogs";
import {
  DeleteLocalBranchDialog,
  DeleteRemoteBranchDialog,
} from "./DeleteBranchDialogs";
import { IntentDialog } from "./IntentDialog";
import { PushDialog } from "./PushDialog";
import { RepoPickerDialog } from "./RepoPickerDialog";
import { SquashDialog } from "./SquashDialog";
import { useLingering } from "./parts";
import { INTENT_ENDPOINTS } from "@/dnd/intents";
import { closeDialog, openDialog, useDialogState, type DialogSpec } from "./store";

export function DialogHost({ intent, onClose }: DialogHostProps) {
  const spec = useDialogState();
  const shownSpec = useLingering(spec);

  // Arrastar um ramo para a lixeira resolve como `delete-branch`. Em vez de
  // confirmar no dialogo generico, entrega ao dialogo dedicado — e la que mora
  // o escalonamento para -D e o aviso de que o remoto e do servidor.
  useEffect(() => {
    if (!intent || intent.kind !== "delete-branch" || !intent.allowed) return;
    const option = intent.options[0];
    if (!option) return;
    if (option.endpoint === INTENT_ENDPOINTS.deleteBranchLocal) {
      openDialog({ kind: "delete-branch-local", name: String(option.body.name ?? "") });
    } else if (option.endpoint === INTENT_ENDPOINTS.deleteBranchRemote) {
      openDialog({
        kind: "delete-branch-remote",
        remote: String(option.body.remote ?? ""),
        name: String(option.body.name ?? ""),
      });
    }
    onClose();
  }, [intent, onClose]);

  const shownIntent = useLingering(intent);
  const intentOpen = intent !== null && intent.kind !== "delete-branch";

  return (
    <>
      <IntentDialog
        intent={shownIntent && shownIntent.kind !== "delete-branch" ? shownIntent : null}
        open={intentOpen}
        onClose={onClose}
      />

      <SpecDialogs spec={shownSpec} open={spec !== null} />

      {/* Dirigidos por estado: ninguem os abre, eles aparecem. */}
      <CredentialDialog />
      <ConflictDialog />
    </>
  );
}

function SpecDialogs({ spec, open }: { spec: DialogSpec | null; open: boolean }) {
  if (!spec) return null;

  switch (spec.kind) {
    case "squash":
      return <SquashDialog open={open} commits={spec.commits} onClose={closeDialog} />;
    case "push":
      return (
        <PushDialog
          open={open}
          remote={spec.remote}
          branch={spec.branch}
          onClose={closeDialog}
        />
      );
    case "delete-branch-local":
      return <DeleteLocalBranchDialog open={open} name={spec.name} onClose={closeDialog} />;
    case "delete-branch-remote":
      return (
        <DeleteRemoteBranchDialog
          open={open}
          name={spec.name}
          remote={spec.remote}
          onClose={closeDialog}
        />
      );
    case "add-remote":
      return (
        <AddRemoteDialog open={open} name={spec.name} url={spec.url} onClose={closeDialog} />
      );
    case "create-branch":
      return (
        <CreateBranchDialog open={open} startPoint={spec.startPoint} onClose={closeDialog} />
      );
    case "create-tag":
      return <CreateTagDialog open={open} target={spec.ref} onClose={closeDialog} />;
    case "repo-picker":
      return <RepoPickerDialog open={open} onClose={closeDialog} />;
    case "conflict":
      // O ConflictDialog le a spec sozinho (ele tambem abre por estado).
      return null;
  }
}
