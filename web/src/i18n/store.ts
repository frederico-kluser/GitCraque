/**
 * O idioma corrente — mesmo motor dos outros dois stores do app (objeto
 * mutavel + `useSyncExternalStore`), sem dependencia nova.
 *
 * Por que um SINGLETON de modulo, e nao um contexto React: metade do texto do
 * app nasce fora de componente — `app/actions.ts` monta os diálogos, o
 * `state/store.ts` emite os toasts, `dialogs/executors.ts` reporta o resultado.
 * Um `useTranslation()` obrigaria a passar `t` por parametro em toda essa
 * cadeia. Com o singleton, qualquer modulo faz `t("chave")`.
 *
 * A re-renderizacao vem do `<LocaleBoundary>` (ver `index.tsx`), que remonta a
 * arvore ao trocar de idioma. Trocar de idioma e raro e deliberado; garantir que
 * NADA fica com texto velho vale mais do que preservar o estado local dos
 * componentes. O estado do repositorio nao se perde: ele mora em modulo, fora
 * do React.
 */
import { createTranslator } from "./translate.ts";
import { en } from "./locales/en.ts";
import { es } from "./locales/es.ts";
import { pt } from "./locales/pt.ts";
import { zh } from "./locales/zh.ts";
import { resolveInitialLocale, writeStoredLocale } from "./detect.ts";
import {
  LOCALE_TAGS,
  type Locale,
  type MessageKey,
  type MessageParams,
  type Messages,
  type Translate,
} from "./types.ts";

const CATALOGS: Record<Locale, Messages> = { en, pt, es, zh };

let locale: Locale = resolveInitialLocale();
/** O ingles e o fallback de chave faltante — e o idioma padrao do app. */
let translator: Translate = createTranslator(CATALOGS[locale], en);

const listeners = new Set<() => void>();

export const getLocale = (): Locale => locale;

/** Tag BCP-47 do idioma corrente, para `Intl.*`. */
export const getLocaleTag = (): string => LOCALE_TAGS[locale];

/** O catalogo cru do idioma corrente — usado pelo motor puro de DND. */
export const getMessages = (): Messages => CATALOGS[locale];

/**
 * `t` do app. Chave desconhecida devolve a propria chave: texto errado na tela
 * e ruim, tela em branco e pior.
 */
export const t = (key: MessageKey, params?: MessageParams): string => translator(key, params);

/** Escreve `lang` no <html>: leitor de tela e hifenizacao dependem disso. */
function applyDocumentLocale(next: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = LOCALE_TAGS[next];
}

export function setLocale(next: Locale) {
  if (next === locale) return;
  locale = next;
  translator = createTranslator(CATALOGS[next], en);
  writeStoredLocale(next);
  applyDocumentLocale(next);
  for (const l of listeners) l();
}

export const subscribeLocale = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

// Antes do primeiro render: o <html lang> ja nasce certo.
applyDocumentLocale(locale);
