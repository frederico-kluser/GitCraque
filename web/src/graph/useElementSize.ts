/**
 * Medida do container por ResizeObserver.
 *
 * O `FixedSizeList` do react-window precisa da altura em px para decidir quantas
 * linhas montar. Nao ha AutoSizer instalado (e nao vamos instalar dependencia),
 * entao o modulo mede o proprio container.
 *
 * So a ALTURA e medida. A largura tinha um hook irmao aqui, para o aviso de
 * rolagem lateral do compacto; ele saiu junto com o teto da coluna: a janela
 * horizontal do grafo passou a ser `graphColumnBox`, um numero que se sabe sem
 * perguntar ao navegador, e medir de novo o que ja se sabe so trazia um
 * ResizeObserver a mais e um primeiro render com largura 0.
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
