/**
 * O tradutor — funcao PURA, sem import de runtime.
 *
 * Sem dependencia externa (o projeto nao adota biblioteca de i18n) e sem tocar
 * DOM: da para carregar direto no `node --test` com type-stripping, que e o que
 * permite ao motor de DND (`dnd/intents.ts`, tambem puro) receber um tradutor
 * de fora e continuar testavel sem bundler.
 *
 * Duas capacidades, so as duas que o app usa:
 *
 *   interpolacao  `{nome}` trocado pelo valor; placeholder desconhecido fica
 *                 INTACTO de proposito — e o que deixa `<Rich>` substituir o
 *                 resto por nos React depois.
 *   plural        `chave_one` / `chave_other` escolhidos por `count`. Idioma
 *                 sem plural (zh) simplesmente repete o texto nas duas chaves.
 */
import type { MessageKey, MessageParams, Messages, Translate } from "./types.ts";

const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/**
 * Regra de plural por idioma. Deliberadamente simples: as quatro linguas do app
 * so distinguem singular de plural (o chines nem isso), entao `Intl.PluralRules`
 * seria peso morto.
 */
const pluralSuffix = (count: number): "_one" | "_other" => (count === 1 ? "_one" : "_other");

/**
 * Monta o `t` de um catalogo. `fallback` cobre a chave que faltar — na pratica
 * so acontece com catalogo carregado por engano fora do `tsc`.
 */
export function createTranslator(messages: Messages, fallback?: Messages): Translate {
  const lookup = (key: string): string | undefined =>
    (messages as Record<string, string | undefined>)[key] ??
    (fallback as Record<string, string | undefined> | undefined)?.[key];

  return (key: MessageKey, params?: MessageParams): string => {
    if (params && typeof params.count === "number") {
      const plural = lookup(`${key}${pluralSuffix(params.count)}`);
      if (plural !== undefined) return interpolate(plural, params);
    }
    const template = lookup(key);
    // Chave ausente vira a propria chave: some da tela sem derrubar o render.
    return template === undefined ? key : interpolate(template, params);
  };
}
