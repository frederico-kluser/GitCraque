/**
 * O microfone flutuante do bottom center — e a bolha em que ele cresce.
 *
 * O caminho inteiro numa peca so: gravar -> transcrever -> mandar para o
 * agente -> mostrar o que ele rodou. Nao ha confirmacao no meio; a decisao do
 * produto e que quem falou ja decidiu, e a intencao vai ate o fim.
 *
 * CASCATA: o pill que muda de estado vem do catalogo (`MultiStateButton`), a
 * animacao vem do tema (`useMotionUITransition`). O que faltou no catalogo, e
 * por isso esta escrito aqui, e a BOLHA em si — um popover ancorado no rodape
 * que cresce com o conteudo; o `sheet` prende na borda e o `expand-card`
 * pertence a um cartao, nenhum dos dois serve para um transiente centrado.
 *
 * Escada de z-index (`ContextMenuHost.tsx:117`): a bolha fica em `z-40`, ABAIXO
 * do ActionMenu (`z-50`) e de tudo que vem depois. Um dialogo de confirmacao
 * precisa cobrir o microfone, nunca o contrario.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Loader2, Mic, Send, Square, X } from "lucide-react";

import { MultiStateButton } from "@/components/motion-ui/multi-state-button";
import { useMotionUITransition } from "@/components/motion-ui/ui-theme";
import { useVoiceRecorder } from "@/hooks";
import { getLocale, t } from "@/i18n";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FOCUS_RING, SectionLabel, ToolButton } from "@/panels/parts";
import {
  abortAgent,
  agentCancelled,
  agentClosed,
  agentRecordingStarted,
  agentTranscribing,
  runAgent,
  selectAgent,
  useAppState,
} from "@/state/store";
import type { AgentPhase } from "@/state/store";

/** Superficie do pill por estado. Tokens semanticos, nunca paleta numerada. */
const SURFACE: Record<AgentPhase, string> = {
  idle: "bg-card text-foreground border border-border",
  recording: "bg-destructive text-destructive-foreground",
  transcribing: "bg-secondary text-secondary-foreground",
  running: "bg-primary text-primary-foreground",
  done: "bg-card text-success border border-border",
  failed: "bg-card text-destructive border border-border",
};

/** O rotulo de cada estado sai do catalogo de textos, nunca da fonte. */
function labelFor(phase: AgentPhase): string {
  switch (phase) {
    case "recording":
      return t("agent.state.recording");
    case "transcribing":
      return t("agent.state.transcribing");
    case "running":
      return t("agent.state.running");
    case "done":
      return t("agent.done");
    case "failed":
      return t("agent.failed");
    default:
      return t("agent.state.idle");
  }
}

function iconFor(phase: AgentPhase) {
  if (phase === "recording") return <Square className="size-3.5" />;
  if (phase === "transcribing" || phase === "running") {
    return <Loader2 className="size-3.5 animate-spin" />;
  }
  return <Mic className="size-3.5" />;
}

