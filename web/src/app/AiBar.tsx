/**
 * A area de IA — uma faixa larga fixa no rodape da tela.
 *
 * O caminho inteiro numa peca so: escrever -> mandar para o agente -> mostrar o
 * que ele rodou. Nao ha confirmacao no meio; a decisao do produto e que quem
 * escreveu ja decidiu, e a intencao vai ate o fim.
 *
 * Dois estados, decididos por `ai.hasKey`:
 *
 *  - LIBERADA: input largo e botao de executar. Enter manda.
 *  - TRANCADA: a MESMA area vira o convite para colar a chave da OpenRouter.
 *    Nao ha um input apagado com cadeado ao lado — sem chave nao existe nada
 *    util para digitar ali, e o unico proximo passo e desbloquear.
 *
 * Enquanto `ai.checked` e falso a area nao aparece: uma requisicao que ainda
 * nao voltou nao e prova de que falta chave, e piscar o convite no boot para
 * quem tem chave gravada seria mentir por meio segundo.
 *
 * O MICROFONE FOI EMBORA. Esta area ja gravou audio, transcrevia pela
 * OpenRouter e mandava o texto para o mesmo agente. O caminho de voz continua
 * inteiro e testado no backend (`POST /ai/transcribe`) e o hook do navegador
 * segue no lugar (`web/src/hooks/useVoiceRecorder.ts`) — ver a secao "Voz" de
 * `docs/ARCHITECTURE.md` para religar em tres passos.
 *
 * CASCATA: o botao de executar vem do catalogo (`MultiStateButton`), a animacao
 * vem do tema (`useMotionUITransition`). O que faltou no catalogo, e por isso
 * esta escrito aqui, e a BOLHA de resposta — um popover ancorado no rodape que
 * cresce com o conteudo; o `sheet` prende na borda e o `expand-card` pertence a
 * um cartao, nenhum dos dois serve para um transiente centrado.
 *
 * Escada de z-index (`ContextMenuHost.tsx:117`): a area fica em `z-40`, ABAIXO
 * do ActionMenu (`z-50`) e de tudo que vem depois. Um dialogo de confirmacao
 * precisa cobrir a area de IA, nunca o contrario.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CornerDownLeft, KeyRound, Loader2, Lock, Sparkles, X } from "lucide-react";

import { MultiStateButton } from "@/components/motion-ui/multi-state-button";
import { useMotionUITransition } from "@/components/motion-ui/ui-theme";
import { useLayoutMode } from "@/hooks";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { FOCUS_RING, SectionLabel, ToolButton } from "@/panels/parts";
import {
  abortAgent,
  agentClosed,
  runAgent,
  saveAiKey,
  selectAgent,
  selectAi,
  useAppState,
} from "@/state/store";

/** Largura da faixa. A mesma nos dois estados, para nada saltar ao desbloquear. */
const AREA_WIDTH = "w-[min(46rem,calc(100vw-2rem))]";

const AREA_SURFACE =
  "pointer-events-auto rounded-xl border border-border bg-card text-card-foreground shadow-lg";

/* ------------------------------------------------------------------ */
/* Trancada: o convite para desbloquear                                */
/* ------------------------------------------------------------------ */

/**
 * O convite ocupa a area inteira quando nao ha chave.
 *
 * A chave vai para o servidor e some da vista: `saveAiKey` grava em
 * `~/.config/gitcraque/openrouter.json` (modo 0600) e o que volta e so a
 * mascara. O campo e `type="password"` porque chave colada em tela
 * compartilhada e chave vazada.
 */
