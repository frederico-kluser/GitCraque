/**
 * A View de um arquivo, ocupando a coluna direita inteira.
 *
 * Substitui o Detalhe enquanto ha arquivo aberto. Este arquivo e so a barra de
 * voltar: quem mostra o conteudo — e o caminho, a origem, copiar e fechar — e o
 * `FileViewer` do modulo `@/viewer`.
 *
 * O voltar devolve o lugar DE ONDE o arquivo veio, e nao um destino fixo: um
 * arquivo de commit volta para o detalhe daquele commit; um arquivo da arvore de
 * trabalho volta para a lista de alteracoes que o abriu. Um destino fixo
 * mandaria metade dos cliques para uma tela que a pessoa nao estava vendo.
 *
 * A arvore de trabalho tem DUAS listas desde que o detalhe passou a mostra-la
 * sem commit selecionado, e a selecao diz qual delas foi: com um commit
 * selecionado o detalhe estava exibindo aquele commit, entao quem abriu so pode
 * ter sido a gaveta, e o voltar a reabre; sem commit selecionado o proprio
 * detalhe e a lista, e fechar o arquivo ja devolve exatamente ela.
 *
 * CASCATA: o catalogo do Motion UI nao tem barra de navegacao com voltar — os 20
 * instalados sao mecanicas de revelacao, gesto e overlay. Sao dez linhas de
 * botao sobre o `FOCUS_RING` dos `parts` do proprio shell; a troca de tela em si
 * (crossfade) fica no `SidePanel`, que e quem conhece as duas.
 */
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { FileViewer } from "@/viewer";
import { closeFile, openFile, useAppState } from "@/state/store";
import type { OpenFile } from "@/state/store";
import { openChanges, openContextMenu, useCommitDetail } from "@/hooks";
import { viewerMenu } from "@/app/menus";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { PanelProps } from "@/types/modules";
import { FOCUS_RING } from "./parts";

export interface FileViewPanelProps extends PanelProps {
  file: OpenFile;
}

export function FileViewPanel({ className, file }: FileViewPanelProps) {
  // Booleano, nao o hash: o comparador do `useAppState` e `Object.is`, e so
  // importa aqui SE ha commit selecionado, nao qual.
  const hasCommit = useAppState((s) => s.selection.primary !== null);

  /**
   * Voltar fecha o arquivo — e o `SidePanel` deriva a tela de `openFile`, entao
   * fechar E voltar para o detalhe. Reabre a gaveta so quando ela e a unica
   * lista possivel de onde este arquivo pode ter saido.
   */
  const back = () => {
    closeFile();
    if (file.fromWorkingTree && hasCommit) openChanges();
  };

  const backLabel = file.fromWorkingTree ? t("view.back.changes") : t("view.back.detail");

  // Navegacao entre os arquivos do commit: o detalhe tem cache por hash, entao
  // quem veio da lista nao paga requisicao nova. Arquivo da arvore de trabalho
  // nao tem lista de onde navegar — os botoes nao existem para ele.
  const detail = useCommitDetail(file.hash);
  const files = file.hash ? (detail.data?.files ?? []) : [];
  const index = file.hash ? files.findIndex((f) => f.path === file.path) : -1;
  const prev = index > 0 ? (files[index - 1] ?? null) : null;
  const next = index >= 0 && index < files.length - 1 ? (files[index + 1] ?? null) : null;

  const navButton = (
    direction: "prev" | "next",
    target: { path: string } | null,
  ) => {
    const label = direction === "prev" ? t("viewer.prevFile") : t("viewer.nextFile");
    const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
    return (
      <button
        type="button"
        disabled={!target}
        aria-label={label}
        title={target ? target.path : label}
        onClick={() => target && openFile(target.path, file.hash, false)}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md",
          "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          "duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
          "disabled:pointer-events-none disabled:opacity-35",
          "touch:size-tap",
          FOCUS_RING,
        )}
      >
        <Icon className="size-3.5" />
      </button>
    );
  };

  return (
    <section className={cn("flex flex-col", className)} aria-label={t("view.label")}>
      {/* So a navegacao. Caminho, origem, copiar e fechar sao do `FileViewer`
          logo abaixo — repetir os quatro aqui gastava duas linhas da coluna
          dizendo o que a linha seguinte ja dizia. */}
      <header className="flex shrink-0 items-center gap-1 border-b border-border bg-surface-rail px-2 py-1">
        <button
          type="button"
          onClick={back}
          title={backLabel}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
            "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            "duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)]",
            "touch:min-h-tap touch:min-w-tap",
            FOCUS_RING,
          )}
        >
          <ArrowLeft className="size-3.5" />
          {backLabel}
        </button>

        {file.hash ? (
          <div className="flex items-center gap-0.5">
            {navButton("prev", prev)}
            {navButton("next", next)}
          </div>
        ) : null}
      </header>

      <FileViewer
        file={file}
        onClose={back}
        /* O visualizador so reporta o clique; quem sabe o que se pode fazer com
           um arquivo e o shell. */
        onMenu={(event) =>
          openContextMenu({
            label: file.path,
            x: event.x,
            y: event.y,
            items: viewerMenu({ ...event, path: file.path, hash: file.hash, onClose: back }),
          })
        }
        className="min-h-0 flex-1 overflow-auto bg-surface-inset"
      />
    </section>
  );
}
