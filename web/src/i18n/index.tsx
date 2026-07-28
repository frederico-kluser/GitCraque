/**
 * FRONTEIRA PUBLICA DO I18N. Todo modulo do app importa daqui.
 *
 *   import { t } from "@/i18n";
 *   t("rail.branches.title")
 *   t("changes.filesChanged", { count: n })     // plural por `_one` / `_other`
 *
 * Texto com marcacao no meio (um `<code>`, um `<span className="font-mono">`)
 * usa `<Rich>` em vez de concatenacao: a ordem das palavras muda de idioma para
 * idioma, e um `{"..."} <code>x</code> {"..."}` cravado no JSX so funciona no
 * idioma em que foi escrito.
 *
 *   <Rich k="app.emptyRepo.body" nodes={{ command: <code>git log</code> }} />
 */
import { Fragment, useSyncExternalStore, type ReactNode } from "react";
import { getLocale, setLocale, subscribeLocale, t } from "./store.ts";
import { interpolate } from "./translate.ts";
import { LOCALES, LOCALE_NAMES, LOCALE_TAGS, type Locale, type MessageKey, type MessageParams } from "./types.ts";

export { t, setLocale, getLocale, getLocaleTag, getMessages, subscribeLocale } from "./store.ts";
export { createTranslator, interpolate } from "./translate.ts";
export {
  formatBytes,
  formatDateTime,
  formatGitRelativeDate,
  formatNumber,
  formatRelativeTime,
} from "./format.ts";
export { detectBrowserLocale, normalizeLocale, readStoredLocale } from "./detect.ts";
export { LOCALES, LOCALE_NAMES, LOCALE_TAGS, DEFAULT_LOCALE } from "./types.ts";
export type { Locale, MessageKey, MessageParams, Messages, Translate } from "./types.ts";

/** O idioma corrente, com re-render ao trocar. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}

/**
 * Remonta a arvore inteira quando o idioma muda.
 *
 * O `t` do app e um singleton de modulo (ver `store.ts`), entao um componente
 * que so chama `t()` nao tem como saber que precisa re-renderizar. Trocar a
 * `key` resolve isso de uma vez para o app inteiro — inclusive para o texto que
 * nasce fora do React. O estado do repositorio sobrevive: ele mora em modulo.
 */
export function LocaleBoundary({ children }: { children: ReactNode }) {
  const locale = useLocale();
  return <Fragment key={locale}>{children}</Fragment>;
}

export interface RichProps {
  k: MessageKey;
  /** nos React que entram no lugar de cada `{nome}` */
  nodes?: Record<string, ReactNode>;
  /** valores de texto, interpolados antes dos nos */
  params?: MessageParams;
}

const SPLIT = /(\{[a-zA-Z0-9_]+\})/g;
const NAME = /^\{([a-zA-Z0-9_]+)\}$/;

/** Texto traduzido com nos React no lugar dos placeholders. */
export function Rich({ k, nodes, params }: RichProps) {
  const text = params ? interpolate(t(k), params) : t(k);
  if (!nodes) return <>{text}</>;

  return (
    <>
      {text.split(SPLIT).map((part, index) => {
        const match = NAME.exec(part);
        const node = match ? nodes[match[1]] : undefined;
        if (match && node !== undefined) return <Fragment key={index}>{node}</Fragment>;
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}

/** Lista pronta para o seletor de idioma: valor, nome nativo e tag BCP-47. */
export const LOCALE_OPTIONS: ReadonlyArray<{ value: Locale; label: string; tag: string }> =
  LOCALES.map((value) => ({ value, label: LOCALE_NAMES[value], tag: LOCALE_TAGS[value] }));

/** Troca de idioma vinda da UI — o seletor e a paleta chamam esta. */
export function chooseLocale(next: Locale) {
  setLocale(next);
}
