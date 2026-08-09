/**
 * Medida do container por ResizeObserver.
 *
 * O `FixedSizeList` do react-window precisa da altura em px para decidir quantas
 * linhas montar. Nao ha AutoSizer instalado (e nao vamos instalar dependencia),
 * entao o modulo mede o proprio container. A largura entrou junto para o aviso
 * de rolagem lateral da densidade compacta: o grafo so avisa que o historico
 * rola para o lado quando a linha e mais larga do que o que cabe na tela.
 */
import { useEffect, useRef, useState } from "react";

export function useElementHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.height ?? 0;
      setHeight((current) => (Math.abs(current - next) < 0.5 ? current : next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, height };
}

/** A largura VISIVEL de um container — a medida do aviso de rolagem lateral. */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth((current) => (Math.abs(current - next) < 0.5 ? current : next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}
