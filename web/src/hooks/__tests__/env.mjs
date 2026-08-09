/**
 * Ambiente de navegador falso para a suite de `useViewport.ts`.
 *
 * NAO e um teste: o glob da suite e `*.test.mjs`, entao este arquivo nunca e
 * coletado pelo `node --test`. Mesma convencao do runner do grafo, onde um
 * helper nao pode terminar em `.test.ts` sob pena de virar suite.
 *
 * ── Por que um ambiente artesanal ─────────────────────────────────────
 *
 * O repositorio tem UMA dependencia de backend (`ws`) e a instrucao e manter
 * assim: sem jsdom, sem happy-dom, sem vitest. O que `useViewport.ts` consome
 * do navegador cabe em nove nomes — `window.innerWidth`, `window.innerHeight`,
 * `window.matchMedia`, `window.addEventListener`, `window.removeEventListener`,
 * `navigator.maxTouchPoints`, `requestAnimationFrame`, `cancelAnimationFrame` e
 * a propria existencia de `window`. Um DOM inteiro seria peso morto, e pior:
 * um jsdom esconde justamente o que estes testes querem enxergar, que e a
 * CONTAGEM de listeners vivos e o instante exato em que um frame roda.
 *
 * ── Ordem obrigatoria ─────────────────────────────────────────────────
 *
 * `useViewport.ts` le o ambiente no ESCOPO DO MODULO (`let snapshot = read()`),
 * entao o ambiente tem de existir ANTES do import. Por isso `freshViewport()`
 * instala e so depois importa, e por isso o import e dinamico.
 *
 * ── Instancia limpa por teste ─────────────────────────────────────────
 *
 * O cache de modulos do Node e por URL, incluindo a query string. `?instance=N`
 * devolve um modulo NOVO, com `snapshot`, `listeners`, `frame` e `detach`
 * zerados. Sem isso o estado de um teste vazaria para o proximo, e a suite
 * inteira viraria uma unica ordem de execucao fragil.
 */

const MODULE_URL = new URL("../useViewport.ts", import.meta.url).href;

let instances = 0;

/** As tres consultas que o modulo de producao observa. */
export const COARSE = "(pointer: coarse)";
export const NO_HOVER = "(hover: none)";
export const LANDSCAPE = "(orientation: landscape)";

/**
 * Planta `window`, `navigator`, `requestAnimationFrame` e `cancelAnimationFrame`
 * em `globalThis` e devolve o painel de controle deles.
 *
 * `globalThis.navigator` existe no Node 24 como getter sem setter, entao
 * atribuicao simples falha em modulo ESM (modo estrito). `defineProperty` e o
 * unico caminho.
 */
