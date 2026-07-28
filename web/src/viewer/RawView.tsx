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
import type { FileContentPayload } from "@/types/git";
import { Notice } from "./parts.tsx";

/** Bytes em algo legivel: 812 B, 41,2 kB, 2,3 MB. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["kB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1).replace(".", ",")} ${units[unit]}`;
}

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
        <Notice title="Arquivo binario">
          {formatBytes(payload.size)} — nada a renderizar como texto.
        </Notice>
      </div>
    );
  }

  const lines = toLines(payload.content);

  return (
    <div>
      {payload.truncated ? (
        <div className="p-3 pb-0">
          <Notice tone="warning" title="Arquivo cortado">
            O backend enviou so o inicio do blob ({formatBytes(payload.size)} no total).
          </Notice>
        </div>
      ) : null}

      {lines.length === 0 ? (
        <div className="p-3">
          <Notice title="Arquivo vazio">Zero bytes.</Notice>
        </div>
      ) : (
        <div className="grid grid-cols-[auto_1fr] items-start font-mono text-xs leading-relaxed">
          {lines.map((line, index) => (
            <Fragment key={index}>
              <span className="select-none px-2 py-0.5 text-right tabular-nums text-muted-foreground/70">
                {index + 1}
              </span>
              <span className="py-0.5 pr-3 whitespace-pre-wrap break-words">{line || " "}</span>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
