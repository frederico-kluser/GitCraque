/**
 * O BOTAO DIREITO DO DEDO — toque longo que abre o MESMO menu de contexto.
 *
 * O app inteiro nasce o menu de `onContextMenu` (`contextMenuFor`), que num
 * celular nunca acontece: nao ha botao direito num dedo. Este arquivo e a
 * maquina de estados que reconhece "dedo parado por um tempo" e chama o mesmo
 * `openContextMenu`. Quem liga isso ao store e `longPressMenu`, em
 * `useShellStore.ts` — aqui nao ha store, nao ha React e nao ha texto.
 *
 * ## Nao usa hook nenhum do React
 *
 * `useLongPress` NAO chama `useRef`, `useState` nem `useEffect`: o estado do
 * gesto e de MODULO, porque so existe um ponteiro primario por vez na tela
 * inteira. Isso e o que torna o hook seguro em tres situacoes onde a versao
 * "com useRef" quebraria: chamado condicionalmente, chamado dentro de um `map`
 * de linhas virtualizadas (a linha desmonta durante o gesto e o timer
 * sobreviveria no lugar errado), e chamado fora do React. O nome comeca com
 * `use` por convencao de leitura, nao por obrigacao das regras dos hooks.
 *
 * ## ENCADEAR, nao substituir
 *
 * Os mesmos nos que precisam de menu ja recebem `listeners` do `useDraggable`
 * do @dnd-kit, que instala o PROPRIO `onPointerDown`. Espalhar este bundle por
 * cima apaga o do arraste (e vice-versa), e o `tsc` nao acusa nada. Use
 * `withLongPress()`, que encadeia os cinco e deixa o resto passar:
 *
 *   const press = longPressMenu(label, build);       // de `useShellStore`
 *   <span {...withLongPress(drag.listeners, press)} />
 *
 * Para um handler solto — o `stopPropagation` que `graph/RefChip.tsx` compoe a
 * mao hoje para o arraste do chip nao virar arraste da linha — use `chain()`:
 *
 *   onPointerDown={chain(barrarPropagacao, drag.listeners?.onPointerDown, press.onPointerDown)}
 *
 * ## O que os navegadores realmente fazem (pesquisado, nao suposto)
 *
 *  - **Chrome Android dispara um `contextmenu` sintetico** no toque longo, e ele
 *    e um `PointerEvent` com `pointerType === "touch"`. Sem guarda, o menu
 *    abriria duas vezes: uma pelo nosso timer, outra pelo evento do navegador.
 *    (https://stackoverflow.com/questions/41060472 e
 *    https://caniuse.com/mdn-api_element_contextmenu_event_type_pointerevent)
 *  - **Safari no iOS nao dispara `contextmenu`** — nem no toque longo, nem na
 *    selecao de texto. So o timer funciona la, e o "callout" nativo (Copiar /
 *    Consultar) so morre por CSS: `-webkit-touch-callout: none` mais
 *    `user-select: none`, que sao do agente irmao, dono de `theme.css`.
 *    (https://github.com/mdn/browser-compat-data/issues/6376)
 *  - **`pointercancel`** chega quando o navegador toma o gesto para si: comecou
 *    a rolar, girou a tela, abriu UI do sistema. E cancelamento, nunca disparo.
 *    (https://www.w3.org/TR/pointerevents3/)
 *  - **O clique fantasma** e o `click` emulado que vem depois do gesto de toque.
 *    Se o menu ja abriu, esse clique selecionaria a linha por baixo do menu.
 *    Morre com um listener de `click` de UMA vez so, em fase de CAPTURA.
 */

/* ------------------------------------------------------------------ */
/* A forma do que se devolve                                           */
/* ------------------------------------------------------------------ */

/**
 * Assinaturas propositalmente ESTRUTURAIS (`{ ... }`) e nao
 * `React.PointerEvent`: assim o bundle encadeia com os `listeners` do @dnd-kit,
 * que sao tipados como `SyntheticListenerMap` (handlers de `Event` cru), sem
 * um `as` no meio. Todo campo que se le aqui existe nos dois mundos.
 */
export interface LongPressPointerEvent {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
}

export interface LongPressMouseEvent {
  clientX: number;
  clientY: number;
  preventDefault: () => void;
  stopPropagation: () => void;
}

/** O ponto do gesto, em coordenadas de VIEWPORT — as mesmas do `contextMenuFor`. */
export interface LongPressPoint {
  x: number;
  y: number;
}

/** De onde veio a abertura. `"mouse"` = botao direito; `"touch"` = dedo parado. */
export type LongPressOrigin = "mouse" | "touch";

