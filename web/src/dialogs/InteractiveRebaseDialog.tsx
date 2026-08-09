/**
 * Rebase interativo visual: o usuario define a acao de cada commit selecionado
 * (pick, reword, squash, fixup, drop) e opcionalmente reordena com botoes
 * Mover Cima/Baixo.
 *
 * O backend faz `GIT_SEQUENCE_EDITOR="node proxy-editor.mjs" git rebase -i <base>`
 * com ENV_REBASE_HASHES e ENV_REBASE_ACTIONS. Para acoes "reword", o
 * proxy-editor tambem e usado como GIT_EDITOR com uma fila de mensagens.
 */
import { useCallback, useMemo, useState } from "react";
import { HoldToConfirmButton } from "@/components/motion-ui/hold-to-confirm";
import { api } from "@/lib/api";
import { t } from "@/i18n";
import { short, truncate } from "@/lib/utils";
import { runOperation, selectCommits, useAppState } from "@/state/store";
import type { RawCommit, RebaseInteractiveAction } from "@/types/git";
import {
  Button,
  Callout,
  CommandPreview,
  DialogShell,
  Field,
  HoldHint,
} from "./parts";
import {
  type RebaseInteractiveOptions,
  rebaseInteractiveBody,
  rebaseInteractivePreview,
} from "./requests";

const CONTROL_CLASS =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export interface InteractiveRebaseDialogProps {
  open: boolean;
  commits: string[];
  onClose: () => void;
}

const ACTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "pick", label: "pick" },
  { value: "reword", label: "reword" },
  { value: "squash", label: "squash" },
  { value: "fixup", label: "fixup" },
  { value: "drop", label: "drop" },
];

/** Ordena os hashes pela ordem topologica do log (o mais ANTIGO primeiro). */
function orderTopological(hashes: string[], log: RawCommit[]): string[] {
  const index = new Map(log.map((c, i) => [c.hash, i]));
  return [...new Set(hashes)].sort((a, b) => (index.get(b) ?? -1) - (index.get(a) ?? -1));
}

export function InteractiveRebaseDialog({ open, commits, onClose }: InteractiveRebaseDialogProps) {
  const log = useAppState(selectCommits);
  const byHash = useMemo(() => new Map(log.map((c) => [c.hash, c])), [log]);

  const orderedRef = useMemo(() => orderTopological(commits, log), [commits, log]);
  const [ordered, setOrdered] = useState<string[]>(orderedRef);
  const [initialCommitKey, setInitialCommitKey] = useState("");
  const [actionMap, setActionMap] = useState<Record<string, RebaseInteractiveAction>>({});
  const [messageMap, setMessageMap] = useState<Record<string, string>>({});

  // Reset state when commits change
  if (initialCommitKey !== commits.join(",")) {
    setOrdered(orderedRef);
    setActionMap({});
    setMessageMap({});
    setInitialCommitKey(commits.join(","));
  }

  const root = ordered.length > 0 && byHash.get(ordered[0])?.parents.length === 0;
  const enough = ordered.length >= 2;

  const moveUp = useCallback((idx: number) => {
    if (idx <= 0) return;
    setOrdered((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((idx: number) => {
    setOrdered((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  const setAction = useCallback((hash: string, action: RebaseInteractiveAction) => {
    setActionMap((prev) => {
      if (action === "pick") {
        const next = { ...prev };
        delete next[hash];
        return next;
      }
      return { ...prev, [hash]: action };
    });
    if (action !== "reword") {
      setMessageMap((prev) => {
        const next = { ...prev };
        delete next[hash];
        return next;
      });
    }
  }, []);

  const setMessage = useCallback((hash: string, msg: string) => {
    setMessageMap((prev) => ({ ...prev, [hash]: msg }));
  }, []);

  const options = useMemo((): RebaseInteractiveOptions => ({
    commits: ordered,
    actionMap,
    messageMap,
    root,
  }), [ordered, actionMap, messageMap, root]);

  const run = () => {
    onClose();
    void runOperation(t("rebaseInteractive.op"), () =>
      api.rebaseInteractive(rebaseInteractiveBody(options)),
      {
        refresh: "all",
        successMessage: t("rebaseInteractive.done", { count: ordered.length }),
      },
    );
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={t("rebaseInteractive.title", { count: ordered.length })}
      description={t("rebaseInteractive.description")}
      tone="destructive"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {enough ? (
            <HoldToConfirmButton onConfirm={run} aria-describedby="rebase-interactive-hold-hint">
              {t("rebaseInteractive.hold")}
            </HoldToConfirmButton>
          ) : null}
        </>
      }
    >
      {!enough ? (
        <Callout tone="warning">
          {t("rebaseInteractive.needTwo", { count: ordered.length })}
        </Callout>
      ) : (
        <>
          <Callout tone="danger">{t("rebaseInteractive.warning")}</Callout>

          <Field label={t("rebaseInteractive.plan")} hint={t("rebaseInteractive.plan.hint")}>
            <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {ordered.map((hash, idx) => {
                const commit = byHash.get(hash);
                const action = actionMap[hash] || "pick";
                const isReword = action === "reword";

                return (
                  <div key={hash} className="space-y-2 bg-surface-inset px-3 py-2">
                    <div className="flex items-center gap-2 touch:flex-wrap">
                      <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">
                        {idx + 1}
                      </span>

                      <select
                        value={action}
                        onChange={(e) => setAction(hash, e.target.value as RebaseInteractiveAction)}
                        className="h-8 w-24 shrink-0 rounded-md border border-border bg-surface px-2 text-xs text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring touch:min-h-tap"
                        aria-label={`${t("rebaseInteractive.actionFor")} ${short(hash)}`}
                      >
                        {ACTION_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>

                      <code className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                        {short(hash)}
                      </code>
                      <span className="min-w-0 truncate text-xs text-foreground">
                        {commit ? truncate(commit.subject, 60) : t("squash.outOfLog")}
                      </span>

                      <div className="ml-auto flex shrink-0 gap-0.5">
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-xs text-muted-foreground transition-colors hover:bg-surface hover:text-foreground disabled:opacity-30 touch:size-tap"
                          aria-label={t("rebaseInteractive.moveUp")}
                          disabled={idx === 0}
                          onClick={() => moveUp(idx)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-xs text-muted-foreground transition-colors hover:bg-surface hover:text-foreground disabled:opacity-30 touch:size-tap"
                          aria-label={t("rebaseInteractive.moveDown")}
                          disabled={idx >= ordered.length - 1}
                          onClick={() => moveDown(idx)}
                        >
                          ↓
                        </button>
                      </div>
                    </div>

                    {isReword && (
                      <div className="pl-8">
                        <textarea
                          value={messageMap[hash] ?? ""}
                          onChange={(e) => setMessage(hash, e.target.value)}
                          placeholder={t("rebaseInteractive.reword.placeholder")}
                          className={`${CONTROL_CLASS} min-h-[48px]`}
                          rows={2}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("rebaseInteractive.reword.hint")}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Field>

          <CommandPreview
            argv={rebaseInteractivePreview(options)}
            label={t("rebaseInteractive.preview")}
          />
          <HoldHint id="rebase-interactive-hold-hint" />
        </>
      )}
    </DialogShell>
  );
}
