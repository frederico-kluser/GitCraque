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

const STATE_LABEL: Record<PushState, string> = {
  idle: "Enviar",
  enviando: "Enviando...",
  ok: "Enviado",
  erro: "Falhou",
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
    const result = await runOperation(
      `Push para ${remote}`,
      () => api.push(pushBody(options)),
      { refresh: "refs", successMessage: `Push para ${remote} concluido` },
    );
    if (result?.ok) {
      setState("ok");
      confettiRef.current?.burst();
    } else {
      setState("erro");
    }
  };

  const branchOptions = branches.map((b) => ({
    value: b.name,
    label: b.upstream ? `${b.name} → ${b.upstream}` : `${b.name} (sem upstream)`,
  }));
  if (branch && !branches.some((b) => b.name === branch)) {
    branchOptions.unshift({ value: branch, label: branch });
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title="Push"
      description="Envia os commits do ramo escolhido para o remoto."
      onEnter={force ? undefined : run}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
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
                Segure para push --force-with-lease
              </HoldToConfirmButton>
            ) : (
              <MultiStateButton
                state={state}
                onClick={run}
                disabled={!ready}
                surfaceClassName={STATE_SURFACE[state]}
                feedback={state === "erro" ? "shake" : state === "ok" ? "pop" : "none"}
                announce={`Push: ${STATE_LABEL[state]}`}
                aria-label={`Enviar ${branch || "ramo atual"} para ${remote || "remoto"}`}
              >
                {STATE_LABEL[state]}
              </MultiStateButton>
            )}
          </div>
        </>
      }
    >
      {remotes.length === 0 ? (
        <>
          <Callout tone="warning">
            Este repositorio nao tem nenhum remoto configurado, entao nao ha para onde
            enviar.
          </Callout>
          <Button variant="primary" onClick={() => openDialog({ kind: "add-remote" })}>
            Adicionar remoto
          </Button>
        </>
      ) : (
        <>
          {remotes.length <= 3 ? (
            <Field label="Remoto" hint={selectedRemote?.pushUrl}>
              <SegmentedToggle
                value={remote}
                onChange={setRemote}
                ariaLabel="Remoto de destino"
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
              label="Remoto"
              value={remote}
              onChange={setRemote}
              options={remotes.map((r) => ({ value: r.name, label: `${r.name} — ${r.pushUrl}` }))}
              hint={selectedRemote?.pushUrl}
            />
          )}

          <SelectField
            label="Ramo"
            value={branch}
            onChange={setBranch}
            options={branchOptions}
            hint={
              branchInfo
                ? `${branchInfo.ahead} commits a frente, ${branchInfo.behind} atras do upstream.`
                : "Sem upstream configurado."
            }
          />

          <div className="space-y-2.5">
            <CheckboxField
              label="--set-upstream"
              checked={setUpstream}
              onChange={setUpstreamOverride}
              hint="Passa a acompanhar o ramo remoto depois deste push."
            />
            <CheckboxField
              label="--tags"
              checked={tags}
              onChange={setTags}
              hint="Envia junto todas as tags locais."
            />
            <CheckboxField
              label="--force-with-lease"
              checked={force}
              onChange={setForce}
              hint="Sobrescreve o ramo remoto, mas so se ele estiver onde voce viu por ultimo."
            />
          </div>

          {force ? (
            <Callout tone="danger">
              O ramo {branch || "atual"} sera SOBRESCRITO em {remote}. Quem ja tinha
              baixado os commits antigos vai precisar rebasear.
            </Callout>
          ) : null}

          {selectedRemote?.https ? (
            <Callout tone="info">
              {selectedRemote.host ?? "O remoto"} usa https: se o cofre nao tiver a
              credencial, o GitCraque vai pedir usuario e token aqui mesmo, sem travar o
              git.
            </Callout>
          ) : null}

          <CommandPreview argv={pushPreview(options)} />
          {force ? <HoldHint id="push-hold-hint" /> : null}
        </>
      )}
    </DialogShell>
  );
}
