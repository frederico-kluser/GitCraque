/**
 * Hook de tema — fonte unica da aparencia claro/escuro/sistema.
 *
 * Separado do `useShellStore` de proposito: o tema e a unica preferencia que
 * PRECISA agir antes do primeiro render (evitar o flash branco) e a unica que
 * escuta um evento do sistema operacional (`prefers-color-scheme`). A chave de
 * localStorage tambem e propria (`gitcraque-theme`, nao `gitcraque.shell`),
 * para o valor "system" nao confundir leitores antigos que esperavam so
 * "light"/"dark".
 */

import { useEffect, useSyncExternalStore } from "react";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

/** "system" segue o SO; os outros dois ignoram a preferencia. */
export type ThemeMode = "light" | "dark" | "system";

/* ------------------------------------------------------------------ */
/* Estado do modulo — mesmo padrao do `useShellStore`                  */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "gitcraque-theme";

function readStored(): ThemeMode {
  if (typeof localStorage === "undefined") return "system";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* modo privado: segue sem gravar */
  }
  return "system";
}

function writeStored(mode: ThemeMode) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* silencioso — a UI segue, so nao lembra */
  }
}

/** A preferencia do SO AGORA — "light" ou "dark". */
export function systemPrefers(): "light" | "dark" {
  if (typeof matchMedia !== "function") return "dark";
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** O tema efetivo: resolve "system" para o que o SO pede. */
export function resolvedTheme(mode: ThemeMode): "light" | "dark" {
  return mode === "system" ? systemPrefers() : mode;
}

/** Aplica a classe e o `color-scheme` no <html>. Idempotente. */
export function applyThemeClass(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const dark = resolvedTheme(mode) === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/* ---- estado do modulo ---- */

let mode: ThemeMode = readStored();
const listeners = new Set<() => void>();

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

function notify() {
  for (const l of listeners) l();
}

/** Troca o modo e persiste. Dispara os listeners (hooks re-renderizam). */
export function setThemeMode(next: ThemeMode) {
  if (next === mode) return;
  mode = next;
  writeStored(next);
  applyThemeClass(next);
  notify();
}

export function getThemeMode(): ThemeMode {
  return mode;
}

/** Alterna entre claro e escuro (pula "system"). */
export function toggleTheme() {
  const effective = resolvedTheme(mode);
  setThemeMode(effective === "dark" ? "light" : "dark");
}

/* ------------------------------------------------------------------ */
/* Aplica o tema antes do primeiro render — mata o flash.              */
/* ------------------------------------------------------------------ */

if (typeof document !== "undefined") {
  applyThemeClass(mode);
}

/* ------------------------------------------------------------------ */
/* Hook React                                                          */
/* ------------------------------------------------------------------ */

/**
 * Gancho que expoe o modo de tema e reage a mudancas do SO.
 *
 * Chamado UMA vez em `main.tsx`, antes do render. Enquanto montado:
 *  - escuta `prefers-color-scheme` (so quando o modo e "system");
 *  - limpa o listener ao desmontar.
 *
 * O estado do modulo ja aplicou a classe antes do primeiro paint; o listener
 * cobre o caso de a pessoa trocar a preferencia do SO com o app aberto.
 */
export function useTheme() {
  const current = useSyncExternalStore(subscribe, () => mode);

  useEffect(() => {
    if (typeof matchMedia !== "function") return;

    const mq = matchMedia("(prefers-color-scheme: dark)");

    const onChange = () => {
      /* So reage quando o modo e "system" — se a pessoa escolheu "dark"
         explicitamente, uma mudanca no SO nao altera a aparencia. */
      if (mode === "system") {
        applyThemeClass("system");
        notify();
      }
    };

    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return current;
}
