/**
 * Push — escolha do remoto (vem de `git remote -v`), do ramo, e das opcoes
 * --set-upstream, --tags e --force-with-lease.
 *
 * O botao principal e o `MultiStateButton` (idle -> enviando -> ok -> erro);
 * quando o force esta armado ele da lugar ao `HoldToConfirmButton`, porque
 * reescrever o ramo no servidor nao pode sair de um clique. Sucesso dispara o
 * `Confetti`.
 *
 * Remoto https passa pelo trampolim GIT_ASKPASS: se o cofre nao tiver a
 * credencial, o `CredentialDialog` aparece sozinho por cima deste.
 */
import { useEffect, useRef, useState } from "react";
import { Confetti, type ConfettiHandle } from "@/components/motion-ui/confetti";
import { HoldToConfirmButton } from "@/components/motion-ui/hold-to-confirm";
import { MultiStateButton } from "@/components/motion-ui/multi-state-button";
import {
  SegmentedToggle,
  SegmentedToggleOption,
} from "@/components/motion-ui/segmented-toggle";
import { api } from "@/lib/api";
import { t } from "@/i18n";
import type { MessageKey } from "@/i18n";
import {
  runOperation,
  selectBranches,
  selectHead,
  selectRemotes,
  useAppState,
} from "@/state/store";
import { openDialog } from "./store";
import {
  Button,
  Callout,
  CheckboxField,
  CommandPreview,
  DialogShell,
  Field,
  HoldHint,
  SelectField,
} from "./parts";
import { pushBody, pushPreview } from "./requests";

type PushState = "idle" | "enviando" | "ok" | "erro";

const STATE_LABEL: Record<PushState, MessageKey> = {
  idle: "push.state.idle",
  enviando: "push.state.sending",
  ok: "push.state.ok",
  erro: "push.state.error",
};

const STATE_SURFACE: Record<PushState, string> = {
  idle: "bg-primary text-primary-foreground",
  enviando: "bg-secondary text-secondary-foreground",
  ok: "bg-success text-success-foreground",
  erro: "bg-destructive text-destructive-foreground",
};

export interface PushDialogProps {
  open: boolean;
  remote?: string;
  branch?: string;
  onClose: () => void;
}

