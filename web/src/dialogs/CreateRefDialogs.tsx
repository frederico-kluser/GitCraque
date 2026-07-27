/**
 * Criar ramo e criar tag — os dois dialogos simples, com `startPoint`/`ref`
 * opcional. Nenhum dos dois e destrutivo, entao Enter confirma.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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

const START_HINT = "Vazio usa o HEAD atual. Aceita hash, ramo ou tag.";

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

  const error = name.trim() && !isValidRefName(name) ? "Nome de ref invalido." : undefined;
  const ready = Boolean(name.trim()) && !error;
  const options = {
    name: name.trim(),
    startPoint: startPoint.trim() || undefined,
    checkout,
  };

  const run = () => {
    if (!ready) return;
    onClose();
    void runOperation("Criar ramo", () => api.createBranch(createBranchBody(options)), {
      refresh: checkout ? "head" : "refs",
      successMessage: `Ramo ${options.name} criado`,
    });
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title="Criar ramo"
      description="Cria uma referencia local nova apontando para o ponto de partida."
      size="sm"
      onEnter={run}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={run} disabled={!ready}>
            Criar
          </Button>
        </>
      }
    >
      <TextField
        label="Nome do ramo"
        value={name}
        onChange={setName}
        placeholder="feature/nome-curto"
        autoFocus
        error={error}
      />

      <TextField
        label="Ponto de partida (opcional)"
        value={startPoint}
        onChange={setStartPoint}
        placeholder={head?.hash ? short(head.hash) : "HEAD"}
        mono
        hint={START_HINT}
      />

      <CheckboxField
        label="Trocar para o ramo novo"
        checked={checkout}
        onChange={setCheckout}
        hint="Faz checkout depois de criar. Nao confundir com troca de worktree, que e process.chdir."
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

  const error = name.trim() && !isValidRefName(name) ? "Nome de tag invalido." : undefined;
  const ready = Boolean(name.trim()) && !error;
  const options = {
    name: name.trim(),
    ref: target.trim() || undefined,
    message: message.trim() || undefined,
  };

  const run = () => {
    if (!ready) return;
    onClose();
    void runOperation("Criar tag", () => api.createTag(createTagBody(options)), {
      refresh: "refs",
      successMessage: `Tag ${options.name} criada`,
    });
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title="Criar tag"
      description="Marca um commit com um nome fixo."
      size="sm"
      onEnter={run}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={run} disabled={!ready}>
            Criar
          </Button>
        </>
      }
    >
      <TextField
        label="Nome da tag"
        value={name}
        onChange={setName}
        placeholder="v1.0.0"
        autoFocus
        error={error}
      />

      <TextField
        label="Commit (opcional)"
        value={target}
        onChange={setTarget}
        placeholder={head?.hash ? short(head.hash) : "HEAD"}
        mono
        hint={START_HINT}
      />

      <TextField
        label="Mensagem (opcional)"
        value={message}
        onChange={setMessage}
        placeholder="Versao 1.0.0"
        hint="Com mensagem a tag e anotada (-a -m); sem mensagem e leve."
      />

      {message.trim() ? (
        <Callout tone="info">
          Tag anotada guarda autor, data e mensagem como objeto proprio no repositorio.
        </Callout>
      ) : null}

      {ready ? <CommandPreview argv={createTagPreview(options)} /> : null}
    </DialogShell>
  );
}
