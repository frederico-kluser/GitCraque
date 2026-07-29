/**
 * A FOTO DO AUTOR — de onde ela vem, e o que aparece quando ela nao existe.
 *
 * Este arquivo e o UNICO lugar do projeto que fala com um servidor de fora.
 * Isso e deliberado e o motivo de ele existir separado: o resto do GitCraque
 * conversa so com o proprio backend em 127.0.0.1, entao a excecao fica
 * confinada, documentada e atras de uma constante que desliga tudo de uma vez.
 *
 * O QUE SAI DAQUI PARA A INTERNET: o SHA-256 do e-mail de cada autor que
 * aparecer na tela, como caminho de uma URL de <img>. Nao sai o e-mail em
 * claro, nao sai nada do repositorio, e nenhuma requisicao parte do servidor.
 * Quem busca e a tag <img> do navegador. Para desligar, `GRAVATAR_ENABLED`
 * abaixo — tudo cai no retrato de iniciais, que nunca depende de rede.
 *
 * REGRA DE CARGA: este modulo e lido direto pelo Node no runner do grafo, sem
 * bundler. Nada de import de runtime com `@/` (so `import type`), e por isso
 * ele devolve um INDICE de lane em vez de uma cor: resolver o indice no token
 * `var(--lane-N)` e trabalho de quem desenha, exatamente como `paint.ts` faz
 * com os apelidos de cor.
 */

/** Chave unica para desligar a busca externa. `false` = so iniciais, zero rede. */
export const GRAVATAR_ENABLED = true;

/**
 * `d=404` e o que torna o fallback possivel: sem conta, o Gravatar devolve 404
 * em vez da silhueta padrao, e o `onError` da <img> nos entrega o controle.
 * Verificado em 2026-07-29: conta real responde 200 image/jpeg; e-mail sem
 * conta responde 404.
 */
const GRAVATAR_BASE = "https://gravatar.com/avatar";

/** Quantidade de matizes de lane — espelha `LANE_COUNT` de `lib/utils.ts`.
 *  Duplicado de proposito: importar de `@/lib/utils` derruba o runner do grafo. */
const LANE_COUNT = 8;

/** Normaliza como o Gravatar manda: minusculas e sem espaco nas pontas. */
const normalize = (email: string): string => email.trim().toLowerCase();

/**
 * URL da foto, ou `null` quando nao da para montar (e-mail vazio, busca
 * desligada, ou ambiente sem `crypto.subtle`).
 *
 * E assincrona porque o unico digest nativo do navegador e assincrono — e o
 * Gravatar aceita SHA-256, o que nos livra de trazer um MD5 so para isto.
 */
export async function gravatarUrl(email: string, size: number): Promise<string | null> {
  const normalized = normalize(email);
  if (!GRAVATAR_ENABLED || !normalized) return null;

  const subtle = globalThis.crypto?.subtle;
  /* contexto inseguro ou runtime sem WebCrypto: segue sem foto, nao quebra */
  if (!subtle) return null;

  try {
    const bytes = new TextEncoder().encode(normalized);
    const digest = await subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `${GRAVATAR_BASE}/${hex}?d=404&s=${size}`;
  } catch {
    return null;
  }
}

/**
 * Iniciais do retrato de reserva: primeira letra do primeiro e do ultimo nome.
 *
 * Nome de uma palavra rende uma letra so — "R" e melhor que "RR". Sem nome
 * util, cai na primeira letra do e-mail; sem nada, "?".
 */
export function initialsOf(name: string, email = ""): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    const first = normalize(email).charAt(0);
    return first ? first.toUpperCase() : "?";
  }
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

/**
 * Lane de cor do retrato de reserva, derivada do e-mail: o mesmo autor recebe
 * sempre a mesma cor, e a cor sai da paleta que o grafo ja usa em vez de um
 * valor novo. FNV-1a — barato, deterministico, e nao precisa ser criptografico.
 */
export function avatarLane(seed: string): number {
  let hash = 0x811c9dc5;
  const text = normalize(seed);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash % LANE_COUNT) + LANE_COUNT) % LANE_COUNT;
}
