/**
 * CRU — o arquivo como esta, em mono, com numeracao de linha.
 *
 * O que faltou no catalogo do Motion UI: `terminal-session` e a estetica de
 * terminal (com datilografia e cadencia), nao um visualizador de arquivo — aqui
 * o texto tem de aparecer inteiro, de uma vez, alinhado. Escrito a mao.
 *
 * Os dois casos que o contrato obriga a tratar sem tentar renderizar:
 * `binary` (heuristica de NUL no backend) e `truncated` (so o inicio do blob
 * veio).
 */
import { Fragment } from "react";
import { formatBytes, t } from "@/i18n";
import type { FileContentPayload } from "@/types/git";
import { Notice } from "./parts.tsx";

/* `formatBytes` mudou de casa: o separador decimal e do IDIOMA (41,2 kB em
 * pt/es, 41.2 kB em en/zh), entao ele vive em `@/i18n/format`. Reexportado aqui
 * porque `viewer/index.ts` ja o publicava. */
export { formatBytes };

/** Linhas do conteudo, sem a linha fantasma do `\n` final. */
export function toLines(content: string): string[] {
  if (!content) return [];
  const lines = content.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export interface RawViewProps {
  payload: FileContentPayload;
}

export function RawView({ payload }: RawViewProps) {
  if (payload.binary) {
    return (
      <div className="p-3">
        <Notice title={t("raw.binary.title")}>
          {t("raw.binary.body", { size: formatBytes(payload.size) })}
        </Notice>
      </div>
    );
  }

  const lines = toLines(payload.content);

  return (
    <div>
      {payload.truncated ? (
        <div className="p-3 pb-0">
          <Notice tone="warning" title={t("raw.truncated.title")}>
            {t("raw.truncated.body", { size: formatBytes(payload.size) })}
          </Notice>
        </div>
      ) : null}

      {lines.length === 0 ? (
        <div className="p-3">
          <Notice title={t("raw.empty.title")}>{t("raw.empty.body")}</Notice>
        </div>
      ) : (
        /* gutter comprimido e mono um ponto maior em tela estreita (max-md),
           via CSS puro: a estrutura da grade nao muda de modo. `pb-safe-bottom`
           deixa a ultima linha acima da barra de gestos do iOS. */
        <div className="grid grid-cols-[auto_1fr] items-start font-mono text-xs leading-relaxed pb-safe-bottom">
          {lines.map((line, index) => (
            <Fragment key={index}>
              <span className="select-none py-0.5 text-right tabular-nums text-muted-foreground/70 max-md:px-1.5 px-2">
                {index + 1}
              </span>
              <span className="py-0.5 pr-3 whitespace-pre-wrap break-words max-md:text-[13px]">{line || " "}</span>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
