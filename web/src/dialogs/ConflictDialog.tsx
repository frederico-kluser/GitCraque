/**
 * Conflito — aparece quando o repositorio fica com operacao pendente
 * (`repo.head.pending`), que e como uma operacao volta quando o git parou no
 * meio: rebase, merge, cherry-pick ou revert com arquivos em conflito.
 *
 * Dois modos:
 *  1. Lista de arquivos — clicar num arquivo abre o editor inline.
 *  2. Editor inline — navegacao entre regioes de conflito, botoes
 *     "Usar Nosso"/"Usar Deles"/"Ambos" por regiao, preview e stage.
 *
 * Abre sozinho, mas pode ser fechado: quem fecha nao ve de novo o MESMO estado
 * pendente. Os paineis reabrem com `openDialog({ kind: "conflict" })`.
 */
import { useCallback, useEffect, useState } from "react";
import { HoldToConfirmButton } from "@/components/motion-ui/hold-to-confirm";
import { api } from "@/lib/api";
import { Rich, t } from "@/i18n";
import type { MessageKey } from "@/i18n";
import { short } from "@/lib/utils";
import {
  resolveConflictsWithAgent,
  runOperation,
  selectAgent,
  selectAi,
  selectPending,
  useAppState,
} from "@/state/store";
import type { ConflictFile, ConflictRegion, PendingOperation } from "@/types/git";
import {
  Button,
  Callout,
  CommandPreview,
  DialogShell,
  Field,
  HoldHint,
} from "./parts";
import {
  abortPreview,
  continuePreview,
  resumableKind,
  resumeBody,
} from "./requests";
import { useLingering } from "./parts";
import { closeDialog, useDialogState } from "./store";

const KIND_KEY: Record<PendingOperation["kind"], MessageKey> = {
  rebase: "conflict.kind.rebase",
  "rebase-interactive": "conflict.kind.rebaseInteractive",
  merge: "conflict.kind.merge",
  "cherry-pick": "conflict.kind.cherryPick",
  revert: "conflict.kind.revert",
  bisect: "conflict.kind.bisect",
};

const kindLabel = (kind: PendingOperation["kind"]) => t(KIND_KEY[kind]);

const signatureOf = (p: PendingOperation | null) =>
  p ? `${p.kind}|${p.current ?? ""}|${p.step ?? ""}|${p.conflicts.join(",")}` : null;

/* ------------------------------------------------------------------ */
/* Editor inline de conflitos                                          */
/* ------------------------------------------------------------------ */

