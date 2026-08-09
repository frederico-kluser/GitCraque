/**
 * Detector de deslize horizontal entre paineis — a navegacao por gesto do
 * layout de coluna unica.
 *
 * No compacto so um painel cabe na tela (rail, grafo ou detalhe) e a barra
 * inferior troca entre eles com botoes. Este componente acrescenta o mesmo
 * comando ao dedo: deslizar para a esquerda avanca para o proximo painel,
 * deslizar para a direita volta. E DETECCAO pura, sem deslocamento visual:
 * `dragConstraints` preso em zero segura o elemento no lugar e a decisao
 * sai do `info.offset` cru do fim do gesto — o motion nao clamp o offset do
 * PanInfo, so o valor visual do `x`.
 *
 * Tres vizinhos delicados, e o trato com cada um:
 *
 *  - ROLAGEM VERTICAL: `drag="x"` instala `touch-action: pan-y` no proprio
 *    elemento, entao o navegador rola as listas nativamente e so o gesto
 *    horizontal chega ao JS. `dragDirectionLock` prende a direcao nos
 *    primeiros 10px de movimento — um comeco de rolagem nunca vira deslize,
 *    e um gesto que o navegador toma para si termina em `pointercancel` com
 *    offset vertical-dominante, que este detector ignora.
 *    (Contrapartida conhecida: a rolagem HORIZONTAL do grafo largo
 *    `GraphView.tsx:491-494` nao existe mais por toque no compacto — o gesto
 *    horizontal e do deslize. Ver handoff da onda 3.)
 *  - DRAG-AND-DROP: enquanto o motor do @dnd-kit arrasta uma linha, este
 *    detector abre mao (`useActiveDrag`) — quem esta deslizando e a linha,
 *    nao o painel. E o deslize NUNCA chama `cancelLongPress()`: o timer do
 *    toque longo morre por conta propria (tolerancia de 10px), como morre
 *    numa rolagem comum.
 *  - MENU DE CONTEXTO: com um menu aberto (o toque longo venceu) o gesto nao
 *    troca de painel — o dedo pertence ao menu, nao a tela.
 *
 * So arma no compacto e com ponteiro de toque; com mouse as colunas ja
 * navegam por teclado e clique. O `aria-live` da `MobileNav` anuncia a
 * troca feita aqui de graca, porque ela vai pelo mesmo `setMobilePane`.
 */
import { useRef } from "react";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { PanInfo } from "motion/react";
import { useActiveDrag } from "@/dnd";
import { selectContextMenu, useShellState } from "@/hooks";
import { cn } from "@/lib/utils";

/** Deslize minimo (px) para trocar de painel. */
export const SWIPE_DISTANCE_PX = 80;

/** Velocidade minima (px/s) para um movimento rapido contar como deslize. */
export const SWIPE_VELOCITY_PX_S = 300;

/** Fracao da largura do container que dispensa a exigencia de velocidade. */
export const SWIPE_WIDTH_FRACTION = 0.4;

interface PaneSwipeProps {
  /** `false` (mouse, layout largo) deixa o envoltorio inerte. */
  enabled: boolean;
  /** Deslize para a esquerda — avanca na ordem dos paineis. */
  onSwipeLeft: () => void;
  /** Deslize para a direita — volta na ordem dos paineis. */
  onSwipeRight: () => void;
  className?: string;
  children: ReactNode;
}

export function PaneSwipe({ enabled, onSwipeLeft, onSwipeRight, className, children }: PaneSwipeProps) {
  const ref = useRef<HTMLDivElement>(null);
  /* Um arrasto do @dnd-kit em curso nao e deslize de painel. */
  const dragging = useActiveDrag() !== null;
  /* Menu aberto e dono do dedo (toque longo venceu). */
  const menuOpen = useShellState(selectContextMenu) !== null;

  const handleDragEnd = (_event: unknown, info: PanInfo) => {
    /* As duas leituras acima sao do RENDER atual: o motion rele as props no
       fim do gesto, entao um arrasto que nasceu depois do dedo descer ainda
       e visto aqui antes de a decisao ser tomada. */
    if (dragging || menuOpen) return;

    const dx = info.offset.x;
    /* Horizontal de verdade: o dedo foi mais para o lado do que para cima. */
    if (Math.abs(dx) <= Math.abs(info.offset.y)) return;

    const width = ref.current?.clientWidth ?? 0;
    const long =
      Math.abs(dx) >= SWIPE_DISTANCE_PX && Math.abs(info.velocity.x) > SWIPE_VELOCITY_PX_S;
    const far = width > 0 && Math.abs(dx) >= width * SWIPE_WIDTH_FRACTION;
    /* Abaixo do limiar nao ha o que animar: o x nunca saiu de zero e o
       deslize apenas nao aconteceu. */
    if (!long && !far) return;

    if (dx < 0) onSwipeLeft();
    else onSwipeRight();
  };

  return (
    <motion.div
      ref={ref}
      className={cn("h-full min-h-0", className)}
      drag={enabled ? "x" : false}
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0}
      onDragEnd={handleDragEnd}
    >
      {children}
    </motion.div>
  );
}
