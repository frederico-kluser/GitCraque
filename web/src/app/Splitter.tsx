/**
 * Divisoria arrastavel entre as colunas do shell.
 *
 * CASCATA: o catalogo do Motion UI nao tem splitter — nem `resizable`, nem
 * `panel-group`, nem nada equivalente (os 19 componentes instalados sao
 * mecanicas de revelacao, gesto e navegacao). Entao esta e escrita a mao, com o
 * minimo necessario: `setPointerCapture` para o arrasto seguir mesmo fora do
 * elemento, `role="separator"` com as setas do teclado para quem nao usa mouse,
 * e nenhuma animacao — arrastar divisoria e feedback direto, nao coreografia.
 *
 * A largura resultante e persistida pelo shell store (localStorage).
 */
import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

const KEYBOARD_STEP = 16;

export interface SplitterProps {
  /** "x" move a divisoria na horizontal (colunas); "y" na vertical (linhas). */
  axis: "x" | "y";
  /** Valor corrente em px. */
  value: number;
  /** +1 quando arrastar para a direita/baixo AUMENTA o valor; -1 quando diminui. */
  sign?: 1 | -1;
  min: number;
  max: number;
  label: string;
  onChange: (px: number) => void;
}

export function Splitter({ axis, value, sign = 1, min, max, label, onChange }: SplitterProps) {
  const origin = useRef({ pointer: 0, value: 0 });

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      origin.current = { pointer: axis === "x" ? event.clientX : event.clientY, value };
    },
    [axis, value],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const pointer = axis === "x" ? event.clientX : event.clientY;
      onChange(origin.current.value + (pointer - origin.current.pointer) * sign);
    },
    [axis, sign, onChange],
  );

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const decrease = axis === "x" ? "ArrowLeft" : "ArrowUp";
      const increase = axis === "x" ? "ArrowRight" : "ArrowDown";
      if (event.key !== decrease && event.key !== increase) return;
      event.preventDefault();
      const delta = (event.key === increase ? KEYBOARD_STEP : -KEYBOARD_STEP) * sign;
      onChange(value + delta);
    },
    [axis, sign, value, onChange],
  );

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onChange(Math.round((min + max) / 2))}
      className={cn(
        "group relative shrink-0 touch-none bg-border transition-colors",
        "duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
        "hover:bg-primary focus-visible:bg-primary focus-visible:outline-none",
        axis === "x" ? "w-px cursor-col-resize" : "h-px cursor-row-resize",
      )}
    >
      {/* Alvo de arrasto maior que a linha de 1px, sem engordar o layout. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute",
          axis === "x" ? "inset-y-0 -left-1 -right-1" : "inset-x-0 -top-1 -bottom-1",
        )}
      />
    </div>
  );
}
