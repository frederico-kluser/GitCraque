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
 * Cor sai dos tokens `bg-diff-add-bg` / `text-diff-add-fg` e
 * `bg-diff-del-bg` / `text-diff-del-fg`. Nenhum hex.
 */
import { Fragment } from "react";
import type { DiffHunk, DiffLine, DiffPayload } from "@/types/git";
import { cn } from "@/lib/utils";
import { Notice } from "./parts.tsx";

/* ------------------------------------------------------------------ */

const GUTTER =
  "select-none px-2 py-0.5 text-right tabular-nums text-muted-foreground/70";

const MARKER = "select-none px-1 text-center";

const CONTENT = "py-0.5 pr-3 whitespace-pre-wrap break-words";

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

function HunkLines({ hunk }: { hunk: DiffHunk }) {
  return (
    <>
      <div className="col-span-4 border-y border-border bg-surface-inset px-3 py-1 text-muted-foreground">
        {hunk.header}
      </div>
      {hunk.lines.map((line, index) => {
        const tone = LINE_TONE[line.kind];
        return (
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
  if (!patch) {
    return (
      <div className="p-3">
        <Notice title="Sem alteracoes neste commit">
          {path} nao foi tocado aqui — o conteudo esta nas abas Cru e Formatado.
        </Notice>
      </div>
    );
  }

  if (patch.binary) {
    return (
      <div className="p-3">
        <Notice title="Arquivo binario">Git nao gera patch de texto para {patch.path}.</Notice>
      </div>
    );
  }

  if (patch.hunks.length === 0) {
    return (
      <div className="p-3">
        <Notice title="Patch vazio">
          Nenhum trecho alterado — o git registrou a mudanca sem alterar conteudo (modo, renomeacao).
        </Notice>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[auto_auto_auto_1fr] items-start font-mono text-xs leading-relaxed">
      {patch.oldPath && patch.oldPath !== patch.path ? (
        <div className="col-span-4 border-b border-border px-3 py-1.5 text-muted-foreground">
          renomeado de <span className="text-foreground">{patch.oldPath}</span>
        </div>
      ) : null}
      {patch.hunks.map((hunk, index) => (
        <HunkLines key={`${hunk.header}-${index}`} hunk={hunk} />
      ))}
    </div>
  );
}
