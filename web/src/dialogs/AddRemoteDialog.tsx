/**
 * Adicionar remoto — nome + url, com validacao de url (https, ssh:// ou
 * scp-like) e aviso de que https vai passar pelo trampolim GIT_ASKPASS e
 * portanto pode pedir credencial.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { t } from "@/i18n";
import { remoteHost } from "@/lib/utils";
import { runOperation, selectRemotes, useAppState } from "@/state/store";
import {
  Button,
  Callout,
  CommandPreview,
  DialogShell,
  TextField,
} from "./parts";
import {
  addRemoteBody,
  addRemotePreview,
  classifyRemoteUrl,
  isValidRemoteName,
} from "./requests";

export function AddRemoteDialog({
  open,
  name: initialName,
  url: initialUrl,
  onClose,
}: {
  open: boolean;
  name?: string;
  url?: string;
  onClose: () => void;
}) {
  const remotes = useAppState(selectRemotes);
  const [name, setName] = useState(initialName ?? "origin");
  const [url, setUrl] = useState(initialUrl ?? "");

  useEffect(() => {
    if (!open) return;
    setName(initialName ?? (remotes.some((r) => r.name === "origin") ? "" : "origin"));
    setUrl(initialUrl ?? "");
  }, [open]);

  const kind = classifyRemoteUrl(url);
  const duplicated = remotes.some((r) => r.name === name.trim());
  const nameError = !name.trim()
    ? undefined
    : !isValidRemoteName(name)
      ? t("addRemote.name.invalid")
      : duplicated
        ? t("addRemote.name.duplicated", { name: name.trim() })
        : undefined;
  const urlError = url.trim() && kind === "invalid" ? t("addRemote.url.invalid") : undefined;

  const ready = Boolean(name.trim()) && !nameError && kind !== "invalid" && !urlError;
  const options = { name: name.trim(), url: url.trim() };

  const run = () => {
    if (!ready) return;
    onClose();
    void runOperation(t("addRemote.op"), () => api.addRemote(addRemoteBody(options)), {
      refresh: "config",
      successMessage: t("addRemote.done", { name: options.name }),
    });
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t("addRemote.title")}
      description={t("addRemote.description")}
      size="md"
      onEnter={run}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={run} disabled={!ready}>
            {t("common.add")}
          </Button>
        </>
      }
    >
      <TextField
        label={t("addRemote.name")}
        value={name}
        onChange={setName}
        placeholder="origin"
        autoFocus
        error={nameError}
        hint={t("addRemote.name.hint")}
      />

      <TextField
        label={t("addRemote.url")}
        value={url}
        onChange={setUrl}
        placeholder="https://github.com/org/repo.git"
        mono
        error={urlError}
        hint={t("addRemote.url.hint")}
      />

      {kind === "https" ? (
        <Callout tone="warning">
          {t("addRemote.https", {
            host: remoteHost(url.trim()) ?? t("addRemote.https.thisHost"),
          })}
        </Callout>
      ) : kind === "ssh" || kind === "scp" ? (
        <Callout tone="info">{t("addRemote.ssh")}</Callout>
      ) : null}

      {ready ? <CommandPreview argv={addRemotePreview(options)} /> : null}
    </DialogShell>
  );
}
