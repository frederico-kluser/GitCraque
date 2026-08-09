/**
 * Driver de hook: monta `useViewport()` / `useViewportValue()` DE VERDADE,
 * fora de um renderizador, e conta re-renders.
 *
 * NAO e um teste (o glob da suite e `*.test.mjs`).
 *
 * ── Por que isto precisa existir ──────────────────────────────────────
 *
 * `subscribe` e `getSnapshot` sao constantes de MODULO em `useViewport.ts`:
 * nao ha export para elas. O unico caminho ate o ciclo de vida do listener
 * global — que e o item mais importante a testar — passa por dentro do hook.
 *
 * E `react-dom/server` nao serve: o render de servidor chama `getServerSnapshot`
 * e NUNCA chama `subscribe`. Um teste de assinatura via `renderToStaticMarkup`
 * mediria zero.
 *
 * ── Como funciona ─────────────────────────────────────────────────────
 *
 * O React resolve todo hook pelo "dispatcher" corrente, publicado em
 * `React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H`.
 * Trocando `H` por um objeto proprio durante a chamada, a funcao do hook de
 * producao roda LITERALMENTE — mesmo codigo, mesmos argumentos — e este arquivo
 * recebe o `subscribe` e o `getSnapshot` que ela passou.
 *
 * ── O que isto e, e o que NAO e ───────────────────────────────────────
 *
 * O `useSyncExternalStore` aqui e um MODELO do algoritmo do React, nao o React:
 * renderiza, assina depois do render, e a cada notificacao rele `getSnapshot()`
 * e compara com `Object.is` — desistindo quando o valor nao mudou, que e
 * exatamente a regra de bailout do React. E deliberado dizer isto em voz alta:
 * o que os testes de contagem de render provam e que o STORE respeita o
 * contrato do qual o React depende, e nao que o React reconciliou. Provar
 * reconciliacao exigiria DOM, e um DOM falso provaria menos do que este modelo,
 * nao mais.
 *
 * Limite conhecido: `useCallback` memoiza por posicao de chamada, e o store e
 * unico por hook montado. Serve para os dois hooks deste modulo e nao pretende
 * servir para outros.
 */
import * as React from "react";

const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

const sameDeps = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * Monta `hook` e devolve o painel de controle.
 *
 * `mount()` roda o render inicial e SO DEPOIS assina, como o efeito do React.
 */
export function mountHook(hook) {
  const slots = [];
  let cursor = 0;

  let subscribeFn = null;
  let getSnapshotFn = null;
  let subscribeIdentities = 0;

  let value;
  let renders = 0;
  let notifications = 0;
  let unsubscribe = null;
  let live = false;

  const dispatcher = {
    useCallback(fn, deps) {
      const index = cursor++;
      const slot = slots[index];
      if (slot && sameDeps(slot.deps, deps)) return slot.fn;
      slots[index] = { fn, deps };
      return fn;
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      if (subscribe !== subscribeFn) subscribeIdentities += 1;
      subscribeFn = subscribe;
      getSnapshotFn = getSnapshot;
      return getSnapshot();
    },
  };

  function render() {
    cursor = 0;
    const previous = internals.H;
    internals.H = dispatcher;
    try {
      value = hook();
    } finally {
      internals.H = previous;
    }
    renders += 1;
    return value;
  }

  /* A regra de bailout do React: rele o snapshot e so re-renderiza se ele
     mudou por `Object.is`. E aqui que um `getSnapshot` instavel viraria laco
     infinito num React de verdade — e aqui que este teste o pegaria. */
  function handleStoreChange() {
    notifications += 1;
    const next = getSnapshotFn();
    if (Object.is(next, value)) return;
    render();
  }

  const api = {
    mount() {
      render();
      unsubscribe = subscribeFn(handleStoreChange);
      live = true;
      return api;
    },
    /** Re-render forcado, como um pai que re-renderiza o filho. */
    rerender() {
      const before = subscribeFn;
      render();
      /* O React re-assina quando a identidade de `subscribe` muda. */
      if (live && subscribeFn !== before) {
        unsubscribe();
        unsubscribe = subscribeFn(handleStoreChange);
      }
      return api;
    },
    unmount() {
      if (!live) return api;
      live = false;
      unsubscribe();
      return api;
    },
    /** Chama o unsubscribe de novo — o que o StrictMode faz de proposito. */
    unsubscribeAgain() {
      unsubscribe();
      return api;
    },
    value: () => value,
    renders: () => renders,
    notifications: () => notifications,
    subscribeIdentities: () => subscribeIdentities,
  };

  return api;
}

/**
 * Extrai o `subscribe` e o `getSnapshot` que o hook entrega ao React, sem
 * montar nada. E o acesso cru ao store, que nao tem export proprio.
 */
export function captureStore(viewport, hook = viewport.useViewport) {
  let captured = null;
  const dispatcher = {
    useCallback: (fn) => fn,
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
      captured = { subscribe, getSnapshot, getServerSnapshot };
      return getSnapshot();
    },
  };
  const previous = internals.H;
  internals.H = dispatcher;
  try {
    hook();
  } finally {
    internals.H = previous;
  }
  return captured;
}

/** Assina o store cru, sem render, para os testes de ciclo de vida do listener. */
export function rawSubscribe(viewport, listener = () => {}) {
  return captureStore(viewport).subscribe(listener);
}
