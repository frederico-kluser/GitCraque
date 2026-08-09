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
import { formatBytes, t } from "@/i18n";
import type { MessageKey } from "@/i18n";
import { cn, short } from "@/lib/utils";
import { isMarkdownPath, type OpenFile } from "@/state/store";
import { countChanges, DiffView, pickPatch } from "./DiffView.tsx";
import { MarkdownView } from "./MarkdownView.tsx";
import { CloseIcon, CodeSkeleton, IconButton, Meta, Notice } from "./parts.tsx";
import { RawView, toLines } from "./RawView.tsx";
import { useDiffResource, useFileContentResource } from "./useFileResource.ts";

/* ------------------------------------------------------------------ */
/* Modos                                                               */
/* ------------------------------------------------------------------ */

export type ViewerMode = "diff" | "markdown" | "raw";

const MODE_LABEL: Record<ViewerMode, MessageKey> = {
  diff: "viewer.mode.diff",
  markdown: "viewer.mode.markdown",
  raw: "viewer.mode.raw",
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
  const origem = file.hash ? short(file.hash) : t("viewer.workingTree");

  return (
    <header className="shrink-0 border-b border-border bg-card">
      <div className="flex items-center gap-2 px-3 pt-2">
        <p className="min-w-0 flex-1 truncate font-mono text-xs" title={file.path}>
          <span className="text-muted-foreground">{dir}</span>
          <span className="font-medium text-foreground">{base}</span>
        </p>
        <Meta title={file.hash ?? t("viewer.workingTreeTitle")}>{origem}</Meta>
        <CopyButton
          variant="icon"
          value={file.path}
          label={t("viewer.copyPath")}
          copiedLabel={t("viewer.pathCopied")}
        />
        <IconButton label={t("viewer.close")} onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </div>

      <div className="flex items-center gap-3 px-3 py-2">
        <SegmentedToggle
          value={mode}
          onChange={onMode}
          ariaLabel={t("viewer.mode.aria")}
          className="p-0.5"
        >
          {modes.map((option) => (
            /* `touch:min-h-tap` so sob toque (ou alvos forçados): a pilula
               inteira passa a ter 44px de altura, sem mudar o desktop. */
            <SegmentedToggleOption
              key={option}
              value={option}
              className="px-3 py-1 text-xs touch:min-h-tap touch:px-3"
            >
              {t(MODE_LABEL[option])}
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
        {t("viewer.empty.title")}
      </StaggerRevealHeadline>
      <StaggerRevealItem as="p" className="max-w-sm text-xs text-muted-foreground">
        {t("viewer.empty.body")}
      </StaggerRevealItem>
    </StaggerReveal>
  );
}

/* ------------------------------------------------------------------ */
/* Visualizador                                                        */
/* ------------------------------------------------------------------ */

/**
 * O que o visualizador entrega a quem monta o menu de contexto dele.
 *
 * O visualizador nao decide o que oferecer — ele nao conhece as acoes do app.
 * Ele so diz ONDE foi o clique, O QUE esta marcado e QUAIS modos existem; quem
 * traduz isso em itens e o painel que o hospeda. Mesmo arranjo que o grafo usa
 * para `onRefActivate`.
 */
export interface ViewerMenuEvent {
  x: number;
  y: number;
  /** texto marcado dentro do visualizador, "" quando nao ha nada */
  selection: string;
  mode: ViewerMode;
  modes: ViewerMode[];
  modeLabel: (mode: ViewerMode) => string;
  onMode: (mode: ViewerMode) => void;
}

export interface FileViewerProps {
  file: OpenFile | null;
  onClose?: () => void;
  onMenu?: (event: ViewerMenuEvent) => void;
  className?: string;
}

export function FileViewer({ file, onClose, onMenu, className }: FileViewerProps) {
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
    /* `text-size-adjust:100%` segura a inflacao automatica de fonte do iOS
       Safari quando a pagina esta num container com scroll proprio — sem
       isso, em orientacao de paisagem o conteudo cresce e o scroll horizontal
       reaparece. No desktop a propriedade e no-op. */
    <section
      className={cn(
        "flex h-full min-h-0 flex-col bg-card [text-size-adjust:100%]",
        className,
      )}
      aria-label={t("viewer.label", { path: file.path })}
      /* A selecao e lida NA HORA do clique: o menu precisa saber se ha um trecho
         marcado para oferecer "copiar a selecao" — e o unico uso real que o menu
         do navegador tinha aqui. */
      onContextMenu={
        onMenu
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              onMenu({
                x: event.clientX,
                y: event.clientY,
                selection: window.getSelection()?.toString() ?? "",
                mode: activeMode,
                modes,
                modeLabel: (m) => t(MODE_LABEL[m]),
                onMode: setMode,
              });
            }
          : undefined
      }
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
  mode === "diff" ? t("viewer.error.patch") : t("viewer.error.file");

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
  return t("viewer.summary.lines", {
    count: toLines(content.content).length,
    size: formatBytes(content.size),
  });
}
