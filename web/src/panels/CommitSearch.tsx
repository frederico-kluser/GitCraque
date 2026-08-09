/**
 * Barra de busca de commits — filtra o historico por texto na mensagem.
 *
 * Debounce de 300ms: cada tecla reseta o temporizador; so a ultima digitaçao
 * em 300ms dispara a busca. O componente guarda o valor local para o input
 * responder na hora, mas so propaga para o store depois do debounce.
 *
 * Duas faces, uma maquina de estado:
 *  - ponteiro fino: o input inline da barra, como sempre;
 *  - toque (layout compacto): um botao de lupa que abre a busca em TELA CHEIA.
 *    O input inline tem 32px de altura e o dedo precisa de 44 — em vez de
 *    esticar a barra, a busca vira um sheet que cobre tudo e morre com um
 *    toque no X (ou Escape).
 *
 * CASCATA: o `sheet` do catalogo e de RODAPE e nao aceita classe na casca,
 * entao nao reancora. Aqui a tela inteira e a moldura: nao ha o que escurecer
 * (sem `Backdrop`), so a caixa `fixed inset-0` com os primitivos de overlay —
 * `useFocusTrap` (que tambem move o foco para o input na abertura) e
 * `useScrollLock`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useFocusTrap, useScrollLock } from "@/components/motion-ui/overlay";
import { useMotionUITheme, useMotionUITransition } from "@/components/motion-ui/ui-theme";
import { selectSearchText, setSearchText, useAppState } from "@/state/store";
import { useLayoutMode } from "@/hooks";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { FOCUS_RING, ToolButton } from "./parts";

const DEBOUNCE_MS = 300;

export function CommitSearch({ className }: { className?: string }) {
  const compact = useLayoutMode() === "compact";
  const searchText = useAppState(selectSearchText);
  const [local, setLocal] = useState(searchText);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const snap = useMotionUITransition("snap");

  // Sincroniza o valor local com o store quando o store muda por fora (ex: limpar).
  useEffect(() => {
    setLocal(searchText);
  }, [searchText]);

  const clear = useCallback(() => {
    setLocal("");
    setSearchText("");
    inputRef.current?.focus();
  }, []);

  const onChange = useCallback(
    (value: string) => {
      setLocal(value);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setSearchText(value);
      }, DEBOUNCE_MS);
    },
    [],
  );

  // Limpa o timer na desmontagem.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!compact) {
    const hasSearch = searchText.length > 0;
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            value={local}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t("search.placeholder")}
            aria-label={t("search.aria")}
            className={cn(
              "h-8 w-full rounded-md border border-border bg-card pr-8 pl-8",
              "text-xs text-foreground placeholder:text-muted-foreground",
              "transition-colors duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
              "hover:border-primary/30 focus:border-primary/50",
              FOCUS_RING,
            )}
          />
          <AnimatePresence>
            {local.length > 0 && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ ...snap }}
                onClick={clear}
                aria-label={t("search.clear")}
                className={cn(
                  "absolute top-1/2 right-1 -translate-y-1/2 rounded p-0.5",
                  "text-muted-foreground hover:text-foreground",
                  "transition-colors duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
                )}
              >
                <X className="size-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return <SearchSheet local={local} inputRef={inputRef} clear={clear} onChange={onChange} />;
}

/**
 * A face de toque: lupa na barra + busca em tela cheia.
 *
 * O estado do texto (debounce, limpar) vive no `CommitSearch`, de cima — este
 * componente so posiciona. Os hooks de overlay moram AQUI, sempre montados no
 * modo compacto, para nenhum deles entrar e sair de chamada a meia-vida.
 */
function SearchSheet({
  local,
  inputRef,
  clear,
  onChange,
}: {
  local: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  clear: () => void;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const ui = useMotionUITransition("ui");
  const snap = useMotionUITransition("snap");
  const { motionMode } = useMotionUITheme();
  const still = motionMode === "off";

  useFocusTrap({ active: open, container: panelRef, initialFocus: inputRef, onEscape: () => setOpen(false) });
  useScrollLock(open);

  return (
    <>
      <ToolButton
        tone="ghost"
        icon={<Search className="size-4" />}
        aria-label={t("search.open")}
        title={t("search.open")}
        onClick={() => setOpen(true)}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            key="commit-search-sheet"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("search.sheet.title")}
            initial={still ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ ...ui }}
            className="fixed inset-0 z-50 flex flex-col bg-background"
          >
            <header className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-rail px-3 py-2">
              <Search className="size-4 shrink-0 text-primary" />
              <h2 className="font-heading text-sm font-semibold text-foreground">
                {t("search.sheet.title")}
              </h2>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("search.close")}
                title={t("search.close")}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground",
                  "transition-colors hover:bg-accent hover:text-foreground",
                  "duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
                  "touch:size-tap",
                  FOCUS_RING,
                )}
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="px-3 py-3">
              <div className="relative">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={inputRef}
                  type="search"
                  value={local}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder={t("search.placeholder")}
                  aria-label={t("search.aria")}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={cn(
                    "h-11 w-full rounded-lg border border-border bg-card pr-10 pl-10",
                    /*
                     * text-base (16px) e o minimo que o Safari iOS respeita sem
                     * dar zoom no foco; o input inline pode ficar em text-xs
                     * porque so existe onde o ponteiro e fino. O clear nativo
                     * do webkit some para nao disputar com o nosso (que tem o
                     * alvo de 44px — o nativo tem ~16px, inalcancavel no dedo).
                     */
                    "text-base text-foreground placeholder:text-muted-foreground",
                    "[&::-webkit-search-cancel-button]:hidden",
                    "transition-colors duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
                    "hover:border-primary/30 focus:border-primary/50",
                    FOCUS_RING,
                  )}
                />
                <AnimatePresence>
                  {local.length > 0 && (
                    <motion.button
                      type="button"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ ...snap }}
                      onClick={clear}
                      aria-label={t("search.clear")}
                      className={cn(
                        "absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md",
                        "text-muted-foreground hover:text-foreground",
                        "transition-colors duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
                        "touch:size-tap",
                        FOCUS_RING,
                      )}
                    >
                      <X className="size-4" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