export interface LongPressOptions {
  /**
   * Chamado quando o gesto vence. Recebe o ponto e QUEM abriu — o consumidor
   * pode querer diferenciar (um menu de dedo cabe menos itens que um de mouse).
   */
  onLongPress: (point: LongPressPoint, origin: LongPressOrigin) => void;
  /**
   * Quanto tempo o dedo fica parado antes de abrir. Obrigatorio de proposito:
   * o numero canonico e `LONG_PRESS_MS`, de `useShellStore.ts`, e nao pode ter
   * uma segunda copia aqui.
   */
  delayMs: number;
  /** Tolerancia de movimento em px. Default `MOVE_TOLERANCE_PX`. */
  moveTolerance?: number;
  /** `false` desliga o bundle inteiro (linha desabilitada, alvo sem menu). */
  enabled?: boolean;
}

export interface LongPressBundle {
  onContextMenu: (event: LongPressMouseEvent) => void;
  onPointerDown: (event: LongPressPointerEvent) => void;
  onPointerUp: (event: LongPressPointerEvent) => void;
  onPointerCancel: (event: LongPressPointerEvent) => void;
  onPointerMove: (event: LongPressPointerEvent) => void;
}

/* ------------------------------------------------------------------ */
/* Numeros                                                             */
/* ------------------------------------------------------------------ */

/**
 * Quanto o dedo pode escorregar sem deixar de ser "parado".
 *
 * 10px e o meio termo medido pelas plataformas: abaixo disso o tremor natural
 * da mao cancelaria menus a esmo; acima, um comeco de rolagem lenta ainda
 * contaria como toque longo e a lista abriria menu ao ser arrastada.
 */
export const MOVE_TOLERANCE_PX = 10;

/**
 * Por quanto tempo, depois de o menu abrir pelo dedo, os eventos emulados sao
 * jogados fora: o `click` fantasma e o `contextmenu` sintetico do Android.
 *
 * Larga o suficiente para cobrir o atraso entre o dedo sair da tela e o clique
 * emulado chegar (que a especificacao nao limita), e curta o suficiente para
 * nunca engolir um clique de verdade — o proximo toque intencional da pessoa
 * leva bem mais que isso, porque ela ainda esta lendo o menu que acabou de
 * abrir.
 */
export const GHOST_WINDOW_MS = 900;

/* ------------------------------------------------------------------ */
/* Estado do gesto — UM para a tela inteira                            */
/* ------------------------------------------------------------------ */

/**
 * So existe um ponteiro primario, entao so existe um gesto armado. Guardar isto
 * no modulo (e nao num `useRef` por componente) resolve de graca o caso que mais
 * doi numa lista virtualizada: a linha some do DOM no meio do gesto e o timer
 * dela nunca seria limpo.
 */
interface ArmedGesture {
  pointerId: number;
  x: number;
  y: number;
  tolerance: number;
  timer: ReturnType<typeof setTimeout>;
}

let armed: ArmedGesture | null = null;

/**
 * Quando o ultimo toque longo venceu. Enquanto estiver dentro da janela, tanto o
 * `contextmenu` sintetico quanto o `click` fantasma sao descartados.
 *
 * `-Infinity` e nao `0`: com `0`, um relogio zerado (`Date.now()` mockado em
 * teste) cairia dentro da janela e engoliria o primeiro evento legitimo.
 */
let firedAt = Number.NEGATIVE_INFINITY;

/**
 * `true` entre o `pointerdown` de um dedo e o `pointerup`/`pointercancel` dele.
 *
 * Junto com a janela fantasma, e o que responde a pergunta "este `contextmenu`
 * que chegou agora e do mouse ou e o sintetico do Android?": no Android o
 * sintetico chega ora com o dedo ainda na tela (pega por esta bandeira), ora
 * logo depois de solta-lo (pega pela janela). As duas guardas juntas cobrem as
 * duas ordens, e nenhuma delas sobrevive ao gesto — um clique direito de mouse
 * um minuto depois volta a ser tratado como mouse.
 */
let touchGestureActive = false;

const now = () => Date.now();

const dentroDaJanela = () => now() - firedAt < GHOST_WINDOW_MS;

/** Desarma o timer sem mexer na janela fantasma nem no gesto em curso. */
function desarmar() {
  if (!armed) return;
  clearTimeout(armed.timer);
  armed = null;
}

/**
 * Cancela QUALQUER toque longo pendente. Publica de proposito: e o gancho que
 * o motor de arraste chama no `onDragStart`.
 *
 * A REGRA, escrita uma vez: `DND_DELAY_MS < LONG_PRESS_MS` (ver
 * `useShellStore.ts`). O arraste por toque acorda ANTES do menu; se ninguem
 * avisasse este modulo, o timer do menu continuaria correndo e o menu abriria
 * no meio do arrasto, com a linha ja colada no dedo.
 */
