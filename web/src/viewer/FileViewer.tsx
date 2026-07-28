/**
 * VISUALIZADOR DE ARQUIVO — a casca dos tres modos.
 *
 * Montagem, pela cascata do Motion UI: `SegmentedToggle` alterna os modos,
 * `Skeleton` cobre a carga, `CopyButton` copia o caminho, `StaggerReveal` faz o
 * estado vazio entrar. O que sobrou — o cabecalho, o botao de fechar, as
 * grades de diff e de linha crua — nao tem equivalente no catalogo e esta
 * escrito a mao em `parts.tsx`, `DiffView.tsx` e `RawView.tsx`.
 *
 * Movimento: `useMotionUITransition("ui")` na troca de modo, so `opacity` e
 * `transform`, com a distancia saindo de `theme.travel` — nenhum numero na mao.
 */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CopyButton } from "@/components/motion-ui/copy-button";
import { SegmentedToggle, SegmentedToggleOption } from "@/components/motion-ui/segmented-toggle";
import {
  StaggerReveal,
  StaggerRevealHeadline,
  StaggerRevealItem,
} from "@/components/motion-ui/stagger-reveal";
import { useMotionUITheme, useMotionUITransition } from "@/components/motion-ui/ui-theme";
import { cn, short } from "@/lib/utils";
import { isMarkdownPath, type OpenFile } from "@/state/store";
import { countChanges, DiffView, pickPatch } from "./DiffView.tsx";
import { MarkdownView } from "./MarkdownView.tsx";
import { CloseIcon, CodeSkeleton, IconButton, Meta, Notice } from "./parts.tsx";
import { formatBytes, RawView, toLines } from "./RawView.tsx";
import { useDiffResource, useFileContentResource } from "./useFileResource.ts";

/* ------------------------------------------------------------------ */
/* Modos                                                               */
/* ------------------------------------------------------------------ */

export type ViewerMode = "diff" | "markdown" | "raw";

const MODE_LABEL: Record<ViewerMode, string> = {
  diff: "Diff",
  markdown: "Formatado",
  raw: "Cru",
};

/** Diff e sempre o padrao; "Formatado" so existe quando o arquivo e markdown. */
const modesFor = (path: string): ViewerMode[] =>
  isMarkdownPath(path) ? ["diff", "markdown", "raw"] : ["diff", "raw"];

/* ------------------------------------------------------------------ */
/* Cabecalho                                                           */
/* ------------------------------------------------------------------ */

/** `src/app/App.tsx` -> `{ dir: "src/app/", base: "App.tsx" }` */
function splitPath(path: string) {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? { dir: "", base: path } : { dir: path.slice(0, cut + 1), base: path.slice(cut + 1) };
}

interface HeaderProps {
  file: OpenFile;
  mode: ViewerMode;
  modes: ViewerMode[];
  onMode: (mode: ViewerMode) => void;
  summary: string | null;
  onClose?: () => void;
}

function Header({ file, mode, modes, onMode, summary, onClose }: HeaderProps) {
  const { dir, base } = splitPath(file.path);
  const origem = file.hash ? short(file.hash) : "working tree";

  return (
    <header className="shrink-0 border-b border-border bg-card">
      <div className="flex items-center gap-2 px-3 pt-2">
        <p className="min-w-0 flex-1 truncate font-mono text-xs" title={file.path}>
          <span className="text-muted-foreground">{dir}</span>
          <span className="font-medium text-foreground">{base}</span>
        </p>
        <Meta title={file.hash ?? "arquivo da working tree"}>{origem}</Meta>
        <CopyButton
          variant="icon"
          value={file.path}
          label="Copiar o caminho do arquivo"
          copiedLabel="Caminho copiado"
        />
        <IconButton label="Fechar o visualizador" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </div>

      <div className="flex items-center gap-3 px-3 py-2">
        <SegmentedToggle
          value={mode}
          onChange={onMode}
          ariaLabel="Modo de exibicao do arquivo"
          className="p-0.5"
        >
          {modes.map((option) => (
            <SegmentedToggleOption key={option} value={option} className="px-3 py-1 text-xs">
              {MODE_LABEL[option]}
            </SegmentedToggleOption>
          ))}
        </SegmentedToggle>
        {summary ? (
          <span className="truncate font-mono text-xs text-muted-foreground">{summary}</span>
        ) : null}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Estado vazio                                                        */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <StaggerReveal className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <StaggerRevealHeadline as="h2" className="text-sm font-medium text-foreground">
        Nenhum arquivo aberto
      </StaggerRevealHeadline>
      <StaggerRevealItem as="p" className="max-w-sm text-xs text-muted-foreground">
        Escolha um arquivo no detalhe do commit ou no painel de alteracoes. Ele aparece aqui em
        diff, formatado (quando for markdown) e cru.
      </StaggerRevealItem>
    </StaggerReveal>
  );
}

