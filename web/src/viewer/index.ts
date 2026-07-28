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
export type { ViewerMode } from "./FileViewer";

/**
 * A sanitizacao sai pela fronteira nao por ser util fora daqui, mas porque
 * precisa ficar visivel: qualquer outro lugar do app que um dia transforme
 * markdown de repositorio em HTML tem de passar por ESTE caminho, com as suas
 * duas camadas, em vez de chamar `marked` direto.
 */
export { markdownToSafeHtml } from "./markdown";
export { SANITIZE_CONFIG, SanitizerUnavailableError, sanitizeHtml } from "./sanitize";
export { classifyUrl, escapeHtml, SAFE_URI_REGEXP } from "./url-policy";
export type { ClassifiedUrl, UrlKind } from "./url-policy";
