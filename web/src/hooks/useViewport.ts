/**
 * Viewport — fonte unica de "que tela e esta" e "que ponteiro e este".
 *
 * As duas perguntas sao SEPARADAS de proposito. Um laptop com tela sensivel ao
 * toque e desktop COM toque; um iPad em paisagem tem 1024px de largura (tablet)
 * e ponteiro grosseiro. Decidir layout por `isTouch` erra o primeiro; decidir
 * alvo de clique por `isMobile` erra o segundo.
 *
 * Mesmo motor do `useShellStore` e do `state/store.ts`: objeto mutavel de
 * modulo + Set de listeners + `useSyncExternalStore`. Nenhuma dependencia nova.
 *
 * O que este arquivo NAO faz: nao guarda preferencia, nao persiste nada, nao
 * tem texto de interface. E leitura pura do ambiente.
 */
import { useCallback, useSyncExternalStore } from "react";

/* ------------------------------------------------------------------ */
/* Os cortes                                                           */
/* ------------------------------------------------------------------ */

/**
 * Larguras de corte, em px. Congelado porque e contrato entre frentes: quem
 * escreve uma media query em CSS tem de bater com quem le `isMobile` em JS.
 *
 * `mobile: 768`  — abaixo disso so cabe UMA coluna.
 * `desktop: 1280` — a partir daqui cabem as tres colunas do grid original.
 */
export const BREAKPOINTS = Object.freeze({
  mobile: 768,
  desktop: 1280,
});

/* ------------------------------------------------------------------ */
/* A forma do que se le                                                */
/* ------------------------------------------------------------------ */

export interface Viewport {
  /** `window.innerWidth` em px */
  width: number;
  /** `window.innerHeight` em px */
  height: number;
  /** largura < 768 — uma coluna por vez */
  isMobile: boolean;
  /** 768 <= largura < 1280 — duas colunas cabem, tres nao */
  isTablet: boolean;
  /** largura >= 1280 — o grid de tres colunas original */
  isDesktop: boolean;
  /** `(pointer: coarse)` — o ponteiro PRIMARIO e um dedo */
  coarsePointer: boolean;
  /** `(hover: none)` — nao existe estado de passagem do mouse */
  noHover: boolean;
  /** ha toque disponivel, mesmo que o ponteiro primario seja fino */
  isTouch: boolean;
  /** orientacao de paisagem */
  landscape: boolean;
}

const COARSE_QUERY = "(pointer: coarse)";
const NO_HOVER_QUERY = "(hover: none)";
const LANDSCAPE_QUERY = "(orientation: landscape)";

/**
 * O valor que vale onde nao existe DOM: render de servidor, `node --test`,
 * qualquer importacao fora do navegador. Desktop com ponteiro fino — a hipotese
 * que degrada melhor, porque e o layout que o app ja tinha.
 *
 * Congelado e devolvido SEMPRE pela mesma referencia: `getServerSnapshot` do
 * `useSyncExternalStore` exige um valor constante.
 */
const SERVER_SNAPSHOT: Viewport = Object.freeze({
  width: BREAKPOINTS.desktop,
  height: 900,
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  coarsePointer: false,
  noHover: false,
  isTouch: false,
  landscape: true,
});

/* ------------------------------------------------------------------ */
/* Leitura do ambiente                                                 */
/* ------------------------------------------------------------------ */

const hasWindow = () => typeof window !== "undefined";

/** `matchMedia` falta em ambiente sem DOM e em jsdom antigo — nunca assuma. */
function media(query: string): MediaQueryList | null {
  if (!hasWindow() || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(query);
}

function matches(query: string, fallback: boolean): boolean {
  const mq = media(query);
  return mq ? mq.matches : fallback;
}

/** Monta um snapshot NOVO a partir do ambiente. Nunca chame isto no render. */
function read(): Viewport {
  if (!hasWindow()) return SERVER_SNAPSHOT;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const coarsePointer = matches(COARSE_QUERY, false);
  const noHover = matches(NO_HOVER_QUERY, false);
  /* `maxTouchPoints` pega o caso que nenhuma media query pega: o laptop com
     tela sensivel ao toque, que responde `pointer: fine` porque o ponteiro
     PRIMARIO dele e o trackpad. */
  const touchPoints = typeof navigator !== "undefined" ? (navigator.maxTouchPoints ?? 0) : 0;

  return {
    width,
    height,
    isMobile: width < BREAKPOINTS.mobile,
    isTablet: width >= BREAKPOINTS.mobile && width < BREAKPOINTS.desktop,
    isDesktop: width >= BREAKPOINTS.desktop,
    coarsePointer,
    noHover,
    isTouch: coarsePointer || noHover || touchPoints > 0,
    /* Sem suporte a `(orientation:)` a razao das medidas resolve igual. */
    landscape: matches(LANDSCAPE_QUERY, width >= height),
  };
}

/**
 * Compara CAMPO A CAMPO, e nao por referencia.
 *
 * E o que permite descartar um snapshot recem-lido e continuar devolvendo o
 * antigo — ver `refresh()`, que e onde a estabilidade de identidade e decidida.
 * Todos os nove campos entram: os derivados nao poderiam ser deduzidos de
 * `width` sozinho (`isTouch` depende de `maxTouchPoints`, que muda quando se
 * pluga um monitor sensivel ao toque).
 */
function same(a: Viewport, b: Viewport): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.isMobile === b.isMobile &&
    a.isTablet === b.isTablet &&
    a.isDesktop === b.isDesktop &&
    a.coarsePointer === b.coarsePointer &&
    a.noHover === b.noHover &&
    a.isTouch === b.isTouch &&
    a.landscape === b.landscape
  );
}

