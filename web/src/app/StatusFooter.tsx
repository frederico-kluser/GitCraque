/**
 * Rodape fino de diagnostico.
 *
 * Dois itens e so: o cwd que o servidor esta usando agora (que muda com
 * `process.chdir`) e quantos commits o `git log` trouxe. Versao do binario,
 * tempo de log e estado do WebSocket sairam — ruido: o ws ja tem o badge da
 * toolbar e o banner fixo de reconexao.
 */
import { FolderTree, GitCommitHorizontal } from "lucide-react";
import { selectCommits, useAppState } from "@/state/store";
import { formatNumber, t } from "@/i18n";
import { cn } from "@/lib/utils";

function Item({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={title}>
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

export function StatusFooter({ className }: { className?: string }) {
  const cwd = useAppState((s) => s.repo?.cwd ?? s.worktrees?.cwd ?? null);
  const commits = useAppState(selectCommits);
  const total = useAppState((s) => s.log?.total ?? 0);

  return (
    <footer
      className={cn(
        "flex items-center gap-4 overflow-hidden px-4 py-1 font-mono text-[10px] text-muted-foreground",
        className,
      )}
    >
      <Item icon={<FolderTree className="size-3" />} title={t("footer.cwd")}>
        {cwd ?? "—"}
      </Item>
      <span className="h-3 w-px shrink-0 bg-border" />
      <Item icon={<GitCommitHorizontal className="size-3" />} title={t("footer.commits")}>
        {formatNumber(commits.length)}
        {total > commits.length ? ` / ${formatNumber(total)}` : ""} {t("footer.commitsSuffix")}
      </Item>
    </footer>
  );
}