export function installEnv(options = {}) {
  const {
    width = 1440,
    height = 900,
    media = {},
    maxTouchPoints = 0,
    hasWindow = true,
    hasMatchMedia = true,
    hasRaf = true,
    hasCancelRaf = true,
    hasNavigator = true,
  } = options;

  const mediaState = new Map(Object.entries(media));
  const mqls = [];
  const windowListeners = new Map();
  const calls = { windowAdd: 0, windowRemove: 0, mediaAdd: 0, mediaRemove: 0, matchMedia: 0 };
  const optionsSeen = [];

  /* MediaQueryList falso. `matches` e um getter porque o objeto de verdade e
     VIVO: o navegador atualiza a propriedade do mesmo objeto quando o ambiente
     muda, e o modulo de producao guarda essas referencias dentro do `attach`. */
  const makeMql = (query) => {
    const listeners = new Set();
    const mql = {
      media: query,
      get matches() {
        return mediaState.get(query) === true;
      },
      addEventListener(type, fn) {
        if (type !== "change") return;
        listeners.add(fn);
        calls.mediaAdd += 1;
      },
      removeEventListener(type, fn) {
        if (type !== "change") return;
        listeners.delete(fn);
        calls.mediaRemove += 1;
      },
    };
    Object.defineProperty(mql, "listeners", { value: listeners });
    mqls.push(mql);
    return mql;
  };

  const fakeWindow = {
    innerWidth: width,
    innerHeight: height,
    addEventListener(type, fn, opts) {
      let set = windowListeners.get(type);
      if (!set) {
        set = new Set();
        windowListeners.set(type, set);
      }
      set.add(fn);
      calls.windowAdd += 1;
      optionsSeen.push({ type, options: opts });
    },
    removeEventListener(type, fn) {
      windowListeners.get(type)?.delete(fn);
      calls.windowRemove += 1;
    },
  };

  if (hasMatchMedia) {
    /* O navegador devolve um objeto NOVO a cada chamada — replicado de
       proposito, porque e o que torna possivel o modulo remover o listener de
       um objeto e deixar outro vazando. */
    fakeWindow.matchMedia = (query) => {
      calls.matchMedia += 1;
      return makeMql(query);
    };
  }

  const frames = new Map();
  let nextFrame = 1;

  define("window", hasWindow ? fakeWindow : undefined);
  define("navigator", hasNavigator ? { maxTouchPoints } : undefined);
  define(
    "requestAnimationFrame",
    hasRaf
      ? (cb) => {
          const id = nextFrame++;
          frames.set(id, cb);
          return id;
        }
      : undefined,
  );
  define("cancelAnimationFrame", hasCancelRaf ? (id) => void frames.delete(id) : undefined);

  const env = {
    window: fakeWindow,
    calls,
    optionsSeen,

    /** Redimensiona. Nao dispara evento nenhum: quem dispara e o teste. */
    setSize(nextWidth, nextHeight) {
      fakeWindow.innerWidth = nextWidth;
      if (nextHeight !== undefined) fakeWindow.innerHeight = nextHeight;
    },

    /** Muda o resultado de uma media query, em todos os MQL vivos dela. */
    setMedia(query, value) {
      mediaState.set(query, value);
    },

    setTouchPoints(points) {
      define("navigator", { maxTouchPoints: points });
    },

    /** Dispara um evento de `window`. Devolve quantos handlers rodaram. */
    fire(type) {
      const set = windowListeners.get(type);
      if (!set) return 0;
      const handlers = [...set];
      for (const fn of handlers) fn({ type });
      return handlers.length;
    },

    /** Dispara `change` em todo MQL vivo da consulta. */
    fireMediaChange(query) {
      let fired = 0;
      for (const mql of mqls) {
        if (mql.media !== query) continue;
        for (const fn of [...mql.listeners]) {
          fn({ type: "change", matches: mql.matches });
          fired += 1;
        }
      }
      return fired;
    },

    /** Roda os frames pendentes. Devolve quantos rodaram. */
    flushFrames() {
      const pending = [...frames.values()];
      frames.clear();
      for (const cb of pending) cb(0);
      return pending.length;
    },

    pendingFrames: () => frames.size,

    /** Listeners VIVOS de `window` (opcionalmente de um tipo so). */
    windowListenerCount(type) {
      if (type !== undefined) return windowListeners.get(type)?.size ?? 0;
      let total = 0;
      for (const set of windowListeners.values()) total += set.size;
      return total;
    },

    /** Listeners VIVOS espalhados por todos os MediaQueryList ja criados. */
    mediaListenerCount(query) {
      let total = 0;
      for (const mql of mqls) {
        if (query !== undefined && mql.media !== query) continue;
        total += mql.listeners.size;
      }
      return total;
    },

    totalListenerCount() {
      return env.windowListenerCount() + env.mediaListenerCount();
    },
  };

  return env;
}

function define(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

/**
 * Instala o ambiente e SO ENTAO importa uma instancia virgem do modulo.
 * Devolve `{ env, viewport }`.
 */
export async function freshViewport(options = {}) {
  const env = installEnv(options);
  const viewport = await import(`${MODULE_URL}?instance=${++instances}`);
  return { env, viewport };
}
