/**
 * Vocabulario do i18n — o unico lugar que declara quais idiomas existem.
 *
 * `pt` e o catalogo MESTRE: o tipo `MessageKey` sai dele, entao um idioma que
 * esqueca uma chave nao compila. Acrescentar texto novo e sempre: escreve em
 * `locales/pt.ts`, o `tsc` aponta os tres arquivos que faltam.
 */
import type { pt } from "./locales/pt.ts";

/** Ordem = ordem do seletor de idioma. */
export const LOCALES = ["en", "pt", "es", "zh"] as const;

export type Locale = (typeof LOCALES)[number];

/** Sem idioma reconhecido no navegador, o app fala ingles. */
export const DEFAULT_LOCALE: Locale = "en";

/** Nome de cada idioma NO PROPRIO idioma — nunca traduzido. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  pt: "Português",
  es: "Español",
  zh: "中文",
};

/** Tag BCP-47 para `Intl.*` e para o atributo `lang` do <html>. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: "en-US",
  pt: "pt-BR",
  es: "es-ES",
  zh: "zh-CN",
};

/** As chaves que existem MESMO no arquivo — inclusive as variantes `_one`/`_other`. */
export type CatalogKey = keyof typeof pt;

/**
 * A raiz de um par de plural: de `changes.staged_one` sai `changes.staged`.
 * Ela nao existe no catalogo, mas E o que se passa para `t` — o tradutor
 * escolhe a variante pelo `count`. Sem isto, chamar `t("changes.staged", ...)`
 * seria erro de tipo, e cravar `_other` na chamada perderia o singular.
 */
type PluralBase<K> = K extends `${infer Base}_one` ? Base : never;

/** O que `t()` aceita: chave literal ou raiz de plural. */
export type MessageKey = CatalogKey | PluralBase<CatalogKey>;

/** Todo idioma tem de cobrir o catalogo inteiro, variantes de plural incluidas. */
export type Messages = Record<CatalogKey, string>;

/** Valores interpolados em `{nome}`. */
export type MessageParams = Record<string, string | number>;

export type Translate = (key: MessageKey, params?: MessageParams) => string;
