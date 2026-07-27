/**
 * Console de comandos crus — a prova visivel de que o GitCraque so orquestra
 * o binario do git. Cada `git:command` do WebSocket vira linha aqui: o argv
 * exato, o cwd, o codigo de saida e a duracao.
 *
 * CASCATA: `TerminalSession` do catalogo e uma sessao SIMULADA — ele digita
 * uma lista fixa de linhas com timeline propria e remonta a cada mudanca do
 * array. Um console ao vivo precisa do oposto: append incremental, rolagem que
 * gruda no fim e centenas de linhas sem re-animar nada. Entao o corpo e
 * escrito aqui, herdando a ESTETICA do componente (prompt `$` em `text-primary`,
 * `font-mono text-[0.8125rem] leading-[1.9] tabular-nums`, tons por classe) e o
 * `IdleCaret` piscando no fim.
 */
import { useEffect, useMemo, useRef } from "react";
import { Ban, Eraser, Terminal } from "lucide-react";
import { motion, useInView } from "motion/react";
import { CopyButton } from "@/components/motion-ui/copy-button";
import { SegmentedToggle, SegmentedToggleOption } from "@/components/motion-ui/segmented-toggle";
import { useMotionUITheme, useMotionUITransition } from "@/components/motion-ui/ui-theme";
import { clearConsole, useAppState } from "@/state/store";
import {
  focusConsoleLine,
  matchesConsoleFilter,
  setConsoleFilter,
  useShellState,
  useStickToBottom,
  type ConsoleFilter,
} from "@/hooks";
import { cn } from "@/lib/utils";
import type { ConsoleLine } from "@/types/git";
import type { PanelProps } from "@/types/modules";
import { Chip, SectionLabel, ToolButton } from "./parts";

/** Tom por tipo de linha — mesma escala do `TerminalSession`. */
const KIND_CLASS: Record<ConsoleLine["kind"], string> = {
  command: "text-foreground",
  stdout: "text-muted-foreground",
  stderr: "text-warning",
  exit: "text-muted-foreground",
  error: "text-destructive",
  info: "text-primary",
};

const FILTERS: Array<{ value: ConsoleFilter; label: string }> = [
  { value: "all", label: "tudo" },
  { value: "command", label: "comandos" },
  { value: "output", label: "saida" },
  { value: "error", label: "erros" },
];

/** Caret ocioso do `TerminalSession`: opacidade no compositor, parado fora da vista. */
function IdleCaret() {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref);
  const { motionMode } = useMotionUITheme();
  const ambient = useMotionUITransition("ambient");
  const running = inView && motionMode === "full";

  return (
    <motion.span
      ref={ref}
      aria-hidden="true"
      className="inline-block h-[1.1em] w-[2px] shrink-0 self-center bg-primary"
      animate={running ? { opacity: [1, 1, 0, 0] } : { opacity: 1 }}
      transition={
        running
          ? { duration: ambient.duration * 2.2, times: [0, 0.5, 0.5, 1], ease: "linear", repeat: Infinity }
          : { duration: 0 }
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* Linha                                                               */
/* ------------------------------------------------------------------ */

function Line({ line, focused }: { line: ConsoleLine; focused: boolean }) {
  const failed = line.exitCode != null && line.exitCode !== 0;

  if (line.kind === "command") {
    return (
      <div
        id={`console-${line.id}`}
        className={cn(
          "group flex items-baseline gap-2 rounded-sm px-1 -mx-1",
          focused && "bg-primary/12 ring-1 ring-primary ring-inset",
        )}
      >
        <span className="shrink-0 select-none text-primary">$</span>
        <span className="min-w-0 flex-1 break-all text-foreground">{line.text}</span>
        {line.cwd && (
          <span className="hidden shrink-0 truncate text-[10px] text-muted-foreground lg:inline" title={line.cwd}>
            {line.cwd}
          </span>
        )}
        <span className="shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <CopyButton
            variant="icon"
            value={line.argv ? `git ${line.argv.join(" ")}` : line.text}
            label="Copiar o comando"
            copiedLabel="Comando copiado"
          />
        </span>
      </div>
    );
  }

  if (line.kind === "exit") {
    return (
      <div id={`console-${line.id}`} className="flex items-baseline gap-2 pl-4">
        <Chip tone={failed ? "danger" : "success"} mono>
          exit {line.exitCode ?? "?"}
        </Chip>
        {line.durationMs != null && (
          <span className="text-[11px] text-muted-foreground">{line.durationMs} ms</span>
        )}
      </div>
    );
  }

  return (
    <div
      id={`console-${line.id}`}
      className={cn("pl-4 break-all whitespace-pre-wrap", KIND_CLASS[line.kind])}
    >
      {line.text}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ConsolePanel({ className }: PanelProps) {
  const lines = useAppState((s) => s.console);
  const filter = useShellState((s) => s.consoleFilter);
  const focus = useShellState((s) => s.consoleFocus);

  const visible = useMemo(() => lines.filter((l) => matchesConsoleFilter(l, filter)), [lines, filter]);
  const { ref, pinned, onScroll, scrollToBottom } = useStickToBottom<HTMLDivElement>(visible.length);

  // "Ver comando" no toast de erro: traz a linha para a vista e a destaca.
  useEffect(() => {
    if (!focus) return;
    const node = document.getElementById(`console-${focus}`);
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(() => focusConsoleLine(null), 2_600);
    return () => clearTimeout(t);
  }, [focus]);

  return (
    <section className={cn("flex flex-col", className)} aria-label="Console de comandos git">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Terminal className="size-3.5 text-primary" />
        <SectionLabel className="text-foreground">Console</SectionLabel>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{visible.length}</span>
        <span className="flex-1" />
        <SegmentedToggle
          value={filter}
          onChange={(next) => setConsoleFilter(next as ConsoleFilter)}
          ariaLabel="Filtrar linhas do console"
          className="p-0.5"
        >
          {FILTERS.map((f) => (
            <SegmentedToggleOption key={f.value} value={f.value} className="px-2 py-0.5 text-[10px]">
              {f.label}
            </SegmentedToggleOption>
          ))}
        </SegmentedToggle>
        {!pinned && (
          <ToolButton size="sm" tone="ghost" onClick={scrollToBottom} title="Ir para o fim">
            ↓ fim
          </ToolButton>
        )}
        <ToolButton
          size="sm"
          tone="ghost"
          aria-label="Limpar console"
          title="Limpar console"
          icon={<Eraser className="size-3" />}
          onClick={clearConsole}
        />
      </header>

      <div
        ref={ref}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[0.8125rem] leading-[1.9] tabular-nums"
      >
        {visible.length === 0 ? (
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Ban className="size-3.5" />
            {lines.length === 0
              ? "Nenhum comando executado ainda. Cada `git` que o servidor rodar aparece aqui, com argv, cwd e exit code."
              : "Nenhuma linha casa com o filtro."}
          </p>
        ) : (
          <>
            {visible.map((line) => (
              <Line key={line.id} line={line} focused={focus === line.id} />
            ))}
            <div className="flex items-baseline gap-2">
              <span className="shrink-0 select-none text-primary">$</span>
              <IdleCaret />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
