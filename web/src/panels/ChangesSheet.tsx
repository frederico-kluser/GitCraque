/**
 * Gaveta de alteracoes: o `StatusPanel` inteiro — staging, rascunho e commit —
 * ancorado na borda direita, por cima da tela.
 *
 * Era uma aba do sidebar direito. Saiu de la quando a coluna passou a mostrar
 * uma tela por vez, e o gatilho virou o botao de commit da toolbar. A gaveta
 * fecha sozinha ao abrir um arquivo: clicar numa linha manda ver o conteudo, e
 * o conteudo aparece na coluna que a propria gaveta estaria tapando.
 *
 * CASCATA: o `sheet` do catalogo e uma gaveta de RODAPE — `fixed inset-x-0
 * bottom-0`, `max-w-md`, dismiss arrastando para BAIXO — e a caixa externa dele
 * nao aceita `className`, entao ancorar a direita brigaria com o componente em
 * vez de usa-lo. O que se aproveita do catalogo sao os primitivos de overlay
 * (`Backdrop`, `useFocusTrap`, `useScrollLock`) — os mesmos que o `DialogShell`
 * de `@/dialogs` usa —, e o novo aqui e so a geometria: borda direita, altura
 * cheia, entrada no eixo x. Tempo e curva saem do tema, nunca de numero solto.
 */
import { useEffect, useRef } from "react";
import { GitCommitHorizontal, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Backdrop, useFocusTrap, useScrollLock } from "@/components/motion-ui/overlay";
import { useMotionUITheme, useMotionUITransition } from "@/components/motion-ui/ui-theme";
import { useAppState } from "@/state/store";
import { closeChanges, selectChangesOpen, useLayoutMode, useShellState } from "@/hooks";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { Chip, FOCUS_RING } from "./parts";
import { StatusPanel } from "./StatusPanel";

/** Larga o bastante para caminho + estatistica + botoes da linha caberem. */
const SHEET_WIDTH = "min(32rem, 100vw - 2rem)";

export function ChangesSheet() {
  const open = useShellState(selectChangesOpen);
  /* No compacto a gaveta nao desliza da borda: vira tela cheia, cobrindo a
     barra de navegacao. O painel interno e o mesmo. */
  const compact = useLayoutMode() === "compact";
  const changeCount = useAppState((s) => s.status?.entries.length ?? 0);
  const openFile = useAppState((s) => s.openFile);
  const panelRef = useRef<HTMLDivElement>(null);
  const ui = useMotionUITransition("ui");
  const { motionMode } = useMotionUITheme();
  const still = motionMode === "off";
  const calm = motionMode === "calm";

  useFocusTrap({ active: open, container: panelRef, onEscape: closeChanges });
  useScrollLock(open);

  /**
   * Clicar num arquivo da lista abre a View na coluna direita — que fica
   * exatamente atras desta gaveta. `openFile` e um objeto novo a cada chamada do
   * store, inclusive para o mesmo arquivo, entao o segundo clique tambem fecha.
   * O primeiro render nao conta: `openFile` pode ja existir quando a gaveta abre.
   */
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (openFile) closeChanges();
  }, [openFile]);

  // Deslocamento de entrada: para fora pela DIREITA no desktop (e de onde
  // ela vem); para BAIXO no compacto, onde ela vira tela cheia.
  const hidden = calm ? "translateX(0px)" : compact ? "translateY(24px)" : "translateX(24px)";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="changes-sheet"
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ ...ui }}
          className="fixed inset-0 z-50 flex justify-end"
        >
          <Backdrop opacity={0.45} onClick={closeChanges} />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("changes.sheet.label")}
            initial={still ? false : { opacity: 0, transform: hidden }}
            animate={{ opacity: 1, transform: compact ? "translateY(0px)" : "translateX(0px)" }}
            exit={still ? undefined : { opacity: 0, transform: hidden }}
            transition={{ ...ui }}
            style={{ width: compact ? "100%" : SHEET_WIDTH }}
            className={cn(
              "relative z-10 flex h-full min-h-0 flex-col bg-card text-card-foreground shadow-2xl",
              /* Tela cheia no compacto: sem borda (nao ha coluna a separar) e
                 com o recorte de seguranca embaixo, onde mora a barra de
                 gestos do aparelho. */
              !compact && "border-l border-border",
              compact && "pb-safe-bottom",
            )}
          >
            <header
              className={cn(
                "flex shrink-0 items-center gap-2 border-b border-border bg-surface-rail px-3 py-2",
                /* No compacto o cabecalho cola na borda de cima, que num
                   celular com entalhe fica atras da barra de status. */
                compact && "pt-safe-top",
              )}
            >
              <GitCommitHorizontal className="size-4 shrink-0 text-primary" />
              <h2 className="font-heading text-sm font-semibold text-foreground">
                {t("changes.sheet.title")}
              </h2>
              {changeCount > 0 && <Chip tone="primary">{changeCount}</Chip>}
              <span className="flex-1" />
              <button
                type="button"
                onClick={closeChanges}
                aria-label={t("changes.sheet.close")}
                title={t("changes.sheet.close")}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground",
                  "transition-colors hover:bg-accent hover:text-foreground",
                  "duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
                  FOCUS_RING,
                )}
              >
                <X className="size-3.5" />
              </button>
            </header>

            <StatusPanel className="min-h-0 flex-1 bg-background" />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
