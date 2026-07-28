/**
 * FORMATADO — o markdown renderizado.
 *
 * O que faltou no catalogo do Motion UI: tipografia de documento. O projeto
 * tambem nao tem `@tailwindcss/typography` (e nao vai ter), entao a `prose` e a
 * da casa, em `prose.ts`.
 *
 * Este e o unico lugar do app que monta HTML vindo de fora com
 * `dangerouslySetInnerHTML`, e por isso a string passa por DUAS camadas antes:
 *
 *   markdownToSafeHtml  — `markdown.ts`, renderer que escapa todo HTML cru e
 *                         filtra todo href/src (string pura, testavel no node)
 *   sanitizeHtml        — `sanitize.ts`, DOMPurify com allowlist fechada
 *
 * Se a segunda nao puder rodar (sem DOM), ela LANCA e o painel mostra o erro.
 * Nao existe caminho neste arquivo que exiba markdown sem passar pelas duas.
 */
import { useMemo } from "react";
import { t } from "@/i18n";
import { markdownToSafeHtml } from "./markdown.ts";
import { PROSE } from "./prose.ts";
import { sanitizeHtml } from "./sanitize.ts";
import { Notice } from "./parts.tsx";

export interface MarkdownViewProps {
  source: string;
  /** avisa que o backend cortou o blob — o documento esta incompleto */
  truncated?: boolean;
}

interface Render {
  html: string | null;
  error: string | null;
}

function render(source: string): Render {
  try {
    return { html: sanitizeHtml(markdownToSafeHtml(source)), error: null };
  } catch (error) {
    return { html: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export function MarkdownView({ source, truncated }: MarkdownViewProps) {
  const { html, error } = useMemo(() => render(source), [source]);

  if (error) {
    return (
      <div className="p-3">
        <Notice tone="error" title={t("markdown.error.title")}>
          {error}
        </Notice>
      </div>
    );
  }

  return (
    <div className="p-4">
      {truncated ? (
        <Notice tone="warning" title={t("markdown.truncated.title")} className="mb-4">
          {t("markdown.truncated.body")}
        </Notice>
      ) : null}
      {source.trim() ? (
        // O `html` chega ja sanitizado pelas duas camadas acima. Nenhuma outra
        // string do app entra por aqui. O `data-prose` marca a fronteira: e o
        // unico no da arvore cujo conteudo veio de um arquivo de repositorio.
        <div
          data-prose="markdown"
          className={PROSE.root}
          dangerouslySetInnerHTML={{ __html: html ?? "" }}
        />
      ) : (
        <Notice title={t("markdown.empty.title")}>{t("markdown.empty.body")}</Notice>
      )}
    </div>
  );
}
