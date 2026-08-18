/**
 * STUB DE `@/hooks` PARA O BUNDLE DE TESTE — injetado via alias do esbuild.
 *
 * O `useCommitDetail` de verdade le o cache de detalhe de commit, que e
 * PRIVADO de modulo — um teste nao tem como semear `detailCache` sem DOM nem
 * efeitos. Este stub devolve o detalhe que o teste pedir, e ainda controla o
 * viewport (para renderizar o DiffView compacto).
 *
 * NAO e um teste (o glob da suite e `*.test.mjs`). Soh entra em bundle, nunca
 * e carregado direto pelo Node.
 */
import type { CommitDetail } from "@/types/git";

let detail: CommitDetail | null = null;
let compact = false;

export const setCommitDetail = (value: CommitDetail | null) => {
  detail = value;
};

export const setCompact = (value: boolean) => {
  compact = value;
};

export const useCommitDetail = (hash: string | null): { data: CommitDetail | null; loading: boolean; error: string | null } => ({
  data: hash ? detail : null,
  loading: false,
  error: null,
});

export const useViewportValue = (): boolean => compact;

export const selectIsMobile = (): boolean => compact;

export const openChanges = (): void => {};

export const openContextMenu = (): void => {};

export const askConfirm = async (): Promise<boolean> => true;
