/**
 * De onde sai o idioma, na ordem: escolha salva → navegador → ingles.
 *
 * A regra do produto: o app pega o idioma do NAVEGADOR e, se nao reconhecer
 * nenhum dos quatro, fala ingles. A escolha manual, quando existe, ganha de
 * tudo — quem trocou no seletor nao quer ver a decisao revista a cada reload.
 */
import { DEFAULT_LOCALE, LOCALES, type Locale } from "./types.ts";

export const LOCALE_STORAGE_KEY = "gitcraque.locale";

const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

/**
 * `pt-BR` → `pt`, `zh-Hans-CN` → `zh`, `en_US` → `en`.
 *
 * So a subtag primaria importa: o app nao distingue pt-BR de pt-PT nem
 * zh-Hans de zh-Hant, e fingir que distingue daria catalogo morto.
 */
export function normalizeLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const primary = tag.toLowerCase().replace("_", "-").split("-")[0];
  return isLocale(primary) ? primary : null;
}

/** A escolha manual salva no localStorage, se ainda for um idioma valido. */
export function readStoredLocale(): Locale | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    // modo privado bloqueia o storage: a deteccao do navegador ainda funciona
    return null;
  }
}

export function writeStoredLocale(locale: Locale) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* sem persistencia: a sessao corrente continua no idioma escolhido */
  }
}

/**
 * O que o navegador pede. `navigator.languages` vem em ordem de preferencia,
 * entao o primeiro que o app fala vence — alguem com `["it", "es", "en"]`
 * recebe espanhol, nao ingles.
 */
export function detectBrowserLocale(): Locale | null {
  if (typeof navigator === "undefined") return null;
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of tags) {
    const locale = normalizeLocale(tag);
    if (locale) return locale;
  }
  return null;
}

/** A decisao completa, na ordem do cabecalho deste arquivo. */
export const resolveInitialLocale = (): Locale =>
  readStoredLocale() ?? detectBrowserLocale() ?? DEFAULT_LOCALE;
