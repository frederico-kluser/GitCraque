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

export const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

/** trunca preservando o inicio, com reticencia tipografica. */
export const truncate = (s: string, n: number) =>
  s.length <= n ? s : `${s.slice(0, n - 1)}…`