/* ------------------------------------------------------------------ */
/* Estado do modulo                                                    */
/* ------------------------------------------------------------------ */

let snapshot: Viewport = read();
const listeners = new Set<() => void>();

/**
 * Rele o ambiente e, SO SE algum campo mudou, troca a referencia e avisa.
 *
 * Esta guarda e o coracao do arquivo. `useSyncExternalStore` compara o que
 * `getSnapshot()` devolve com `Object.is`: se a referencia mudasse a cada
 * chamada, o React re-renderizaria em laco infinito ("The result of
 * getSnapshot should be cached"). Por isso `getSnapshot` NUNCA consulta o
 * ambiente: ele devolve esta variavel, que so muda aqui.
 */
function refresh() {
  const next = read();
  if (same(snapshot, next)) return;
  snapshot = next;
  for (const l of listeners) l();
}

/* ---- coalescing: resize dispara dezenas de vezes por segundo ---- */

let frame: number | null = null;

function schedule() {
  if (frame !== null) return;
  if (typeof requestAnimationFrame !== "function") {
    refresh();
    return;
  }
  frame = requestAnimationFrame(() => {
    frame = null;
    refresh();
  });
}

/* ---- um unico listener global, montado na primeira subscricao ---- */

let detach: (() => void) | null = null;

function attach() {
  if (detach || !hasWindow()) return;

  const queries = [COARSE_QUERY, NO_HOVER_QUERY, LANDSCAPE_QUERY]
    .map(media)
    .filter((mq): mq is MediaQueryList => mq !== null);

  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("orientationchange", schedule, { passive: true });
  for (const mq of queries) mq.addEventListener("change", schedule);

  detach = () => {
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    for (const mq of queries) mq.removeEventListener("change", schedule);
  };

  /* A tela pode ter mudado enquanto ninguem ouvia — e o modulo foi lido uma vez
     so, na importacao. */
  refresh();
}

function release() {
  if (!detach) return;
  detach();
  detach = null;
  if (frame !== null) {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    frame = null;
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (listeners.size === 1) attach();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) release();
  };
};

/* Referencias estaveis: passar uma seta nova a cada render faria o
   `useSyncExternalStore` re-assinar em todo render. */
const getSnapshot = () => snapshot;
const getServerSnapshot = () => SERVER_SNAPSHOT;

/* ------------------------------------------------------------------ */
/* API publica                                                         */
/* ------------------------------------------------------------------ */

/**
 * Leitura fora do React — handlers, acoes, modulos sem componente.
 *
 * Quando NINGUEM esta assinado nao ha listener instalado e o snapshot pode
 * estar velho, entao rele antes de devolver. Com alguem assinado, devolve o
 * mesmo objeto que os componentes estao vendo.
 */
export function getViewport(): Viewport {
  if (!detach) refresh();
  return snapshot;
}

/** O viewport inteiro. Re-renderiza a cada px de resize — veja `useViewportValue`. */
export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Um campo so, para quem nao quer re-render a cada pixel de resize.
 *
 * O comparador e `Object.is`, entao o seletor tem de ser uma funcao ESTAVEL
 * (constante de modulo) e devolver um valor primitivo. Um seletor montando
 * objeto ou array novo re-renderiza para sempre. Use os `select*` abaixo.
 */
export function useViewportValue<T>(selector: (v: Viewport) => T): T {
  return useSyncExternalStore(
    subscribe,
    useCallback(() => selector(snapshot), [selector]),
    useCallback(() => selector(SERVER_SNAPSHOT), [selector]),
  );
}

/* ---- seletores estaveis ---- */

export const selectIsMobile = (v: Viewport) => v.isMobile;
export const selectIsTablet = (v: Viewport) => v.isTablet;
export const selectIsDesktop = (v: Viewport) => v.isDesktop;
export const selectIsTouch = (v: Viewport) => v.isTouch;
export const selectCoarsePointer = (v: Viewport) => v.coarsePointer;
export const selectLandscape = (v: Viewport) => v.landscape;
