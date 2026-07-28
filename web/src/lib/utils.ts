import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* --- helpers do GitCraque (o shadcn CLI e dono apenas de `cn` acima) --- */

/** hash curto de 7 caracteres, como o git abrevia. */
export const short = (hash: string, n = 7) => hash.slice(0, n)

/** cor da lane do grafo — 8 matizes ciclicas, definidas em styles/theme.css */
export const LANE_COUNT = 8
export const laneVar = (lane: number) =>
  `var(--lane-${((lane % LANE_COUNT) + LANE_COUNT) % LANE_COUNT})`

/** host de uma url de remote, para casar com o cofre de credenciais. */
export function remoteHost(url: string): string | undefined {
  const https = /^https?:\/\/(?:[^@/]*@)?([^/:]+)/.exec(url)
  if (https) return https[1]
  const scp = /^(?:[^@]+@)?([^:/]+):/.exec(url)
  if (scp) return scp[1]
  return undefined
}

export const isHttpsRemote = (url: string) => /^https?:\/\//.test(url)

/** Abre a url de um remoto no navegador, convertendo scp-like em https.
 * Morava em `app/commands.ts`; veio para ca quando a paleta foi removida, porque
 * quem usa e o menu de contexto de remoto. */
export function browseUrl(raw: string): string | null {
  if (/^https?:\/\//.test(raw)) return raw.replace(/\.git$/, "")
  const scp = /^(?:([^@]+)@)?([^:/]+):(.+)$/.exec(raw)
  if (scp) return `https://${scp[2]}/${scp[3].replace(/\.git$/, "")}`
  return null
}

/* `plural(n, "arquivo", "arquivos")` saiu daqui: ele carregava as duas formas
 * cravadas na chamada, que e exatamente o que o catalogo resolve. Agora e
 * `t("changes.filesChanged", { count: n })`, com as variantes `_one`/`_other`
 * em cada idioma — ver `@/i18n`. */

/** trunca preservando o inicio, com reticencia tipografica. */
export const truncate = (s: string, n: number) =>
  s.length <= n ? s : `${s.slice(0, n - 1)}…`