function ConflictEditor({
  file,
  onBack,
  onResolved,
}: {
  file: ConflictFile;
  onBack: () => void;
  onResolved: () => void;
}) {
  // Resolucao escolhida por regiao: null = nao resolvida ainda
  const [resolutions, setResolutions] = useState<(null | "ours" | "theirs" | "both")[]>(() =>
    file.regions.map(() => null),
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const regions = file.regions;
  const current = regions[currentIndex];
  const unresolvedCount = resolutions.filter((r) => r === null).length;
  const allResolved = unresolvedCount === 0;

  const resolveRegion = useCallback(
    (resolution: "ours" | "theirs" | "both") => {
      setResolutions((prev) => {
        const next = [...prev];
        next[currentIndex] = resolution;
        return next;
      });
      // Avanca para o proximo conflito nao resolvido
      const nextUnresolved = resolutions.findIndex(
        (r, i) => i > currentIndex && r === null,
      );
      if (nextUnresolved !== -1) {
        setCurrentIndex(nextUnresolved);
      }
    },
    [currentIndex, resolutions],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        path: file.path,
        resolutions: resolutions
          .map((r, i) => (r ? { region: i, resolution: r } : null))
          .filter((r): r is { region: number; resolution: "ours" | "theirs" | "both" } => r !== null),
      };
      await api.conflicts.resolve(body);
      onResolved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("conflict.editor.resolveFailed"));
    } finally {
      setSaving(false);
    }
  }, [file.path, resolutions, onResolved]);

  // Navegacao entre regioes
  const goTo = (delta: number) => {
    const next = currentIndex + delta;
    if (next >= 0 && next < regions.length) setCurrentIndex(next);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecalho */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors touch:inline-flex touch:min-h-tap touch:min-w-tap touch:items-center touch:justify-center touch:px-2"
        >
          ← {t("conflict.editor.back")}
        </button>
        <span className="text-xs text-muted-foreground">
          {t("conflict.editor.fileLabel")}:{" "}
          <code className="font-mono text-foreground">{file.path}</code>
        </span>
      </div>

      {/* Navegacao entre conflitos */}
      {regions.length > 0 ? (
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => goTo(-1)} disabled={currentIndex === 0}>
            ←
          </Button>
          <span className="text-xs font-medium text-muted-foreground">
            {t("conflict.editor.regionLabel", { index: currentIndex + 1 })}
            {" · "}
            {t("conflict.editor.navigate", { current: currentIndex + 1, total: regions.length, count: regions.length })}
          </span>
          <Button
            variant="ghost"
            onClick={() => goTo(1)}
            disabled={currentIndex >= regions.length - 1}
          >
            →
          </Button>
        </div>
      ) : null}

      {/* Regiao atual */}
      {current ? (
        <div className="flex flex-col gap-3">
          {/* Preview: Nosso */}
          <Field label={t("conflict.editor.previewOurs", { label: current.oursLabel || "HEAD" })}>
            <pre className="max-h-32 overflow-auto rounded-md border border-border bg-surface-inset p-2 font-mono text-xs whitespace-pre-wrap">
              {current.ours || (
                <span className="text-muted-foreground italic">(vazio)</span>
              )}
            </pre>
          </Field>

          {/* Preview: Deles */}
          <Field label={t("conflict.editor.previewTheirs", { label: current.theirsLabel || "MERGE_HEAD" })}>
            <pre className="max-h-32 overflow-auto rounded-md border border-border bg-surface-inset p-2 font-mono text-xs whitespace-pre-wrap">
              {current.theirs || (
                <span className="text-muted-foreground italic">(vazio)</span>
              )}
            </pre>
          </Field>

          {/* Botoes de resolucao */}
          {!resolutions[currentIndex] ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => resolveRegion("ours")}>
                {t("conflict.editor.ours")}
              </Button>
              <Button variant="secondary" onClick={() => resolveRegion("theirs")}>
                {t("conflict.editor.theirs")}
              </Button>
              <Button variant="secondary" onClick={() => resolveRegion("both")}>
                {t("conflict.editor.both")}
              </Button>
            </div>
          ) : (
            <Callout tone="info">
              {t("conflict.editor.resolved")}
            </Callout>
          )}
        </div>
      ) : regions.length === 0 ? (
        <Callout tone="warning">
          {t("conflict.noFiles")}
        </Callout>
      ) : null}

      {/* Status de conflitos restantes */}
      {unresolvedCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("conflict.editor.remaining", { count: unresolvedCount })}
        </p>
      ) : allResolved && regions.length > 0 ? (
        <Callout tone="info">{t("conflict.editor.allResolved")}</Callout>
      ) : null}

      {/* Botao de salvar */}
      {allResolved && regions.length > 0 ? (
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? t("common.running") : t("conflict.editor.saveResolve")}
          </Button>
          {saveError ? <span className="text-xs text-destructive">{saveError}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dialogo principal                                                   */
/* ------------------------------------------------------------------ */

export function ConflictDialog() {
  const pending = useAppState(selectPending);
  const ai = useAppState(selectAi);
  const agent = useAppState(selectAgent);
  const spec = useDialogState();
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Estado do editor inline
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [editorData, setEditorData] = useState<ConflictFile | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);

  const requested = spec?.kind === "conflict";
  const signature = signatureOf(pending);
  const open = pending !== null && (requested || dismissed !== signature);
  const shown = useLingering(pending);

  // Carrega o arquivo de conflito quando o usuario clica
  const openFile = useCallback(async (filePath: string) => {
    setEditingFile(filePath);
    setEditorLoading(true);
    setEditorData(null);
    try {
      const data = await api.conflicts.file(filePath);
      setEditorData(data);
    } catch {
      setEditingFile(null);
    } finally {
      setEditorLoading(false);
    }
  }, []);

  const closeEditor = useCallback(() => {
    setEditingFile(null);
    setEditorData(null);
  }, []);

  const onFileResolved = useCallback(() => {
    setEditingFile(null);
    setEditorData(null);
  }, []);

  // Fecha o editor se o pending mudar (ex.: abortou)
  useEffect(() => {
    if (!shown) {
      setEditingFile(null);
      setEditorData(null);
    }
  }, [shown]);

  if (!shown) return null;

  const close = () => {
    setDismissed(signature);
    setEditingFile(null);
    setEditorData(null);
    if (requested) closeDialog();
  };

  const kind = resumableKind(shown.kind);

  const resume = () => {
    if (!kind) return;
    close();
    void runOperation(
      t("conflict.op.continue", { kind: kindLabel(shown.kind) }),
      () => api.continueOp(resumeBody(kind)),
      { refresh: "rebase-state", successMessage: t("conflict.done.resumed") },
    );
  };

  const abort = () => {
    if (!kind) return;
    close();
    void runOperation(
      t("conflict.op.abort", { kind: kindLabel(shown.kind) }),
      () => api.abort(resumeBody(kind)),
      { refresh: "rebase-state", successMessage: t("conflict.done.aborted") },
    );
  };

  const podeIA = shown.conflicts.length > 0 && ai.hasKey && agent.phase !== "running";

  const resolverComIA = () => {
    close();
    void resolveConflictsWithAgent();
  };

  const progress =
    shown.step && shown.total ? t("conflict.progress", { step: shown.step, total: shown.total }) : "";

  // No modo editor, o titulo muda
  const title = editingFile
    ? t("conflict.editor.title", { path: editingFile })
    : t("conflict.title", { kind: kindLabel(shown.kind), progress });

  return (
    <DialogShell
      open={open}
      onClose={close}
      title={title}
      description={
        editingFile
          ? null
          : shown.conflicts.length > 0
            ? t("conflict.description.conflicts")
            : t("conflict.description.clean")
      }
      tone="destructive"
      onEnter={kind && !editingFile ? resume : undefined}
      footer={editingFile ? null : (
        <>
          <Button variant="ghost" onClick={close}>
            {t("common.close")}
          </Button>
          {podeIA ? (
            <Button variant="ghost" onClick={resolverComIA}>
              {t("conflict.ai.action")}
            </Button>
          ) : null}
          {kind ? (
            <>
              <HoldToConfirmButton
                onConfirm={abort}
                aria-describedby="conflict-hold-hint"
                className="w-48"
              >
                {t("conflict.hold")}
              </HoldToConfirmButton>
              <Button variant="primary" onClick={resume}>
                {t("conflict.continue")}
              </Button>
            </>
          ) : null}
        </>
      )}
    >
      {/* Modo editor */}
      {editingFile ? (
        editorLoading ? (
          <Callout tone="info">{t("common.running")}</Callout>
        ) : editorData ? (
          <ConflictEditor
            file={editorData}
            onBack={closeEditor}
            onResolved={onFileResolved}
          />
        ) : (
          <Callout tone="warning">{t("conflict.editor.resolveFailed")}</Callout>
        )
      ) : (
        <>
          {shown.current ? (
            <Callout tone="info">
              <Rich
                k="conflict.applying"
                nodes={{ hash: <code className="font-mono">{short(shown.current)}</code> }}
              />
            </Callout>
          ) : null}

          {shown.conflicts.length > 0 ? (
            <Field
              label={t("conflict.files", { count: shown.conflicts.length })}
              hint={t("conflict.files.hint")}
            >
              <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                {shown.conflicts.map((path) => (
                  <li key={path}>
                    <button
                      type="button"
                      onClick={() => openFile(path)}
                      className="w-full bg-surface-inset px-3 py-2 font-mono text-xs text-destructive hover:bg-surface-rail text-left transition-colors cursor-pointer touch:min-h-tap touch:py-2.5"
                    >
                      {path}
                    </button>
                  </li>
                ))}
              </ul>
            </Field>
          ) : (
            <Callout tone="warning">{t("conflict.noFiles")}</Callout>
          )}

          {kind ? (
            <>
              <CommandPreview argv={continuePreview(kind)} label={t("conflict.preview.continue")} />
              <CommandPreview argv={abortPreview(kind)} label={t("conflict.preview.abort")} />
              <HoldHint id="conflict-hold-hint">{t("conflict.holdHint")}</HoldHint>
            </>
          ) : (
            <Callout tone="warning">
              {t("conflict.unsupported", { kind: kindLabel(shown.kind) })}
            </Callout>
          )}
        </>
      )}
    </DialogShell>
  );
}
