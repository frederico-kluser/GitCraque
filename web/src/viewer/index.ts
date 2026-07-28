/**
 * VISUALIZADOR DE ARQUIVO — fronteira publica do modulo `src/viewer`.
 * Dono: a frente "viewer". O resto do app so pode importar daqui.
 *
 * Um arquivo aberto (de um commit ou da working tree) mostrado em tres modos:
 * diff, markdown formatado e conteudo cru. Quem escolhe o arquivo e o painel
 * de detalhe (ou o de alteracoes); quem o exibe e este modulo.
 */
export { FileViewer } from "./FileViewer";
export type { FileViewerProps } from "./FileViewer";