export function PushDialog({ open, remote: initialRemote, branch: initialBranch, onClose }: PushDialogProps) {
  const remotes = useAppState(selectRemotes);
  const branches = useAppState(selectBranches);
  const head = useAppState(selectHead);
  const confettiRef = useRef<ConfettiHandle>(null);

  const [remote, setRemote] = useState(initialRemote ?? "");
  const [branch, setBranch] = useState(initialBranch ?? "");
  const [upstreamOverride, setUpstreamOverride] = useState<boolean | null>(null);
  const [tags, setTags] = useState(false);
  const [force, setForce] = useState(false);
  const [state, setState] = useState<PushState>("idle");

  // Sempre que reabre, volta ao padrao: remoto preferido, ramo do HEAD, sem force.
  useEffect(() => {
    if (!open) return;
    setState("idle");
    setForce(false);
    setTags(false);
    setUpstreamOverride(null);
    setRemote(
      initialRemote ??
        (remotes.some((r) => r.name === "origin") ? "origin" : (remotes[0]?.name ?? "")),
    );
    setBranch(initialBranch ?? head?.branch ?? branches.find((b) => b.isHead)?.name ?? "");
    // Depende so de `open` de proposito: recalcular a cada refresh de refs
    // apagaria a escolha que o usuario acabou de fazer.
  }, [open]);

  // Sucesso fecha sozinho, com folga para o confete aparecer.
  useEffect(() => {
    if (state !== "ok") return;
    const timer = setTimeout(onClose, 1_400);
    return () => clearTimeout(timer);
  }, [state, onClose]);

  const branchInfo = branches.find((b) => b.name === branch);
  const setUpstream = upstreamOverride ?? (branchInfo ? !branchInfo.upstream : false);
  const options = {
    remote,
    branch: branch || undefined,
    setUpstream,
    tags,
    forceWithLease: force,
  };
  const selectedRemote = remotes.find((r) => r.name === remote);
  const ready = remote.length > 0 && state !== "enviando";

  const run = async () => {
    if (!ready) return;
    setState("enviando");
    const result = await runOperation(t("push.op", { remote }), () => api.push(pushBody(options)), {
      refresh: "refs",
      successMessage: t("push.done", { remote }),
    });
    if (result?.ok) {
      setState("ok");
      confettiRef.current?.burst();
    } else {
      setState("erro");
    }
  };

  const branchOptions = branches.map((b) => ({
    value: b.name,
    label: b.upstream
      ? `${b.name} → ${b.upstream}`
      : t("push.field.branch.noUpstream", { name: b.name }),
  }));
  if (branch && !branches.some((b) => b.name === branch)) {
    branchOptions.unshift({ value: branch, label: branch });
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t("push.title")}
      description={t("push.description")}
      onEnter={force ? undefined : run}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <div className="relative">
            <Confetti ref={confettiRef} />
            {force ? (
              <HoldToConfirmButton
                key="force"
                onConfirm={run}
                aria-describedby="push-hold-hint"
                className="w-64"
              >
                {t("push.hold")}
              </HoldToConfirmButton>
            ) : (
              <MultiStateButton
                state={state}
                onClick={run}
                disabled={!ready}
                surfaceClassName={STATE_SURFACE[state]}
                feedback={state === "erro" ? "shake" : state === "ok" ? "pop" : "none"}
                announce={`${t("push.title")}: ${t(STATE_LABEL[state])}`}
                aria-label={t("push.aria", {
                  branch: branch || t("push.aria.currentBranch"),
                  remote: remote || t("push.aria.remote"),
                })}
              >
                {t(STATE_LABEL[state])}
              </MultiStateButton>
            )}
          </div>
        </>
      }
    >
      {remotes.length === 0 ? (
        <>
          <Callout tone="warning">{t("push.noRemotes")}</Callout>
          <Button variant="primary" onClick={() => openDialog({ kind: "add-remote" })}>
            {t("push.addRemote")}
          </Button>
        </>
      ) : (
        <>
          {remotes.length <= 3 ? (
            <Field label={t("push.field.remote")} hint={selectedRemote?.pushUrl}>
              <SegmentedToggle
                value={remote}
                onChange={setRemote}
                ariaLabel={t("push.field.remote.aria")}
                className="w-fit"
              >
                {remotes.map((r) => (
                  <SegmentedToggleOption key={r.name} value={r.name}>
                    {r.name}
                  </SegmentedToggleOption>
                ))}
              </SegmentedToggle>
            </Field>
          ) : (
            <SelectField
              label={t("push.field.remote")}
              value={remote}
              onChange={setRemote}
              options={remotes.map((r) => ({ value: r.name, label: `${r.name} — ${r.pushUrl}` }))}
              hint={selectedRemote?.pushUrl}
            />
          )}

          <SelectField
            label={t("push.field.branch")}
            value={branch}
            onChange={setBranch}
            options={branchOptions}
            hint={
              branchInfo
                ? t("push.field.branch.hint", {
                    ahead: branchInfo.ahead,
                    behind: branchInfo.behind,
                  })
                : t("push.field.branch.hint.none")
            }
          />

          <div className="space-y-2.5">
            <CheckboxField
              label="--set-upstream"
              checked={setUpstream}
              onChange={setUpstreamOverride}
              hint={t("push.field.setUpstream.hint")}
            />
            <CheckboxField
              label="--tags"
              checked={tags}
              onChange={setTags}
              hint={t("push.field.tags.hint")}
            />
            <CheckboxField
              label="--force-with-lease"
              checked={force}
              onChange={setForce}
              hint={t("push.field.force.hint")}
            />
          </div>

          {force ? (
            <Callout tone="danger">
              {t("push.force.warning", {
                branch: branch || t("push.force.currentBranch"),
                remote,
              })}
            </Callout>
          ) : null}

          {selectedRemote?.https ? (
            <Callout tone="info">
              {t("push.https.note", { host: selectedRemote.host ?? t("push.https.theRemote") })}
            </Callout>
          ) : null}

          <CommandPreview argv={pushPreview(options)} />
          {force ? <HoldHint id="push-hold-hint" /> : null}
        </>
      )}
    </DialogShell>
  );
}
