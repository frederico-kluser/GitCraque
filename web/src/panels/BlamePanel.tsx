/**
 * Painel de blame — `git blame --porcelain` virtualizado com react-window.
 *
 * Gutter esquerda: autor + data resumida. Hover revela o commit completo.
 * Clique no hash navega para o DetailPanel daquele commit.
 *
 * Ocupa a coluna direita inteira, substituindo o DetailPanel/FileViewPanel.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FixedSizeList } from "react-window";
import { ArrowLeft, FileSearch } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useMotionUITransition } from "@/components/motion-ui/ui-theme";
import { Skeleton } from "@/components/motion-ui/skeleton";
import { selectCommit, useAppState } from "@/state/store";
import { api, ApiRequestError } from "@/lib/api";
import { Rich, formatDateTime, t } from "@/i18n";
import { cn, short } from "@/lib/utils";
import type { BlameLine, BlamePayload } from "@/types/git";
import type { PanelProps } from "@/types/modules";
import { EmptyState, FOCUS_RING, SectionLabel, ToolButton } from "./parts";

/* ------------------------------------------------------------------ *
 * Constantes de layout
 * ------------------------------------------------------------------ */

const ROW_HEIGHT = 24;
const GUTTER_WIDTH = 220;

/* ------------------------------------------------------------------ *
 * Cache do payload de blame. Chave = `${path}:${hash}`.
 * ------------------------------------------------------------------ */

const blameCache = new Map<string, BlamePayload>();

/* ------------------------------------------------------------------ *
 * Linha virtualizada
 * ------------------------------------------------------------------ */

interface BlameRowData {
  lines: BlameLine[];
  onSelectCommit: (hash: string) => void;
}

function BlameRow({ index, style, data }: { index: number; style: React.CSSProperties; data: BlameRowData }) {
  const line = data.lines[index];
  const dateStr = line.date ? formatDateTime(new Date(line.date * 1000).toISOString()) : "";
  // Data resumida: "2025-03-15"
  const shortDate = dateStr ? dateStr.split(",")[0]?.trim() ?? "" : "";

  return (
    <div
      style={style}
      className="flex items-center border-b border-border/50 text-[11px]"
    >
      {/* Gutter: autor + data */}
      <div
        className="flex shrink-0 items-center gap-1 px-2 text-muted-foreground"
        style={{ width: GUTTER_WIDTH }}
        title={t("blame.tooltip", {
          hash: line.hash,
          summary: line.summary,
          author: line.author,
          email: line.email,
          date: dateStr,
        })}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            data.onSelectCommit(line.hash);
          }}
          className={cn(
            "font-mono text-[10px] text-primary hover:underline",
            FOCUS_RING,
            "rounded-sm px-0.5",
          )}
          title={t("detail.goTo", { hash: line.hash })}
        >
          {short(line.hash)}
        </button>
        <span className="truncate">
          <span className="font-medium">{line.author.split(" ")[0]}</span>
          {shortDate && <span className="ml-1 text-[10px] opacity-60">{shortDate}</span>}
        </span>
      </div>

      {/* Numero da linha */}
      <span className="shrink-0 w-10 text-right pr-1.5 font-mono text-[10px] text-muted-foreground/60 tabular-nums select-none">
        {line.lineNumber}
      </span>

      {/* Conteudo da linha */}
      <span className="flex-1 truncate pl-1 font-mono text-[11px] text-foreground">
        {line.content || " "}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Painel
 * ------------------------------------------------------------------ */

export type BlamePanelProps = PanelProps & { path: string; hash: string | null };

export function BlamePanel({ path, hash, className }: BlamePanelProps) {
  const [payload, setPayload] = useState<BlamePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<FixedSizeList<BlameRowData>>(null);
  const ui = useMotionUITransition("ui");

  const cacheKey = `${path}:${hash ?? "HEAD"}`;

  useEffect(() => {
    const cached = blameCache.get(cacheKey);
    if (cached) {
      setPayload(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .blame({ path, hash: hash ?? undefined })
      .then((p) => {
        if (cancelled) return;
        blameCache.set(cacheKey, p);
        setPayload(p);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg =
          err instanceof ApiRequestError
            ? err.payload.detail ?? err.payload.error
            : String(err);
        setError(msg);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, path, hash]);

  const onSelectCommit = useCallback(
    (commitHash: string) => {
      selectCommit(commitHash);
    },
    [],
  );

  const rowData: BlameRowData = useMemo(
    () => ({
      lines: payload?.lines ?? [],
      onSelectCommit,
    }),
    [payload, onSelectCommit],
  );

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...ui }}
      className={cn("flex flex-col min-h-0 bg-card", className)}
      aria-label={t("blame.label", { path })}
    >
      {/* Cabecalho */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <FileSearch className="size-4 text-primary" />
        <SectionLabel className="text-foreground flex-1 truncate">
          {t("blame.label", { path })}
        </SectionLabel>
        {hash && (
          <span className="font-mono text-[10px] text-muted-foreground">{short(hash)}</span>
        )}
      </header>

      {/* Colunas do cabecalho da tabela */}
      <div
        className="flex shrink-0 items-center border-b border-border bg-surface-inset px-2 py-1 text-[10px] font-medium text-muted-foreground"
      >
        <div style={{ width: GUTTER_WIDTH }} className="px-2">
          {t("blame.header.author")}
        </div>
        <span className="w-10 text-right pr-1.5">{t("blame.header.line")}</span>
        <span className="flex-1 pl-1">{t("blame.header.content")}</span>
      </div>

      {/* Corpo */}
      <div className="flex min-h-0 flex-1 flex-col">
        {loading && (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full rounded-sm" />
            ))}
          </div>
        )}

        {error && (
          <EmptyState
            title={t("blame.error.title")}
            description={error}
          />
        )}

        {payload && payload.lines.length === 0 && (
          <EmptyState
            title={t("blame.empty.title")}
            description={t("blame.empty.body")}
          />
        )}

        {payload && payload.lines.length > 0 && (
          <div className="flex-1 min-h-0">
            <FixedSizeList<BlameRowData>
              ref={listRef}
              height={0}
              width="100%"
              itemCount={payload.lines.length}
              itemSize={ROW_HEIGHT}
              itemData={rowData}
              className="scrollbar-thin"
              // fill parent: react-window AutoSizer pattern
              outerRef={useCallback((node: HTMLElement | null) => {
                if (node) {
                  const resize = () => {
                    const parent = node.parentElement;
                    if (parent) {
                      node.style.height = `${parent.clientHeight}px`;
                      node.style.width = `${parent.clientWidth}px`;
                    }
                  };
                  resize();
                  const ro = new ResizeObserver(resize);
                  ro.observe(node.parentElement!);
                }
              }, [])}
            >
              {BlameRow}
            </FixedSizeList>
          </div>
        )}
      </div>
    </motion.section>
  );
}
