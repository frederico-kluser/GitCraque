/**
 * Rodape fino de diagnostico.
 *
 * Tudo aqui e verificavel: o cwd que o servidor esta usando agora (que muda com
 * `process.chdir`), a versao do binario do git, quantos commits o `git log`
 * trouxe e quanto tempo ele levou, e o estado do WebSocket.
 */
import { Circle, Clock, FolderTree, GitCommitHorizontal, Terminal } from "lucide-react";
import { selectCommits, useAppState } from "@/state/store";
import { cn } from "@/lib/utils";
import type { ConnectionState } from "@/lib/ws";

const CONNECTION_TONE: Record<ConnectionState, string> = {
  open: "text-success",
  connecting: "text-warning",
  reconnecting: "text-warning",
  closed: "text-destructive",
};

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
  const gitVersion = useAppState((s) => s.repo?.gitVersion ?? null);
  const commits = useAppState(selectCommits);
  const total = useAppState((s) => s.log?.total ?? 0);
  const elapsed = useAppState((s) => s.log?.elapsedMs ?? null);
  const connection = useAppState((s) => s.connection);

  return (
    <footer
      className={cn(
        "flex items-center gap-4 overflow-hidden px-4 py-1 font-mono text-[10px] text-muted-foreground",
        className,
      )}
    >
      <Item icon={<FolderTree className="size-3" />} title="process.cwd() do servidor">
        {cwd ?? "—"}
      </Item>
      <span className="h-3 w-px shrink-0 bg-border" />
      <Item icon={<Terminal className="size-3" />} title="Versao do binario do git">
        {gitVersion ?? "git ?"}
      </Item>
      <span className="h-3 w-px shrink-0 bg-border" />
      <Item icon={<GitCommitHorizontal className="size-3" />} title="Commits carregados / alcancaveis por --all">
        {commits.length.toLocaleString("pt-BR")}
        {total > commits.length ? ` / ${total.toLocaleString("pt-BR")}` : ""} commits
      </Item>
      <span className="h-3 w-px shrink-0 bg-border" />
      <Item icon={<Clock className="size-3" />} title="Tempo do ultimo `git log`">
        {elapsed != null ? `${elapsed} ms` : "—"}
      </Item>
      <span className="flex-1" />
      <span className={cn("flex shrink-0 items-center gap-1.5", CONNECTION_TONE[connection])} title="WebSocket">
        <Circle className="size-2 fill-current" />
        ws: {connection}
      </span>
    </footer>
  );
}
