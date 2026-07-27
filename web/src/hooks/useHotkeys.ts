/**
 * Atalhos globais do app.
 *
 * Um unico listener em `window` na fase de captura: assim o Esc chega antes de
 * qualquer widget que engula a tecla, e o ⌘Enter funciona mesmo com o foco
 * dentro do textarea de commit.
 *
 * ⌘K nao entra aqui — o `useCommandK` do Motion UI ja instala o proprio
 * listener global; duplicar so faria a paleta abrir e fechar no mesmo evento.
 */
import { useEffect, useRef } from "react";

export interface HotkeyHandlers {
  /** ⌘R / Ctrl+R — recarrega o estado do repositorio (nao a pagina) */
  onRefresh?: () => void;
  /** ⌘Enter — commita o que estiver preparado */
  onCommit?: () => void;
  /** Esc — limpa a selecao */
  onEscape?: () => void;
}

/** Campos onde uma tecla solta (sem modificador) pertence ao usuario. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useHotkeys(handlers: HotkeyHandlers) {
  // Ref para o listener nascer uma vez e nunca ler closure velha.
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key;

      if (mod && key.toLowerCase() === "r" && !event.shiftKey) {
        event.preventDefault();
        ref.current.onRefresh?.();
        return;
      }

      if (mod && key === "Enter") {
        event.preventDefault();
        ref.current.onCommit?.();
        return;
      }

      if (key === "Escape") {
        // Dentro de um campo, o Esc e do campo (fechar autocomplete, etc.).
        if (isTypingTarget(event.target)) return;
        ref.current.onEscape?.();
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
