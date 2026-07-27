/**
 * Atividade de commits por semana, para o `Sparkline` do cabecalho.
 *
 * O historico obrigatorio do produto sai com `%ar` (data RELATIVA: "3 days
 * ago"); nao ha data absoluta no payload do log. Como o backend fixa
 * `LC_ALL=C`, essa string e estavel em ingles e da para converter em "ha quantos
 * dias" com precisao suficiente para um grafico de 1 pixel por semana.
 */
import { useMemo } from "react";
import type { RawCommit } from "@/types/git";

const DAY = 1;
const WEEK = 7;
const MONTH = 30.44;
const YEAR = 365.25;

const UNIT_DAYS: Record<string, number> = {
  second: 1 / 86_400,
  minute: 1 / 1_440,
  hour: 1 / 24,
  day: DAY,
  week: WEEK,
  month: MONTH,
  year: YEAR,
};

/**
 * "2 weeks ago" → 14; "3 months, 2 weeks ago" → 105,3; "just now" → 0.
 * Soma todos os pares `<n> <unidade>` que aparecerem na frase.
 */
export function relativeDateToDays(relative: string): number {
  let days = 0;
  let matched = false;
  const re = /(\d+)\s+(second|minute|hour|day|week|month|year)s?/g;
  for (const m of relative.matchAll(re)) {
    const factor = UNIT_DAYS[m[2]];
    if (factor === undefined) continue;
    days += Number(m[1]) * factor;
    matched = true;
  }
  return matched ? days : 0;
}

export interface CommitActivity {
  /** contagem por semana, da mais ANTIGA para a mais recente (ordem do Sparkline) */
  history: number[];
  /** commits na semana corrente */
  lastWeek: number;
  /** total considerado na janela */
  windowTotal: number;
  /** semanas cobertas */
  weeks: number;
}

/**
 * Distribui os commits carregados nas ultimas `weeks` semanas.
 * Commits mais antigos que a janela ficam de fora — o grafico e de atividade
 * recente, nao do repositorio inteiro.
 */
export function useCommitActivity(commits: RawCommit[], weeks = 16): CommitActivity {
  return useMemo(() => {
    const buckets = new Array<number>(weeks).fill(0);
    let windowTotal = 0;

    for (const commit of commits) {
      const days = relativeDateToDays(commit.relativeDate);
      const index = weeks - 1 - Math.floor(days / WEEK);
      if (index < 0 || index >= weeks) continue;
      buckets[index] += 1;
      windowTotal += 1;
    }

    return { history: buckets, lastWeek: buckets[weeks - 1] ?? 0, windowTotal, weeks };
  }, [commits, weeks]);
}
