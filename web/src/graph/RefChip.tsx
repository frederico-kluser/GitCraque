/**
 * Chips de referencia da linha do commit: branch local, branch remota, tag,
 * stash e HEAD, cada um com sua cor semantica.
 *
 * Nada no catalogo do Motion UI e um "chip" de ref (o mais proximo, `badge`, nao
 * esta instalado), entao a marcacao e propria — mas so com tokens semanticos.
 */
import { Archive, CircleDot, Cloud, GitBranch, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CommitRef, RefKind } from "@/types/git";

/** Quantos chips cabem antes de virar "+N". */
const MAX_CHIPS = 4;

const TONE: Record<RefKind, string> = {
  head: "border-primary/45 bg-primary/15 text-primary",
  localBranch: "border-border bg-secondary text-secondary-foreground",
  remoteBranch: "border-border bg-muted text-muted-foreground",
  tag: "border-warning/45 bg-warning/15 text-warning",
  stash: "border-border bg-accent text-accent-foreground",
};

const ICON: Record<RefKind, LucideIcon> = {
  head: CircleDot,
  localBranch: GitBranch,
  remoteBranch: Cloud,
  tag: Tag,
  stash: Archive,
};

/** HEAD primeiro, depois branches locais, remotas, tags e stashes. */
const ORDER: Record<RefKind, number> = {
  head: 0,
  localBranch: 1,
  remoteBranch: 2,
  tag: 3,
  stash: 4,
};

export function RefChip({ refEntry }: { refEntry: CommitRef }) {
  const Icon = ICON[refEntry.kind];
  return (
    <span
      className={cn(
        "inline-flex max-w-[14rem] shrink-0 items-center gap-1 rounded-md border px-1.5 py-px text-[11px] leading-4",
        TONE[refEntry.kind],
        refEntry.isHead && refEntry.kind !== "head" && "ring-1 ring-primary/40",
      )}
      title={refEntry.fullName ?? refEntry.name}
    >
      <Icon aria-hidden className="size-3 shrink-0 opacity-70" />
      <span className="truncate font-medium">{refEntry.name}</span>
    </span>
  );
}

export function RefChips({ refs }: { refs: CommitRef[] }) {
  if (refs.length === 0) return null;

  const sorted = refs.slice().sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  const shown = sorted.slice(0, MAX_CHIPS);
  const hidden = sorted.length - shown.length;

  return (
    <>
      {shown.map((entry) => (
        <RefChip key={`${entry.kind}:${entry.name}`} refEntry={entry} />
      ))}
      {hidden > 0 && (
        <span
          className="shrink-0 rounded-md border border-border px-1.5 py-px text-[11px] leading-4 text-muted-foreground"
          title={sorted
            .slice(MAX_CHIPS)
            .map((entry) => entry.name)
            .join(", ")}
        >
          +{hidden}
        </span>
      )}
    </>
  );
}
