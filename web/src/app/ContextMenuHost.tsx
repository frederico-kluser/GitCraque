/**
 * O MENU DE CONTEXTO DO APP — um so, para a tela inteira.
 *
 * Duas responsabilidades, e as duas sao metade da mesma regra:
 *
 *  1. **Desenhar o nosso menu** onde ele faz sentido. Quem clica com o botao
 *     direito num commit, numa branch, num arquivo ou no visualizador chama
 *     `contextMenuFor(...)` e a lista aparece aqui. Nao ha um popup por linha:
 *     a View Tree e virtualizada e montar um `Menu.Root` por commit visivel
 *     seria caro a toa.
 *  2. **Matar o menu do navegador** em todo o resto. Um cliente git de desktop
 *     que oferece "Recarregar" e "Traduzir para o portugues" em cima do grafo
 *     denuncia que e uma pagina web. A unica excecao e onde o menu nativo tem
 *     funcao que nao da para reproduzir — campo de texto: colar, desfazer e
 *     corretor ortografico vivem la.
 *
 * CASCATA: o catalogo do Motion UI e feito de mecanicas de revelacao e gesto —
 * nao ha menu ancorado nele. A semantica (roving focus, Escape, clique fora,
 * `aria`) vem do `Menu` do Base UI, o mesmo caminho que a toolbar e o "⋯" das
 * linhas ja percorrem. O que nao existe pronto e ancorar num PONTO em vez de num
 * elemento; isso e o retangulo virtual aqui embaixo.
 */
import { useEffect, useMemo, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import {
  closeContextMenu,
  selectContextMenu,
  useShellState,
  type ContextMenuRequest,
} from "@/hooks";
import { MENU_POPUP_CLASS, MenuItems } from "@/panels/parts";

/* ------------------------------------------------------------------ */
/* O menu nativo                                                       */
/* ------------------------------------------------------------------ */

/**
 * Onde o menu do navegador continua valendo: campo de texto e area editavel.
 *
 * Nao e leniencia — e o unico lugar onde ele faz coisa que nos nao fazemos.
 * Colar sem atalho, desfazer, e a lista do corretor ortografico nao existem
 * fora do menu nativo, e nenhuma delas se reimplementa a partir de JavaScript.
 */
const EDITAVEL = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

const ehEditavel = (target: EventTarget | null) =>
  target instanceof Element && target.closest(EDITAVEL) !== null;

/**
 * Barra o menu nativo no documento inteiro.
 *
 * Roda na fase de BORBULHA e depois de todo mundo: os alvos que tem menu proprio
 * ja chamaram `preventDefault` e `stopPropagation` no caminho, entao o que chega
 * aqui e exatamente o que nao tem menu — e e isso que precisa ficar sem menu
 * nenhum.
 */
function useSuppressNativeMenu() {
  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (ehEditavel(event.target)) return;
      event.preventDefault();
    };
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, []);
}

/* ------------------------------------------------------------------ */
/* O host                                                              */
/* ------------------------------------------------------------------ */

export function ContextMenuHost() {
  useSuppressNativeMenu();

  const request = useShellState(selectContextMenu);

  /**
   * O pedido some do store no instante em que o menu comeca a fechar, e o popup
   * ficaria vazio durante a animacao de saida. Esta copia segura o conteudo ate
   * o fim da transicao — e por isso que ela existe.
   */
  const [shown, setShown] = useState<ContextMenuRequest | null>(request);
  useEffect(() => {
    if (request) setShown(request);
  }, [request]);

  /**
   * Ancora virtual: um retangulo de tamanho zero no ponto do clique. E o que
   * permite ao Base UI posicionar (e VIRAR, perto da borda da tela) um popup que
   * nao tem elemento gatilho.
   */
  const anchor = useMemo(() => {
    const x = shown?.x ?? 0;
    const y = shown?.y ?? 0;
    return { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) };
  }, [shown?.x, shown?.y]);

  return (
    <Menu.Root
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) closeContextMenu();
      }}
      onOpenChangeComplete={(open) => {
        if (!open) setShown(null);
      }}
    >
      <Menu.Portal>
        <Menu.Positioner
          anchor={anchor}
          side="right"
          align="start"
          sideOffset={2}
          alignOffset={-2}
          /* acima do dialogo de confirmacao (z-60): um menu aberto de dentro de
             um dialogo tem de ficar por cima dele. */
          className="z-[80] outline-none"
        >
          <Menu.Popup
            aria-label={shown?.label}
            /* Movimento pelos tokens do tema, nunca por numero na mao. So
               `opacity` e `transform`; a caixa nao anima. */
            className={`${MENU_POPUP_CLASS} origin-[var(--transform-origin)] transition-[opacity,transform] duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)] data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0`}
          >
            <MenuItems items={shown?.items ?? []} />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
