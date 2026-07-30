/**
 * Barra de busca de commits — filtra o historico por texto na mensagem.
 *
 * Debounce de 300ms: cada tecla reseta o temporizador; so a ultima digitaçao
 * em 300ms dispara a busca. O componente guarda o valor local para o input
 * responder na hora, mas so propaga para o store depois do debounce.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Search, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAppState, setSearchText, selectSearchText } from "@/state/store";
import { useMotionUITransition } from "@/components/motion-ui/ui-theme";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./parts";

const DEBOUNCE_MS = 300;

export function CommitSearch({ className }: { className?: string }) {
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

  const hasSearch = searchText.length > 0;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          value={local}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("search.placeholder")}
          aria-label={t("search.aria")}
          className={cn(
            "h-8 w-full rounded-md border border-border bg-card pl-8 pr-8",
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
                "absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5",
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
