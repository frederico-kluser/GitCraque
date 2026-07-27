/**
 * Adicionar remoto — nome + url, com validacao de url (https, ssh:// ou
 * scp-like) e aviso de que https vai passar pelo trampolim GIT_ASKPASS e
 * portanto pode pedir credencial.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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
      ? "Nome invalido: use letras, numeros, ponto, hifen ou sublinhado."
      : duplicated
        ? `Ja existe um remoto chamado ${name.trim()}.`
        : undefined;
  const urlError =
    url.trim() && kind === "invalid"
      ? "Url invalida. Use https://host/org/repo.git ou git@host:org/repo.git."
      : undefined;

  const ready = Boolean(name.trim()) && !nameError && kind !== "invalid" && !urlError;
  const options = { name: name.trim(), url: url.trim() };

  const run = () => {
    if (!ready) return;
    onClose();
    void runOperation("Adicionar remoto", () => api.addRemote(addRemoteBody(options)), {
      refresh: "config",
      successMessage: `Remoto ${options.name} adicionado`,
    });
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title="Adicionar remoto"
      description="Cadastra um destino de fetch e push neste repositorio."
      size="md"
      onEnter={run}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={run} disabled={!ready}>
            Adicionar
          </Button>
        </>
      }
    >
      <TextField
        label="Nome"
        value={name}
        onChange={setName}
        placeholder="origin"
        autoFocus
        error={nameError}
        hint="Como o remoto vai aparecer em git remote -v."
      />

      <TextField
        label="Url"
        value={url}
        onChange={setUrl}
        placeholder="https://github.com/org/repo.git"
        mono
        error={urlError}
        hint="https://host/org/repo.git, ssh://host/caminho ou git@host:org/repo.git"
      />

      {kind === "https" ? (
        <Callout tone="warning">
          Url https: fetch e push passam pelo trampolim GIT_ASKPASS. Na primeira vez o
          GitCraque vai pedir usuario e token para {remoteHost(url.trim()) ?? "este host"}{" "}
          numa caixa propria — o git nunca fica travado num prompt.
        </Callout>
      ) : kind === "ssh" || kind === "scp" ? (
        <Callout tone="info">
          Url ssh: a autenticacao e do seu agente de chaves. Se a chave tiver
          passphrase, o pedido tambem chega pela caixa de credenciais.
        </Callout>
      ) : null}

      {ready ? <CommandPreview argv={addRemotePreview(options)} /> : null}
    </DialogShell>
  );
}
