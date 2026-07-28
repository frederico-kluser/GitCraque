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
import { t } from "@/i18n";
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
      t("deleteLocal.op", { name }),
      () => api.deleteBranchLocal(deleteBranchLocalBody(options)),
      { refresh: "refs", successMessage: t("deleteLocal.done", { name }) },
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
      title={t("deleteLocal.title", { name })}
      description={t("deleteLocal.description")}
      tone="destructive"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <HoldToConfirmButton
            key={force ? "force" : "safe"}
            onConfirm={run}
            aria-describedby="delete-local-hint"
            className="w-56"
          >
            {force ? t("deleteLocal.holdForce") : t("deleteLocal.hold")}
          </HoldToConfirmButton>
        </>
      }
    >
      {branch?.upstream ? (
        <Callout tone="info">
          {t("deleteLocal.upstream", {
            name,
            upstream: branch.upstream,
            ahead: branch.ahead,
            behind: branch.behind,
          })}
        </Callout>
      ) : null}

      {needsForce ? (
        <Callout tone="danger">{t("deleteLocal.notMerged", { name })}</Callout>
      ) : (
        <Callout tone="warning">{t("deleteLocal.safe")}</Callout>
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
      t("deleteRemote.op", { remote, name }),
      () => api.deleteBranchRemote(deleteBranchRemoteBody(options)),
      { refresh: "refs", successMessage: t("deleteRemote.done", { remote, name }) },
    );
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t("deleteRemote.title", { name })}
      description={t("deleteRemote.description")}
      tone="destructive"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <HoldToConfirmButton
            onConfirm={run}
            aria-describedby="delete-remote-hint"
            className="w-56"
          >
            {t("deleteRemote.hold")}
          </HoldToConfirmButton>
        </>
      }
    >
      <Callout tone="danger">
        {t("deleteRemote.warning", { name, remote: remote || t("deleteRemote.noRemote") })}
      </Callout>

      {remotes.length > 1 ? (
        <SelectField
          label={t("deleteRemote.field.remote")}
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
