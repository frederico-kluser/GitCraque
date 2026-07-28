/**
 * STUB — sera substituido pela implementacao real.
 *
 * Contrato: recebe o arquivo aberto do store (`state.openFile`) e mostra
 *   · Diff        — o patch do arquivo naquele commit (api.diff)
 *   · Formatado   — markdown renderizado, so quando a extensao for de markdown
 *   · Cru         — o conteudo como esta no arquivo (api.file)
 */
import type { OpenFile } from "@/state/store";

export interface FileViewerProps {
  file: OpenFile | null;
  onClose?: () => void;
  className?: string;
}

export function FileViewer({ file, className }: FileViewerProps) {
  return (
    <section className={className} data-stub="file-viewer">
      {file ? (
        <p className="p-4 text-sm text-muted-foreground">
          Visualizador ainda nao implementado — {file.path}
        </p>
      ) : null}
    </section>
  );
}
