/**
 * Rolagem que gruda no fim SEM roubar o scroll do usuario.
 *
 * A regra: so rola sozinho quando o usuario ja estava no fim. Assim que ele
 * sobe para ler uma saida antiga, o auto-scroll desliga; ao voltar ao rodape,
 * religa. E o comportamento de qualquer terminal decente.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Folga em px para considerar "no fim" — evita desligar por 1px de subpixel. */
const BOTTOM_SLACK = 24;

export function useStickToBottom<T extends HTMLElement>(dependency: unknown) {
  const ref = useRef<T>(null);
  const [pinned, setPinned] = useState(true);
  // Ref espelha o estado para o efeito de scroll nao depender do render.
  const pinnedRef = useRef(true);
  pinnedRef.current = pinned;

  const onScroll = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    setPinned(distance <= BOTTOM_SLACK);
  }, []);

  const scrollToBottom = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
    setPinned(true);
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node || !pinnedRef.current) return;
    node.scrollTop = node.scrollHeight;
  }, [dependency]);

  return { ref, pinned, onScroll, scrollToBottom };
}
