/**
 * Dialogo de clone — url + caminho destino + branch opcional.
 *
 * O botao "Clonar" chama `api.clone()` com barra de progresso via `op:progress`,
 * igual ao fetch. Ao terminar, o backend ja abriu o repo clonado (process.chdir
 * + cwd:changed) e a View Tree e recarregada.
 */
import { useEffect, useState } from "react";
import { t } from "@/i18n";
import { cloneRepository } from "@/state/store";
import { openDialog } from "@/dialogs";
import { Button, CommandPreview, DialogShell, TextField } from "./parts";

/** Abre o dialogo de clone a partir de qualquer lugar do app. */
export function openCloneDialog() {
  openDialog({ kind: "clone" });
}

export function CloneDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [dest, setDest] = useState("");
  const [branch, setBranch] = useState("");

  useEffect(() => {
    if (!open) return;
    setUrl("");
    setDest("");
    setBranch("");
  }, [open]);

  const ready = url.trim().length > 0 && dest.trim().length > 0;

  const run = () => {
    if (!ready) return;
    onClose();
    void cloneRepository({
      url: url.trim(),
      path: dest.trim(),
      ...(branch.trim() ? { branch: branch.trim() } : {}),
    });
  };

  const previewArgs = ["clone", "--progress"];
  if (branch.trim()) previewArgs.push("--branch", branch.trim());
  previewArgs.push(url.trim() || "<url>", dest.trim() || "<path>");

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t("clone.title")}
      description={t("clone.description")}
      size="md"
      onEnter={run}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={run} disabled={!ready}>
            {t("clone.confirm")}
          </Button>
        </>
      }
    >
      <TextField
        label={t("clone.field.url")}
        value={url}
        onChange={setUrl}
        placeholder={t("clone.field.url.placeholder")}
        autoFocus
        hint={t("clone.field.url.hint")}
      />

      <TextField
        label={t("clone.field.path")}
        value={dest}
        onChange={setDest}
        placeholder={t("clone.field.path.placeholder")}
        hint={t("clone.field.path.hint")}
      />

      <TextField
        label={t("clone.field.branch")}
        value={branch}
        onChange={setBranch}
        placeholder={t("clone.field.branch.placeholder")}
      />

      {ready ? <CommandPreview argv={previewArgs} /> : null}
    </DialogShell>
  );
}
