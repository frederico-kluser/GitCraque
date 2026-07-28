/**
 * Squash dos commits selecionados no grafo.
 *
 * O backend faz `GIT_SEQUENCE_EDITOR="node proxy-editor.mjs" git rebase -i <base>`
 * — nao ha emulador de terminal. A UI mostra o plano exatamente como o
 * proxy-editor vai deixar o `git-rebase-todo`: o mais ANTIGO continua `pick`,
 * todos os outros viram `squash` (ou `fixup`, que descarta as mensagens).
 */
import { useMemo, useState } from "react";
import { HoldToConfirmButton } from "@/components/motion-ui/hold-to-confirm";
import {
  SegmentedToggle,
  SegmentedToggleOption,
} from "@/components/motion-ui/segmented-toggle";
import { api } from "@/lib/api";
import { t } from "@/i18n";
import { short, truncate } from "@/lib/utils";
import { runOperation, selectCommits, useAppState } from "@/state/store";
import type { RawCommit } from "@/types/git";
import {
  Button,
  Callout,
  CommandPreview,
  DialogShell,
  Field,
  HoldHint,
  TextAreaField,
} from "./parts";
import { squashPlan, squashPreview, squashRequest } from "./requests";

export interface SquashDialogProps {
  open: boolean;
  commits: string[];
  onClose: () => void;
}

/** Ordena os hashes pela ordem topologica do log (o mais ANTIGO primeiro). */
function orderTopological(hashes: string[], log: RawCommit[]): string[] {
  const index = new Map(log.map((c, i) => [c.hash, i]));
  // O log vem do mais novo para o mais antigo: indice maior = mais antigo.
  return [...new Set(hashes)].sort((a, b) => (index.get(b) ?? -1) - (index.get(a) ?? -1));
}

export function SquashDialog({ open, commits, onClose }: SquashDialogProps) {
  const log = useAppState(selectCommits);
  const [mode, setMode] = useState<"squash" | "fixup">("squash");
  const [message, setMessage] = useState("");

  const ordered = useMemo(() => orderTopological(commits, log), [commits, log]);
  const byHash = useMemo(() => new Map(log.map((c) => [c.hash, c])), [log]);
  const fixup = mode === "fixup";
  const root = ordered.length > 0 && byHash.get(ordered[0])?.parents.length === 0;
  const options = { commits: ordered, message: message.trim() || undefined, fixup, root };
  const plan = squashPlan(options);
  const enough = ordered.length >= 2;

  const run = () => {
    onClose();
    void runOperation(t("squash.op"), () => api.squash(squashRequest(options)), {
      refresh: "all",
      successMessage: t("squash.done", { count: ordered.length }),
    });
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t("squash.title", { count: ordered.length })}
      description={t("squash.description")}
      tone="destructive"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {enough ? (
            <HoldToConfirmButton onConfirm={run} aria-describedby="squash-hold-hint">
              {t("squash.hold")}
            </HoldToConfirmButton>
          ) : null}
        </>
      }
    >
      {!enough ? (
        <Callout tone="warning">{t("squash.needTwo", { count: ordered.length })}</Callout>
      ) : (
        <>
          <Callout tone="danger">{t("squash.warning")}</Callout>

          <Field label={t("squash.plan")} hint={t("squash.plan.hint")}>
            <ol className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {plan.map((line) => {
                const commit = byHash.get(line.hash);
                return (
                  <li
                    key={line.hash}
                    className="flex items-center gap-3 bg-surface-inset px-3 py-2 text-xs"
                  >
                    <span
                      className={
                        line.action === "pick"
                          ? "w-12 shrink-0 font-mono font-semibold text-success"
                          : "w-12 shrink-0 font-mono text-warning"
                      }
                    >
                      {line.action}
                    </span>
                    <code className="shrink-0 font-mono text-muted-foreground">
                      {short(line.hash)}
                    </code>
                    <span className="truncate text-foreground">
                      {commit ? truncate(commit.subject, 90) : t("squash.outOfLog")}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Field>

          <Field
            label={t("squash.mode")}
            hint={fixup ? t("squash.mode.fixupHint") : t("squash.mode.squashHint")}
          >
            <SegmentedToggle
              value={mode}
              onChange={(value) => setMode(value as "squash" | "fixup")}
              ariaLabel={t("squash.mode.aria")}
              className="w-fit"
            >
              <SegmentedToggleOption value="squash">squash</SegmentedToggleOption>
              <SegmentedToggleOption value="fixup">fixup</SegmentedToggleOption>
            </SegmentedToggle>
          </Field>

          <TextAreaField
            label={t("squash.message")}
            value={message}
            onChange={setMessage}
            disabled={fixup}
            placeholder={
              fixup ? t("squash.message.fixupPlaceholder") : t("squash.message.placeholder")
            }
            hint={fixup ? t("squash.message.fixupHint") : t("squash.message.hint")}
          />

          <CommandPreview argv={squashPreview(options)} label={t("squash.preview")} />
          <HoldHint id="squash-hold-hint" />
        </>
      )}
    </DialogShell>
  );
}
