/**
 * DIFF — o patch do arquivo, numerado dos DOIS lados.
 *
 * O que faltou no catalogo do Motion UI: nao ha componente de diff (nem faria
 * sentido ter — cor de adicao/remocao e vocabulario deste produto), entao a
 * grade e escrita a mao.
 *
 * A grade e UMA so para o arquivo inteiro, nao uma por hunk: assim as duas
 * colunas de numero tem a mesma largura do inicio ao fim do patch, em vez de
 * pularem de lugar quando um hunk passa da centena. O cabecalho de hunk ocupa
 * as quatro colunas.
 *
 * Em tela estreita (<768px, `useViewportValue(selectIsMobile)`) a grade vira
 * tres colunas com UM numero por linha — o da nova versao quando existe, o da
 * antiga em delecao pura — e o conteudo sobe para 13px; numeracao e fonte do
 * desktop ficam intocadas.
 *
 * Cor sai dos tokens `bg-diff-add-bg` / `text-diff-add-fg` e
 * `bg-diff-del-bg` / `text-diff-del-fg`. Nenhum hex.
 */
import { Fragment } from "react";
import type { DiffHunk, DiffLine, DiffPayload } from "@/types/git";
import { selectIsMobile, useViewportValue } from "@/hooks";
import { Rich, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { Notice } from "./parts.tsx";

/* ------------------------------------------------------------------ */

/* Em tela estreita a grade tem UMA coluna de numero (a nova quando existe,
   a antiga senao — delecao pura), com um espaco a menos de gutter: sobra
   largura para o conteudo embrulhar em vez de rolar. O desktop nao muda. */
const GUTTER_COMPACT = "px-1.5";

const GUTTER =
  "select-none px-2 py-0.5 text-right tabular-nums text-muted-foreground/70";

const MARKER = "select-none px-1 text-center";

/* O conteudo ja embrulha (`whitespace-pre-wrap break-words`): linha longa
   quebra, nunca empurra a pagina. Em tela estreita o mono sobe um ponto —
   legivel sem scroll horizontal. */
const CONTENT = "py-0.5 pr-3 whitespace-pre-wrap break-words";
const CONTENT_COMPACT = "text-[13px]";

const LINE_TONE: Record<DiffLine["kind"], string> = {
  add: "bg-diff-add-bg text-diff-add-fg",
  del: "bg-diff-del-bg text-diff-del-fg",
  context: "",
  meta: "text-muted-foreground italic",
};

const LINE_MARK: Record<DiffLine["kind"], string> = {
  add: "+",
  del: "-",
  context: " ",
  meta: "\\",
};

/** Soma do patch, para o resumo do cabecalho. */
export function countChanges(patch: DiffPayload | null): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const hunk of patch?.hunks ?? []) {
    for (const line of hunk.lines) {
      if (line.kind === "add") added += 1;
      else if (line.kind === "del") removed += 1;
    }
  }
  return { added, removed };
}

/** Acha, na resposta de `api.diff`, a entrada do caminho pedido. */
export function pickPatch(patches: DiffPayload[] | null, path: string): DiffPayload | null {
  if (!patches?.length) return null;
  return patches.find((p) => p.path === path || p.oldPath === path) ?? patches[0] ?? null;
}

/* ------------------------------------------------------------------ */

function HunkLines({ hunk, compact }: { hunk: DiffHunk; compact: boolean }) {
  return (
    <>
      <div
        className={cn(
          "border-y border-border bg-surface-inset px-3 py-1 text-muted-foreground",
          compact ? "col-span-3" : "col-span-4",
        )}
      >
        {hunk.header}
      </div>
      {hunk.lines.map((line, index) => {
        const tone = LINE_TONE[line.kind];
        return compact ? (
          <Fragment key={`${hunk.header}-${index}`}>
            <span className={cn(GUTTER, GUTTER_COMPACT, tone)}>
              {line.newNumber ?? line.oldNumber ?? ""}
            </span>
            <span className={cn(MARKER, tone)} aria-hidden="true">
              {LINE_MARK[line.kind]}
            </span>
            <span className={cn(CONTENT, CONTENT_COMPACT, tone)}>
              {line.content || " "}
            </span>
          </Fragment>
        ) : (
          <Fragment key={`${hunk.header}-${index}`}>
            <span className={cn(GUTTER, tone)}>{line.oldNumber ?? ""}</span>
            <span className={cn(GUTTER, tone)}>{line.newNumber ?? ""}</span>
            <span className={cn(MARKER, tone)} aria-hidden="true">
              {LINE_MARK[line.kind]}
            </span>
            <span className={cn(CONTENT, tone)}>{line.content || " "}</span>
          </Fragment>
        );
      })}
    </>
  );
}

export interface DiffViewProps {
  patch: DiffPayload | null;
  /** caminho pedido, para a mensagem quando o arquivo nao mudou neste commit */
  path: string;
}

export function DiffView({ patch, path }: DiffViewProps) {
  /* Booleano so (nao o viewport inteiro): re-render unico ao cruzar o corte
     de 768px, coalescido por rAF no proprio hook — nada de re-render a cada
     pixel de resize. */
  const compact = useViewportValue(selectIsMobile);

  if (!patch) {
    return (
      <div className="p-3">
        <Notice title={t("diff.noChanges.title")}>{t("diff.noChanges.body", { path })}</Notice>
      </div>
    );
  }

  if (patch.binary) {
    return (
      <div className="p-3">
        <Notice title={t("diff.binary.title")}>{t("diff.binary.body", { path: patch.path })}</Notice>
      </div>
    );
  }

  if (patch.hunks.length === 0) {
    return (
      <div className="p-3">
        <Notice title={t("diff.emptyPatch.title")}>{t("diff.emptyPatch.body")}</Notice>
      </div>
    );
  }

  return (
    /* `pb-safe-bottom` deixa a ultima linha acima da barra de gestos do iOS:
       o padding vem do token `--spacing-safe-bottom` e vale zero em desktop
       e em aparelho sem recorte. */
    <div
      className={cn(
        "grid items-start font-mono text-xs leading-relaxed pb-safe-bottom",
        compact
          ? "grid-cols-[auto_auto_1fr]"
          : "grid-cols-[auto_auto_auto_1fr]",
      )}
    >
      {patch.oldPath && patch.oldPath !== patch.path ? (
        <div
          className={cn(
            "border-b border-border px-3 py-1.5 text-muted-foreground",
            compact ? "col-span-3" : "col-span-4",
          )}
        >
          <Rich
            k="diff.renamedFrom"
            nodes={{ path: <span className="text-foreground">{patch.oldPath}</span> }}
          />
        </div>
      ) : null}
      {patch.hunks.map((hunk, index) => (
        <HunkLines key={`${hunk.header}-${index}`} hunk={hunk} compact={compact} />
      ))}
    </div>
  );
}