function LockedArea() {
  const [key, setKey] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  const submit = useCallback(() => {
    const value = key.trim();
    if (!value || state === "saving") return;
    setState("saving");
    setError("");
    void saveAiKey(value)
      .then(() => setKey(""))
      .catch((e: unknown) => {
        setState("error");
        setError(e instanceof Error ? e.message : String(e));
      });
    // Sucesso nao volta para "idle" de proposito: `hasKey` vira true e este
    // componente inteiro desmonta.
  }, [key, state]);

  return (
    <section className={cn(AREA_SURFACE, AREA_WIDTH, "flex flex-col gap-3 p-4")}>
      <header className="flex items-start gap-3">
        <span className="mt-px inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-warning/12 text-warning">
          <Lock className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-sm font-semibold text-foreground">
            {t("ai.locked.title")}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("ai.locked.body")}</p>
        </div>
      </header>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <KeyRound className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              if (state === "error") setState("idle");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            disabled={state === "saving"}
            placeholder={t("ai.locked.placeholder")}
            aria-label={t("ai.locked.placeholder")}
            className={cn(
              "w-full rounded-md border border-input bg-background py-1.5 pr-2.5 pl-8",
              "font-mono text-xs text-foreground placeholder:font-sans placeholder:text-muted-foreground",
              "disabled:opacity-50",
              FOCUS_RING,
            )}
          />
        </div>
        <MultiStateButton
          state={state}
          onClick={submit}
          disabled={state === "saving" || !key.trim()}
          feedback={state === "error" ? "shake" : "none"}
          icon={
            state === "saving" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Lock className="size-3.5" />
            )
          }
          surfaceClassName={
            state === "error"
              ? "bg-destructive text-destructive-foreground"
              : "bg-primary text-primary-foreground"
          }
          pillClassName="rounded-md px-4 py-2 text-xs font-medium"
          announce={t("ai.locked.unlock")}
          aria-label={t("ai.locked.unlock")}
        >
          {state === "saving" ? t("common.running") : t("ai.locked.unlock")}
        </MultiStateButton>
      </div>

      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground">{t("ai.locked.hint")}</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Liberada: input e execucao                                          */
/* ------------------------------------------------------------------ */

function Composer({ busy }: { busy: boolean }) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(() => {
    const text = typed.trim();
    if (!text || busy) return;
    setTyped("");
    void runAgent(text, "text");
  }, [busy, typed]);

  return (
    <section className={cn(AREA_SURFACE, AREA_WIDTH, "flex items-center gap-2 p-2")}>
      <span className="ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      </span>

      <input
        ref={inputRef}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        disabled={busy}
        placeholder={t("agent.placeholder")}
        aria-label={t("agent.placeholder")}
        className={cn(
          "min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm text-foreground",
          "placeholder:text-muted-foreground disabled:opacity-50",
          FOCUS_RING,
        )}
      />

      <ToolButton
        tone="primary"
        icon={<CornerDownLeft className="size-3.5" />}
        aria-label={t("agent.send")}
        disabled={busy || !typed.trim()}
        onClick={submit}
      >
        {t("agent.send")}
      </ToolButton>
    </section>
  );
}

/* ------------------------------------------------------------------ */

export function AiBar() {
  const agent = useAppState(selectAgent);
  const ai = useAppState(selectAi);
  const gentle = useMotionUITransition("gentle");
  /* No compacto o rodape da tela e a barra de navegacao: a faixa sobe na
     altura dela (56px + recorte de seguranca) mais a folga de 1.5rem. Sem
     isso ela ficaria escondida atras da barra. */
  const compact = useLayoutMode() === "compact";

  const busy = agent.phase === "transcribing" || agent.phase === "running";
  // A bolha de resposta abre quando ha o que mostrar. `idle` e o repouso: so a
  // faixa, sem nada acima dela.
  const open = agent.phase !== "idle";

  /* ---- Escape: aborta o que estiver em voo, senao fecha a bolha ---- */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (agent.phase === "running") void abortAgent();
      agentClosed();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [agent.phase, open]);

  // Antes da primeira resposta de `/ai/status` nao ha o que mostrar: nem a
  // faixa liberada (pode nao haver chave) nem o convite (pode haver).
  if (!ai.checked) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-2",
        compact ? "bottom-[calc(56px+1.5rem+env(safe-area-inset-bottom,0px))]" : "bottom-6",
      )}
    >
      <AnimatePresence>
        {open && (
          <motion.section
            layout
            initial={{ opacity: 0, transform: "translateY(8px) scale(0.98)" }}
            animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
            exit={{ opacity: 0, transform: "translateY(8px) scale(0.98)" }}
            transition={gentle}
            aria-live="polite"
            className={cn(
              "pointer-events-auto rounded-xl border border-border",
              AREA_WIDTH,
              "bg-popover text-popover-foreground shadow-lg",
              "max-h-[50vh] overflow-y-auto p-3",
            )}
          >
            {agent.utterance && (
              <>
                <SectionLabel>{t("agent.typed")}</SectionLabel>
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

            {agent.verdict && <p className="mt-3 text-sm text-foreground">{agent.verdict}</p>}
            {agent.error && <p className="mt-3 text-sm text-destructive">{agent.error}</p>}
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

      {ai.hasKey ? <Composer busy={busy} /> : <LockedArea />}
    </div>
  );
}