export function cancelLongPress() {
  desarmar();
  touchGestureActive = false;
}

/**
 * Marca a janela fantasma e instala o matador do proximo `click`.
 *
 * Fase de CAPTURA e uma vez so: em borbulha o clique ja teria selecionado a
 * linha antes de chegar aqui, e um listener permanente engoliria o clique
 * seguinte, que e legitimo.
 */
function abrirJanelaFantasma() {
  firedAt = now();
  if (typeof window === "undefined") return;

  const swallow = (event: Event) => {
    window.removeEventListener("click", swallow, true);
    if (!dentroDaJanela()) return;
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener("click", swallow, true);

  /* Rede de seguranca: nem todo gesto produz clique emulado (o dedo saiu de
     cima do elemento, o navegador nao emula). Sem isto o listener ficaria
     pendurado ate o proximo clique de verdade — que ele deixaria passar, mas
     que nao ha razao para ele ver. */
  setTimeout(() => window.removeEventListener("click", swallow, true), GHOST_WINDOW_MS);
}

/**
 * Estado do modulo zerado — SO para teste. O gesto e global de proposito, e um
 * teste que roda casos em sequencia precisa de um ponto limpo entre eles.
 */
export function resetLongPressForTest() {
  desarmar();
  firedAt = Number.NEGATIVE_INFINITY;
  touchGestureActive = false;
}

/* ------------------------------------------------------------------ */
/* Encadeamento                                                        */
/* ------------------------------------------------------------------ */

/**
 * Roda os handlers na ordem dada, pulando os ausentes.
 *
 * Existe porque o caso normal deste app e um no que JA tem handler: o
 * `useDraggable` do @dnd-kit instala `onPointerDown`, e espalhar dois objetos
 * de props faz o segundo apagar o primeiro em silencio — o arraste morre, ou o
 * menu nunca arma, e nada no `tsc` acusa.
 *
 * `Function` entra no union porque e literalmente o que o @dnd-kit declara: o
 * `SyntheticListenerMap` dele e um `Record<string, Function>`, e sem isto todo
 * consumidor repetiria o `as` que `graph/RefChip.tsx` faz hoje na mao.
 */
export function chain<E>(
  ...handlers: Array<((event: E) => void) | Function | undefined | null>
): (event: E) => void {
  return (event: E) => {
    for (const handler of handlers) {
      if (typeof handler === "function") (handler as (event: E) => void)(event);
    }
  };
}

/**
 * Encadeia o bundle inteiro com os `listeners` do @dnd-kit de UMA vez, e e a
 * forma que os consumidores devem usar.
 *
 * Espalhar os dois objetos separados e a forma errada — e a errada compila:
 * o segundo `onPointerDown` apaga o primeiro e o arraste (ou o menu) morre em
 * silencio. Aqui os cinco handlers saem encadeados, com os do arraste
 * PRIMEIRO, e **todo o resto dos listeners passa intacto** — o que importa
 * porque o `KeyboardSensor` entrega um `onKeyDown` por este mesmo mapa, e
 * perde-lo mataria o arraste por teclado sem erro nenhum de tipo.
 *
 *   <span {...withLongPress(drag.listeners, press)} />
 */
export function withLongPress<L extends Record<string, Function>>(
  /* `Function` e literalmente o que o `SyntheticListenerMap` do @dnd-kit
     declara; tipar mais apertado aqui obrigaria um `as` em cada consumidor. */
  listeners: L | undefined,
  bundle: LongPressBundle,
): L & LongPressBundle {
  return {
    ...(listeners ?? ({} as L)),
    onContextMenu: chain(listeners?.onContextMenu, bundle.onContextMenu),
    onPointerDown: chain(listeners?.onPointerDown, bundle.onPointerDown),
    onPointerUp: chain(listeners?.onPointerUp, bundle.onPointerUp),
    onPointerCancel: chain(listeners?.onPointerCancel, bundle.onPointerCancel),
    onPointerMove: chain(listeners?.onPointerMove, bundle.onPointerMove),
  };
}

/* ------------------------------------------------------------------ */
/* A maquina                                                           */
/* ------------------------------------------------------------------ */

const NOOP_BUNDLE: LongPressBundle = {
  onContextMenu: () => {},
  onPointerDown: () => {},
  onPointerUp: () => {},
  onPointerCancel: () => {},
  onPointerMove: () => {},
};

/**
 * Monta o bundle. Ver o cabecalho do arquivo: nao e um hook do React de
 * verdade, entao chamar em condicional, em laco ou fora de um componente e
 * igualmente valido.
 */
export function useLongPress(options: LongPressOptions): LongPressBundle {
  const { onLongPress, delayMs, moveTolerance = MOVE_TOLERANCE_PX, enabled = true } = options;

  if (!enabled) return NOOP_BUNDLE;

  return {
    /**
     * O caminho do mouse — e o pouso do `contextmenu` sintetico do Android.
     *
     * Tres saidas, nesta ordem, e as duas primeiras existem so por causa do
     * Android, que manda um `contextmenu` proprio no toque longo. Ele chega ora
     * DEPOIS do nosso timer, ora ANTES dele, e as duas ordens acontecem no
     * mesmo aparelho:
     *
     *  1. **ja abriu** (janela fantasma aberta) — o sintetico chegou atrasado.
     *     Barra o menu do navegador e nao abre nada. Sem isto, o menu piscaria e
     *     reabriria no ponto do evento sintetico, que nao e o do dedo;
     *  2. **e toque e ainda nao abriu** — o sintetico se antecipou ao timer.
     *     Abre AQUI e DESARMA o timer, senao ele abriria a segunda copia alguns
     *     ms depois;
     *  3. **mouse de verdade** — o comportamento historico, intacto.
     *
     * Preco conhecido e aceito da saida 1: um clique direito de mouse nos
     * ~900ms seguintes a um toque longo tambem e engolido. Isso exige um
     * aparelho hibrido e as duas maos em menos de um segundo; engolir e a
     * falha segura, porque a alternativa e o menu duplicado no celular, que e
     * o caso comum.
     */
    onContextMenu(event: LongPressMouseEvent) {
      event.preventDefault();
      event.stopPropagation();

      if (dentroDaJanela()) return;

      const pointerType = (event as Partial<LongPressPointerEvent>).pointerType;
      if (touchGestureActive || (pointerType && pointerType !== "mouse")) {
        desarmar();
        abrirJanelaFantasma();
        onLongPress({ x: event.clientX, y: event.clientY }, "touch");
        return;
      }

      onLongPress({ x: event.clientX, y: event.clientY }, "mouse");
    },

    /**
     * Arma o timer. Nunca no mouse: segurar o botao esquerdo nao abre menu de
     * contexto em sistema operacional nenhum, e o mouse ja tem `onContextMenu`.
     */
    onPointerDown(event: LongPressPointerEvent) {
      if (event.pointerType === "mouse") return;

      /* Um segundo dedo enquanto o primeiro esta armado e pinca ou rolagem de
         duas maos — nunca toque longo. Desarma e nao rearma. */
      if (armed) {
        desarmar();
        return;
      }

      touchGestureActive = true;
      const { pointerId, clientX: x, clientY: y } = event;
      armed = {
        pointerId,
        x,
        y,
        tolerance: moveTolerance,
        timer: setTimeout(() => {
          armed = null;
          abrirJanelaFantasma();
          onLongPress({ x, y }, "touch");
        }, delayMs),
      };
    },

    /** Dedo que escorregou alem da tolerancia esta rolando a lista, nao pedindo menu. */
    onPointerMove(event: LongPressPointerEvent) {
      if (!armed || armed.pointerId !== event.pointerId) return;
      const dx = event.clientX - armed.x;
      const dy = event.clientY - armed.y;
      /* Comparacao ao QUADRADO: o mesmo circulo de raio `tolerance`, sem a raiz
         quadrada — e isto roda em todo `pointermove`, que sao dezenas por
         segundo enquanto a lista rola. */
      if (dx * dx + dy * dy > armed.tolerance * armed.tolerance) desarmar();
    },

    /**
     * Dedo levantado. Se foi antes do tempo, nao houve menu; se foi depois, o
     * menu ja abriu e quem cobre o `contextmenu` sintetico que ainda pode vir e
     * a janela fantasma — por isso a bandeira do gesto pode cair aqui em
     * qualquer um dos dois casos.
     */
    onPointerUp(event: LongPressPointerEvent) {
      if (armed && armed.pointerId !== event.pointerId) return;
      desarmar();
      touchGestureActive = false;
    },

    /** O navegador tomou o gesto (rolagem, giro de tela, UI do sistema). */
    onPointerCancel(event: LongPressPointerEvent) {
      if (armed && armed.pointerId !== event.pointerId) return;
      desarmar();
      touchGestureActive = false;
    },
  };
}

/**
 * O mesmo de cima, com nome que nao comeca por `use` — para quem monta o bundle
 * fora de um componente e nao quer o aviso das regras dos hooks.
 */
export const longPressHandlers = useLongPress;
