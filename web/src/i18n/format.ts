/**
 * Formatadores sensiveis ao idioma.
 *
 * Tudo aqui existe porque havia numero, data e tamanho cravados em `pt-BR` no
 * codigo (`Intl.DateTimeFormat("pt-BR")`, `toLocaleString("pt-BR")`, o `.` que
 * virava `,` na mao). Com quatro idiomas, isso passa a sair do `Intl` com a tag
 * do idioma corrente.
 */
import { getLocale, getLocaleTag, t } from "./store.ts";

/** Cache por tag: `Intl.*` e caro de construir e o idioma quase nunca muda. */
const dateTimeCache = new Map<string, Intl.DateTimeFormat>();
const numberCache = new Map<string, Intl.NumberFormat>();

function dateTimeFormat(): Intl.DateTimeFormat {
  const tag = getLocaleTag();
  let fmt = dateTimeCache.get(tag);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" });
    dateTimeCache.set(tag, fmt);
  }
  return fmt;
}

function numberFormat(): Intl.NumberFormat {
  const tag = getLocaleTag();
  let fmt = numberCache.get(tag);
  if (!fmt) {
    fmt = new Intl.NumberFormat(tag);
    numberCache.set(tag, fmt);
  }
  return fmt;
}

/** Data absoluta do detalhe do commit. String invalida volta como veio. */
export function formatDateTime(raw: string): string {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : dateTimeFormat().format(date);
}

export const formatNumber = (value: number): string => numberFormat().format(value);

/** Bytes legiveis: 812 B, 41,2 kB, 2.3 MB — o separador decimal vem do idioma. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${formatNumber(bytes)} B`;
  const units = ["kB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const tag = getLocaleTag();
  return `${value.toLocaleString(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${units[unit]}`;
}

/**
 * "ha quanto tempo" a partir de um instante — os recentes do seletor.
 * Sai do catalogo, e nao de `Intl.RelativeTimeFormat`, porque o texto exato
 * ("agora", "ontem") ja era escolha de produto antes do i18n.
 */
export function formatRelativeTime(ms: number, now = Date.now()): string {
  const seconds = Math.max(1, Math.round((now - ms) / 1000));
  if (seconds < 60) return t("time.now");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t("time.minutesAgo", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("time.hoursAgo", { count: hours });
  const days = Math.round(hours / 24);
  return days === 1 ? t("time.yesterday") : t("time.daysAgo", { count: days });
}

/**
 * A data relativa do log (`%ar` do git) reescrita no idioma da interface.
 *
 * O backend fixa `LC_ALL=C`, entao `relativeDate` chega SEMPRE em ingles
 * ("3 days ago") — e e disso que `hooks/useCommitActivity` depende para montar
 * o sparkline. Traduzir no backend quebraria aquele parser; aqui a string
 * original continua intacta no payload e so a exibicao muda.
 *
 * Em ingles devolve o que veio: o proprio git ja escreveu certo.
 */
const RELATIVE_UNITS: Array<[RegExp, Intl.RelativeTimeFormatUnit]> = [
  [/^(\d+)\s+seconds?\s+ago$/, "second"],
  [/^(\d+)\s+minutes?\s+ago$/, "minute"],
  [/^(\d+)\s+hours?\s+ago$/, "hour"],
  [/^(\d+)\s+days?\s+ago$/, "day"],
  [/^(\d+)\s+weeks?\s+ago$/, "week"],
  [/^(\d+)\s+months?\s+ago$/, "month"],
  [/^(\d+)\s+years?\s+ago$/, "year"],
];

const relativeCache = new Map<string, Intl.RelativeTimeFormat>();

export function formatGitRelativeDate(relative: string): string {
  const locale = getLocale();
  if (locale === "en" || !relative) return relative;

  const text = relative.trim().toLowerCase();
  if (text === "just now") return t("time.now");

  for (const [pattern, unit] of RELATIVE_UNITS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const tag = getLocaleTag();
    let fmt = relativeCache.get(tag);
    if (!fmt) {
      fmt = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
      relativeCache.set(tag, fmt);
    }
    return fmt.format(-Number(match[1]), unit);
  }

  // Frase composta ("3 months, 2 weeks ago") ou formato que o git mudou:
  // melhor o ingles cru do que uma traducao pela metade.
  return relative;
}
