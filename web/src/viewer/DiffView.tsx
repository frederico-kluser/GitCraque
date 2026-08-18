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
 *
 * HIGHLIGHT INTRA-LINHA: quando `line.words` existe (o endpoint foi pedido
 * com `wordDiff: true`), o conteudo e renderizado por segmento em vez de uma
 * string so. O segmento de palavra inverte os dois tokens do tipo — fundo
 * forte com texto claro — porque a linha inteira ja carrega `bg-diff-del-bg`:
 * o mesmo fundo em cima do mesmo fundo nao destacaria nada.
 *
 * COLAPSO DE HUNK: o cabecalho e um botao que dobra o bloco em uma linha de
 * reticencias. O estado mora em quem hospeda o viewer (Set de chaves
 * `oldStart:newStart`), nao aqui — assim o colapso sobrevive a troca de modo
 * e de aba de carga, que remonta este componente.
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

/* 13px fixos — o conteudo do desktop subiu de 12px por causa da leitura em
   telas largas; o mobile ja usava 13px no conteudo. `py-1` da a linha um
   respiro que o 12px nao pedia, sem virar monstro de altura. */
const GUTTER =
  "select-none px-2.5 py-1 text-right tabular-nums text-muted-foreground/70";

const MARKER = "select-none px-1 text-center";

/* O conteudo ja embrulha (`whitespace-pre-wrap break-words`): linha longa
   quebra, nunca empurra a pagina. */
const CONTENT = "py-1 pr-3 whitespace-pre-wrap break-words";

const LINE_TONE: Record<DiffLine["kind"], string> = {
  add: "bg-diff-add-bg text-diff-add-fg",
  del: "bg-diff-del-bg text-diff-del-fg",
  context: "",
  meta: "text-muted-foreground italic",
};

/* Palavra destacada: fundo forte (o token de fg) com texto claro (o token de
   bg), porque o fundo fraco da linha ja cobre o segmento inteiro. */
const WORD_TONE: Record<NonNullable<DiffLine["words"]>[number]["kind"], string> = {
  add: "rounded-[2px] bg-diff-add-fg text-diff-add-bg",
  del: "rounded-[2px] bg-diff-del-fg text-diff-del-bg",
  context: "",
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

/* Identidade do hunk para o estado de colapso (unica dentro do arquivo). */
const hunkKey = (hunk: DiffHunk) => `${hunk.oldStart}:${hunk.newStart}`;

/* ------------------------------------------------------------------ */

function LineContent({ line }: { line: DiffLine }) {
  if (!line.words) return <>{line.content || " "}</>;
  return (
    <>
      {line.words.map((word, index) => (
        <span key={index} className={WORD_TONE[word.kind]}>
          {word.text}
        </span>
      ))}
    </>
  );
}

interface HunkLinesProps {
  hunk: DiffHunk;
  compact: boolean;
  collapsed: boolean;
  onToggle: () => void;
}

function HunkLines({ hunk, compact, collapsed, onToggle }: HunkLinesProps) {
  const span = compact ? "col-span-3" : "col-span-4";
  const collapseLabel = collapsed ? t("diff.hunk.expand") : t("diff.hunk.collapse");

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={collapseLabel}
        title={collapseLabel}
        className={cn(
          "cursor-pointer border-y border-border bg-surface-inset px-3 py-1 text-left font-mono text-[11px] text-muted-foreground",
          "select-none transition-colors hover:bg-accent",
          "duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
          "touch:min-h-tap",
          span,
        )}
      >
        {hunk.header}
      </button>
      {collapsed ? (
        /* Reticencias so: o cabecalho acima diz qual hunk esta dobrado. */
        <div
          className={cn(
            "border-b border-border bg-surface-inset/60 px-3 py-0.5 text-center font-mono text-[11px]",
            "text-muted-foreground select-none",
            span,
          )}
          aria-hidden="true"
        >
          …
        </div>
      ) : (
        hunk.lines.map((line, index) => {
          const tone = LINE_TONE[line.kind];
          return compact ? (
            <Fragment key={`${hunk.header}-${index}`}>
              <span className={cn(GUTTER, GUTTER_COMPACT, tone)}>
                {line.newNumber ?? line.oldNumber ?? ""}
              </span>
              <span className={cn(MARKER, tone)} aria-hidden="true">
                {LINE_MARK[line.kind]}
              </span>
              <span className={cn(CONTENT, tone)}>
                <LineContent line={line} />
              </span>
            </Fragment>
          ) : (
            <Fragment key={`${hunk.header}-${index}`}>
              <span className={cn(GUTTER, tone)}>{line.oldNumber ?? ""}</span>
              <span className={cn(GUTTER, tone)}>{line.newNumber ?? ""}</span>
              <span className={cn(MARKER, tone)} aria-hidden="true">
                {LINE_MARK[line.kind]}
              </span>
              <span className={cn(CONTENT, tone)}>
                <LineContent line={line} />
              </span>
            </Fragment>
          );
        })
      )}
    </>
  );
}

export interface DiffViewProps {
  patch: DiffPayload | null;
  /** caminho pedido, para a mensagem quando o arquivo nao mudou neste commit */
  path: string;
  /** chaves de hunk recolhidos (`hunkKey`); vazio ou ausente = tudo aberto */
  collapsed?: ReadonlySet<string>;
  onToggleHunk?: (key: string) => void;
}

export function DiffView({ patch, path, collapsed, onToggleHunk }: DiffViewProps) {
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
        "grid items-start font-mono text-[13px] leading-relaxed pb-safe-bottom",
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
      {patch.hunks.map((hunk, index) => {
        const key = hunkKey(hunk);
        return (
          <HunkLines
            key={`${key}-${index}`}
            hunk={hunk}
            compact={compact}
            collapsed={collapsed?.has(key) ?? false}
            onToggle={() => onToggleHunk?.(key)}
          />
        );
      })}
    </div>
  );
}
