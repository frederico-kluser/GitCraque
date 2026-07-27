/**
 * Insercoes e delecoes por arquivo da ARVORE DE TRABALHO.
 *
 * `StatusPayload` diz o que mudou, nao quanto — o contrato so carrega
 * `insertions`/`deletions` no detalhe de commit. Entao o painel de staging le
 * `GET /api/diff` duas vezes (index e worktree) e conta as linhas dos hunks.
 * A busca so refaz quando a ASSINATURA do status muda (caminhos + codigos), e
 * nao a cada objeto novo que o refresh produz.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { DiffPayload, StatusPayload } from "@/types/git";

export interface FileDelta {
  insertions: number;
  deletions: number;
  binary: boolean;
}

export type DiffStats = Map<string, FileDelta>;

const EMPTY: DiffStats = new Map();

function accumulate(into: DiffStats, files: DiffPayload[]) {
  for (const file of files) {
    let insertions = 0;
    let deletions = 0;
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.kind === "add") insertions += 1;
        else if (line.kind === "del") deletions += 1;
      }
    }
    const previous = into.get(file.path);
    into.set(file.path, {
      insertions: (previous?.insertions ?? 0) + insertions,
      deletions: (previous?.deletions ?? 0) + deletions,
      binary: file.binary || (previous?.binary ?? false),
    });
  }
}

export function useWorkingDiffStats(status: StatusPayload | null): DiffStats {
  const signature = useMemo(
    () => (status ? `${status.cwd}|${status.entries.map((e) => `${e.code}:${e.path}`).join(",")}` : ""),
    [status],
  );
  const [stats, setStats] = useState<DiffStats>(EMPTY);

  useEffect(() => {
    if (!signature) {
      setStats(EMPTY);
      return;
    }
    let alive = true;
    Promise.all([
      api.diff({ staged: true }).catch(() => [] as DiffPayload[]),
      api.diff({}).catch(() => [] as DiffPayload[]),
    ]).then(([staged, worktree]) => {
      if (!alive) return;
      const next: DiffStats = new Map();
      accumulate(next, staged);
      accumulate(next, worktree);
      setStats(next);
    });
    return () => {
      alive = false;
    };
  }, [signature]);

  return stats;
}