export function VoiceBubble() {
  const agent = useAppState(selectAgent);
  const recorder = useVoiceRecorder();
  const reduced = useReducedMotion();
  const gentle = useMotionUITransition("gentle");
  const snap = useMotionUITransition("snap");
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = agent.phase === "transcribing" || agent.phase === "running";
  const open = agent.phase !== "idle";

  /* ---- gravar -> transcrever -> mandar ---- */

  const beginRecording = useCallback(async () => {
    try {
      await recorder.start();
      agentRecordingStarted();
    } catch {
      // Permissao negada e navegador sem microfone chegam pelo mesmo caminho;
      // a distincao util para quem le e "o browser nao liberou".
      agentCancelled(recorder.support === "missing" ? t("agent.micMissing") : t("agent.micDenied"));
    }
  }, [recorder]);

  const finishRecording = useCallback(async () => {
    agentTranscribing();
    try {
      const { audio, format } = await recorder.stop();
      if (!audio) {
        agentCancelled(t("agent.empty"));
        return;
      }
      const result = await api.transcribe({ audio, format, language: getLocale() });
      if (!result.text) {
        agentCancelled(t("agent.empty"));
        return;
      }
      await runAgent(result.text, "voice", result.cost);
    } catch (e) {
      agentCancelled(e instanceof Error ? e.message : String(e));
    }
  }, [recorder]);

  const onPillClick = useCallback(() => {
    if (agent.phase === "recording") return void finishRecording();
    if (agent.phase === "done" || agent.phase === "failed") return agentClosed();
    if (busy) return;
    void beginRecording();
  }, [agent.phase, busy, beginRecording, finishRecording]);

  const submitTyped = useCallback(() => {
    const text = typed.trim();
    if (!text || busy) return;
    setTyped("");
    void runAgent(text, "text");
  }, [busy, typed]);

  /* ---- Escape: aborta o que estiver em voo, senao fecha ---- */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (agent.phase === "recording") recorder.cancel();
      if (agent.phase === "running") void abortAgent();
      agentClosed();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [agent.phase, open, recorder]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex flex-col items-center gap-2">
      <AnimatePresence>
        {open && (
          <motion.section
            layout
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={gentle}
            aria-live="polite"
            className={cn(
              "pointer-events-auto w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-border",
              "bg-popover text-popover-foreground shadow-lg",
              "max-h-[50vh] overflow-y-auto p-3",
            )}
          >
            {agent.utterance && (
              <>
                <SectionLabel>
                  {agent.source === "voice" ? t("agent.heard") : t("agent.typed")}
                </SectionLabel>
                <p className="mt-1 text-sm text-foreground">{agent.utterance}</p>
              </>
            )}

            {agent.commands.length > 0 && (
              <>
                <SectionLabel className="mt-3">{t("agent.commands")}</SectionLabel>
                <ul className="mt-1 space-y-1">
                  {agent.commands.map((command, i) => (
                    <li
                      key={`${i}-${command}`}
                      className="rounded bg-surface-inset px-2 py-1 font-mono text-[11px] text-muted-foreground"
                    >
                      {command}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {agent.verdict && (
              <p className="mt-3 text-sm text-foreground">{agent.verdict}</p>
            )}
            {agent.error && (
              <p className="mt-3 text-sm text-destructive">{agent.error}</p>
            )}
            {agent.cost > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("agent.cost", { cost: agent.cost.toFixed(4) })}
              </p>
            )}

            <footer className="mt-3 flex items-center justify-end gap-2">
              {agent.phase === "running" && (
                <ToolButton tone="danger" size="sm" onClick={() => void abortAgent()}>
                  {t("agent.stop")}
                </ToolButton>
              )}
              {(agent.phase === "done" || agent.phase === "failed") && (
                <ToolButton
                  tone="ghost"
                  size="sm"
                  icon={<X className="size-3" />}
                  onClick={agentClosed}
                >
                  {t("agent.close")}
                </ToolButton>
              )}
            </footer>
          </motion.section>
        )}
      </AnimatePresence>

      <div className="pointer-events-auto flex items-center gap-2">
        {/* O halo da gravacao e continuo, entao respeita `prefers-reduced-motion`
            por conta propria — o tema so cobre as transicoes discretas. */}
        <motion.div
          animate={
            agent.phase === "recording" && !reduced ? { scale: [1, 1.06, 1] } : { scale: 1 }
          }
          transition={
            agent.phase === "recording" && !reduced
              ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
              : snap
          }
        >
          <MultiStateButton
            state={agent.phase}
            onClick={onPillClick}
            disabled={busy && agent.phase !== "running"}
            icon={iconFor(agent.phase)}
            surfaceClassName={SURFACE[agent.phase]}
            pillClassName="rounded-full px-4 py-2 text-xs font-medium shadow-md"
            announce={labelFor(agent.phase)}
            aria-label={t("agent.button.aria")}
          >
            {labelFor(agent.phase)}
          </MultiStateButton>
        </motion.div>

        {/* Digitar e a mesma porta que falar: "ou quando digita, capturada a
            intencao dela e feita ate o fim". */}
        <div className="flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1 shadow-md">
          <input
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitTyped();
            }}
            disabled={busy}
            placeholder={t("agent.placeholder")}
            aria-label={t("agent.placeholder")}
            className={cn(
              "w-56 bg-transparent px-1.5 py-0.5 text-xs text-foreground",
              "placeholder:text-muted-foreground disabled:opacity-50",
              FOCUS_RING,
            )}
          />
          <ToolButton
            tone="ghost"
            size="sm"
            icon={<Send className="size-3" />}
            aria-label={t("agent.send")}
            disabled={busy || !typed.trim()}
            onClick={submitTyped}
          />
        </div>
      </div>
    </div>
  );
}