/* ------------------------------------------------------------------ */
/* Visualizador                                                        */
/* ------------------------------------------------------------------ */

export interface FileViewerProps {
  file: OpenFile | null;
  onClose?: () => void;
  className?: string;
}

export function FileViewer({ file, onClose, className }: FileViewerProps) {
  const [mode, setMode] = useState<ViewerMode>("diff");

  const modes: ViewerMode[] = useMemo(() => (file ? modesFor(file.path) : ["diff"]), [file]);
  // Trocar para um arquivo que nao e markdown com a aba "Formatado" aberta
  // deixaria o toggle apontando para um modo que nao existe mais.
  useEffect(() => {
    if (!modes.includes(mode)) setMode("diff");
  }, [modes, mode]);
  const activeMode: ViewerMode = modes.includes(mode) ? mode : "diff";

  const diff = useDiffResource(file, activeMode === "diff");
  const content = useFileContentResource(file, activeMode !== "diff");

  const patch = useMemo(
    () => (file ? pickPatch(diff.data, file.path) : null),
    [diff.data, file],
  );

  const transition = useMotionUITransition("ui");
  const { motionMode, travel } = useMotionUITheme();
  const travelY = motionMode === "full" ? travel.hover : 0;

  if (!file) {
    return (
      <section className={cn("flex h-full min-h-0 flex-col bg-card", className)}>
        <EmptyState />
      </section>
    );
  }

  const resource = activeMode === "diff" ? diff : content;
  const summary = buildSummary(activeMode, patch, content.data);

  return (
    <section
      className={cn("flex h-full min-h-0 flex-col bg-card", className)}
      aria-label={`Visualizador de ${file.path}`}
    >
      <Header
        file={file}
        mode={activeMode}
        modes={modes}
        onMode={setMode}
        summary={summary}
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 overflow-auto">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${file.hash ?? "wt"}:${file.path}:${activeMode}:${resource.loading}`}
            initial={{ opacity: 0, transform: `translateY(${travelY}px)` }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={{ opacity: 0, transform: `translateY(${-travelY}px)` }}
            transition={{ ...transition }}
          >
            {resource.loading ? (
              <CodeSkeleton />
            ) : resource.error ? (
              <div className="p-3">
                <Notice tone="error" title={errorTitle(activeMode)}>
                  {resource.error}
                </Notice>
              </div>
            ) : activeMode === "diff" ? (
              <DiffView patch={patch} path={file.path} />
            ) : activeMode === "markdown" ? (
              <MarkdownView
                source={content.data?.content ?? ""}
                truncated={content.data?.truncated}
              />
            ) : content.data ? (
              <RawView payload={content.data} />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const errorTitle = (mode: ViewerMode) =>
  mode === "diff" ? "Nao foi possivel ler o patch" : "Nao foi possivel ler o arquivo";

/** A linha de metadados ao lado do toggle, dependente do modo. */
function buildSummary(
  mode: ViewerMode,
  patch: ReturnType<typeof pickPatch>,
  content: { size: number; content: string; binary: boolean } | null,
): string | null {
  if (mode === "diff") {
    if (!patch || patch.binary) return null;
    const { added, removed } = countChanges(patch);
    return `+${added} −${removed}`;
  }
  if (!content) return null;
  if (content.binary) return formatBytes(content.size);
  return `${toLines(content.content).length} linhas · ${formatBytes(content.size)}`;
}
