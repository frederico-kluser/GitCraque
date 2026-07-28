/**
 * Criar ramo e criar tag — os dois dialogos simples, com `startPoint`/`ref`
 * opcional. Nenhum dos dois e destrutivo, entao Enter confirma.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { t } from "@/i18n";
import { short } from "@/lib/utils";
import { runOperation, selectHead, useAppState } from "@/state/store";
import {
  Button,
  Callout,
  CheckboxField,
  CommandPreview,
  DialogShell,
  TextField,
} from "./parts";
import {
  createBranchBody,
  createBranchPreview,
  createTagBody,
  createTagPreview,
  isValidRefName,
} from "./requests";

/* Funcao, nao constante: o modulo carrega uma vez, o idioma pode trocar depois. */
const startHint = () => t("createRef.startHint");

/* ------------------------------------------------------------------ */
/* Ramo                                                                */
/* ------------------------------------------------------------------ */

export function CreateBranchDialog({
  open,
  startPoint: initialStart,
  onClose,
}: {
  open: boolean;
  startPoint?: string;
  onClose: () => void;
}) {
  const head = useAppState(selectHead);
  const [name, setName] = useState("");
  const [startPoint, setStartPoint] = useState(initialStart ?? "");
  const [checkout, setCheckout] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setStartPoint(initialStart ?? "");
    setCheckout(false);
  }, [open, initialStart]);

  const error = name.trim() && !isValidRefName(name) ? t("createBranch.name.invalid") : undefined;
  const ready = Boolean(name.trim()) && !error;
  const options = {
    name: name.trim(),
    startPoint: startPoint.trim() || undefined,
    checkout,
  };

  const run = () => {
    if (!ready) return;
    onClose();
    void runOperation(t("createBranch.op"), () => api.createBranch(createBranchBody(options)), {
      refresh: checkout ? "head" : "refs",
      successMessage: t("createBranch.done", { name: options.name }),
    });
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t("createBranch.title")}
      description={t("createBranch.description")}
      size="sm"
      onEnter={run}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={run} disabled={!ready}>
            {t("common.create")}
          </Button>
        </>
      }
    >
      <TextField
        label={t("createBranch.name")}
        value={name}
        onChange={setName}
        placeholder={t("createBranch.name.placeholder")}
        autoFocus
        error={error}
      />

      <TextField
        label={t("createBranch.start")}
        value={startPoint}
        onChange={setStartPoint}
        placeholder={head?.hash ? short(head.hash) : "HEAD"}
        mono
        hint={startHint()}
      />

      <CheckboxField
        label={t("createBranch.checkout")}
        checked={checkout}
        onChange={setCheckout}
        hint={t("createBranch.checkout.hint")}
      />

      {ready ? <CommandPreview argv={createBranchPreview(options)} /> : null}
    </DialogShell>
  );
}

/* ------------------------------------------------------------------ */
/* Tag                                                                 */
/* ------------------------------------------------------------------ */

export function CreateTagDialog({
  open,
  // `target` e nao `ref`: `ref` e prop reservada de JSX e nao pode virar dado.
  target: initialRef,
  onClose,
}: {
  open: boolean;
  /** commit/ref que a tag vai marcar */
  target?: string;
  onClose: () => void;
}) {
  const head = useAppState(selectHead);
  const [name, setName] = useState("");
  const [target, setTarget] = useState(initialRef ?? "");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setTarget(initialRef ?? "");
    setMessage("");
  }, [open, initialRef]);

  const error = name.trim() && !isValidRefName(name) ? t("createTag.name.invalid") : undefined;
  const ready = Boolean(name.trim()) && !error;
  const options = {
    name: name.trim(),
    ref: target.trim() || undefined,
    message: message.trim() || undefined,
  };

  const run = () => {
    if (!ready) return;
    onClose();
    void runOperation(t("createTag.op"), () => api.createTag(createTagBody(options)), {
      refresh: "refs",
      successMessage: t("createTag.done", { name: options.name }),
    });
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t("createTag.title")}
      description={t("createTag.description")}
      size="sm"
      onEnter={run}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={run} disabled={!ready}>
            {t("common.create")}
          </Button>
        </>
      }
    >
      <TextField
        label={t("createTag.name")}
        value={name}
        onChange={setName}
        placeholder="v1.0.0"
        autoFocus
        error={error}
      />

      <TextField
        label={t("createTag.commit")}
        value={target}
        onChange={setTarget}
        placeholder={head?.hash ? short(head.hash) : "HEAD"}
        mono
        hint={startHint()}
      />

      <TextField
        label={t("createTag.message")}
        value={message}
        onChange={setMessage}
        placeholder={t("createTag.message.placeholder")}
        hint={t("createTag.message.hint")}
      />

      {message.trim() ? <Callout tone="info">{t("createTag.annotated")}</Callout> : null}

      {ready ? <CommandPreview argv={createTagPreview(options)} /> : null}
    </DialogShell>
  );
}
