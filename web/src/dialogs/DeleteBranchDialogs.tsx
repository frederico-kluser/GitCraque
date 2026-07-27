/**
 * Apagar ramo — local (`-d`, escalando para `-D`) e no servidor
 * (`push <remote> --delete`).
 *
 * Os dois sao destrutivos e usam `HoldToConfirmButton`. O local tem uma
 * particularidade: `git branch -d` recusa ramo nao mesclado, e so entao a UI
 * oferece o `-D`. Oferecer o `-D` de saida seria transformar um engano em
 * perda de commits.
 */
import { useEffect, useState } from "react";
import { HoldToConfirmButton } from "@/components/motion-ui/hold-to-confirm";
import { api } from "@/lib/api";
import { runOperation, selectBranches, selectRemotes, useAppState } from "@/state/store";
import {
  Button,
  Callout,
  CommandPreview,
  DialogShell,
  HoldHint,
  SelectField,
} from "./parts";
import {
  deleteBranchLocalBody,
  deleteBranchLocalPreview,
  deleteBranchRemoteBody,
  deleteBranchRemotePreview,
} from "./requests";

/* ------------------------------------------------------------------ */
/* Local                                                               */
/* ------------------------------------------------------------------ */

/** O git recusa `-d` com esta mensagem quando o ramo nao esta mesclado. */
const NOT_MERGED = /not fully merged|is not fully merged/i;

export function DeleteLocalBranchDialog({
  open,
  name,
  onClose,
}: {
  open: boolean;
  name: string;
  onClose: () => void;
}) {
  const branches = useAppState(selectBranches);
  const [needsForce, setNeedsForce] = useState(false);

  useEffect(() => {
    if (open) setNeedsForce(false);
  }, [open, name]);

  const branch = branches.find((b) => b.name === name);
  const force = needsForce;
  const options = { name, force };

  const run = async () => {
    const result = await runOperation(
      `Apagar ramo ${name}`,
      () => api.deleteBranchLocal(deleteBranchLocalBody(options)),
      { refresh: "refs", successMessage: `Ramo ${name} apagado` },
    );
    if (result?.ok) {
      onClose();
      return;
    }
    // Falhou por nao estar mesclado: so agora o -D entra em cena.
    const text = `${result?.stderr ?? ""} ${result?.error ?? ""}`;
    if (!force && NOT_MERGED.test(text)) setNeedsForce(true);
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={`Apagar o ramo ${name}`}
      description="Remove apenas a referencia local. O remoto nao e tocado."
      tone="destructive"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <HoldToConfirmButton
            key={force ? "force" : "safe"}
            onConfirm={run}
            aria-describedby="delete-local-hint"
            className="w-56"
          >
            {force ? "Segure para forcar (-D)" : "Segure para apagar"}
          </HoldToConfirmButton>
        </>
      }
    >
      {branch?.upstream ? (
        <Callout tone="info">
          {name} acompanha {branch.upstream} ({branch.ahead} a frente, {branch.behind}{" "}
          atras). O ramo no servidor continua existindo.
        </Callout>
      ) : null}

      {needsForce ? (
        <Callout tone="danger">
          O git recusou: {name} nao esta totalmente mesclado. Com -D os commits que so
          existem nele ficam inalcancaveis e somem no proximo gc.
        </Callout>
      ) : (
        <Callout tone="warning">
          Com -d o git so apaga se o ramo ja estiver mesclado. Se recusar, a opcao -D
          aparece aqui.
        </Callout>
      )}

      <CommandPreview argv={deleteBranchLocalPreview(options)} />
      <HoldHint id="delete-local-hint" />
    </DialogShell>
  );
}

/* ------------------------------------------------------------------ */
/* Origin                                                              */
/* ------------------------------------------------------------------ */

export function DeleteRemoteBranchDialog({
  open,
  name,
  remote: initialRemote,
  onClose,
}: {
  open: boolean;
  /** nome SEM o prefixo do remoto */
  name: string;
  remote?: string;
  onClose: () => void;
}) {
  const remotes = useAppState(selectRemotes);
  const [remote, setRemote] = useState(initialRemote ?? "origin");

  useEffect(() => {
    if (!open) return;
    setRemote(
      initialRemote ??
        (remotes.some((r) => r.name === "origin") ? "origin" : (remotes[0]?.name ?? "")),
    );
  }, [open]);

  const options = { remote, name };

  const run = () => {
    onClose();
    void runOperation(
      `Apagar ${remote}/${name}`,
      () => api.deleteBranchRemote(deleteBranchRemoteBody(options)),
      { refresh: "refs", successMessage: `${remote}/${name} apagado no servidor` },
    );
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={`Apagar ${name} no servidor`}
      description="Isto e um push de delecao: o ramo deixa de existir no remoto."
      tone="destructive"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <HoldToConfirmButton
            onConfirm={run}
            aria-describedby="delete-remote-hint"
            className="w-56"
          >
            Segure para apagar no servidor
          </HoldToConfirmButton>
        </>
      }
    >
      <Callout tone="danger">
        Apaga {name} NO SERVIDOR {remote || "(sem remoto)"}. Todo mundo que usa esse
        remoto perde a referencia, e nenhum comando local desfaz isso. A copia local
        continua onde esta.
      </Callout>

      {remotes.length > 1 ? (
        <SelectField
          label="Remoto"
          value={remote}
          onChange={setRemote}
          options={remotes.map((r) => ({ value: r.name, label: `${r.name} — ${r.pushUrl}` }))}
        />
      ) : null}

      <CommandPreview argv={deleteBranchRemotePreview(options)} />
      <HoldHint id="delete-remote-hint" />
    </DialogShell>
  );
}
