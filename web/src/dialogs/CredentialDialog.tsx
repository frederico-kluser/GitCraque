/**
 * O outro lado do trampolim de askpass — o dialogo mais critico do app.
 *
 * O `askpass.mjs` roda como filho do git, pergunta ao cofre por um socket unix
 * e, se o cofre nao tiver o segredo, o servidor emite `credentials:needed`. Sem
 * esta caixa, o push por https fica esperando do outro lado ate o timeout de
 * 120 s e o git falha.
 *
 * Por isso ela nao e aberta por painel nenhum: aparece sozinha quando
 * `state.credentialPrompt` deixa de ser null, mostra o prompt CRU que o git
 * mandou, e responde por `answerCredentialPrompt` / `cancelCredentialPrompt`.
 * Se o tempo do pedido acabar, ela mesma cancela e fecha.
 */
import { useEffect, useState } from "react";
import { answerCredentialPrompt, cancelCredentialPrompt, useAppState } from "@/state/store";
import { t } from "@/i18n";
import type { CredentialPrompt } from "@/types/git";
import {
  Button,
  Callout,
  CheckboxField,
  DialogShell,
  Field,
  TextField,
} from "./parts";
import { useLingering } from "./parts";

const remaining = (prompt: CredentialPrompt) =>
  Math.max(0, Math.ceil((prompt.expiresAt - Date.now()) / 1000));

export function CredentialDialog() {
  const prompt = useAppState((s) => s.credentialPrompt);
  const shown = useLingering(prompt);
  const open = prompt !== null;

  const [value, setValue] = useState("");
  const [remember, setRemember] = useState(true);
  const [seconds, setSeconds] = useState(0);

  // Cada pedido novo comeca do zero.
  useEffect(() => {
    if (!prompt) return;
    setValue("");
    setRemember(true);
    setSeconds(remaining(prompt));
  }, [prompt?.requestId]);

  // Contador do tempo restante; quando zera, cancela e fecha sozinho.
  useEffect(() => {
    if (!prompt) return;
    const tick = () => {
      const left = remaining(prompt);
      setSeconds(left);
      if (left <= 0) cancelCredentialPrompt();
    };
    tick();
    const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, [prompt]);

  if (!shown) return null;

  const isUsername = shown.kind === "username";
  const confirm = () => {
    if (!value) return;
    answerCredentialPrompt(value, remember);
  };

  return (
    <DialogShell
      open={open}
      onClose={cancelCredentialPrompt}
      title={
        isUsername
          ? t("credential.title.username", { host: shown.host })
          : t("credential.title.secret", { host: shown.host })
      }
      description={t("credential.description")}
      size="sm"
      onEnter={confirm}
      footer={
        <>
          <span className="mr-auto text-xs text-muted-foreground">
            {seconds > 0 ? t("credential.expiresIn", { seconds }) : t("credential.expired")}
          </span>
          <Button variant="ghost" onClick={cancelCredentialPrompt}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={confirm} disabled={!value || seconds <= 0}>
            {t("credential.send")}
          </Button>
        </>
      }
    >
      <Field label={t("credential.prompt")} hint={t("credential.host", { host: shown.host })}>
        <pre className="overflow-x-auto rounded-md border border-border bg-surface-inset px-3 py-2">
          <code className="font-mono text-xs text-foreground">{shown.prompt}</code>
        </pre>
      </Field>

      <TextField
        key={shown.requestId}
        label={isUsername ? t("credential.field.username") : t("credential.field.secret")}
        value={value}
        onChange={setValue}
        type={isUsername ? "text" : "password"}
        autoFocus
        autoComplete={isUsername ? "username" : "current-password"}
        mono={!isUsername}
        placeholder={isUsername ? t("credential.field.username.placeholder") : "ghp_..."}
      />

      <CheckboxField
        label={t("credential.remember")}
        checked={remember}
        onChange={setRemember}
        hint={t("credential.remember.hint")}
      />

      <Callout tone="info">{t("credential.note")}</Callout>
    </DialogShell>
  );
}
