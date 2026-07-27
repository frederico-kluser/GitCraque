/**
 * Progresso "gotejante" para operacoes sem percentual.
 *
 * O evento `op:progress` do backend traz mensagem, e o store guarda so o
 * rotulo — nao ha percentual confiavel para fetch/rebase/push. Em vez de
 * inventar um numero, a barra avanca em passos cada vez menores rumo a um teto
 * (nunca chega em 100% sozinha) e so fecha em 1 quando a operacao termina de
 * verdade. E o comportamento honesto: mostra que algo esta acontecendo sem
 * mentir sobre o quanto falta.
 */
import { useEffect, useState } from "react";

const CEILING = 0.9;
const STEP_MS = 320;

export function useTrickle(active: boolean): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) {
      // fecha a barra e some — o reset so vale depois da animacao de saida
      setValue((v) => (v > 0 ? 1 : 0));
      const t = setTimeout(() => setValue(0), 400);
      return () => clearTimeout(t);
    }

    setValue(0.08);
    const timer = setInterval(() => {
      setValue((v) => v + (CEILING - v) * 0.18);
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [active]);

  return value;
}
